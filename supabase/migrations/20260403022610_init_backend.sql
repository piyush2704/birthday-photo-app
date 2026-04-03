-- Enums
create type public.event_role as enum ('owner', 'admin', 'guest');
create type public.photo_status as enum ('pending', 'approved', 'rejected');
create type public.moderation_action as enum ('approve', 'reject');

-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

-- Events
create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  public_code text not null unique,
  host_user_id uuid references public.profiles(id) on delete set null,
  moderation_required boolean not null default false,
  created_at timestamptz not null default now()
);

-- Event members
create table public.event_members (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.event_role not null default 'guest',
  joined_at timestamptz not null default now(),
  unique (event_id, user_id)
);

-- Photos
create table public.photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  uploader_user_id uuid references public.profiles(id) on delete set null,
  uploader_display_name text,
  storage_path text not null,
  caption text,
  status public.photo_status not null default 'approved',
  created_at timestamptz not null default now()
);

-- Moderation actions
create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.photos(id) on delete cascade,
  moderator_user_id uuid references public.profiles(id) on delete set null,
  action public.moderation_action not null,
  reason text,
  created_at timestamptz not null default now()
);

-- Indexes
create index on public.event_members (event_id);
create index on public.event_members (user_id);
create index on public.photos (event_id);
create index on public.photos (uploader_user_id);
create index on public.photos (status);
create index on public.moderation_actions (photo_id);

-- Helper functions
create or replace function public.is_event_member(p_event_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.event_members em
    where em.event_id = p_event_id
      and em.user_id = auth.uid()
  );
$$;

create or replace function public.is_event_admin(p_event_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.event_members em
    where em.event_id = p_event_id
      and em.user_id = auth.uid()
      and em.role in ('owner', 'admin')
  );
$$;

create or replace function public.event_id_from_path(path text)
returns uuid
language sql
immutable
as $$
  select nullif(split_part(path, '/', 2), '')::uuid;
$$;

-- Auto-profile creation on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.event_members enable row level security;
alter table public.photos enable row level security;
alter table public.moderation_actions enable row level security;

-- Profiles policies
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Events policies
create policy "events_select_members"
  on public.events for select
  using (public.is_event_member(id) or host_user_id = auth.uid());

create policy "events_insert_owner"
  on public.events for insert
  with check (auth.uid() = host_user_id);

create policy "events_update_admin"
  on public.events for update
  using (public.is_event_admin(id) or host_user_id = auth.uid());

create policy "events_delete_admin"
  on public.events for delete
  using (public.is_event_admin(id) or host_user_id = auth.uid());

-- Event members policies
create policy "event_members_select"
  on public.event_members for select
  using (public.is_event_member(event_id));

create policy "event_members_insert_self"
  on public.event_members for insert
  with check (
    auth.uid() = user_id
    or public.is_event_admin(event_id)
  );

create policy "event_members_update_admin"
  on public.event_members for update
  using (public.is_event_admin(event_id));

create policy "event_members_delete"
  on public.event_members for delete
  using (public.is_event_admin(event_id) or auth.uid() = user_id);

-- Photos policies
create policy "photos_select_members"
  on public.photos for select
  using (public.is_event_member(event_id));

create policy "photos_insert_member_or_service"
  on public.photos for insert
  with check (
    (auth.role() = 'service_role')
    or (auth.role() = 'authenticated' and auth.uid() = uploader_user_id and public.is_event_member(event_id))
  );

create policy "photos_update_uploader_or_admin"
  on public.photos for update
  using (
    public.is_event_admin(event_id)
    or auth.uid() = uploader_user_id
  );

create policy "photos_delete_admin"
  on public.photos for delete
  using (public.is_event_admin(event_id));

-- Moderation actions policies
create policy "moderation_actions_select_admin"
  on public.moderation_actions for select
  using (public.is_event_admin((select event_id from public.photos p where p.id = photo_id)));

create policy "moderation_actions_insert_admin"
  on public.moderation_actions for insert
  with check (public.is_event_admin((select event_id from public.photos p where p.id = photo_id)));

-- Storage bucket
insert into storage.buckets (id, name, public)
values ('event-photos', 'event-photos', false)
on conflict (id) do nothing;

-- Storage policies
create policy "storage_select_event_members"
  on storage.objects for select
  using (
    bucket_id = 'event-photos'
    and public.is_event_member(public.event_id_from_path(name))
  );

create policy "storage_insert_member_or_service"
  on storage.objects for insert
  with check (
    bucket_id = 'event-photos'
    and (
      auth.role() = 'service_role'
      or (auth.role() = 'authenticated' and public.is_event_member(public.event_id_from_path(name)))
    )
  );

create policy "storage_delete_admin"
  on storage.objects for delete
  using (
    bucket_id = 'event-photos'
    and public.is_event_admin(public.event_id_from_path(name))
  );
