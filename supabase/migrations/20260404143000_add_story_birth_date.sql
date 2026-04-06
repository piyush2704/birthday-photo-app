alter table public.event_story_settings
  add column if not exists birth_date date;

update public.event_story_settings
set birth_date = '2025-04-29'
where event_id in (
  select id
  from public.events
  where public_code = 'VAAYU'
)
and birth_date is null;
