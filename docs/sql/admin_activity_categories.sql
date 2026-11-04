-- Run after admin_review.sql and admin_activity_management.sql, as postgres (Supabase SQL Editor).
-- Safe to run more than once.
-- 1. Lets an activity have several tags: `tags` holds them all, main tag first, and `category`
--    stays as the main tag on its own, so everything that reads one tag keeps working.
-- 2. Lets admins change an activity's tags from the admin Activities page, without giving the
--    browser write access to the activities table.
-- 3. Renames the old tag spellings to the official ones.
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
  -- A community activity keeps its submission's main tag in step, so editing the submission
  -- later doesn't bring the old tag back.
  update public.submissions as s set category = cleaned[1] where s.activity_id = p_activity_id;

  return query select a.id, a.category, a.tags from public.activities as a where a.id = p_activity_id;
end;
$$;

revoke all on function public.admin_set_activity_tags(uuid, text[]) from public, anon;
grant execute on function public.admin_set_activity_tags(uuid, text[]) to authenticated;

commit;

-- Anything still listed here isn't an official tag. Fix it on the admin Activities page
-- ("Only tags not on the list"), or tell the team so the list can grow.
select tag, count(*) from public.activities, unnest(tags) as tag
  where not (tag = any (public.wad2do_official_tags()))
  group by tag order by count(*) desc;
