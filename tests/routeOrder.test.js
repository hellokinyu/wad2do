import { test } from 'node:test'
import assert from 'node:assert/strict'
import { departureAt, findFastestRoute, timeRoute, toTime } from '../src/lib/routeOrder.js'

const stop = (id, opening_hours) => ({
  activity_id: id,
  start: '00:00',
  end: '01:00',
  opening_hours,
})

// minutes = { 'A>B': 10 }. Anything not listed takes 60 minutes.
const travel = (minutes) => async (from, to) => [
  {
    mode: 'TRANSIT',
    available: true,
    durationMinutes: minutes[from.activity_id + '>' + to.activity_id] ?? 60,
  },
]

const plan = { date: '2026-10-30', start: 10 * 60, end: 22 * 60 }
const ids = (route) => route.stops.map((s) => s.activity_id)

test('times after midnight keep counting and depart on the next date', () => {
  assert.equal(toTime(1470), '24:30')
  assert.equal(departureAt('2026-10-30', 10 * 60), '2026-10-30T10:00')
  assert.equal(departureAt('2026-10-30', 1470), '2026-10-31T00:30')
  assert.equal(departureAt('2026-10-31', 1440), '2026-11-01T00:00')
})

test('picks the order with the least total travel and retimes the stops', async () => {
  const route = await findFastestRoute([stop('A'), stop('B'), stop('C')], {
    ...plan,
    getOptions: travel({ 'C>A': 5, 'A>B': 5 }),
  })
  assert.deepEqual(ids(route), ['C', 'A', 'B'])
  assert.equal(route.travelMinutes, 10)
  assert.deepEqual(
    route.stops.map((s) => [s.start, s.end]),
    [
      ['10:00', '11:00'],
      ['11:05', '12:05'],
      ['12:10', '13:10'],
    ],
  )
  assert.deepEqual(Object.keys(route.legs), ['C>A', 'A>B'])
})

test('keeps the vote order when nothing is faster, including ties', async () => {
  const stops = [stop('A'), stop('B'), stop('C')]
  assert.equal(await findFastestRoute(stops, { ...plan, getOptions: travel({}) }), null)
  assert.equal(
    await findFastestRoute(stops, { ...plan, getOptions: travel({ 'A>B': 5, 'B>C': 5 }) }),
    null,
  )
})

test('skips a faster order that would miss opening hours', async () => {
  const closedByEleven = {
    Fri: { open: '12:00', close: '18:00' },
  }
  const route = await findFastestRoute([stop('A'), stop('B', closedByEleven)], {
    ...plan,
    getOptions: travel({ 'B>A': 1, 'A>B': 120 }),
  })
  // B first would be quicker, but it isn't open at 10:00
  assert.equal(route, null)
})

test('skips a faster order that runs past the end time', async () => {
  const shortDay = { ...plan, end: 10 * 60 + 150 }
  const longFirst = { ...stop('A'), end: '01:00' }
  const route = await findFastestRoute([longFirst, stop('B')], {
    ...shortDay,
    getOptions: travel({ 'A>B': 30, 'B>A': 45 }),
  })
  assert.equal(route, null)
})

test('leaves large plans and single stops alone without any lookups', async () => {
  let lookups = 0
  const getOptions = async () => {
    lookups++
    return []
  }
  const many = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((id) => stop(id))
  assert.equal(await findFastestRoute(many, { ...plan, getOptions }), null)
  assert.equal(await findFastestRoute([stop('A')], { ...plan, getOptions }), null)
  assert.equal(lookups, 0)
})

test('a failed lookup rejects so the caller can keep its order', async () => {
  await assert.rejects(
    findFastestRoute([stop('A'), stop('B')], {
      ...plan,
      getOptions: async () => {
        throw new Error('OneMap down')
      },
    }),
    /OneMap down/,
  )
})

test('an order with no route is not usable', async () => {
  const route = await timeRoute([stop('A'), stop('B')], {
    ...plan,
    getOptions: async () => [{ mode: 'TRANSIT', available: false }],
  })
  assert.equal(route, null)
})

test('a plan can run past midnight and is checked against the next day', async () => {
  const hours = {
    Fri: { closed: true },
    Sat: { open: '00:00', close: '03:00' },
  }
  const route = await timeRoute([stop('A', { Fri: { open24h: true } }), stop('B', hours)], {
    date: '2026-10-30',
    start: 23 * 60,
    end: 27 * 60,
    getOptions: travel({ 'A>B': 30 }),
  })
  assert.deepEqual(
    route.stops.map((s) => [s.start, s.end]),
    [
      ['23:00', '24:00'],
      ['24:30', '25:30'],
    ],
  )
})
