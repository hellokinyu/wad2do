// Singapore forecasts from NEA on data.gov.sg. The 4-day outlook starts from the day after it
// was issued, so today has to come from the 24-hour forecast.

const API = 'https://api-open.data.gov.sg/v2/real-time/api/'
const SG_TIME = 'Asia/Singapore'

// Today as YYYY-MM-DD in Singapore, whatever time zone the user's device is in
export function getSgToday(now = new Date()) {
  return now.toLocaleDateString('en-CA', { timeZone: SG_TIME })
}

// '2026-11-02' -> 'Monday'
function getDayName(date) {
  return new Date(date + 'T00:00:00+08:00').toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: SG_TIME,
  })
}

// The same fields from either API. The 24-hour forecast has no day or summary.
function toDay(date, { day, forecast, temperature }) {
  if (!forecast?.text || !temperature) return null
  return {
    date,
    day: day || getDayName(date),
    forecast: { ...forecast, summary: forecast.summary || forecast.text },
    temperature,
  }
}

function readOutlook(json) {
  const forecasts = json?.data?.records?.[0]?.forecasts
  if (!Array.isArray(forecasts)) return []
  return forecasts
    .filter((day) => typeof day?.timestamp === 'string')
    .map((day) => toDay(day.timestamp.slice(0, 10), day)) // already in +08:00
    .filter(Boolean)
}

// The 24-hour forecast as today's entry. It's issued through the day, so its period can start
// yesterday or end tomorrow, but it only stands for today, never for the morning after.
function readToday(json, today) {
  const general = json?.data?.records?.[0]?.general
  const start = general?.validPeriod?.start
  const end = general?.validPeriod?.end
  if (typeof start !== 'string' || typeof end !== 'string') return null
  if (start.slice(0, 10) > today || end.slice(0, 16) <= today + 'T00:00') return null
  return toDay(today, general)
}

// Today plus the next 4 days, earliest first. Either response can be null. If both cover today,
// the 24-hour forecast wins because it's the more recent and detailed one.
export function mergeForecasts(outlookJson, todayJson, today = getSgToday()) {
  const byDate = new Map()
  for (const day of readOutlook(outlookJson)) byDate.set(day.date, day)
  const todayEntry = readToday(todayJson, today)
  if (todayEntry) byDate.set(today, todayEntry)
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

async function fetchJson(endpoint) {
  const response = await fetch(API + endpoint)
  if (!response.ok) throw new Error(endpoint + ' responded with ' + response.status)
  return response.json()
}

// One call failing still leaves the days from the other. Both failing gives an empty list.
export async function fetchForecasts() {
  const results = await Promise.allSettled([
    fetchJson('four-day-outlook'),
    fetchJson('twenty-four-hr-forecast'),
  ])
  const [outlook, today] = results.map((result) => {
    if (result.status === 'fulfilled') return result.value
    console.log(result.reason)
    return null
  })
  return mergeForecasts(outlook, today)
}
