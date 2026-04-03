alter table public.events
  add column if not exists moderator_pin_hash text,
  add column if not exists moderator_pin_set_at timestamptz;

create or replace function public.verify_moderator_pin(p_event_id uuid, p_pin text)
returns boolean
language sql
stable
as $$
  select case
    when p_pin is null or p_pin = '' then false
    when e.moderator_pin_hash is null then false
    else extensions.crypt(p_pin, e.moderator_pin_hash) = e.moderator_pin_hash
  end
  from public.events e
  where e.id = p_event_id;
$$;
