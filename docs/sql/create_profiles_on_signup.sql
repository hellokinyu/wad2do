-- Run this entire script in the Supabase SQL Editor as the postgres role.
-- Creates profiles for future signups and fills in missing existing profiles.
-- Existing profile values are preserved; omitted columns use table defaults.
begin;

create or replace function public.wad2do_create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Replace only this script's trigger so the script can be run again.
drop trigger if exists wad2do_create_profile_on_signup on auth.users;

create trigger wad2do_create_profile_on_signup
after insert on auth.users
for each row execute function public.wad2do_create_profile_for_new_user();

insert into public.profiles (id)
select u.id
from auth.users u
where not exists (
  select 1 from public.profiles p where p.id = u.id
)
on conflict (id) do nothing;

commit;

-- Expected result: 0. Then refresh /profile and try saving preferences.
select count(*) as users_without_profiles
from auth.users u
where not exists (
  select 1 from public.profiles p where p.id = u.id
);
