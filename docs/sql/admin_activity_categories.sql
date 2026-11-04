-- Run after admin_review.sql and admin_activity_management.sql, as postgres (Supabase SQL Editor).
-- Safe to run more than once.
-- 1. Lets an activity have several tags: `tags` holds them all, main tag first, and `category`
--    stays as the main tag on its own, so everything that reads one tag keeps working.
-- 2. Lets admins change an activity's tags from the admin Activities page, without giving the
--    browser write access to the activities table.
-- 3. Lets people pick several tags when they submit an activity; approval copies them across.
-- 4. Renames the old tag spellings to the official ones.
-- The official list must match src/data/activityCategories.js.
begin;

-- The official tags, and the old spellings they replace
create or replace function public.wad2do_tidy_tag(p_tag text)
returns text
language sql immutable
set search_path = ''
as $$
  select case lower(btrim(p_tag))
    when 'outdoor' then 'Outdoors'
    when 'outdoors' then 'Outdoors'
    when 'cafes' then 'Cafés'
    when 'cafe' then 'Cafés'
    when 'cafés' then 'Cafés'
    when 'workshop' then 'Workshops'
    else nullif(btrim(p_tag), '')
  end;
$$;

create or replace function public.wad2do_official_tags()
returns text[]
language sql immutable
set search_path = ''
as $$
  select array['Food', 'Cafés', 'Outdoors', 'Arts and culture', 'Workshops', 'Sports and fitness',
    'Social games', 'Nightlife', 'Shopping', 'Family-friendly', 'Wellness'];
$$;

alter table public.activities add column if not exists tags text[] not null default '{}';

-- Tidy the main tags, then start every activity's list with its main tag
update public.activities set category = public.wad2do_tidy_tag(category)
  where category is distinct from public.wad2do_tidy_tag(category);
update public.submissions set category = public.wad2do_tidy_tag(category)
  where category is distinct from public.wad2do_tidy_tag(category);
update public.activities set tags = array[category]
  where cardinality(tags) = 0 and category is not null;

-- Keeps the two in step whichever one changes. Approving a submission, or editing an approved
-- one, only sets `category`; the trigger adds it to the front of `tags`.
create or replace function public.wad2do_keep_main_tag()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  previous text;
  tags_edited boolean := false;
begin
  -- OLD only exists on updates, so read it inside its own check
  if tg_op = 'UPDATE' then
    previous := old.category;
    tags_edited := new.tags is distinct from old.tags;
  end if;
  if tags_edited and cardinality(new.tags) > 0 then
    -- The tag list was edited: its first tag is the main one
    new.category := new.tags[1];
  elsif new.category is not null and not (new.category = any (new.tags)) then
    -- The main tag was edited: it replaces the old main tag at the front of the list
    new.tags := array[new.category] || array_remove(new.tags, previous);
  end if;
  return new;
end;
$$;

drop trigger if exists wad2do_keep_main_tag on public.activities;
create trigger wad2do_keep_main_tag before insert or update of category, tags on public.activities
  for each row execute function public.wad2do_keep_main_tag();

-- Admins set the whole list at once; the first tag becomes the main one
drop function if exists public.admin_set_activity_category(uuid, text);
create or replace function public.admin_set_activity_tags(p_activity_id uuid, p_tags text[])
returns table (id uuid, category text, tags text[])
language plpgsql security definer
set search_path = ''
as $$
declare
  cleaned text[];
begin
  if not public.wad2do_is_admin() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;
  select coalesce(array_agg(tag order by position), '{}') into cleaned
    from (
      select distinct on (tag) tag, position
      from unnest(p_tags) with ordinality as given(tag, position)
      order by tag, position
    ) as unique_tags;
  if cardinality(cleaned) = 0 then
    raise exception 'Pick at least one tag.' using errcode = '22023';
  end if;
  if not (cleaned <@ public.wad2do_official_tags()) then
    raise exception 'Pick tags from the list.' using errcode = '22023';
  end if;

  update public.activities as a set tags = cleaned, category = cleaned[1] where a.id = p_activity_id;
  if not found then
    raise exception 'Activity not found.' using errcode = 'P0002';
  end if;
  -- A community activity keeps its submission in step, so editing the submission later
  -- doesn't bring the old tags back.
  update public.submissions as s set tags = cleaned where s.activity_id = p_activity_id;

  return query select a.id, a.category, a.tags from public.activities as a where a.id = p_activity_id;
end;
$$;

revoke all on function public.admin_set_activity_tags(uuid, text[]) from public, anon;
grant execute on function public.admin_set_activity_tags(uuid, text[]) to authenticated;


-- ---------- Several tags on submissions too ----------
alter table public.submissions add column if not exists tags text[] not null default '{}';
update public.submissions set tags = array[category]
  where cardinality(tags) = 0 and category is not null;
grant insert (tags), update (tags) on public.submissions to authenticated;

drop trigger if exists wad2do_keep_main_tag on public.submissions;
create trigger wad2do_keep_main_tag before insert or update of category, tags on public.submissions
  for each row execute function public.wad2do_keep_main_tag();

-- A submission's tags follow it onto its activity: when it's approved (activity_id is set)
-- and whenever its tags change afterwards. Approval itself didn't need changing.
create or replace function public.wad2do_publish_submission_tags()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.activity_id is not null and cardinality(new.tags) > 0
    and (old.activity_id is distinct from new.activity_id or old.tags is distinct from new.tags) then
    update public.activities set tags = new.tags where id = new.activity_id;
  end if;
  return new;
end;
$$;

drop trigger if exists wad2do_publish_submission_tags on public.submissions;
create trigger wad2do_publish_submission_tags after update of activity_id, tags on public.submissions
  for each row execute function public.wad2do_publish_submission_tags();

-- Editing an approved submission can now change its tags (same function as
-- admin_activity_management.sql, with tags added to the fields it accepts and saves)
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
    'website', 'image_url', 'opening_hours', 'tags'];
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
    image_url = edited.image_url, opening_hours = edited.opening_hours, tags = edited.tags
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


commit;

-- Anything still listed here isn't an official tag. Fix it on the admin Activities page
-- ("Only tags not on the list"), or tell the team so the list can grow.
select tag, count(*) from public.activities, unnest(tags) as tag
  where not (tag = any (public.wad2do_official_tags()))
  group by tag order by count(*) desc;
