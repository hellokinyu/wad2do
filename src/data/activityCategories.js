// The official activity tags. The submit form, the admin edit form and the admin Activities page
// all offer exactly these, so the Activities page chips stay tidy.
// The database checks admin tag changes against the same list (docs/sql/admin_activity_categories.sql),
// so add or rename a tag in both places.
export const ACTIVITY_CATEGORIES = [
  'Food',
  'Cafés',
  'Outdoors',
  'Arts and culture',
  'Workshops',
  'Sports and fitness',
  'Social games',
  'Nightlife',
  'Shopping',
  'Family-friendly',
  'Wellness',
]

export function isOfficialCategory(value) {
  return ACTIVITY_CATEGORIES.includes(value)
}

// An activity can have several tags. `tags` holds them all, main tag first; `category` is the
// main tag on its own, which older rows and the submission form still use.
export function activityTags(activity) {
  const list =
    Array.isArray(activity?.tags) && activity.tags.length ? activity.tags : [activity?.category]
  const tags = list.map((tag) => (typeof tag === 'string' ? tag.trim() : '')).filter(Boolean)
  return [...new Set(tags)]
}
