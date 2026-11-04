import test from 'node:test'
import assert from 'node:assert/strict'
import { getGoogleVisitHours } from '../src/lib/googleOpeningHours.js'

const point = (day, hour, minute = 0, date) => ({ day, hour, minute, ...(date && { date }) })
const period = (day, from, to) => ({ open: point(day, from), close: point(day, to) })
const check = (details, date, from, to) =>
  getGoogleVisitHours(details, date, from, to, '2026-11-05')
const weekly = (periods) => ({ regularOpeningHours: { periods } })

test('checks the complete visit, exact closing, split periods and Sunday overnight hours', () => {
  const hours = weekly([
    period(5, 10, 14),
    period(5, 17, 22),
    { open: point(0, 22), close: point(1, 2) },
  ])
  assert.deepEqual(check(hours, '2026-11-13', 21 * 60, 22 * 60), {
    warnings: [],
    provisional: true,
  })
  assert.deepEqual(check(hours, '2026-11-13', 21 * 60 + 27, 22 * 60 + 27).warnings, [
    'Closes at 22:00',
  ])
  assert.deepEqual(check(hours, '2026-11-13', 13 * 60, 18 * 60).warnings, ['Closes at 14:00'])
  assert.deepEqual(check(hours, '2026-11-13', 15 * 60, 18 * 60).warnings, ['Opens at 17:00'])
  assert.deepEqual(check(hours, '2026-11-16', 60, 120).warnings, [])
  assert.deepEqual(check(hours, '2026-11-15', 23 * 60, 26 * 60).warnings, [])
  assert.deepEqual(check(hours, '2026-11-15', 25 * 60, 26 * 60).warnings, [])
})

test('uses date-specific hours, including a special closure, before usual weekly hours', () => {
  const details = {
    ...weekly([period(5, 0, 23)]),
    currentOpeningHours: {
      periods: [
        {
          open: point(5, 10, 0, { year: 2026, month: 11, day: 6 }),
          close: point(5, 14, 0, { year: 2026, month: 11, day: 6 }),
        },
      ],
    },
  }
  assert.deepEqual(check(details, '2026-11-06', 13 * 60, 15 * 60), {
    warnings: ['Closes at 14:00'],
    provisional: false,
  })
  details.currentOpeningHours.periods = []
  assert.deepEqual(check(details, '2026-11-06', 13 * 60, 14 * 60), {
    warnings: ['Closed on this day'],
    provisional: false,
  })
  assert.deepEqual(check(details, '2026-11-13', 13 * 60, 15 * 60).warnings, [])
})

test('date-specific overnight carryover and truncated end of seven-day coverage', () => {
  const details = {
    currentOpeningHours: {
      periods: [
        {
          open: point(4, 0, 0, { year: 2026, month: 11, day: 5 }),
          close: point(4, 2, 0, { year: 2026, month: 11, day: 5 }),
        },
        {
          open: point(3, 22, 0, { year: 2026, month: 11, day: 11 }),
          close: { ...point(3, 23, 59, { year: 2026, month: 11, day: 11 }), truncated: true },
        },
      ],
    },
  }
  assert.deepEqual(check(details, '2026-11-05', 60, 120).warnings, [])
  assert.deepEqual(check(details, '2026-11-11', 23 * 60, 1440).warnings, [])
  assert.deepEqual(check(details, '2026-11-11', 23 * 60, 1500).warnings, [
    'Opening hours unavailable.',
  ])
})

test('always-open sentinel is accepted and missing, malformed or undated current hours fail closed', () => {
  assert.deepEqual(check(weekly([{ open: point(0, 0) }]), '2026-11-13', 1380, 1500).warnings, [])
  for (const details of [
    null,
    {},
    weekly([{ open: point(5, 25) }]),
    { currentOpeningHours: { periods: [period(5, 10, 22)] } },
  ]) {
    assert.deepEqual(check(details, '2026-11-06', 600, 660).warnings, [
      'Opening hours unavailable.',
    ])
  }
  assert.deepEqual(check(weekly([period(5, 10, 22)]), 'bad-date', 600, 660).warnings, [
    'Opening hours unavailable.',
  ])
  assert.deepEqual(check(weekly([period(5, 10, 10)]), '2026-11-13', 600, 660).warnings, [
    'Opening hours unavailable.',
  ])
})

test('missing or null hours and minutes are unavailable in both current and regular periods', () => {
  for (const date of ['2026-11-06', '2026-11-13']) {
    for (const endpoint of ['open', 'close']) {
      for (const field of ['hour', 'minute']) {
        for (const value of [undefined, null]) {
          const periods = [
            {
              open: point(5, 10, 0, { year: 2026, month: 11, day: 6 }),
              close: point(5, 22, 0, { year: 2026, month: 11, day: 6 }),
            },
          ]
          periods[0][endpoint][field] = value
          const details = { currentOpeningHours: { periods }, regularOpeningHours: { periods } }
          assert.deepEqual(
            check(details, date, 600, 660).warnings,
            ['Opening hours unavailable.'],
            `${date}: ${endpoint}.${field} = ${value}`,
          )
        }
      }
    }
  }
  for (const open of [{ day: 0 }, { day: 0, hour: 0 }, { day: 0, minute: 0 }]) {
    assert.deepEqual(check(weekly([{ open }]), '2026-11-13', 600, 660).warnings, [
      'Opening hours unavailable.',
    ])
  }
})
