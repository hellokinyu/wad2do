import { getOpeningWindowWarnings } from './openingHours.js'

export const USUAL_HOURS_NOTE = 'Based on usual opening hours; holiday hours may differ.'
const unavailable = () => ({ warnings: ['Opening hours unavailable.'], provisional: false })
const dayMs = 86400000

function dateNumber(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN
  const timestamp = Date.parse(value + 'T00:00:00Z')
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value
    ? timestamp / dayMs
    : NaN
}

function pointDate(point) {
  const date = point?.date
  return dateNumber(
    `${date?.year}-${String(date?.month).padStart(2, '0')}-${String(date?.day).padStart(2, '0')}`,
  )
}

function pointMinutes(point) {
  if (!point || !Number.isInteger(point.day) || point.day < 0 || point.day > 6) return NaN
  const { hour, minute } = point
  return Number.isInteger(hour) &&
    hour >= 0 &&
    hour < 24 &&
    Number.isInteger(minute) &&
    minute >= 0 &&
    minute < 60
    ? hour * 60 + minute
    : NaN
}

// Google periods stay in memory; all offsets refer to the visit's Singapore date.
export function getGoogleVisitHours(details, date, start, end, fetchedDate) {
  const visitDay = dateNumber(date)
  const fetchedDay = dateNumber(fetchedDate)
  if (
    !Number.isFinite(visitDay) ||
    !Number.isFinite(fetchedDay) ||
    !Number.isFinite(start) ||
    start < 0 ||
    !Number.isFinite(end) ||
    end <= start
  )
    return unavailable()
  const current =
    visitDay + Math.floor(start / 1440) >= fetchedDay &&
    visitDay + Math.ceil(end / 1440) <= fetchedDay + 7
  const hours = current ? details?.currentOpeningHours : details?.regularOpeningHours
  if (!Array.isArray(hours?.periods)) return unavailable()
  const windows = []
  const weekday = new Date(visitDay * dayMs).getUTCDay()
  for (const period of hours.periods) {
    const open = pointMinutes(period?.open)
    if (!Number.isFinite(open)) return unavailable()
    if (!period.close) {
      if (hours.periods.length !== 1 || period.open.day !== 0 || open !== 0) return unavailable()
      windows.push({
        open: current ? (fetchedDay - visitDay) * 1440 : -10080,
        close: current ? (fetchedDay + 7 - visitDay) * 1440 : 20160,
      })
      continue
    }
    const close = pointMinutes(period.close)
    if (!Number.isFinite(close)) return unavailable()
    if (current) {
      const from = pointDate(period.open)
      const to = pointDate(period.close)
      if (!Number.isFinite(from) || !Number.isFinite(to)) return unavailable()
      const window = {
        open: (from - visitDay) * 1440 + open,
        close: (to - visitDay) * 1440 + close,
      }
      // The final truncated 23:59 endpoint represents the end of the seven-day range.
      if (period.close.truncated && close === 1439 && to === fetchedDay + 6) window.close++
      if (window.close <= window.open) return unavailable()
      windows.push(window)
    } else {
      const duration = ((period.close.day - period.open.day + 7) % 7) * 1440 + close - open
      if (duration === 0) return unavailable()
      const length = duration <= 0 ? duration + 10080 : duration
      for (const week of [-1, 0, 1]) {
        const from = (period.open.day - weekday + week * 7) * 1440 + open
        windows.push({ open: from, close: from + length })
      }
    }
  }
  return { warnings: getOpeningWindowWarnings(windows, start, end), provisional: !current }
}
