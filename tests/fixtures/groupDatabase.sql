-- Test fixture based on the supplied 28 Oct 2026 group-schema inspection. Never apply to Supabase.
-- auth.users/activities are minimal FK stubs; votes/share broad policies deliberately test older grants.
create role anon;
create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid;
$$;
create function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
$$;
grant usage on schema auth, public to anon, authenticated;
create table auth.users (id uuid primary key, raw_user_meta_data jsonb);
create table public.activities (id uuid primary key);
create table public."profiles" (
  "id" uuid not null,
  "display_name" text,
  "interests" text[],
  "budget" text,
  "home_area" text,
  "is_admin" bool default false,
  "created_at" timestamptz default timezone('utc'::text, now()),
  "home_station_id" text
);
create table public."groups" (
  "id" uuid not null default gen_random_uuid(),
  "name" text not null,
  "start_date" date,
  "end_date" date,
  "budget_per_person" numeric,
  "invite_code" text,
  "created_by" uuid,
  "chosen_start" timestamptz,
  "chosen_end" timestamptz,
  "created_at" timestamptz default timezone('utc'::text, now())
);
create table public."group_members" (
  "group_id" uuid not null,
  "user_id" uuid not null
);
create table public."availability" (
  "group_id" uuid not null,
  "user_id" uuid not null,
  "slot_start" timestamptz not null
);
create table public."itineraries" (
  "group_id" uuid not null,
  "stops" jsonb not null,
  "total_cost" numeric,
  "updated_by" uuid,
  "updated_at" timestamptz default timezone('utc'::text, now())
);
create table public."votes" (
  "group_id" uuid not null,
  "activity_id" uuid not null,
  "user_id" uuid not null,
  "value" int4
);
create table public."group_activities" (
  "group_id" uuid not null,
  "activity_id" uuid not null,
  "shared_by" uuid
);
alter table public."availability" add constraint "availability_pkey" PRIMARY KEY (group_id, user_id, slot_start);
alter table public."group_activities" add constraint "group_activities_pkey" PRIMARY KEY (group_id, activity_id);
alter table public."group_members" add constraint "group_members_pkey" PRIMARY KEY (group_id, user_id);
alter table public."groups" add constraint "groups_invite_code_key" UNIQUE (invite_code);
alter table public."groups" add constraint "groups_pkey" PRIMARY KEY (id);
alter table public."itineraries" add constraint "itineraries_pkey" PRIMARY KEY (group_id);
alter table public."profiles" add constraint "profiles_pkey" PRIMARY KEY (id);
alter table public."votes" add constraint "votes_pkey" PRIMARY KEY (group_id, activity_id, user_id);
alter table public."votes" add constraint "votes_value_check" CHECK ((value = ANY (ARRAY[1, '-1'::integer])));
alter table public."availability" add constraint "availability_group_id_fkey" FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
alter table public."availability" add constraint "availability_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public."group_activities" add constraint "group_activities_activity_id_fkey" FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE;
alter table public."group_activities" add constraint "group_activities_group_id_fkey" FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
alter table public."group_activities" add constraint "group_activities_shared_by_fkey" FOREIGN KEY (shared_by) REFERENCES profiles(id);
alter table public."group_members" add constraint "group_members_group_id_fkey" FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
alter table public."group_members" add constraint "group_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public."groups" add constraint "groups_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public."itineraries" add constraint "itineraries_group_id_fkey" FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
alter table public."itineraries" add constraint "itineraries_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES profiles(id);
alter table public."profiles" add constraint "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."votes" add constraint "votes_activity_id_fkey" FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE;
alter table public."votes" add constraint "votes_group_id_fkey" FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
alter table public."votes" add constraint "votes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
create function public.wad2do_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_admin);
$$;
alter table public."profiles" enable row level security;
alter table public."groups" enable row level security;
alter table public."group_members" enable row level security;
alter table public."availability" enable row level security;
alter table public."itineraries" enable row level security;
alter table public."votes" enable row level security;
alter table public."group_activities" enable row level security;
grant DELETE on public."availability" to "anon";
grant INSERT on public."availability" to "anon";
grant REFERENCES on public."availability" to "anon";
grant SELECT on public."availability" to "anon";
grant TRIGGER on public."availability" to "anon";
grant TRUNCATE on public."availability" to "anon";
grant UPDATE on public."availability" to "anon";
grant DELETE on public."availability" to "authenticated";
grant INSERT on public."availability" to "authenticated";
grant REFERENCES on public."availability" to "authenticated";
grant SELECT on public."availability" to "authenticated";
grant TRIGGER on public."availability" to "authenticated";
grant TRUNCATE on public."availability" to "authenticated";
grant UPDATE on public."availability" to "authenticated";
grant DELETE on public."group_members" to "anon";
grant INSERT on public."group_members" to "anon";
grant REFERENCES on public."group_members" to "anon";
grant SELECT on public."group_members" to "anon";
grant TRIGGER on public."group_members" to "anon";
grant TRUNCATE on public."group_members" to "anon";
grant UPDATE on public."group_members" to "anon";
grant DELETE on public."group_members" to "authenticated";
grant INSERT on public."group_members" to "authenticated";
grant REFERENCES on public."group_members" to "authenticated";
grant SELECT on public."group_members" to "authenticated";
grant TRIGGER on public."group_members" to "authenticated";
grant TRUNCATE on public."group_members" to "authenticated";
grant UPDATE on public."group_members" to "authenticated";
grant DELETE on public."groups" to "anon";
grant INSERT on public."groups" to "anon";
grant REFERENCES on public."groups" to "anon";
grant SELECT on public."groups" to "anon";
grant TRIGGER on public."groups" to "anon";
grant TRUNCATE on public."groups" to "anon";
grant UPDATE on public."groups" to "anon";
grant DELETE on public."groups" to "authenticated";
grant INSERT on public."groups" to "authenticated";
grant REFERENCES on public."groups" to "authenticated";
grant SELECT on public."groups" to "authenticated";
grant TRIGGER on public."groups" to "authenticated";
grant TRUNCATE on public."groups" to "authenticated";
grant UPDATE on public."groups" to "authenticated";
grant DELETE on public."itineraries" to "anon";
grant INSERT on public."itineraries" to "anon";
grant REFERENCES on public."itineraries" to "anon";
grant SELECT on public."itineraries" to "anon";
grant TRIGGER on public."itineraries" to "anon";
grant TRUNCATE on public."itineraries" to "anon";
grant UPDATE on public."itineraries" to "anon";
grant DELETE on public."itineraries" to "authenticated";
grant INSERT on public."itineraries" to "authenticated";
grant REFERENCES on public."itineraries" to "authenticated";
grant SELECT on public."itineraries" to "authenticated";
grant TRIGGER on public."itineraries" to "authenticated";
grant TRUNCATE on public."itineraries" to "authenticated";
grant UPDATE on public."itineraries" to "authenticated";
grant REFERENCES on public."profiles" to "anon";
grant SELECT on public."profiles" to "anon";
grant TRIGGER on public."profiles" to "anon";
grant TRUNCATE on public."profiles" to "anon";
grant REFERENCES on public."profiles" to "authenticated";
grant SELECT on public."profiles" to "authenticated";
grant TRIGGER on public."profiles" to "authenticated";
grant TRUNCATE on public."profiles" to "authenticated";
create policy "Availability viewable by authenticated users" on public."availability" as PERMISSIVE for SELECT to public using ((auth.role() = 'authenticated'::text));
create policy "Users can manage own availability" on public."availability" as PERMISSIVE for ALL to public using ((auth.uid() = user_id));
create policy "Collaborative access to group_members" on public."group_members" as PERMISSIVE for ALL to public using ((auth.role() = 'authenticated'::text));
create policy "Collaborative access to groups" on public."groups" as PERMISSIVE for ALL to public using ((auth.role() = 'authenticated'::text));
create policy "Collaborative access to itineraries" on public."itineraries" as PERMISSIVE for ALL to public using ((auth.role() = 'authenticated'::text));
create policy "Profiles viewable by everyone" on public."profiles" as PERMISSIVE for SELECT to public using (true);
create policy "Users can update own profile" on public."profiles" as PERMISSIVE for UPDATE to public using ((auth.uid() = id));
create policy "wad2do_edit_own_profile" on public."profiles" as PERMISSIVE for UPDATE to "authenticated" using ((id = auth.uid())) with check ((id = auth.uid()));
create policy "wad2do_limit_profile_updates" on public."profiles" as RESTRICTIVE for UPDATE to "authenticated" using ((id = auth.uid())) with check ((id = auth.uid()));
create policy "wad2do_read_group_profiles" on public."profiles" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM (group_members mine
     JOIN group_members theirs ON ((theirs.group_id = mine.group_id)))
  WHERE ((mine.user_id = auth.uid()) AND (theirs.user_id = profiles.id)))));
create policy "wad2do_read_profile" on public."profiles" as PERMISSIVE for SELECT to "authenticated" using (((id = auth.uid()) OR wad2do_is_admin()));
grant all on public."votes" to anon, authenticated;
create policy test_old_broad_access on public."votes" for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
grant all on public."group_activities" to anon, authenticated;
create policy test_old_broad_access on public."group_activities" for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
insert into auth.users (id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), ('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
insert into public.profiles (id, display_name, is_admin, home_station_id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Member A', false, 'private-a'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Member B', false, 'private-b'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Admin', true, 'private-admin');
insert into public.activities (id) values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222');
