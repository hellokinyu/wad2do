// Opt-in ONLY for a disposable database with activity_image_storage.sql already applied.
import { test } from 'node:test'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

test(
  'photo Storage policies resist broad grants and preserve other buckets',
  {
    skip: !process.env.WAD2DO_DISPOSABLE_DATABASE_URL,
  },
  async () => {
    await promisify(execFile)('psql', [
      process.env.WAD2DO_DISPOSABLE_DATABASE_URL,
      '-X',
      '-v',
      'ON_ERROR_STOP=1',
      '-f',
      fileURLToPath(new URL('../docs/sql/verify_activity_image_storage.sql', import.meta.url)),
    ])
  },
)
