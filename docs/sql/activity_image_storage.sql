-- Run in the Supabase SQL Editor as postgres before deploying the photo form.
-- Public photos are readable by URL before review. No existing private bucket is made public.
begin;

do $$
begin
  if exists (select 1 from storage.buckets where id = 'activity-images' and not public) then
    raise exception 'activity-images already exists as private. Review visibility before continuing.';
  end if;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('activity-images', 'activity-images', true, 5000000,
  array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists wad2do_upload_activity_image on storage.objects;
create policy wad2do_upload_activity_image on storage.objects
  for insert to authenticated
  with check (bucket_id = 'activity-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Restrictive guards also constrain older permissive policies; other buckets are unaffected.
drop policy if exists wad2do_limit_activity_image_inserts on storage.objects;
create policy wad2do_limit_activity_image_inserts on storage.objects as restrictive
  for insert to authenticated
  with check (bucket_id <> 'activity-images'
    or (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists wad2do_deny_anonymous_activity_images on storage.objects;
create policy wad2do_deny_anonymous_activity_images on storage.objects as restrictive
  for insert to anon
  with check (bucket_id <> 'activity-images');

-- Uploaded bytes stay immutable, including after approval. No browser upsert, move or delete.
drop policy if exists wad2do_deny_activity_image_updates on storage.objects;
create policy wad2do_deny_activity_image_updates on storage.objects as restrictive
  for update to anon, authenticated
  using (bucket_id <> 'activity-images')
  with check (bucket_id <> 'activity-images');

drop policy if exists wad2do_deny_activity_image_deletes on storage.objects;
create policy wad2do_deny_activity_image_deletes on storage.objects as restrictive
  for delete to anon, authenticated
  using (bucket_id <> 'activity-images');

-- No SELECT policy is needed for public image URLs. Do not add general list access.
commit;
