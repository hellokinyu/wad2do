import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hasCompleteOpeningHours, getVisitHoursWarnings } from '../src/lib/openingHours.js'

const closedWeek = () =>
  Object.fromEntries(
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => [day, { closed: true }]),
  )

test('approval requires a full week with at least one open day', () => {
  for (const hours of [null, undefined, {}, [], closedWeek(), { Mon: { open24h: true } }]) {
    assert.equal(hasCompleteOpeningHours(hours), false)
  }
  for (const entry of [
    { open: '09:00', close: '18:00' },
    { open: '20:00', close: '02:00' },
    { open24h: true },
  ]) {
    assert.equal(hasCompleteOpeningHours({ ...closedWeek(), Fri: entry }), true)
  }
})

test('approval rejects invalid times, contradictory modes, unknown days and malformed entries', () => {
  for (const entry of [
    null,
    [],
    'Closed',
    { closed: false },
    { open24h: 'true' },
    { closed: true, open24h: true },
    { open: '09:00' },
    { open: '09:00', close: '09:00' },
    { open: '24:00', close: '02:00' },
    { open: '9:00', close: '18:00' },
    { open: 900, close: '18:00' },
    { open: '09:00', close: '18:60' },
    { open: '09:00', close: '18:00', closed: true },
  ]) {
    assert.equal(hasCompleteOpeningHours({ ...closedWeek(), Mon: entry }), false)
  }
  assert.equal(
    hasCompleteOpeningHours({ ...closedWeek(), Mon: { open24h: true }, Other: {} }),
    false,
  )
})

test('a visit must start after opening and finish no later than closing', () => {
  const hours = { ...closedWeek(), Fri: { open: '10:00', close: '18:00' } }
  assert.deepEqual(getVisitHoursWarnings(hours, '2026-10-30', 9 * 60, 10 * 60), ['Opens at 10:00'])
  assert.deepEqual(getVisitHoursWarnings(hours, '2026-10-30', 10 * 60, 18 * 60), [])
  assert.deepEqual(getVisitHoursWarnings(hours, '2026-10-30', 17 * 60, 18 * 60 + 1), [
    'Closes at 18:00',
  ])
  assert.deepEqual(getVisitHoursWarnings(hours, '2026-10-31', 12 * 60, 13 * 60), [
    'Closed on this day',
  ])
})

test('overnight hours work on both the opening date and the following closed day', () => {
  const hours = { ...closedWeek(), Fri: { open: '20:00', close: '02:00' } }
  assert.deepEqual(getVisitHoursWarnings(hours, '2026-10-30', 20 * 60, 21 * 60), [])
  assert.deepEqual(getVisitHoursWarnings(hours, '2026-10-30', 23 * 60, 26 * 60), [])
  assert.deepEqual(getVisitHoursWarnings(hours, '2026-10-30', 23 * 60, 26 * 60 + 1), [
    'Closes at 02:00 next day',
  ])
  assert.deepEqual(getVisitHoursWarnings(hours, '2026-10-31', 60, 120), [])
  assert.deepEqual(getVisitHoursWarnings(hours, '2026-10-31', 60, 121), ['Closes at 02:00'])
  assert.deepEqual(getVisitHoursWarnings(hours, '2026-10-30', 19 * 60, 20 * 60), ['Opens at 20:00'])
})

test('a visit starting after midnight uses the next day from the plan date', () => {
  const hours = { ...closedWeek(), Sat: { open: '00:00', close: '02:00' } }
  assert.deepEqual(getVisitHoursWarnings(hours, '2026-10-30', 24 * 60 + 30, 25 * 60 + 30), [])
  assert.deepEqual(getVisitHoursWarnings(hours, '2026-10-30', 25 * 60 + 30, 26 * 60 + 30), [
    'Closes at 02:00',
  ])
  assert.deepEqual(getVisitHoursWarnings(closedWeek(), '2026-10-30', 24 * 60 + 30, 25 * 60), [
    'Closed on this day',
  ])
})

test('Sunday carryover wraps the week and separate opening periods retain their gap', () => {
  const hours = {
    ...closedWeek(),
    Sun: { open: '20:00', close: '02:00' },
    Mon: { open: '10:00', close: '18:00' },
  }
  assert.deepEqual(getVisitHoursWarnings(hours, '2026-11-02', 60, 120), [])
  assert.deepEqual(getVisitHoursWarnings(hours, '2026-11-02', 60, 11 * 60), ['Closes at 02:00'])
  assert.deepEqual(getVisitHoursWarnings(hours, '2026-11-02', 9 * 60, 10 * 60), ['Opens at 10:00'])
})

test('24-hour days join across midnight and missing catalogue hours retain their fallback', () => {
  const hours = { ...closedWeek(), Fri: { open24h: true }, Sat: { open24h: true } }
  assert.deepEqual(getVisitHoursWarnings(hours, '2026-10-30', 23 * 60, 25 * 60), [])
  assert.deepEqual(getVisitHoursWarnings(hours, '2026-10-31', 23 * 60, 24 * 60), [])
  assert.deepEqual(getVisitHoursWarnings(hours, '2026-10-31', 23 * 60, 24 * 60 + 1), [
    'Closes at 00:00 next day',
  ])
  assert.deepEqual(getVisitHoursWarnings(null, '2026-10-30', 9 * 60, 10 * 60), [])
  assert.deepEqual(getVisitHoursWarnings({}, '', 0, 60), ['Opening hours unavailable'])
  assert.deepEqual(getVisitHoursWarnings(hours, '2026-10-30', NaN, 60), [
    'Opening hours unavailable',
  ])
})
