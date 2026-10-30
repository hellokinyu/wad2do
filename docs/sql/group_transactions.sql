-- Run as postgres before deploying the updated frontend; see docs/group-database.md.
-- Adds atomic group operations; does not recreate tables or change existing data.
begin;

-- A known invite-link UUID exposes a preview, never an enumerable list of groups.
create or replace function public.wad2do_group_details(p_group_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  current_group public.groups;
  member boolean;
  result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Log in to see this group.' using errcode = '42501';
  end if;
  select * into current_group from public.groups where id = p_group_id;
  if not found then return null; end if;
  member := public.wad2do_is_group_member(p_group_id);
  result := jsonb_build_object(
    'id', current_group.id, 'name', current_group.name,
    'start_date', current_group.start_date, 'end_date', current_group.end_date,
    'is_member', member,
    'group_members', jsonb_build_array(jsonb_build_object('count',
      (select count(*) from public.group_members where group_id = p_group_id)))
  );
  if member then
    result := result || jsonb_build_object(
      'budget_per_person', current_group.budget_per_person,
      'invite_code', current_group.invite_code,
      'chosen_start', current_group.chosen_start, 'chosen_end', current_group.chosen_end
    );
  end if;
  return result;
end;
$$;

create or replace function public.wad2do_join_group(p_group_id uuid default null, p_invite_code text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  joined_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Log in to join a group.' using errcode = '42501';
  end if;
  -- Realtime DELETE events expose primary keys, so a group UUID is not an invite secret.
  if p_invite_code is null or upper(btrim(p_invite_code)) !~ '^[A-HJ-NP-Z2-9]{6}$' then
    raise exception 'No group with that code or link.' using errcode = 'P0002';
  end if;
  select id into joined_id from public.groups
    where invite_code = upper(btrim(p_invite_code))
      and (p_group_id is null or id = p_group_id) for update;
  if not found then
    raise exception 'No group with that code or link.' using errcode = 'P0002';
  end if;
  insert into public.group_members (group_id, user_id) values (joined_id, auth.uid())
    on conflict (group_id, user_id) do nothing;
  return joined_id;
end;
$$;

-- Group pages receive names and avatars, never the other members' home station or preferences.
-- The avatar lives in the login's metadata, so it is read from auth.users.
-- Dropped first because adding avatar_animal changes the returned columns.
drop function if exists public.get_group_member_names(uuid);
create function public.get_group_member_names(p_group_id uuid)
returns table (id uuid, display_name text, avatar_animal text)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.group_members where group_id = p_group_id and user_id = auth.uid()) then
    raise exception 'Only group members can do this.' using errcode = '42501';
  end if;
  return query
    select p.id, p.display_name::text, (u.raw_user_meta_data ->> 'avatar_animal')::text
    from public.group_members m
    join public.profiles p on p.id = m.user_id
    left join auth.users u on u.id = m.user_id
    where m.group_id = p_group_id;
end;
$$;


create or replace function public.create_group(
  p_group_id uuid, p_name text, p_start_date date, p_end_date date,
  p_budget_per_person numeric, p_invite_code text
)
returns public.groups
language plpgsql security definer set search_path = ''
as $$
declare
  result public.groups;
begin
  if auth.uid() is null then
    raise exception 'Log in to create a group.' using errcode = '42501';
  end if;
  if p_group_id is null or p_name is null or btrim(p_name) = ''
    or p_start_date is null or p_end_date is null
    or not isfinite(p_start_date) or not isfinite(p_end_date)
    or p_end_date < p_start_date
    or p_budget_per_person is null or p_budget_per_person < 0
    or p_budget_per_person::text in ('NaN', 'Infinity', '-Infinity')
    or p_invite_code is null or p_invite_code !~ '^[A-HJ-NP-Z2-9]{6}$' then
    raise exception 'Enter a name, valid dates, budget and invite code.' using errcode = '22023';
  end if;

  insert into public.groups (id, name, start_date, end_date, budget_per_person, invite_code, created_by)
    values (p_group_id, btrim(p_name), p_start_date, p_end_date, p_budget_per_person, p_invite_code, auth.uid())
    on conflict (id) do nothing
    returning * into result;
  if not found then
    -- A retry after a lost response returns the original group without another INSERT.
    select * into result from public.groups where id = p_group_id for update;
    if result.created_by is distinct from auth.uid()
      or not public.wad2do_is_group_member(p_group_id) then
      raise exception 'This group ID is already in use.' using errcode = '42501';
    end if;
    return result;
  end if;

  insert into public.group_members (group_id, user_id) values (result.id, auth.uid());
  return result;
end;
$$;

create or replace function public.replace_group_availability(
  p_group_id uuid, p_slots timestamptz[], p_expected_user_id uuid
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  current_group public.groups;
begin
  if p_expected_user_id is null or p_expected_user_id is distinct from auth.uid() then
    raise exception 'Your account changed. Reload availability before saving.' using errcode = '42501';
  end if;
  -- Share the lock with settings/member changes, and serialize replacement saves.
  select * into current_group from public.groups where id = p_group_id for update;
  if not found or not public.wad2do_is_group_member(p_group_id) then
    raise exception 'Only group members can do this.' using errcode = '42501';
  end if;
  if current_group.start_date is null or current_group.end_date is null
    or not isfinite(current_group.start_date) or not isfinite(current_group.end_date)
    or current_group.end_date < current_group.start_date
    or p_slots is null or exists (
    select 1 from unnest(p_slots) as slots(slot)
    where slot is null or not isfinite(slot)
      or (slot at time zone 'Asia/Singapore')::date not between current_group.start_date and current_group.end_date
      or (slot at time zone 'Asia/Singapore')::time < time '09:00'
      or (slot at time zone 'Asia/Singapore')::time >= time '23:00'
      or extract(minute from slot at time zone 'Asia/Singapore')::integer % 30 <> 0
      or extract(second from slot at time zone 'Asia/Singapore') <> 0
  ) then
    raise exception 'Choose half-hour slots inside the group dates, from 9am to 11pm.' using errcode = '22023';
  end if;

  delete from public.availability where group_id = p_group_id and user_id = auth.uid();
  insert into public.availability (group_id, user_id, slot_start)
    select p_group_id, auth.uid(), slot from unnest(p_slots) as slots(slot) group by slot;
end;
$$;

create or replace function public.update_group_settings(
  p_group_id uuid, p_name text, p_start_date date, p_end_date date,
  p_budget_per_person numeric, p_clear_chosen boolean default false
)
returns public.groups
language plpgsql security definer set search_path = ''
as $$
declare
  result public.groups;
  clear_chosen boolean;
begin
  select * into result from public.groups where id = p_group_id for update;
  if not found or not public.wad2do_is_group_member(p_group_id) then
    raise exception 'Only group members can do this.' using errcode = '42501';
  end if;
  if p_name is null or btrim(p_name) = '' or p_start_date is null or p_end_date is null
    or not isfinite(p_start_date) or not isfinite(p_end_date) or p_end_date < p_start_date
    or p_budget_per_person is null or p_budget_per_person < 0
    or p_budget_per_person::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception 'Enter a name, valid dates and a budget of $0 or more.' using errcode = '22023';
  end if;
  clear_chosen := result.chosen_start is not null and (
    (result.chosen_start at time zone 'Asia/Singapore')::date not between p_start_date and p_end_date
    or (result.chosen_end at time zone 'Asia/Singapore')::date not between p_start_date and p_end_date
  );
  if clear_chosen and p_clear_chosen is distinct from true then
    raise exception 'The chosen time changed. Reload the group and confirm clearing it before saving.' using errcode = '22023';
  end if;

  update public.groups set name = btrim(p_name), start_date = p_start_date,
    end_date = p_end_date, budget_per_person = p_budget_per_person,
    chosen_start = case when clear_chosen then null else chosen_start end,
    chosen_end = case when clear_chosen then null else chosen_end end
    where id = p_group_id returning * into result;
  if clear_chosen then
    delete from public.itineraries where group_id = p_group_id;
  end if;
  return result;
end;
$$;

revoke all on function public.create_group(uuid, text, date, date, numeric, text) from public, anon;
revoke all on function public.replace_group_availability(uuid, timestamptz[], uuid) from public, anon;
revoke all on function public.update_group_settings(uuid, text, date, date, numeric, boolean) from public, anon;
grant execute on function public.create_group(uuid, text, date, date, numeric, text) to authenticated;
grant execute on function public.replace_group_availability(uuid, timestamptz[], uuid) to authenticated;
grant execute on function public.update_group_settings(uuid, text, date, date, numeric, boolean) to authenticated;

revoke all on function public.get_group_member_names(uuid) from public, anon;
grant execute on function public.get_group_member_names(uuid) to authenticated;
revoke all on function public.wad2do_group_details(uuid) from public, anon;
grant execute on function public.wad2do_group_details(uuid) to authenticated;
revoke all on function public.wad2do_join_group(uuid, text) from public, anon;
grant execute on function public.wad2do_join_group(uuid, text) to authenticated;

commit;
