create or replace function public.hash_event_pin(p_pin text)
returns text
language sql
security definer
set search_path = public, extensions
as $$
  select case
    when p_pin is null or p_pin = '' then null
    else extensions.crypt(p_pin, extensions.gen_salt('bf'))
  end;
$$;
