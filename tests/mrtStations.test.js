import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { homeAreas } from '../src/data/homeAreas.js'
import { findStation, findStationInDirection, mrtStations } from '../src/data/mrtStations.js'

test('all 146 open physical MRT stations have unique IDs/codes and supported areas', () => {
  assert.equal(mrtStations.length, 146)
  assert.equal(new Set(mrtStations.map((station) => station.id)).size, mrtStations.length)
  const codes = mrtStations.flatMap((station) => station.codes)
  assert.equal(new Set(codes).size, codes.length)
  for (const station of mrtStations) {
    assert.match(station.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    assert.ok(station.name.trim())
    assert.ok(station.codes.length > 0)
    station.codes.forEach((code) => assert.match(code, /^(NS|EW|NE|CC|DT|TE|CG)\d+$/))
    assert.ok(homeAreas.includes(station.area), station.name)
    for (const coordinate of [station.x, station.y]) {
      assert.ok(Number.isFinite(coordinate) && coordinate >= 0 && coordinate <= 100)
    }
  }
})

test('operating line coverage includes interchanges once and excludes unopened stations', () => {
  const codes = new Set(mrtStations.flatMap((station) => station.codes))
  for (const [line, last, excluded] of [
    ['NS', 28, [6]],
    ['EW', 33, []],
    ['NE', 18, [2]],
    ['CC', 34, [18]],
    ['DT', 35, []],
    ['TE', 29, [10, 21]],
    ['CG', 2, []],
  ]) {
    for (let number = 1; number <= last; number++) {
      assert.equal(codes.has(line + number), !excluded.includes(number), line + number)
    }
  }
  assert.deepEqual(findStation('tampines').codes, ['EW2', 'DT32'])
  for (const id of [
    'brickland',
    'sungei-kadut',
    'bukit-brown',
    'mount-pleasant',
    'marina-south',
    'founders-memorial',
    'bedok-south',
    'sungei-bedok',
    'xilin',
  ]) {
    assert.equal(findStation(id), null)
  }
})

test('station targets do not overlap at any supported zoom', () => {
  for (const zoom of [0.25, 0.5, 0.75, 1]) {
    const targetSize = 48 * zoom
    for (const [index, a] of mrtStations.entries()) {
      for (const b of mrtStations.slice(index + 1)) {
        const dx = (Math.abs(a.x - b.x) * 3600 * zoom) / 100
        const dy = (Math.abs(a.y - b.y) * 3600 * zoom * 1007) / 1410 / 100
        assert.ok(dx >= targetSize || dy >= targetSize, `${a.name} overlaps ${b.name} at ${zoom}`)
      }
    }
  }
})

test('coordinates remain attached to the exact local artwork', () => {
  const svg = readFileSync(new URL('../public/images/mrt-map.svg', import.meta.url), 'utf8')
  assert.ok(svg.includes('viewBox="0 0 1410 1007"'))
  const circles = [...svg.matchAll(/<circle\s+cx="([\d.]+)"\s+cy="([\d.]+)"/g)].map(([, x, y]) => [
    (Number(x) / 1410) * 100,
    (Number(y) / 1007) * 100,
  ])
  for (const station of mrtStations.filter((station) => station.id !== 'bencoolen')) {
    assert.ok(
      circles.some(
        ([x, y]) => Math.abs(x - station.x) < 0.000001 && Math.abs(y - station.y) < 0.000001,
      ),
      station.name,
    )
  }
})

test('arrow navigation follows nearby diagram positions and stops at map edges', () => {
  for (const [from, key, expected] of [
    ['jurong-east', 'ArrowLeft', 'chinese-garden'],
    ['jurong-east', 'ArrowRight', 'clementi'],
    ['jurong-east', 'ArrowUp', 'bukit-batok'],
    ['jurong-east', 'ArrowDown', 'jurong-east'],
    ['telok-blangah', 'ArrowLeft', 'telok-blangah'],
    ['labrador-park', 'ArrowLeft', 'labrador-park'],
    ['canberra', 'ArrowRight', 'canberra'],
    ['admiralty', 'ArrowRight', 'sembawang'],
    ['woodlands-north', 'ArrowUp', 'woodlands-north'],
    ['tuas-link', 'ArrowLeft', 'tuas-link'],
    ['marina-south-pier', 'ArrowDown', 'marina-south-pier'],
  ]) {
    assert.equal(findStationInDirection(from, key).id, expected, `${from}: ${key}`)
  }
  assert.equal(findStationInDirection('missing', 'ArrowRight'), null)
  assert.equal(findStationInDirection('jurong-east', 'Tab'), findStation('jurong-east'))
})

test('all arrow hops stay local and every station is reachable from every starting station', () => {
  const neighbours = new Map(mrtStations.map((station) => [station.id,
    ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].map((key) => {
      const next = findStationInDirection(station.id, key)
      const dx = ((next.x - station.x) * 1410) / 100
      const dy = ((next.y - station.y) * 1007) / 100
      assert.ok(Math.hypot(dx, dy) <= 150, `${station.name}: ${key}`)
      return next.id
    }),
  ]))
  for (const start of mrtStations) {
    const reached = new Set([start.id])
    const queue = [start.id]
    for (const id of queue) {
      for (const next of neighbours.get(id)) {
        if (!reached.has(next)) {
          reached.add(next)
          queue.push(next)
        }
      }
    }
    assert.equal(reached.size, mrtStations.length, start.name)
  }
})
