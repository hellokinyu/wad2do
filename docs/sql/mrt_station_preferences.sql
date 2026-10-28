-- Run in Supabase SQL Editor as postgres to repair MRT preference saves.
-- Existing owner-only profile RLS policies remain in effect.
begin;
alter table public.profiles add column if not exists home_station_id text;
grant update (home_station_id) on public.profiles to authenticated;
commit;

-- Expected: can_save_home_station = true, can_change_admin = false.
select
  has_column_privilege('authenticated', 'public.profiles', 'home_station_id', 'UPDATE')
    as can_save_home_station,
  has_column_privilege('authenticated', 'public.profiles', 'is_admin', 'UPDATE')
    as can_change_admin;
