// Optional isolated PostgreSQL engine: set WAD2DO_PGLITE_MODULE to the file URL
// of an installed @electric-sql/pglite/dist/index.js. Never connects to Supabase.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import process from 'node:process'

test(
  'admin activity management authorization, synchronization and atomic deletion',
  {
    skip: !process.env.WAD2DO_PGLITE_MODULE,
  },
  async () => {
    const { PGlite } = await import(process.env.WAD2DO_PGLITE_MODULE)
    const db = new PGlite()
    const admin = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const owner = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    const submission = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    const group = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
    const hours = Object.fromEntries(
      ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => [day, { open24h: true }]),
    )
    const asUser = async (id) => {
      await db.exec('reset role')
      await db.query("select set_config('request.jwt.claims', $1, false)", [
        JSON.stringify({ sub: id }),
      ])
      await db.exec('set role authenticated')
    }
    const scalar = async (sql, params = []) =>
      Object.values((await db.query(sql, params)).rows[0])[0]
    try {
      await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as
        $$ select (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')::uuid $$;
      grant usage on schema auth to authenticated;
      create table profiles (id uuid primary key, display_name text, interests text[], budget text,
        home_area text, home_station_id text, company text[], is_admin boolean, created_at timestamptz);
      create table activities (id uuid primary key default gen_random_uuid(), name text, category text,
        price_per_person numeric check(price_per_person >= 0), duration_min integer, indoor boolean,
        address text, area text, lat numeric, lng numeric, opening_hours jsonb, description text,
        image_url text, source text, google_place_id text, created_at timestamptz,
        map_embed_url text, price_note text, website text);
      create table submissions (id uuid primary key default gen_random_uuid(), submitted_by uuid references profiles,
        name text, category text, price_per_person numeric, duration_min integer, indoor boolean,
        address text, area text, opening_hours jsonb, description text, image_url text, website text,
        google_place_id text, postal_code text, status text, reject_reason text, reviewed_by uuid,
        reviewed_at timestamptz, activity_id uuid references activities, created_at timestamptz);
      create table groups (id uuid primary key);
      create table favourites (user_id uuid, activity_id uuid references activities);
      create table group_activities (group_id uuid references groups, activity_id uuid references activities,
        shared_by uuid, primary key(group_id, activity_id));
      create table votes (group_id uuid, activity_id uuid references activities, user_id uuid, value integer,
        foreign key(group_id, activity_id) references group_activities);
      create table itineraries (group_id uuid references groups, stops jsonb, total_cost numeric, updated_by uuid);
      alter table itineraries enable row level security;
      insert into profiles(id, is_admin) values ('${admin}', true), ('${owner}', false);
      insert into groups values ('${group}');
    `)
      for (const file of [
        'admin_review.sql',
        'admin_activity_management.sql',
        'admin_activity_management.sql',
      ]) {
        await db.exec(await readFile(new URL('../docs/sql/' + file, import.meta.url), 'utf8'))
      }
      await db.query(
        `insert into submissions(id,submitted_by,name,category,price_per_person,duration_min,
      indoor,address,area,opening_hours,status) values($1,$2,'Studio','Arts and culture',20,60,true,'Old address','Orchard',$3,'pending')`,
        [submission, owner, JSON.stringify(hours)],
      )
      await asUser(owner)
      await assert.rejects(
        db.query('select public.edit_approved_submission($1, $2)', [submission, '{}']),
        /Admin access required/,
      )
      await assert.rejects(
        db.query("select public.delete_submission($1, 'pending')", [submission]),
        /Admin access required/,
      )
      await asUser(admin)
      const approved = await scalar('select to_jsonb(public.approve_submission($1))', [submission])
      const activity = approved.activity_id
      const edit = {
        name: 'Corrected studio',
        address: 'New address',
        price_per_person: 35,
        google_place_id: 'New_place',
        website: 'https://example.com',
      }
      await db.exec('reset role')
      await db.query(
        "update activities set lat=1, lng=2, map_embed_url='old-map', price_note='old-price' where id=$1",
        [activity],
      )
      await asUser(admin)
      await assert.rejects(
        db.query('select public.edit_approved_submission($1, $2)', [
          submission,
          JSON.stringify({ status: 'pending' }),
        ]),
        /Only editable/,
      )
      await assert.rejects(
        db.query('select public.edit_approved_submission($1, $2)', [
          submission,
          JSON.stringify({ opening_hours: {} }),
        ]),
        /opening hours/,
      )
      await assert.rejects(
        db.query('select public.edit_approved_submission($1, $2)', [
          submission,
          JSON.stringify({ price_per_person: -1 }),
        ]),
        /check constraint/,
      )
      await assert.rejects(
        db.query('select public.edit_approved_submission($1, $2)', [
          submission,
          JSON.stringify({ website: 'javascript:alert(1)' }),
        ]),
        /URLs/,
      )
      await db.query('select public.edit_approved_submission($1, $2)', [
        submission,
        JSON.stringify(edit),
      ])
      await db.query('select public.edit_approved_submission($1, $2)', [
        submission,
        JSON.stringify(edit),
      ])
      const saved = await scalar('select to_jsonb(s) from submissions s where id=$1', [submission])
      const published = await scalar('select to_jsonb(a) from activities a where id=$1', [activity])
      for (const [key, value] of Object.entries(edit)) {
        assert.equal(saved[key], value)
        assert.equal(published[key], value)
      }
      assert.equal(saved.status, 'approved')
      assert.equal(saved.reviewed_by, admin)
      for (const key of ['lat', 'lng', 'map_embed_url', 'price_note'])
        assert.equal(published[key], null)
      assert.equal(await scalar('select count(*)::int from activities'), 1)
      await assert.rejects(
        db.query("select public.delete_submission($1, 'pending')", [submission]),
        /has changed/,
      )
      await db.exec('reset role')
      const other = await scalar("insert into activities(name) values('Other') returning id")
      await db.query('insert into favourites values($1,$2),($1,$3)', [owner, activity, other])
      await db.query('insert into group_activities values($1,$2,$3),($1,$4,$3)', [
        group,
        activity,
        owner,
        other,
      ])
      await db.query('insert into votes values($1,$2,$3,1),($1,$4,$3,1)', [
        group,
        activity,
        owner,
        other,
      ])
      const remainingStop = { activity_id: other, cost: 8, start: '12:00', end: '13:00' }
      await db.query('insert into itineraries values($1,$2,43,$3)', [
        group,
        JSON.stringify([{ activity_id: activity, cost: 35 }, remainingStop]),
        owner,
      ])
      // Force the last write to fail: all related deletes must roll back too.
      await db.exec(`create function block_delete() returns trigger language plpgsql as $$ begin raise exception 'test rollback'; end; $$;
      create trigger block_delete before delete on activities for each row execute function block_delete();`)
      await asUser(admin)
      await assert.rejects(
        db.query("select public.delete_submission($1,'approved')", [submission]),
        /test rollback/,
      )
      assert.equal(await scalar('select count(*)::int from submissions'), 1)
      await db.exec('reset role')
      assert.equal(await scalar('select count(*)::int from favourites'), 2)
      assert.equal(await scalar('select jsonb_array_length(stops) from itineraries'), 2)
      await db.exec('drop trigger block_delete on activities')
      await asUser(admin)
      await db.query("select public.delete_submission($1,'approved')", [submission])
      await db.query("select public.delete_submission($1,'approved')", [submission])
      assert.equal(await scalar('select count(*)::int from submissions'), 0)
      assert.equal(await scalar('select count(*)::int from activities'), 1)
      await db.exec('reset role')
      for (const table of ['favourites', 'votes', 'group_activities']) {
        assert.equal(await scalar(`select count(*)::int from ${table}`), 1)
      }
      assert.deepEqual(await scalar('select stops from itineraries'), [remainingStop])
      assert.equal(Number(await scalar('select total_cost from itineraries')), 8)
      // Pending/rejected deletes do not require verified hours or a published activity.
      for (const status of ['pending', 'rejected']) {
        await db.query(
          `insert into submissions(id,submitted_by,name,category,price_per_person,duration_min,
        indoor,address,area,opening_hours,status) values($1,$2,'Draft','Food',0,60,true,'Address','Orchard','{}',$3)`,
          [submission, owner, status],
        )
        await asUser(admin)
        await db.query('select public.delete_submission($1,$2)', [submission, status])
        await db.exec('reset role')
        assert.equal(await scalar('select count(*)::int from submissions'), 0)
        assert.equal(await scalar('select count(*)::int from activities'), 1)
      }
      await db.exec('set role anon')
      await assert.rejects(
        db.query("select public.delete_submission($1,'approved')", [submission]),
        /permission denied/,
      )
      await assert.rejects(
        db.query('select public.edit_approved_submission($1,$2)', [submission, '{}']),
        /permission denied/,
      )
    } finally {
      await db.close()
    }
  },
)
