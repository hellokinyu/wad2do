import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getSgToday, mergeForecasts } from '../src/lib/weatherForecast.js'

const outlookDay = (date, text = 'Thundery Showers') => ({
  day: 'From outlook',
  timestamp: date + 'T00:00:00+08:00',
  forecast: { code: 'TL', summary: 'Afternoon ' + text, text },
  temperature: { low: 25, high: 33 },
})
const outlook = (...dates) => ({ data: { records: [{ forecasts: dates.map((d) => outlookDay(d)) }] } })
const twentyFourHour = (start, end) => ({
  data: {
    records: [
      {
        general: {
          validPeriod: { start, end },
          temperature: { low: 25, high: 35 },
          forecast: { code: 'HT', text: 'Heavy Thundery Showers' },
        },
      },
    ],
  },
})
const dates = (days) => days.map((day) => day.date)
const today = twentyFourHour('2026-11-02T12:00:00+08:00', '2026-11-03T12:00:00+08:00')
const nextFour = outlook('2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06')

test('adds today in front of the 4-day outlook', () => {
  const days = mergeForecasts(nextFour, today, '2026-11-02')
  assert.deepEqual(dates(days), [
    '2026-11-02',
    '2026-11-03',
    '2026-11-04',
    '2026-11-05',
    '2026-11-06',
  ])
  assert.equal(days[0].day, 'Monday')
  assert.equal(days[0].forecast.summary, 'Heavy Thundery Showers')
  assert.equal(days[1].forecast.summary, 'Afternoon Thundery Showers')
})

test('shows an overlapping day once, using the 24-hour forecast', () => {
  const early = twentyFourHour('2026-11-02T18:00:00+08:00', '2026-11-03T18:00:00+08:00')
  const days = mergeForecasts(nextFour, early, '2026-11-03')
  assert.deepEqual(dates(days), ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'])
  assert.equal(days[0].forecast.text, 'Heavy Thundery Showers')
})

test("a 24-hour period running past midnight doesn't replace tomorrow", () => {
  const days = mergeForecasts(nextFour, today, '2026-11-02')
  assert.equal(days.find((day) => day.date === '2026-11-03').forecast.code, 'TL')
})

test('a 24-hour forecast that no longer covers today is ignored', () => {
  const ended = twentyFourHour('2026-11-01T00:00:00+08:00', '2026-11-02T00:00:00+08:00')
  assert.deepEqual(dates(mergeForecasts(outlook('2026-11-03'), ended, '2026-11-02')), ['2026-11-03'])
})

test('one call failing still returns the other', () => {
  assert.deepEqual(dates(mergeForecasts(null, today, '2026-11-02')), ['2026-11-02'])
  assert.equal(mergeForecasts(nextFour, null, '2026-11-02').length, 4)
})

test('empty or malformed responses give no days', () => {
  for (const empty of [null, {}, { data: {} }, { data: { records: [] } }, { data: { records: [{}] } }]) {
    assert.deepEqual(mergeForecasts(empty, empty, '2026-11-02'), [])
  }
  const broken = { data: { records: [{ forecasts: [{ timestamp: '2026-11-03T00:00:00+08:00' }, null] }] } }
  assert.deepEqual(mergeForecasts(broken, null, '2026-11-02'), [])
})

test('days come back in date order', () => {
  const unordered = outlook('2026-11-05', '2026-11-03', '2026-11-04')
  assert.deepEqual(dates(mergeForecasts(unordered, today, '2026-11-02')), [
    '2026-11-02',
    '2026-11-03',
    '2026-11-04',
    '2026-11-05',
  ])
})

test('today is the Singapore date, not UTC', () => {
  // 20:00 UTC on 2 Nov is already 04:00 on 3 Nov in Singapore
  assert.equal(getSgToday(new Date('2026-11-02T20:00:00Z')), '2026-11-03')
})
