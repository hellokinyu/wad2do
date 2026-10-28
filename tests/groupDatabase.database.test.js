// Opt-in ONLY for a disposable database with group_members.sql and group_transactions.sql applied.
import { test } from 'node:test'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

test(
  'group privacy, authorization, atomic writes and rollback in PostgreSQL',
  {
    skip: !process.env.WAD2DO_DISPOSABLE_DATABASE_URL,
  },
  async () => {
    for (const file of ['verify_group_database.sql', 'verify_group_access.sql']) {
      await promisify(execFile)('psql', [
        process.env.WAD2DO_DISPOSABLE_DATABASE_URL,
        '-X',
        '-v',
        'ON_ERROR_STOP=1',
        '-f',
        fileURLToPath(new URL('../docs/sql/' + file, import.meta.url)),
      ])
    }
  },
)
