-- Read-only. Shows schema and permissions, not profile rows, passwords or API keys.
-- One statement returns every check together, including editors that show only the last result.
with columns_info as (
select table_name, ordinal_position, column_name, data_type, udt_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name in (
  'profiles', 'groups', 'group_members', 'availability', 'itineraries', 'votes', 'group_activities'
)
order by table_name, ordinal_position
), constraints_info as (
select c.relname as table_name, con.conname, pg_get_constraintdef(con.oid) as definition
from pg_constraint con join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in (
  'profiles', 'groups', 'group_members', 'availability', 'itineraries', 'votes', 'group_activities'
)
order by c.relname, con.conname
), policies_info as (
select tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies where schemaname = 'public' and tablename in (
  'profiles', 'groups', 'group_members', 'availability', 'itineraries', 'votes', 'group_activities'
)
order by tablename, policyname
), grants_info as (
select table_name, grantee, privilege_type from information_schema.role_table_grants
where table_schema = 'public' and table_name in ('profiles', 'groups', 'group_members', 'availability', 'itineraries', 'votes', 'group_activities')
  and grantee in ('anon', 'authenticated', 'PUBLIC')
order by table_name, grantee, privilege_type
), existing_group_functions as (
  select p.proname as name, pg_get_function_identity_arguments(p.oid) as arguments,
    pg_get_function_result(p.oid) as result_type, p.prosecdef as security_definer
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in (
    'get_group_member_names', 'create_group', 'replace_group_availability', 'update_group_settings',
    'wad2do_group_details', 'wad2do_join_group'
  )
  order by p.proname, p.oid
)
select 'columns' as check_name, coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) as details from columns_info c
union all
select 'constraints', coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) from constraints_info c
union all
select 'policies', coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) from policies_info p
union all
select 'grants', coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb) from grants_info g
union all
select 'functions', jsonb_build_object(
  'admin_helper', to_regprocedure('public.wad2do_is_admin()'),
  'membership_helper', to_regprocedure('public.wad2do_is_group_member(uuid)'),
  'existing_group_functions', (select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb) from existing_group_functions f)
);
