-- Run this entire file in the Supabase SQL Editor as postgres.
-- Lets any group member remove members, leave, or delete the group,
-- and see the names of the other people in their groups.
-- These run as functions because a member's own policies can't delete other members'
-- availability and votes, and the group can only be deleted once those rows are gone.
begin;

-- A helper: is the signed-in user in this group?
-- SECURITY DEFINER lets this read group_members without applying its policies.
create or replace function public.wad2do_is_group_member(p_group_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = auth.uid()
  );
$$;

-- 1. Delete the group and everything in it, as one transaction.
create or replace function public.delete_group(p_group_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.wad2do_is_group_member(p_group_id) then
    raise exception 'Only group members can do this.' using errcode = '42501';
  end if;

  delete from public.votes where group_id = p_group_id;
  delete from public.group_activities where group_id = p_group_id;
  delete from public.availability where group_id = p_group_id;
  delete from public.itineraries where group_id = p_group_id;
  delete from public.group_members where group_id = p_group_id;
  delete from public.groups where id = p_group_id;
end;
$$;

-- 2. Remove a member (or yourself, to leave), along with their availability and votes.
-- Activities they shared stay in the group. If nobody would be left, the group is deleted.
create or replace function public.remove_group_member(p_group_id uuid, p_user_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.wad2do_is_group_member(p_group_id) then
    raise exception 'Only group members can do this.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id <> p_user_id
  ) then
    perform public.delete_group(p_group_id);
    return;
  end if;

  delete from public.availability where group_id = p_group_id and user_id = p_user_id;
  delete from public.votes where group_id = p_group_id and user_id = p_user_id;
  delete from public.group_members where group_id = p_group_id and user_id = p_user_id;
end;
$$;

-- 3. Profiles: members can read the profiles of people in the same group,
-- so names show up in Settings, Availability and Activities instead of "Member".
-- This adds to wad2do_read_profile in admin_review.sql (own profile, or admin).
drop policy if exists wad2do_read_group_profiles on public.profiles;
create policy wad2do_read_group_profiles on public.profiles for select to authenticated
  using (
    exists (
      select 1
      from public.group_members mine
      join public.group_members theirs on theirs.group_id = mine.group_id
      where mine.user_id = auth.uid() and theirs.user_id = profiles.id
    )
  );

revoke all on function public.wad2do_is_group_member(uuid) from public, anon;
revoke all on function public.delete_group(uuid) from public, anon;
revoke all on function public.remove_group_member(uuid, uuid) from public, anon;
grant execute on function public.wad2do_is_group_member(uuid) to authenticated;
grant execute on function public.delete_group(uuid) to authenticated;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;

commit;
