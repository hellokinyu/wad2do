import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchReasons, rankActivities, scoreActivity } from '../src/lib/activityRanking.js'

test('agreed examples score interests, affordability and exact area', () => {
  const profile = {
    interests: ['Cafes', 'Outdoors', 'Wellness'],
    budget: 'under-20',
    home_area: 'Bishan',
  }
  const activities = [
    { category: 'Outdoor', area: 'Bishan', price_per_person: 0 },
    { category: 'Cafés', area: 'Bugis', price_per_person: '12' },
    { category: 'Wellness', area: 'Bugis', price_per_person: 40 },
    { category: 'Food', area: 'Bishan', price_per_person: 10 },
    { category: 'Cafes', area: 'Bugis', price_per_person: null },
  ]
  assert.deepEqual(
    activities.map((activity) => scoreActivity(activity, profile)),
    [7, 6, 4, 3, 4],
  )
  assert.deepEqual(rankActivities(activities, profile), [
    activities[0],
    activities[1],
    activities[2],
    activities[4],
    activities[3],
  ])
})

test('budget boundaries reward cheaper activities and never treat unknown prices as free', () => {
  for (const [budget, limit] of [
    ['under-20', 20],
    ['20-50', 50],
    ['50-100', 100],
  ]) {
    for (const [price, score] of [
      [0, 2],
      [limit - 0.01, 2],
      [limit, 0],
      [limit + 1, 0],
    ]) {
      assert.equal(scoreActivity({ price_per_person: price }, { budget }), score)
    }
  }
  for (const price of [null, undefined, '', '  ', 'unknown', -1, Infinity, false]) {
    assert.equal(scoreActivity({ price_per_person: price }, { budget: '100-plus' }), 0)
  }
  assert.equal(scoreActivity({ price_per_person: 1000 }, { budget: '100-plus' }), 2)
  assert.equal(scoreActivity({ price_per_person: 0 }, { budget: 'unknown' }), 0)
})

test('category aliases and case work without inventing suitability or proximity', () => {
  assert.equal(scoreActivity({ category: ' CAFÉS ' }, { interests: ['cafes', 'Cafes'] }), 4)
  assert.equal(scoreActivity({ category: 'Workshops' }, { interests: ['Arts and culture'] }), 4)
  assert.equal(scoreActivity({ category: 'Sports and fitness' }, { interests: ['Wellness'] }), 4)
  assert.equal(scoreActivity({ category: 'Social games' }, { interests: ['Family-friendly'] }), 0)
  assert.equal(scoreActivity({ area: ' BISHAN ' }, { home_area: 'Bishan' }), 1)
  assert.equal(scoreActivity({ area: 'Jurong' }, { home_area: 'Jurong East' }), 0)
})

test('missing preferences preserve catalogue order and ranking does not mutate inputs', () => {
  const first = Object.freeze({ category: 'Food', price_per_person: 10 })
  const second = Object.freeze({ category: 'Outdoor', price_per_person: 0 })
  const activities = Object.freeze([first, second])
  assert.deepEqual(rankActivities(activities, null), [first, second])
  assert.deepEqual(rankActivities(activities, {}), [first, second])
  assert.deepEqual(rankActivities(activities, { interests: 'Outdoors' }), [first, second])
  assert.deepEqual(rankActivities(activities, { interests: ['Outdoors'] }), [second, first])
  assert.deepEqual(activities, [first, second])
})

test('any of an activity’s tags can match an interest, but it only counts once', () => {
  const pottery = { category: 'Workshops', tags: ['Workshops', 'Family-friendly'] }
  assert.equal(scoreActivity(pottery, { interests: ['Family-friendly'] }), 4)
  assert.equal(scoreActivity(pottery, { interests: ['Arts and culture', 'Family-friendly'] }), 4)
  assert.equal(scoreActivity({ category: 'Food', tags: [] }, { interests: ['Food'] }), 4)
  assert.deepEqual(matchReasons(pottery, { interests: ['Family-friendly'] }), ['Family-friendly'])
})
