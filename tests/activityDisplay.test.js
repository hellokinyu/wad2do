import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getMapEmbedUrl } from '../src/lib/activityDisplay.js'

test('maps preserve saved embeds and use coordinates or addresses instead of unsupported Place ID queries', () => {
  const saved = 'https://www.google.com/maps/embed?pb=saved'
  assert.equal(getMapEmbedUrl({ map_embed_url: saved, google_place_id: 'venue' }), saved)
  for (const [activity, query] of [
    [
      { google_place_id: 'ChIJ6etOYDQZ2jERlLhZt3ShWI8', address: '107 North Bridge Road' },
      '107 North Bridge Road, Singapore',
    ],
    [{ lat: 1.29, lng: 103.85, address: 'Singapore' }, '1.29,103.85'],
    [
      { address: '107 North Bridge Road', area: 'City / Downtown' },
      '107 North Bridge Road, Singapore',
    ],
    [{ address: '1 A&B #02-03', lat: null, lng: null }, '1 A&B #02-03, Singapore'],
  ]) {
    const url = new URL(getMapEmbedUrl(activity))
    assert.equal(url.origin + url.pathname, 'https://www.google.com/maps')
    assert.equal(url.searchParams.get('q'), query)
    assert.equal(url.searchParams.get('output'), 'embed')
    assert.equal(url.searchParams.get('z'), '16')
  }
  assert.equal(getMapEmbedUrl(null), null)
  assert.equal(getMapEmbedUrl({}), null)
  assert.equal(getMapEmbedUrl({ google_place_id: 'ChIJ6etOYDQZ2jERlLhZt3ShWI8' }), null)
  assert.equal(getMapEmbedUrl({ lat: 100, lng: 200 }), null)
})
