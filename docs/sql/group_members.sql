-- Run this entire file in the Supabase SQL Editor as postgres.
-- Lets any group member remove members, leave, or delete the group,
-- and see only the names of the other people in their groups.
-- These run as functions because a member's own policies can't delete other members'
-- availability and votes, and the group can only be deleted once those rows are gone.
begin;

do $$ begin
  if to_regprocedure('public.get_group_member_names(uuid)') is null
    or to_regprocedure('public.wad2do_group_details(uuid)') is null
    or to_regprocedure('public.wad2do_join_group(uuid,text)') is null then
    raise exception 'Run the current docs/sql/group_transactions.sql first to install the private group and invite lookups.';
  end if;
end $$;

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
  perform 1 from public.groups where id = p_group_id for update;
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
  perform 1 from public.groups where id = p_group_id for update;
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

-- 3. Full profiles remain private even if an older permissive policy still exists.
drop policy if exists wad2do_read_group_profiles on public.profiles;
alter table public.profiles enable row level security;
drop policy if exists wad2do_limit_profile_reads on public.profiles;
create policy wad2do_limit_profile_reads on public.profiles as restrictive
  for select to authenticated
  using (id = auth.uid() or public.wad2do_is_admin());
drop policy if exists wad2do_deny_anonymous_profile_reads on public.profiles;
create policy wad2do_deny_anonymous_profile_reads on public.profiles as restrictive
  for select to anon using (false);

revoke all on function public.wad2do_is_group_member(uuid) from public, anon;
revoke all on function public.delete_group(uuid) from public, anon;
revoke all on function public.remove_group_member(uuid, uuid) from public, anon;
grant execute on function public.wad2do_is_group_member(uuid) to authenticated;
grant execute on function public.delete_group(uuid) to authenticated;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;

-- Existing permissive policies are combined with these restrictive guards.
do $$
declare
  target text;
begin
  foreach target in array array['profiles', 'groups', 'group_members', 'availability', 'itineraries', 'votes', 'group_activities'] loop
    execute format('alter table public.%I enable row level security', target);
    execute format('revoke all on public.%I from public, anon', target);
    execute format('revoke truncate, references, trigger on public.%I from authenticated', target);
    execute format('drop policy if exists wad2do_deny_anonymous_group_data on public.%I', target);
    execute format('create policy wad2do_deny_anonymous_group_data on public.%I as restrictive for all to anon using (false) with check (false)', target);
  end loop;
  foreach target in array array['group_members', 'availability', 'itineraries', 'votes', 'group_activities'] loop
    execute format('drop policy if exists wad2do_member_access on public.%I', target);
    execute format('create policy wad2do_member_access on public.%I for all to authenticated using (public.wad2do_is_group_member(group_id)) with check (public.wad2do_is_group_member(group_id))', target);
    execute format('drop policy if exists wad2do_limit_member_access on public.%I', target);
    execute format('create policy wad2do_limit_member_access on public.%I as restrictive for all to authenticated using (public.wad2do_is_group_member(group_id)) with check (public.wad2do_is_group_member(group_id))', target);
  end loop;
end;
$$;

-- Preserve preference edits, but never let a browser grant itself admin access.
revoke insert, update, delete on public.profiles from public, anon, authenticated;
revoke insert (id, display_name, interests, budget, home_area, home_station_id, company, is_admin, created_at),
  update (id, display_name, interests, budget, home_area, home_station_id, company, is_admin, created_at)
  on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, interests, budget, home_area, home_station_id, company)
  on public.profiles to authenticated;

drop policy if exists wad2do_member_access on public.groups;
create policy wad2do_member_access on public.groups for all to authenticated
  using (public.wad2do_is_group_member(id)) with check (public.wad2do_is_group_member(id));
drop policy if exists wad2do_limit_member_access on public.groups;
create policy wad2do_limit_member_access on public.groups as restrictive for all to authenticated
  using (public.wad2do_is_group_member(id)) with check (public.wad2do_is_group_member(id));

-- Creation, joins, removals and availability replacement go through checked functions.
revoke insert, update, delete on public.group_members, public.availability, public.groups from authenticated;
revoke insert (group_id, user_id), update (group_id, user_id)
  on public.group_members from public, anon, authenticated;
revoke insert (group_id, user_id, slot_start), update (group_id, user_id, slot_start)
  on public.availability from public, anon, authenticated;
revoke insert (id, name, start_date, end_date, budget_per_person, invite_code, created_by, chosen_start, chosen_end, created_at),
  update (id, name, start_date, end_date, budget_per_person, invite_code, created_by, chosen_start, chosen_end, created_at)
  on public.groups from public, anon, authenticated;
grant select on public.groups, public.group_members, public.availability to authenticated;
-- Availability still confirms a time and extends the end date directly, for members only.
grant update (chosen_start, chosen_end, end_date) on public.groups to authenticated;
grant select, insert, update, delete on public.itineraries, public.votes, public.group_activities to authenticated;

drop policy if exists wad2do_limit_itinerary_author on public.itineraries;
create policy wad2do_limit_itinerary_author on public.itineraries as restrictive for all to authenticated
  using (true) with check (updated_by = auth.uid());

drop policy if exists wad2do_limit_vote_insert on public.votes;
create policy wad2do_limit_vote_insert on public.votes as restrictive for insert to authenticated
  with check (user_id = auth.uid() and value in (-1, 1));
drop policy if exists wad2do_limit_vote_update on public.votes;
create policy wad2do_limit_vote_update on public.votes as restrictive for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and value in (-1, 1));
drop policy if exists wad2do_limit_vote_delete on public.votes;
create policy wad2do_limit_vote_delete on public.votes as restrictive for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists wad2do_limit_share_insert on public.group_activities;
create policy wad2do_limit_share_insert on public.group_activities as restrictive for insert to authenticated
  with check (shared_by = auth.uid());
drop policy if exists wad2do_limit_share_update on public.group_activities;
create policy wad2do_limit_share_update on public.group_activities as restrictive for update to authenticated
  using (shared_by = auth.uid()) with check (shared_by = auth.uid());
drop policy if exists wad2do_limit_share_delete on public.group_activities;
create policy wad2do_limit_share_delete on public.group_activities as restrictive for delete to authenticated
  using (shared_by = auth.uid());

-- Preserve old rows; enforce the shortlist relation for new writes and cascade future removals.
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.votes'::regclass
    and conname = 'wad2do_votes_shortlist_fkey') then
    alter table public.votes add constraint wad2do_votes_shortlist_fkey
      foreign key (group_id, activity_id) references public.group_activities(group_id, activity_id)
      on delete cascade not valid;
  end if;
end $$;

commit;
