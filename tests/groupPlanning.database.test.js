import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import process from 'node:process'

test('group planning rejects stale saves, invalidates old times atomically and preserves permissions', {
  skip: !process.env.WAD2DO_PGLITE_MODULE,
}, async () => {
  const { PGlite } = await import(process.env.WAD2DO_PGLITE_MODULE)
  const db = new PGlite()
  const memberA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const memberB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const outsider = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  const groupId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  const stop = {
    activity_id: '11111111-1111-4111-8111-111111111111',
    start: '10:00', end: '11:00', cost: 10, reason: 'Group vote', travel_mode: null,
  }
  const scalar = async (sql, values = []) => Object.values((await db.query(sql, values)).rows[0])[0]
  const revision = () => scalar('select plan_revision from groups where id=$1', [groupId])
  const asUser = async (id) => {
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claims',$1,false)", [
      JSON.stringify({ sub: id, role: 'authenticated' }),
    ])
    await db.exec('set role authenticated')
  }
  const save = (version, user, stops = [stop]) => scalar(
    'select save_group_itinerary($1,$2,$3,$4)', [groupId, version, user, JSON.stringify(stops)],
  )
  try {
    await db.exec('create publication supabase_realtime')
    for (const file of [
      'tests/fixtures/groupDatabase.sql', 'docs/sql/group_transactions.sql',
      'docs/sql/group_members.sql', 'docs/sql/group_planning.sql', 'docs/sql/group_planning.sql',
    ]) await db.exec(await readFile(new URL('../' + file, import.meta.url), 'utf8'))
    assert.deepEqual((await db.query("select tablename from pg_publication_tables where pubname='supabase_realtime' order by tablename")).rows.map((row) => row.tablename),
      ['availability', 'group_members', 'groups'])
    await asUser(memberA)
    await db.query("select create_group($1,'Weekend','2026-10-30','2026-10-31',50,'ABC234')", [groupId])
    await asUser(memberB)
    await db.query("select wad2do_join_group($1,'ABC234')", [groupId])
    await db.query("update groups set chosen_start='2026-10-30T10:00+08',chosen_end='2026-10-30T14:00+08' where id=$1", [groupId])
    const initial = await revision()
    await asUser(memberA)
    const first = await save(initial, memberA)
    assert.ok(Number(first) > Number(initial))
    await asUser(memberB)
    await assert.rejects(save(initial, memberB, []), { code: 'PT409' })
    assert.equal(Number(await scalar('select total_cost from itineraries where group_id=$1', [groupId])), 10)
    const second = await save(first, memberB, [])
    assert.ok(Number(second) > Number(first))
    await assert.rejects(save(second, memberA), { code: '42501' })
    for (const invalid of [null, {}, [{ ...stop, cost: -1 }], [{ ...stop, activity_id: 'bad' }]]) {
      await assert.rejects(save(second, memberB, invalid), { code: '22023' })
    }
    await assert.rejects(db.query('update itineraries set stops=$1 where group_id=$2', ['[]', groupId]), { code: '42501' })
    await asUser(outsider)
    await assert.rejects(save(second, outsider), { code: '42501' })
    await asUser(memberA)
    const third = await save(second, memberA)

    await db.exec('reset role')
    await db.exec(`create function pg_temp.fail_plan_delete() returns trigger language plpgsql as $$
      begin raise exception 'Simulated failure' using errcode='23514'; end $$;
      create trigger fail_delete before delete on itineraries for each row
        execute function pg_temp.fail_plan_delete();`)
    await asUser(memberA)
    await assert.rejects(db.query("update groups set chosen_start='2026-10-31T15:00+08',chosen_end='2026-10-31T17:00+08' where id=$1", [groupId]), { code: '23514' })
    assert.equal(await revision(), third)
    assert.equal(await scalar('select count(*)::int from itineraries where group_id=$1', [groupId]), 1)
    await db.exec('reset role; drop trigger fail_delete on itineraries')
    await asUser(memberA)
    await db.query("update groups set chosen_start='2026-10-31T15:00+08',chosen_end='2026-10-31T17:00+08' where id=$1", [groupId])
    assert.equal(await scalar('select count(*)::int from itineraries where group_id=$1', [groupId]), 0)
    await assert.rejects(save(third, memberA), { code: 'PT409' })
    const changed = await revision()
    await db.query("update groups set chosen_start='2026-10-31T15:00+08',chosen_end='2026-10-31T17:00+08' where id=$1", [groupId])
    assert.equal(await revision(), changed)
    await assert.rejects(db.query("update groups set chosen_start='2026-11-10T10:00+08',chosen_end='2026-11-10T12:00+08' where id=$1", [groupId]), { code: '22023' })
    assert.equal(await revision(), changed)
    const fourth = await save(changed, memberA)
    await db.exec('reset role')
    await db.query("update itineraries set stops='[]' where group_id=$1", [groupId])
    await asUser(memberA)
    await assert.rejects(save(fourth, memberA), { code: 'PT409' })
    await db.exec('reset role; set role anon')
    await assert.rejects(save(fourth, memberA), { code: '42501' })
  } finally {
    await db.close()
  }
})
