-- Disposable database ONLY, as postgres, after group_members.sql and group_transactions.sql.
-- Requires two ordinary profiles and an admin profile. All changes roll back.
begin;

-- Deliberately simulate an older policy that would otherwise expose every profile.
grant select on public.profiles to anon, authenticated;
create policy wad2do_group_test_broad on public.profiles for select to anon, authenticated using (true);

create function pg_temp.wad2do_test_failure() returns trigger language plpgsql as $$
begin
  raise exception 'Simulated database write failure' using errcode = '23514';
end;
$$;

do $$
declare
  user_a uuid;
  user_b uuid;
  admin_id uuid;
  test_group uuid := gen_random_uuid();
  failed_group uuid := gen_random_uuid();
  result public.groups;
  profile_count integer;
  invalid_budget numeric;
  invalid_slots timestamptz[];
  original_start timestamptz := '2026-10-30T10:00:00+08:00';
begin
  select id into user_a from public.profiles where not coalesce(is_admin, false) order by id limit 1;
  select id into user_b from public.profiles where not coalesce(is_admin, false) and id <> user_a order by id limit 1;
  select id into admin_id from public.profiles where is_admin order by id limit 1;
  if user_a is null or user_b is null or admin_id is null then
    raise exception 'Create two ordinary accounts and an admin before running these disposable-database checks.';
  end if;

  if has_function_privilege('anon', 'public.get_group_member_names(uuid)', 'execute')
    or has_function_privilege('anon', 'public.create_group(uuid,text,date,date,numeric,text)', 'execute')
    or has_function_privilege('anon', 'public.replace_group_availability(uuid,timestamptz[],uuid)', 'execute')
    or has_function_privilege('anon', 'public.update_group_settings(uuid,text,date,date,numeric,boolean)', 'execute') then
    raise exception 'Anonymous access to a group function.';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', user_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select * into result from public.create_group(test_group, 'Test outing', '2026-10-30', '2026-10-31', 50, 'ABC234');
  if result.id <> test_group or result.created_by <> user_a then raise exception 'Wrong group owner.'; end if;
  select * into result from public.create_group(test_group, 'Retry changed draft', '2026-10-30', '2026-10-31', 60, 'DEF567');
  if result.name <> 'Test outing' then raise exception 'Retry changed the original group.'; end if;
  execute 'reset role';
  if (select count(*) from public.groups where id = test_group) <> 1
    or (select count(*) from public.group_members where group_id = test_group and user_id = user_a) <> 1 then
    raise exception 'Create/retry did not make exactly one group with its creator.';
  end if;
  insert into public.group_members (group_id, user_id) values (test_group, user_b);

  execute 'set local role authenticated';
  if (select count(*) from public.get_group_member_names(test_group)) <> 2 then raise exception 'Member names unavailable.'; end if;
  select count(*) into profile_count from public.profiles where id in (user_a, user_b, admin_id);
  if profile_count <> 1 then raise exception 'Other members private profiles are visible.'; end if;
  if not exists (select 1 from public.profiles where id = user_a) then raise exception 'Own profile hidden.'; end if;
  begin
    perform public.replace_group_availability(test_group, array[]::timestamptz[], user_b);
    raise exception 'Stale account selection was accepted.';
  exception when insufficient_privilege then null; end;
  perform public.replace_group_availability(test_group, array[original_start, original_start], user_a);
  execute 'reset role';
  if (select count(*) from public.availability where group_id = test_group and user_id = user_a) <> 1 then
    raise exception 'Duplicate slots were not normalized.';
  end if;

  -- Invalid slots must leave the previous saved selection intact.
  execute 'set local role authenticated';
  for invalid_slots in select value from (values
    (null::timestamptz[]), (array[null::timestamptz]),
    (array['2026-10-29T10:00:00+08:00'::timestamptz]),
    (array['2026-10-30T08:30:00+08:00'::timestamptz]),
    (array['2026-10-30T23:00:00+08:00'::timestamptz]),
    (array['2026-10-30T10:15:00+08:00'::timestamptz]),
    (array['2026-10-30T10:30:00.5+08:00'::timestamptz]),
    (array['infinity'::timestamptz])
  ) as inputs(value) loop
    begin
      perform public.replace_group_availability(test_group, invalid_slots, user_a);
      raise exception 'Invalid availability accepted.';
    exception when invalid_parameter_value then null; end;
  end loop;
  execute 'reset role';
  if not exists (select 1 from public.availability where group_id = test_group and user_id = user_a and slot_start = original_start) then
    raise exception 'Invalid input deleted the previous availability.';
  end if;

  update public.groups set start_date = null where id = test_group;
  execute 'set local role authenticated';
  begin
    perform public.replace_group_availability(test_group, array[original_start], user_a);
    raise exception 'Availability accepted without group dates.';
  exception when invalid_parameter_value then null; end;
  execute 'reset role';
  update public.groups set start_date = '2026-10-30' where id = test_group;

  -- A failure after the DELETE must roll the deletion back as well.
  execute 'create trigger wad2do_test_availability_failure before insert on public.availability for each row execute function pg_temp.wad2do_test_failure()';
  execute 'set local role authenticated';
  begin
    perform public.replace_group_availability(test_group, array[original_start + interval '30 minutes'], user_a);
    raise exception 'Expected availability insert failure.';
  exception when check_violation then null; end;
  execute 'reset role';
  execute 'drop trigger wad2do_test_availability_failure on public.availability';
  if not exists (select 1 from public.availability where group_id = test_group and user_id = user_a and slot_start = original_start) then
    raise exception 'Failed insert deleted the previous availability.';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', user_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.replace_group_availability(test_group, array[original_start], user_b);
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', user_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.replace_group_availability(test_group, array[]::timestamptz[], user_a);
  execute 'reset role';
  if exists (select 1 from public.availability where group_id = test_group and user_id = user_a)
    or not exists (select 1 from public.availability where group_id = test_group and user_id = user_b) then
    raise exception 'Clearing availability affected another member.';
  end if;

  execute 'create trigger wad2do_test_membership_failure before insert on public.group_members for each row execute function pg_temp.wad2do_test_failure()';
  execute 'set local role authenticated';
  begin
    perform public.create_group(failed_group, 'Fail creation', '2026-10-30', '2026-10-31', 50, 'JKL789');
    raise exception 'Expected membership failure.';
  exception when check_violation then null; end;
  execute 'reset role';
  execute 'drop trigger wad2do_test_membership_failure on public.group_members';
  if exists (select 1 from public.groups where id = failed_group) then raise exception 'Failed membership left an orphan group.'; end if;

  update public.groups set chosen_start = original_start, chosen_end = original_start + interval '2 hours' where id = test_group;
  insert into public.itineraries (group_id, stops, total_cost, updated_by) values (test_group, '[]', 0, user_a);
  execute 'set local role authenticated';
  begin
    perform public.update_group_settings(test_group, 'New dates', '2026-10-31', '2026-11-01', 40, false);
    raise exception 'Cleared chosen time without confirmation.';
  exception when invalid_parameter_value then null; end;
  for invalid_budget in select value from (values (-1::numeric), ('NaN'::numeric), ('Infinity'::numeric), (null::numeric)) as inputs(value) loop
    begin
      perform public.update_group_settings(test_group, 'Invalid', '2026-10-30', '2026-10-31', invalid_budget, false);
      raise exception 'Invalid budget accepted.';
    exception when invalid_parameter_value then null; end;
  end loop;
  execute 'reset role';
  execute 'create trigger wad2do_test_plan_failure before delete on public.itineraries for each row execute function pg_temp.wad2do_test_failure()';
  execute 'set local role authenticated';
  begin
    perform public.update_group_settings(test_group, 'New dates', '2026-10-31', '2026-11-01', 40, true);
    raise exception 'Expected itinerary delete failure.';
  exception when check_violation then null; end;
  execute 'reset role';
  execute 'drop trigger wad2do_test_plan_failure on public.itineraries';
  if not exists (select 1 from public.groups where id = test_group and name = 'Test outing' and chosen_start = original_start)
    or not exists (select 1 from public.itineraries where group_id = test_group) then
    raise exception 'Failed itinerary deletion left changed settings.';
  end if;
  execute 'set local role authenticated';
  perform public.update_group_settings(test_group, 'New dates', '2026-10-31', '2026-11-01', 0, true);
  execute 'reset role';
  if not exists (select 1 from public.groups where id = test_group and chosen_start is null and chosen_end is null and budget_per_person = 0)
    or exists (select 1 from public.itineraries where group_id = test_group) then
    raise exception 'Settings and plan clearing did not commit together.';
  end if;

  -- Admin profile reads remain available, but admin status does not bypass group membership.
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if (select count(*) from public.profiles where id in (user_a, user_b, admin_id)) <> 3 then raise exception 'Admin profile reads broken.'; end if;
  begin
    perform public.get_group_member_names(test_group);
    raise exception 'Nonmember read member names.';
  exception when insufficient_privilege then null; end;
  begin
    perform public.replace_group_availability(test_group, array[]::timestamptz[], admin_id);
    raise exception 'Nonmember changed availability.';
  exception when insufficient_privilege then null; end;
  begin
    perform public.update_group_settings(test_group, 'Intruder', '2026-10-31', '2026-11-01', 50, true);
    raise exception 'Nonmember changed settings.';
  exception when insufficient_privilege then null; end;
  begin
    perform public.create_group(test_group, 'Intruder', '2026-10-31', '2026-11-01', 50, 'MNP234');
    raise exception 'Another account recovered someone else''s group.';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  execute 'set local role authenticated';
  begin
    perform public.create_group(failed_group, 'No login', '2026-10-30', '2026-10-31', 50, 'RST567');
    raise exception 'Missing user ID accepted.';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  execute 'set local role anon';
  if exists (select 1 from public.profiles) then raise exception 'Anonymous profile read allowed.'; end if;
  execute 'reset role';
  raise notice 'PASS: private profiles, names-only member reads, membership checks, atomic writes, safe retries, validation and rollback.';
end;
$$;
rollback;
