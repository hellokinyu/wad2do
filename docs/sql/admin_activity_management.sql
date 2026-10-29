-- Run after admin_review.sql and google_place_search.sql, as postgres.
-- Adds admin-only operations without widening browser table permissions.
begin;

create or replace function public.edit_approved_submission(p_submission_id uuid, p_details jsonb)
returns public.submissions
language plpgsql security definer
set search_path = ''
as $$
declare
  submission public.submissions;
  edited public.submissions;
  fields text[] := array['name', 'category', 'price_per_person', 'duration_min',
    'indoor', 'address', 'postal_code', 'google_place_id', 'area', 'description',
    'website', 'image_url', 'opening_hours'];
begin
  if not public.wad2do_is_admin() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_details) is distinct from 'object'
    or p_details - fields <> '{}'::jsonb then
    raise exception 'Only editable activity details may be changed.' using errcode = '22023';
  end if;
  select * into submission from public.submissions where id = p_submission_id for update;
  if not found then
    raise exception 'Submission not found.';
  end if;
  if submission.status is distinct from 'approved' or submission.activity_id is null then
    raise exception 'This submission is no longer linked to an approved activity.';
  end if;
  select * into edited from jsonb_populate_record(submission, p_details);
  if not public.wad2do_valid_opening_hours(edited.opening_hours::jsonb) then
    raise exception 'Enter valid opening hours for every day.' using errcode = '22023';
  end if;
  if (edited.website is not null and edited.website !~* '^https?://[^[:space:]]+$')
    or (edited.image_url is not null and edited.image_url !~* '^https?://[^[:space:]]+$') then
    raise exception 'Website and photo URLs must start with http:// or https://.' using errcode = '22023';
  end if;

  -- Both updates roll back together if either row fails validation or is missing.
  update public.submissions set
    name = edited.name, category = edited.category, price_per_person = edited.price_per_person,
    duration_min = edited.duration_min, indoor = edited.indoor, address = edited.address,
    postal_code = edited.postal_code, google_place_id = edited.google_place_id,
    area = edited.area, description = edited.description, website = edited.website,
    image_url = edited.image_url, opening_hours = edited.opening_hours
    where id = p_submission_id returning * into edited;

  update public.activities set
    name = edited.name, category = edited.category, price_per_person = edited.price_per_person,
    duration_min = edited.duration_min, indoor = edited.indoor, address = edited.address,
    google_place_id = edited.google_place_id, area = edited.area, description = edited.description,
    website = edited.website, image_url = edited.image_url, opening_hours = edited.opening_hours,
    -- A corrected venue must not retain coordinates or a map from the previous location.
    lat = case when address is distinct from edited.address or google_place_id is distinct from edited.google_place_id then null else lat end,
    lng = case when address is distinct from edited.address or google_place_id is distinct from edited.google_place_id then null else lng end,
    map_embed_url = case when address is distinct from edited.address or google_place_id is distinct from edited.google_place_id then null else map_embed_url end,
    price_note = case when price_per_person is distinct from edited.price_per_person then null else price_note end
    where id = submission.activity_id;
  if not found then
    raise exception 'Published activity not found. No changes were saved.';
  end if;
  return edited;
end;
$$;

create or replace function public.delete_submission(p_submission_id uuid, p_expected_status text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  submission public.submissions;
begin
  if not public.wad2do_is_admin() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;
  if p_expected_status is null or p_expected_status not in ('pending', 'approved', 'rejected') then
    raise exception 'A valid submission status is required.' using errcode = '22023';
  end if;
  select * into submission from public.submissions where id = p_submission_id for update;
  -- Retrying after a committed delete with a lost response is safe.
  if not found then return p_submission_id; end if;
  if submission.status is distinct from p_expected_status then
    raise exception 'This submission has changed. Refresh before deleting it.';
  end if;

  if submission.activity_id is not null then
    perform id from public.activities where id = submission.activity_id for update;
    -- Remove only the deleted activity's stops; preserve the remaining order and times.
    update public.itineraries as itinerary set
      stops = coalesce((select jsonb_agg(stop order by position)
        from jsonb_array_elements(itinerary.stops::jsonb) with ordinality as entries(stop, position)
        where stop ->> 'activity_id' is distinct from submission.activity_id::text), '[]'::jsonb),
      total_cost = coalesce((select sum(case when jsonb_typeof(stop -> 'cost') = 'number'
        then (stop ->> 'cost')::numeric else 0 end)
        from jsonb_array_elements(itinerary.stops::jsonb) as entries(stop)
        where stop ->> 'activity_id' is distinct from submission.activity_id::text), 0)
      where itinerary.stops::jsonb @> jsonb_build_array(jsonb_build_object('activity_id', submission.activity_id));
    delete from public.favourites where activity_id = submission.activity_id;
    delete from public.votes where activity_id = submission.activity_id;
    delete from public.group_activities where activity_id = submission.activity_id;
  end if;
  delete from public.submissions where id = p_submission_id;
  if submission.activity_id is not null then
    delete from public.activities where id = submission.activity_id;
  end if;
  return p_submission_id;
end;
$$;

revoke all on function public.edit_approved_submission(uuid, jsonb) from public, anon;
revoke all on function public.delete_submission(uuid, text) from public, anon;
grant execute on function public.edit_approved_submission(uuid, jsonb) to authenticated;
grant execute on function public.delete_submission(uuid, text) to authenticated;

commit;
