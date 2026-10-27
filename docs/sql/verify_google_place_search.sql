-- Run in SQL Editor AFTER both migration scripts. Rolls back all test changes.
-- Requires one existing admin and one ordinary account; never calls Google.
begin;
do $$
declare
  owner_id uuid;
  admin_id uuid;
  suggestion_id uuid := gen_random_uuid();
  result public.submissions;
  first_activity uuid;
  marker text := 'Place lookup SQL verification ' || suggestion_id;
begin
  select id into owner_id from public.profiles where not coalesce(is_admin, false) limit 1;
  select id into admin_id from public.profiles where is_admin = true limit 1;
  if owner_id is null or admin_id is null then
    raise exception 'Create an ordinary account and an admin account first.';
  end if;

  if not has_column_privilege('authenticated', 'public.submissions', 'google_place_id', 'INSERT')
    or not has_column_privilege('authenticated', 'public.submissions', 'postal_code', 'UPDATE')
    or has_column_privilege('authenticated', 'public.submissions', 'status', 'UPDATE')
    or has_column_privilege('authenticated', 'public.activities', 'name', 'INSERT')
    or has_function_privilege('authenticated', 'public.reserve_google_place_search(uuid)', 'EXECUTE') then
    raise exception 'Unexpected browser grants.';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.submissions (id, submitted_by, name, category, price_per_person,
    duration_min, indoor, address, area, opening_hours, status, google_place_id, postal_code)
    values (suggestion_id, owner_id, marker, 'Arts and culture', 20,
      60, true, '10 Orchard Road', 'Orchard',
      '{"Mon":{"open24h":true},"Tue":{"closed":true},"Wed":{"closed":true},"Thu":{"closed":true},"Fri":{"closed":true},"Sat":{"closed":true},"Sun":{"closed":true}}',
      'pending', 'ChIJ_sql_test', '012345');
  begin
    update public.submissions set status = 'approved' where id = suggestion_id;
    raise exception 'Normal user changed review status.';
  exception when insufficient_privilege then null; end;
  begin
    perform public.approve_submission(suggestion_id);
    raise exception 'Normal user approved a submission.';
  exception when insufficient_privilege then null; end;
  update public.submissions set google_place_id = 'ChIJ_forbidden' where id = suggestion_id;
  if found then raise exception 'Normal user edited a pending submission.'; end if;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.submissions set google_place_id = 'ChIJ_corrected' where id = suggestion_id;
  if not found then raise exception 'Admin edit was blocked.'; end if;
  select * into result from public.approve_submission(suggestion_id);
  first_activity := result.activity_id;
  if not exists (select 1 from public.activities where id = first_activity
    and source = 'community' and google_place_id = 'ChIJ_corrected') then
    raise exception 'Approval did not copy the exact ID.';
  end if;
  select * into result from public.approve_submission(suggestion_id);
  if result.activity_id is distinct from first_activity
    or (select count(*) from public.activities where name = marker) <> 1 then
    raise exception 'Repeated approval created a duplicate.';
  end if;
  execute 'reset role';

  -- Older/null-ID submissions remain publishable.
  insert into public.submissions (id, submitted_by, name, category, price_per_person,
    duration_min, indoor, address, area, opening_hours, status)
    select gen_random_uuid(), owner_id, marker || ' manual', category, price_per_person,
      duration_min, indoor, address, area, opening_hours, 'pending'
      from public.submissions where id = suggestion_id
    returning id into suggestion_id;
  execute 'set local role authenticated';
  select * into result from public.approve_submission(suggestion_id);
  if not exists (select 1 from public.activities where id = result.activity_id and google_place_id is null) then
    raise exception 'Approval without an ID failed.';
  end if;
  execute 'reset role';
  raise notice 'PASS: column grants, ordinary-user restrictions, admin correction, exact approval copy, null ID and duplicate approval.';
end $$;
rollback;
