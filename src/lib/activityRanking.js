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

const budgetLimits = {
  'under-20': 20,
  '20-50': 50,
  '50-100': 100,
  '100-plus': Infinity,
}

// The three things Best match checks. scoreActivity adds them up; matchReasons shows them on cards.
function matchParts(activity, profile) {
  const interests = Array.isArray(profile?.interests) ? profile.interests : []
  const category = interestCategory(activity.category)
  const interest = category
    ? interests.find((value) => interestCategory(value) === category)
    : undefined
  const budgetLimit = budgetLimits[profile?.budget]
  const price = getPrice(activity.price_per_person)
  const affordable = price !== null && price < budgetLimit
  // shortcut: match area labels only; add a reviewed area map when proximity is needed.
  const area = normalize(profile?.home_area)
  const areaMatch = Boolean(area) && normalize(activity.area) === area
  return { interest, budgetLimit, affordable, areaMatch }
}

export function scoreActivity(activity, profile) {
  const { interest, affordable, areaMatch } = matchParts(activity, profile)
  return (interest ? 4 : 0) + (affordable ? 2 : 0) + (areaMatch ? 1 : 0)
}

// Short reasons in score order, e.g. ['Outdoors', 'Under S$50', 'In your area']
export function matchReasons(activity, profile) {
  const { interest, budgetLimit, affordable, areaMatch } = matchParts(activity, profile)
  return [
    interest?.trim(),
    affordable && (budgetLimit === Infinity ? 'In your budget' : `Under S$${budgetLimit}`),
    areaMatch && 'In your area',
  ].filter(Boolean)
}

export function rankActivities(activities, profile) {
  // Stable sorting preserves catalogue order when scores tie.
  return activities
    .map((activity) => ({ activity, score: scoreActivity(activity, profile) }))
    .sort((a, b) => b.score - a.score)
    .map(({ activity }) => activity)
}
