-- Run after group_transactions.sql and group_members.sql, once the updated frontend is shared.
-- Preserves existing plans; only a later chosen-time change invalidates a plan.
begin;

alter table public.groups add column if not exists plan_revision bigint not null default 0;

create or replace function public.wad2do_bump_plan_revision()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.groups set plan_revision = plan_revision + 1
    where id = case when TG_OP = 'DELETE' then old.group_id else new.group_id end;
  return null;
end;
$$;
drop trigger if exists wad2do_plan_changed on public.itineraries;
create trigger wad2do_plan_changed after insert or update or delete on public.itineraries
  for each row execute function public.wad2do_bump_plan_revision();

create or replace function public.wad2do_group_plan_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (new.chosen_start is null) <> (new.chosen_end is null) or
    (new.chosen_start is not null and (
      not isfinite(new.chosen_start) or not isfinite(new.chosen_end)
      or new.chosen_end <= new.chosen_start
      or new.start_date is null or new.end_date is null
      or (new.chosen_start at time zone 'Asia/Singapore')::date not between new.start_date and new.end_date
      or (new.chosen_end at time zone 'Asia/Singapore')::date <>
         (new.chosen_start at time zone 'Asia/Singapore')::date
    )) then
    raise exception 'Choose a valid time inside the current group dates.' using errcode = '22023';
  end if;
  if new.chosen_start is distinct from old.chosen_start
    or new.chosen_end is distinct from old.chosen_end then
    delete from public.itineraries where group_id = new.id;
  end if;
  update public.groups set plan_revision = plan_revision + 1 where id = new.id;
  return null;
end;
$$;
drop trigger if exists wad2do_group_plan_changed on public.groups;
create trigger wad2do_group_plan_changed
  after update of chosen_start, chosen_end, start_date, end_date, budget_per_person on public.groups
  for each row when (
    new.chosen_start is distinct from old.chosen_start or new.chosen_end is distinct from old.chosen_end
    or new.start_date is distinct from old.start_date or new.end_date is distinct from old.end_date
    or new.budget_per_person is distinct from old.budget_per_person
  ) execute function public.wad2do_group_plan_changed();

create or replace function public.save_group_itinerary(
  p_group_id uuid, p_expected_revision bigint, p_expected_user_id uuid, p_stops jsonb
)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  current_group public.groups;
  stop jsonb;
  total numeric := 0;
begin
  if p_expected_user_id is null or p_expected_user_id is distinct from auth.uid() then
    raise exception 'Your account changed. Reload before saving.' using errcode = '42501';
  end if;
  select * into current_group from public.groups where id = p_group_id for update;
  if not found or not public.wad2do_is_group_member(p_group_id) then
    raise exception 'Only group members can do this.' using errcode = '42501';
  end if;
  if p_expected_revision is distinct from current_group.plan_revision then
    -- 40001 makes PostgREST 14 retry forever; a stale revision needs a new user decision.
    raise exception 'The plan or group time changed. Load the latest plan before saving.' using errcode = 'PT409';
  end if;
  if current_group.chosen_start is null or current_group.chosen_end is null then
    raise exception 'Choose a group time before saving.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_stops) is distinct from 'array' then
    raise exception 'Stops must be an array.' using errcode = '22023';
  end if;
  for stop in select value from jsonb_array_elements(p_stops) loop
    if jsonb_typeof(stop) is distinct from 'object'
      or not (stop ?& array['activity_id', 'start', 'end', 'cost'])
      or jsonb_typeof(stop -> 'activity_id') is distinct from 'string'
      or (stop ->> 'activity_id') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
      or jsonb_typeof(stop -> 'start') is distinct from 'string'
      or jsonb_typeof(stop -> 'end') is distinct from 'string'
      or (stop ->> 'start') !~ '^[0-9]{2}:[0-5][0-9]$'
      or (stop ->> 'end') !~ '^[0-9]{2}:[0-5][0-9]$'
      or jsonb_typeof(stop -> 'cost') is distinct from 'number' then
      raise exception 'Each stop needs an activity, times and a numeric cost.' using errcode = '22023';
    end if;
    if (stop ->> 'cost')::numeric < 0 or not exists (
      select 1 from public.activities where id = (stop ->> 'activity_id')::uuid
    ) then
      raise exception 'Each stop needs an existing activity and a nonnegative cost.' using errcode = '22023';
    end if;
    total := total + (stop ->> 'cost')::numeric;
  end loop;
  insert into public.itineraries (group_id, stops, total_cost, updated_by, updated_at)
    values (p_group_id, p_stops, total, auth.uid(), clock_timestamp())
    on conflict (group_id) do update set stops = excluded.stops, total_cost = excluded.total_cost,
      updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  return (select plan_revision from public.groups where id = p_group_id);
end;
$$;

revoke all on function public.wad2do_bump_plan_revision() from public, anon, authenticated;
revoke all on function public.wad2do_group_plan_changed() from public, anon, authenticated;
revoke all on function public.save_group_itinerary(uuid, bigint, uuid, jsonb) from public, anon;
grant execute on function public.save_group_itinerary(uuid, bigint, uuid, jsonb) to authenticated;
-- Older clients must reload the updated frontend instead of overwriting a newer plan blindly.
revoke insert, update, delete on public.itineraries from public, anon, authenticated;
revoke insert (group_id, stops, total_cost, updated_by, updated_at),
  update (group_id, stops, total_cost, updated_by, updated_at)
  on public.itineraries from public, anon, authenticated;
grant select on public.itineraries to authenticated;

do $$
declare target text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach target in array array['availability', 'group_members', 'groups'] loop
      if not exists (select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = target) then
        execute format('alter publication supabase_realtime add table public.%I', target);
      end if;
    end loop;
  end if;
end;
$$;

commit;
