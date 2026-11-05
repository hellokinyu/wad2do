-- Run this entire file in the Supabase SQL Editor as postgres, after group_members.sql.
-- Lets a signed-in user delete their own account from the Profile page.
--
-- What happens to their data:
--   Removed:  their profile, saved activities, submissions, login, and in every group their
--             membership, free times and votes. A group they were the last member of is deleted.
--   Kept:     groups other members still use, activities they shared to those groups
--             (shown as "Shared by a member"), saved itineraries, and community activities
--             already approved and published for everyone.
--
-- The browser can't delete a login by itself, so this runs as SECURITY DEFINER (as postgres).
-- It only ever deletes the caller's own account: the id comes from auth.uid(), never a parameter.
-- Everything happens in one transaction: if any step fails, nothing is deleted.
begin;

do $$ begin
  if to_regprocedure('public.remove_group_member(uuid,uuid)') is null then
    raise exception 'Run docs/sql/group_members.sql first to install remove_group_member.';
  end if;
end $$;

create or replace function public.delete_my_account()
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  my_group uuid;
begin
  if me is null then
    raise exception 'Log in to delete your account.' using errcode = '42501';
  end if;

  -- 1. Leave every group. remove_group_member removes this member's free times and votes there,
  --    and deletes the whole group when nobody else is left in it.
  for my_group in select group_id from public.group_members where user_id = me loop
    perform public.remove_group_member(my_group, me);
  end loop;

  -- 2. Shared things other people still use stay, without pointing at the deleted account.
  update public.groups as g set created_by = (
      select m.user_id from public.group_members as m where m.group_id = g.id limit 1)
    where g.created_by = me;
  update public.group_activities set shared_by = null where shared_by = me;
  update public.itineraries set updated_by = null where updated_by = me;
  update public.submissions set reviewed_by = null where reviewed_by = me;

  -- 3. Everything that was only theirs. Published community activities live in
  --    public.activities, so deleting the submission rows leaves them up for everyone.
  delete from public.favourites where user_id = me;
  delete from public.votes where user_id = me;
  delete from public.availability where user_id = me;
  delete from public.submissions where submitted_by = me;
  if to_regclass('public.google_place_search_usage') is not null then
    -- Their hourly Google search count (only exists if google_place_search.sql was run)
    execute 'delete from public.google_place_search_usage where bucket = $1' using me::text;
  end if;
  delete from public.profiles where id = me;

  -- 4. Finally the login itself. This also ends their sessions on every device.
  delete from auth.users where id = me;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

commit;
