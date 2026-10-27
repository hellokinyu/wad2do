import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const profileGrants = (sql) =>
  [
    ...sql.matchAll(/grant\s+update\s*\(([^)]+)\)\s+on\s+public\.profiles\s+to\s+authenticated/gi),
  ].flatMap((match) => match[1].split(',').map((column) => column.trim()))

test('profile SQL grants every field saved by Profile and Onboarding, without granting admin access', () => {
  const granted = profileGrants(read('docs/sql/admin_review.sql'))
  for (const file of ['src/views/ProfileView.vue', 'src/views/OnboardingView.vue']) {
    const updates = [...read(file).matchAll(/\.update\(\{([\s\S]*?)\}\)/g)]
    assert.ok(updates.length > 0, file)
    for (const update of updates) {
      const fields = [...update[1].matchAll(/(?:^|[\n,])\s*(\w+)\s*:/g)].map((match) => match[1])
      assert.ok(fields.length > 0, file)
      for (const field of fields)
        assert.ok(granted.includes(field), `${file} saves ${field}, but SQL does not grant it`)
    }
  }
  for (const protectedField of ['id', 'is_admin', 'created_at'])
    assert.ok(!granted.includes(protectedField))
})

test('the MRT repair grants only its new column', () => {
  assert.deepEqual(profileGrants(read('docs/sql/mrt_station_preferences.sql')), ['home_station_id'])
})
