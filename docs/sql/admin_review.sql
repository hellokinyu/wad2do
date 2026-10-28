-- Run this entire file in the Supabase SQL Editor as postgres.
-- First add activities.website and submissions.reviewed_at/activity_id (already done).
-- This file does not promote any account to admin or remove existing policies.
begin;

alter table public.profiles add column if not exists home_station_id text;
alter table public.submissions add column if not exists google_place_id text;
alter table public.submissions add column if not exists postal_code text;

-- A helper for policies: checks only the signed-in user's own admin flag.
-- SECURITY DEFINER lets this read profiles without recursively applying its policies.
create or replace function public.wad2do_is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_admin = true
  );
$$;

revoke all on function public.wad2do_is_admin() from public, anon;
grant execute on function public.wad2do_is_admin() to authenticated;

-- Pending submissions use {} for hours awaiting admin review, never fabricated hours.
create or replace function public.wad2do_valid_opening_hours(p_hours jsonb)
returns boolean
language plpgsql immutable
set search_path = ''
as $$
declare
  days text[] := array['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  day text;
  entry jsonb;
  has_open_day boolean := false;
begin
  if jsonb_typeof(p_hours) is distinct from 'object' then
    return false;
  end if;
  if not (p_hours ?& days) or p_hours - days <> '{}'::jsonb then
    return false;
  end if;
  foreach day in array days loop
    entry := p_hours -> day;
    if jsonb_typeof(entry) is distinct from 'object' then
      return false;
    end if;
    if entry = '{"closed":true}'::jsonb then
      continue;
    elsif entry = '{"open24h":true}'::jsonb then
      has_open_day := true;
    elsif jsonb_typeof(entry) = 'object'
      and entry ?& array['open', 'close']
      and entry - array['open', 'close'] = '{}'::jsonb
      and jsonb_typeof(entry -> 'open') = 'string'
      and jsonb_typeof(entry -> 'close') = 'string'
      and entry ->> 'open' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      and entry ->> 'close' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      and entry ->> 'open' <> entry ->> 'close' then
      has_open_day := true;
    else
      return false;
    end if;
  end loop;
  return has_open_day;
end;
$$;
revoke all on function public.wad2do_valid_opening_hours(jsonb) from public, anon;
grant execute on function public.wad2do_valid_opening_hours(jsonb) to authenticated;

-- 1. Profiles: users may edit preferences, but cannot assign admin access.
alter table public.profiles enable row level security;
revoke insert, update, delete on public.profiles from public, anon, authenticated;
-- Remove any earlier column grants too; table grants and column grants are separate.
revoke insert (id, display_name, interests, budget, home_area, home_station_id, company, is_admin, created_at),
  update (id, display_name, interests, budget, home_area, home_station_id, company, is_admin, created_at)
  on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, interests, budget, home_area, home_station_id, company)
  on public.profiles to authenticated;

drop policy if exists wad2do_read_profile on public.profiles;
create policy wad2do_read_profile on public.profiles for select to authenticated
  using (id = auth.uid() or public.wad2do_is_admin());

drop policy if exists wad2do_edit_own_profile on public.profiles;
create policy wad2do_edit_own_profile on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Restrictive policies also limit access granted by older, broader policies.
drop policy if exists wad2do_limit_profile_updates on public.profiles;
create policy wad2do_limit_profile_updates on public.profiles as restrictive
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- 2. Submissions: owners read their submissions; admins read all and edit pending ones.
alter table public.submissions enable row level security;
revoke all on public.submissions from public, anon, authenticated;
revoke insert (id, submitted_by, name, category, price_per_person, duration_min,
  indoor, address, area, opening_hours, description, image_url, website, google_place_id, postal_code, status,
  reject_reason, reviewed_by, reviewed_at, activity_id, created_at),
  update (id, submitted_by, name, category, price_per_person, duration_min,
  indoor, address, area, opening_hours, description, image_url, website, google_place_id, postal_code, status,
  reject_reason, reviewed_by, reviewed_at, activity_id, created_at)
  on public.submissions from public, anon, authenticated;
grant select on public.submissions to authenticated;
grant insert (id, submitted_by, name, category, price_per_person, duration_min,
  indoor, address, area, opening_hours, description, image_url, website, google_place_id, postal_code, status)
  on public.submissions to authenticated;
grant update (name, category, price_per_person, duration_min, indoor, address,
  area, opening_hours, description, image_url, website, google_place_id, postal_code)
  on public.submissions to authenticated;

drop policy if exists wad2do_read_submissions on public.submissions;
create policy wad2do_read_submissions on public.submissions for select to authenticated
  using (submitted_by = auth.uid() or public.wad2do_is_admin());
drop policy if exists wad2do_limit_submission_reads on public.submissions;
create policy wad2do_limit_submission_reads on public.submissions as restrictive
  for select to authenticated
  using (submitted_by = auth.uid() or public.wad2do_is_admin());

drop policy if exists wad2do_submit_activity on public.submissions;
create policy wad2do_submit_activity on public.submissions for insert to authenticated
  with check (submitted_by = auth.uid() and status = 'pending'
    and reject_reason is null and reviewed_by is null
    and reviewed_at is null and activity_id is null
    and opening_hours::jsonb = '{}'::jsonb);
drop policy if exists wad2do_limit_submission_inserts on public.submissions;
create policy wad2do_limit_submission_inserts on public.submissions as restrictive
  for insert to authenticated
  with check (submitted_by = auth.uid() and status = 'pending'
    and reject_reason is null and reviewed_by is null
    and reviewed_at is null and activity_id is null
    and opening_hours::jsonb = '{}'::jsonb);

drop policy if exists wad2do_edit_pending_submission on public.submissions;
create policy wad2do_edit_pending_submission on public.submissions for update to authenticated
  using (public.wad2do_is_admin() and status = 'pending')
  with check (public.wad2do_is_admin() and status = 'pending');
drop policy if exists wad2do_limit_submission_updates on public.submissions;
create policy wad2do_limit_submission_updates on public.submissions as restrictive
  for update to authenticated
  using (public.wad2do_is_admin() and status = 'pending')
  with check (public.wad2do_is_admin() and status = 'pending');

-- 3. Activities: publish through the approval function, not a browser INSERT.
alter table public.activities enable row level security;
revoke insert, update, delete on public.activities from public, anon, authenticated;
revoke insert (id, name, category, price_per_person, duration_min, indoor, address,
  area, lat, lng, opening_hours, description, image_url, source, google_place_id,
  created_at, map_embed_url, price_note, website),
  update (id, name, category, price_per_person, duration_min, indoor, address,
  area, lat, lng, opening_hours, description, image_url, source, google_place_id,
  created_at, map_embed_url, price_note, website)
  on public.activities from public, anon, authenticated;
grant select on public.activities to authenticated;
drop policy if exists wad2do_read_activities on public.activities;
create policy wad2do_read_activities on public.activities for select to authenticated
  using (true);

-- 4. Approval runs as one transaction: either both writes succeed or neither does.
create or replace function public.approve_submission(p_submission_id uuid)
returns public.submissions
language plpgsql security definer
set search_path = ''
as $$
declare
  submission public.submissions;
  new_activity_id uuid;
begin
  if not public.wad2do_is_admin() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;

  -- Lock this row so two admins cannot publish the same submission at once.
  select * into submission from public.submissions
    where id = p_submission_id for update;
  if not found then
    raise exception 'Submission not found.';
  end if;
  -- A retry after a lost response returns the original result without another INSERT.
  if submission.status = 'approved' and submission.activity_id is not null then
    return submission;
  end if;
  if submission.status is distinct from 'pending' then
    raise exception 'This submission has already been reviewed.';
  end if;

  if not public.wad2do_valid_opening_hours(submission.opening_hours::jsonb) then
    raise exception 'Add valid opening hours for every day and save before approving.' using errcode = '22023';
  end if;

  insert into public.activities (
    name, category, price_per_person, duration_min, indoor, address, area,
    opening_hours, description, image_url, website, source, google_place_id
  ) values (
    submission.name, submission.category, submission.price_per_person,
    submission.duration_min, submission.indoor, submission.address, submission.area,
    submission.opening_hours, submission.description, submission.image_url,
    submission.website, 'community', submission.google_place_id
  ) returning id into new_activity_id;

  update public.submissions set
    status = 'approved', reject_reason = null, reviewed_by = auth.uid(),
    reviewed_at = now(), activity_id = new_activity_id
    where id = p_submission_id
    returning * into submission;
  return submission;
end;
$$;

-- 5. Rejection requires a reason and records the actual signed-in reviewer.
create or replace function public.reject_submission(p_submission_id uuid, p_reason text)
returns public.submissions
language plpgsql security definer
set search_path = ''
as $$
declare
  submission public.submissions;
begin
  if not public.wad2do_is_admin() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 1 or length(btrim(p_reason)) > 300 then
    raise exception 'Enter a rejection reason between 1 and 300 characters.';
  end if;

  select * into submission from public.submissions
    where id = p_submission_id for update;
  if not found then
    raise exception 'Submission not found.';
  end if;
  if submission.status = 'rejected' and submission.reject_reason = btrim(p_reason) then
    return submission;
  end if;
  if submission.status is distinct from 'pending' then
    raise exception 'This submission has already been reviewed.';
  end if;

  update public.submissions set
    status = 'rejected', reject_reason = btrim(p_reason),
    reviewed_by = auth.uid(), reviewed_at = now(), activity_id = null
    where id = p_submission_id
    returning * into submission;
  return submission;
end;
$$;

revoke all on function public.approve_submission(uuid) from public, anon;
revoke all on function public.reject_submission(uuid, text) from public, anon;
grant execute on function public.approve_submission(uuid) to authenticated;
grant execute on function public.reject_submission(uuid, text) to authenticated;

commit;
