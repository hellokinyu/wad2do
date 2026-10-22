import { getPrice } from './activityDisplay.js'

function normalize(value) {
  return typeof value === 'string'
    ? value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase()
    : ''
}

function interestCategory(value) {
  const category = normalize(value)
  const aliases = {
    outdoor: 'outdoors',
    workshops: 'arts and culture',
    'sports and fitness': 'wellness',
  }
  return Object.hasOwn(aliases, category) ? aliases[category] : category
}

export function scoreActivity(activity, profile) {
  const interests = Array.isArray(profile?.interests) ? profile.interests : []
  const category = interestCategory(activity.category)
  const interestMatch =
    category && interests.some((interest) => interestCategory(interest) === category)
  const budgetLimit = {
    'under-20': 20,
    '20-50': 50,
    '50-100': 100,
    '100-plus': Infinity,
  }[profile?.budget]
  const price = getPrice(activity.price_per_person)
  const affordable = price !== null && price < budgetLimit
  // shortcut: match area labels only; add a reviewed area map when proximity is needed.
  const area = normalize(profile?.home_area)
  const areaMatch = area && normalize(activity.area) === area

  return (interestMatch ? 4 : 0) + (affordable ? 2 : 0) + (areaMatch ? 1 : 0)
}

export function rankActivities(activities, profile) {
  // Stable sorting preserves catalogue order when scores tie.
  return activities
    .map((activity) => ({ activity, score: scoreActivity(activity, profile) }))
    .sort((a, b) => b.score - a.score)
    .map(({ activity }) => activity)
}
