-- Disposable database ONLY, as postgres, after both group migrations. All changes roll back.
-- Requires two ordinary profiles, one admin profile and two existing catalogue activities.
begin;
do $$
declare
  user_a uuid;
  user_b uuid;
  outsider uuid;
  group_a uuid := gen_random_uuid();
  group_b uuid := gen_random_uuid();
  activity_a uuid;
  activity_b uuid;
  preview jsonb;
  target text;
  row_count integer;
begin
  select id into user_a from public.profiles where not coalesce(is_admin, false) order by id limit 1;
  select id into user_b from public.profiles where not coalesce(is_admin, false) and id <> user_a order by id limit 1;
  select id into outsider from public.profiles where is_admin order by id limit 1;
  select id into activity_a from public.activities order by id limit 1;
  select id into activity_b from public.activities where id <> activity_a order by id limit 1;
  if user_a is null or user_b is null or outsider is null or activity_a is null or activity_b is null then
    raise exception 'Two ordinary profiles, an admin and two activities are required.';
  end if;
  foreach target in array array['profiles', 'groups', 'group_members', 'availability', 'itineraries', 'votes', 'group_activities'] loop
    if has_table_privilege('anon', 'public.' || target, 'TRUNCATE')
      or has_table_privilege('authenticated', 'public.' || target, 'TRUNCATE') then
      raise exception 'Browser role can truncate %.', target;
    end if;
  end loop;
  if has_function_privilege('anon', 'public.wad2do_group_details(uuid)', 'execute')
    or has_function_privilege('anon', 'public.wad2do_join_group(uuid,text)', 'execute') then
    raise exception 'Anonymous invite function access.';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', user_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.create_group(group_a, 'Access test A', '2026-10-30', '2026-10-31', 50, 'UVW234');
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', user_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.create_group(group_b, 'Access test B', '2026-10-30', '2026-10-31', 50, 'XYZ567');
  -- Code joins accept lowercase/whitespace, and a repeated join creates no duplicate.
  perform public.wad2do_join_group(p_invite_code => ' uvw234 ');
  perform public.wad2do_join_group(p_invite_code => 'UVW234');
  execute 'reset role';
  if (select count(*) from public.group_members where group_id = group_a and user_id = user_b) <> 1 then
    raise exception 'Code join was not idempotent.';
  end if;
  insert into public.group_activities (group_id, activity_id, shared_by) values
    (group_a, activity_a, user_a), (group_a, activity_b, user_b), (group_b, activity_a, user_b);
  insert into public.votes (group_id, activity_id, user_id, value) values
    (group_a, activity_a, user_a, 1), (group_a, activity_a, user_b, 1), (group_b, activity_a, user_b, 1);
  insert into public.availability (group_id, user_id, slot_start) values (group_b, user_b, '2026-10-30T10:00:00+08:00');
  insert into public.itineraries (group_id, stops, updated_by) values (group_b, '[]', user_b);

  perform set_config('request.jwt.claims', json_build_object('sub', user_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if not exists (select 1 from public.groups where id = group_a) then raise exception 'Own group is hidden.'; end if;
  if exists (select 1 from public.groups where id = group_b) then raise exception 'Nonmember can enumerate another group.'; end if;
  foreach target in array array['group_members', 'availability', 'itineraries', 'votes', 'group_activities'] loop
    execute format('select count(*) from public.%I where group_id = $1', target) into row_count using group_b;
    if row_count <> 0 then raise exception 'Nonmember can read %.', target; end if;
  end loop;
  preview := public.wad2do_group_details(group_b);
  if preview ->> 'name' <> 'Access test B' or (preview ->> 'is_member')::boolean
    or preview ? 'invite_code' or preview ? 'chosen_start' or preview ? 'budget_per_person' then
    raise exception 'Invite preview exposed member-only fields or failed to load.';
  end if;
  begin
    insert into public.group_members (group_id, user_id) values (group_b, user_a);
    raise exception 'Direct membership insertion allowed.';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.group_members where group_id = group_a and user_id = user_b;
    raise exception 'Direct membership deletion allowed.';
  exception when insufficient_privilege then null; end;
  begin
    update public.groups set created_by = user_a where id = group_b;
    raise exception 'Browser changed group ownership.';
  exception when insufficient_privilege then null; end;
  update public.groups set chosen_start = '2026-10-30T10:00:00+08:00' where id = group_b;
  if found then raise exception 'Nonmember changed a group time.'; end if;
  update public.itineraries set stops = '[{"changed":true}]', updated_by = user_a where group_id = group_b;
  if found then raise exception 'Nonmember changed an itinerary.'; end if;
  begin
    delete from public.availability where group_id = group_b;
    raise exception 'Browser deleted availability directly.';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.itineraries (group_id, stops, updated_by) values (group_a, '[]', user_b);
    raise exception 'Itinerary reviewer could be impersonated.';
  exception when insufficient_privilege then null; end;
  insert into public.itineraries (group_id, stops, updated_by) values (group_a, '[]', user_a);
  begin
    insert into public.votes (group_id, activity_id, user_id, value) values (group_a, activity_b, user_b, 1);
    raise exception 'Another member vote could be forged.';
  exception when insufficient_privilege then null; end;
  update public.votes set value = -1 where group_id = group_a and user_id = user_b;
  if found then raise exception 'Another member vote could be changed.'; end if;
  delete from public.votes where group_id = group_a and user_id = user_b;
  if found then raise exception 'Another member vote could be removed.'; end if;
  delete from public.group_activities where group_id = group_a and activity_id = activity_b;
  if found then raise exception 'Another member shared activity could be removed.'; end if;
  delete from public.group_activities where group_id = group_a and activity_id = activity_a;
  if not found then raise exception 'Own shared activity could not be removed.'; end if;
  if exists (select 1 from public.votes where group_id = group_a and activity_id = activity_a) then
    raise exception 'Removing a shared activity did not remove all its votes.';
  end if;
  begin
    insert into public.votes (group_id, activity_id, user_id, value) values (group_a, activity_a, user_a, 1);
    raise exception 'Vote for an unshared activity allowed.';
  exception when foreign_key_violation then null; end;
  update public.profiles set home_area = 'Bishan' where id = user_a;
  if not found then raise exception 'Own preference updates broken.'; end if;
  begin
    update public.profiles set is_admin = true where id = user_a;
    raise exception 'Browser promoted itself to admin.';
  exception when insufficient_privilege then null; end;
  -- Group IDs are exposed by Realtime DELETE events; they are not invite secrets.
  begin
    perform public.wad2do_join_group(p_group_id => group_b);
    raise exception 'A group UUID alone granted membership.';
  exception when no_data_found then null; end;
  begin
    perform public.wad2do_join_group(p_group_id => group_b, p_invite_code => 'UVW234');
    raise exception 'A different group code granted membership.';
  exception when no_data_found then null; end;
  if exists (select 1 from public.group_members where group_id = group_b and user_id = user_a) then
    raise exception 'A rejected invite created membership.';
  end if;
  perform public.wad2do_join_group(p_group_id => group_b, p_invite_code => ' xyz567 ');
  perform public.wad2do_join_group(p_group_id => group_b, p_invite_code => 'XYZ567');
  if not (public.wad2do_group_details(group_b) ->> 'is_member')::boolean then
    raise exception 'Invite-link join failed.';
  end if;
  begin
    perform public.wad2do_join_group(p_invite_code => 'ZZZ999');
    raise exception 'Wrong invite code was accepted.';
  exception when no_data_found then null; end;
  execute 'reset role';

  -- An admin outside the group has no special group access.
  perform set_config('request.jwt.claims', json_build_object('sub', outsider, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if exists (select 1 from public.itineraries where group_id = group_a) then raise exception 'Admin bypassed group membership.'; end if;
  execute 'reset role';
  raise notice 'PASS: member-only data, private invite previews, code/link joins, owner-only votes/shares, cascade removal and protected admin flags.';
end;
$$;
rollback;
