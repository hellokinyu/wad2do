-- Disposable Supabase database ONLY, as postgres, after activity_image_storage.sql.
-- Tests metadata policies with deliberately broad older grants. No real files are uploaded.
-- Every fixture, grant and test policy is rolled back. HTTP upload limits need separate API checks.
begin;
grant select, insert, update, delete on storage.objects to anon, authenticated;
create policy wad2do_photo_test_broad on storage.objects
  for all to anon, authenticated using (true) with check (true);

do $$
declare
  user_a uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  user_b uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  marker text := gen_random_uuid()::text;
  control_bucket text := 'photo-test-' || marker;
  photo_name text := user_a::text || '/' || marker || '/photo.png';
begin
  if not exists (select 1 from storage.buckets where id = 'activity-images'
    and public = true and file_size_limit = 5000000
    and cardinality(allowed_mime_types) = 3
    and allowed_mime_types @> array['image/jpeg', 'image/png', 'image/webp']) then
    raise exception 'Missing or incorrect photo bucket configuration.';
  end if;
  insert into storage.buckets (id, name) values (control_bucket, control_bucket);

  perform set_config('request.jwt.claims', json_build_object('sub', user_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into storage.objects (bucket_id, name) values ('activity-images', photo_name);
  begin
    insert into storage.objects (bucket_id, name)
      values ('activity-images', user_b::text || '/' || marker || '/wrong.png');
    raise exception 'User A uploaded into user B folder.';
  exception when insufficient_privilege then null; end;

  update storage.objects set name = photo_name || '.changed'
    where bucket_id = 'activity-images' and name = photo_name;
  if found then raise exception 'Owner overwrote photo metadata.'; end if;
  delete from storage.objects where bucket_id = 'activity-images' and name = photo_name;
  if found then raise exception 'Owner deleted a photo.'; end if;
  update storage.objects set bucket_id = control_bucket
    where bucket_id = 'activity-images' and name = photo_name;
  if found then raise exception 'Owner moved a photo out of the bucket.'; end if;
  begin
    insert into storage.objects (bucket_id, name) values ('activity-images', photo_name)
      on conflict (bucket_id, name) do update set metadata = '{"changed":true}';
    raise exception 'Owner upserted a photo.';
  exception when insufficient_privilege then null; end;

  -- These operations demonstrate the guards do not restrict another bucket.
  insert into storage.objects (bucket_id, name) values (control_bucket, photo_name);
  update storage.objects set metadata = '{"control":true}'
    where bucket_id = control_bucket and name = photo_name;
  if not found then raise exception 'Other bucket update was blocked.'; end if;
  begin
    update storage.objects set bucket_id = 'activity-images', name = photo_name || '.moved'
      where bucket_id = control_bucket and name = photo_name;
    raise exception 'Moved another bucket object into the photo bucket.';
  exception when insufficient_privilege then null; end;
  delete from storage.objects where bucket_id = control_bucket and name = photo_name;
  if not found then raise exception 'Other bucket delete was blocked.'; end if;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', user_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    insert into storage.objects (bucket_id, name)
      values ('activity-images', user_a::text || '/' || marker || '/intruder.png');
    raise exception 'User B uploaded into user A folder.';
  exception when insufficient_privilege then null; end;
  update storage.objects set metadata = '{"intruder":true}'
    where bucket_id = 'activity-images' and name = photo_name;
  if found then raise exception 'User B changed user A photo.'; end if;
  delete from storage.objects where bucket_id = 'activity-images' and name = photo_name;
  if found then raise exception 'User B deleted user A photo.'; end if;
  execute 'reset role';

  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  begin
    insert into storage.objects (bucket_id, name) values ('activity-images', marker || '/anonymous.png');
    raise exception 'Anonymous user uploaded a photo.';
  exception when insufficient_privilege then null; end;
  update storage.objects set metadata = '{"anonymous":true}'
    where bucket_id = 'activity-images' and name = photo_name;
  if found then raise exception 'Anonymous user changed a photo.'; end if;
  delete from storage.objects where bucket_id = 'activity-images' and name = photo_name;
  if found then raise exception 'Anonymous user deleted a photo.'; end if;
  execute 'reset role';

  if not exists (select 1 from storage.objects where bucket_id = 'activity-images'
    and name = photo_name and metadata is null) then
    raise exception 'Original photo metadata changed.';
  end if;
  raise notice 'PASS: own-folder upload, immutability, anonymous denial, broad policy guards and unrelated buckets.';
end;
$$;
rollback;
