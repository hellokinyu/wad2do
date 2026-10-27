// Opt-in ONLY for a disposable database with both SQL migrations already applied.
// This changes quota settings and counters. It never calls Google.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import process from 'node:process'
const run = promisify(execFile)
const database = process.env.WAD2DO_DISPOSABLE_DATABASE_URL

test(
  'real PostgreSQL serializes concurrent app and per-user reservations',
  { skip: !database },
  async () => {
    const sql = async (query) =>
      (
        await run('psql', [database, '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', query])
      ).stdout.trim()
    const user = '5adbd3ea-5d05-4301-a4e9-1da90d4bcd6c'
    try {
      for (const [monthly, hourly, denied] of [
        [1, 100, 'app_limit'],
        [100, 1, 'user_limit'],
      ]) {
        await sql(
          `update public.google_place_search_config set monthly_limit = ${monthly}, user_hourly_limit = ${hourly}; delete from public.google_place_search_usage;`,
        )
        const outcomes = await Promise.all(
          Array.from({ length: 12 }, () =>
            sql(`set role service_role; select public.reserve_google_place_search('${user}');`),
          ),
        )
        assert.equal(outcomes.filter((value) => value.endsWith('ok')).length, 1)
        assert.equal(outcomes.filter((value) => value.endsWith(denied)).length, 11)
        assert.equal(
          await sql("select attempts from public.google_place_search_usage where bucket = 'app';"),
          '1',
        )
      }
    } finally {
      await sql(
        'update public.google_place_search_config set monthly_limit = null, user_hourly_limit = null; delete from public.google_place_search_usage;',
      )
    }
    assert.match(
      await sql(`set role service_role; select public.reserve_google_place_search('${user}');`),
      /lookup_disabled$/,
    )
  },
)
