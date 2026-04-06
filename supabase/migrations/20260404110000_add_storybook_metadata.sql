alter table public.photos
  add column if not exists captured_at timestamptz,
  add column if not exists capture_source text not null default 'upload',
  add column if not exists is_visible boolean not null default true,
  add column if not exists timeline_sort_order integer not null default 0;

update public.photos
set captured_at = created_at
where captured_at is null;

alter table public.photos
  add constraint photos_capture_source_check
  check (capture_source in ('exif', 'upload'));

create table if not exists public.event_story_settings (
  event_id uuid primary key references public.events(id) on delete cascade,
  grouping text not null default 'month',
  section_count integer not null default 12,
  cover_title text not null default 'Vaayu''s First Year',
  cover_subtitle text not null default 'A scrapbook of little moments and big milestones',
  updated_at timestamptz not null default now(),
  constraint event_story_settings_grouping_check check (grouping in ('month', 'year')),
  constraint event_story_settings_section_count_check check (section_count between 1 and 24)
);

create table if not exists public.event_story_sections (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  label text not null,
  title text not null,
  subtitle text,
  story_text text,
  sort_order integer not null default 0,
  visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.photos
  add column if not exists timeline_section_id uuid references public.event_story_sections(id) on delete set null;

create index if not exists photos_captured_at_idx on public.photos (captured_at desc);
create index if not exists photos_visible_idx on public.photos (is_visible);
create index if not exists photos_timeline_section_idx on public.photos (timeline_section_id);
create index if not exists event_story_sections_event_sort_idx on public.event_story_sections (event_id, sort_order);

alter table public.event_story_settings enable row level security;
alter table public.event_story_sections enable row level security;

create policy "event_story_settings_select_members"
  on public.event_story_settings for select
  using (public.is_event_member(event_id));

create policy "event_story_settings_insert_admin"
  on public.event_story_settings for insert
  with check (public.is_event_admin(event_id));

create policy "event_story_settings_update_admin"
  on public.event_story_settings for update
  using (public.is_event_admin(event_id))
  with check (public.is_event_admin(event_id));

create policy "event_story_settings_delete_admin"
  on public.event_story_settings for delete
  using (public.is_event_admin(event_id));

create policy "event_story_sections_select_members"
  on public.event_story_sections for select
  using (public.is_event_member(event_id));

create policy "event_story_sections_insert_admin"
  on public.event_story_sections for insert
  with check (public.is_event_admin(event_id));

create policy "event_story_sections_update_admin"
  on public.event_story_sections for update
  using (public.is_event_admin(event_id))
  with check (public.is_event_admin(event_id));

create policy "event_story_sections_delete_admin"
  on public.event_story_sections for delete
  using (public.is_event_admin(event_id));
