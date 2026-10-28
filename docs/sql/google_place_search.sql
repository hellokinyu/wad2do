-- Run after docs/sql/admin_review.sql. Rerunnable; retains existing records and policies.
begin;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
    and tablename = 'submissions' and policyname = 'wad2do_limit_submission_updates')
    or to_regprocedure('public.wad2do_valid_opening_hours(jsonb)') is null then
    raise exception 'Run the current docs/sql/admin_review.sql first to install protected review policies and hours validation.';
  end if;
end $$;

alter table public.submissions add column if not exists google_place_id text;
alter table public.submissions add column if not exists postal_code text;
alter table public.submissions drop constraint if exists submissions_postal_code_format;
alter table public.submissions add constraint submissions_postal_code_format
  check (postal_code is null or postal_code ~ '^[0-9]{6}$') not valid;
alter table public.submissions drop constraint if exists submissions_google_place_id_format;
alter table public.submissions add constraint submissions_google_place_id_format
  check (google_place_id is null or google_place_id ~ '^[A-Za-z0-9_-]{1,255}$') not valid;

grant insert (google_place_id, postal_code), update (google_place_id, postal_code)
  on public.submissions to authenticated;

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


revoke all on function public.approve_submission(uuid) from public, anon;
grant execute on function public.approve_submission(uuid) to authenticated;

-- Config is deliberately disabled until the owner allocates a safe allowance.
create table if not exists public.google_place_search_config (
  singleton boolean primary key default true check (singleton),
  monthly_limit integer check (monthly_limit > 0),
  user_hourly_limit integer check (user_hourly_limit > 0)
);
insert into public.google_place_search_config (singleton) values (true) on conflict do nothing;
create table if not exists public.google_place_search_usage (
  bucket text not null,
  window_start timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0),
  primary key (bucket, window_start)
);
alter table public.google_place_search_config enable row level security;
alter table public.google_place_search_usage enable row level security;
revoke all on public.google_place_search_config, public.google_place_search_usage
  from public, anon, authenticated;

create or replace function public.reserve_google_place_search(p_user_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  config public.google_place_search_config;
  month_start timestamptz;
  hour_start timestamptz;
  app_used integer;
  user_used integer;
begin
  if p_user_id is null then raise exception 'User required.'; end if;
  -- All instances lock the same row before checking either counter.
  select * into config from public.google_place_search_config where singleton for update;
  if not found or config.monthly_limit is null or config.user_hourly_limit is null then
    return 'lookup_disabled';
  end if;
  -- Google's free usage resets on the first day at midnight US Pacific time.
  month_start := date_trunc('month', now() at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles';
  hour_start := date_trunc('hour', now() at time zone 'UTC') at time zone 'UTC';
  select attempts into app_used from public.google_place_search_usage
    where bucket = 'app' and window_start = month_start;
  select attempts into user_used from public.google_place_search_usage
    where bucket = p_user_id::text and window_start = hour_start;
  if coalesce(app_used, 0) >= config.monthly_limit then return 'app_limit'; end if;
  if coalesce(user_used, 0) >= config.user_hourly_limit then return 'user_limit'; end if;

  insert into public.google_place_search_usage (bucket, window_start, attempts)
    values ('app', month_start, 1), (p_user_id::text, hour_start, 1)
    on conflict (bucket, window_start) do update
      set attempts = public.google_place_search_usage.attempts + 1;
  return 'ok';
end;
$$;
revoke all on function public.reserve_google_place_search(uuid) from public, anon, authenticated;
grant execute on function public.reserve_google_place_search(uuid) to service_role;
commit;
