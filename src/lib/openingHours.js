const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const time = /^([01]\d|2[0-3]):[0-5]\d$/

export function hasCompleteOpeningHours(hours) {
  if (!hours || typeof hours !== 'object' || Array.isArray(hours)) return false
  if (Object.keys(hours).length !== days.length) return false
  let hasOpenDay = false
  for (const day of days) {
    const entry = hours[day]
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false
    const keys = Object.keys(entry).length
    if (keys === 1 && entry.closed === true) continue
    if (keys === 1 && entry.open24h === true) hasOpenDay = true
    else if (
      keys === 2 &&
      typeof entry.open === 'string' &&
      typeof entry.close === 'string' &&
      time.test(entry.open) &&
      time.test(entry.close) &&
      entry.open !== entry.close
    ) {
      hasOpenDay = true
    } else return false
  }
  return hasOpenDay
}

// Times are minutes from midnight on the plan's Singapore calendar date.
export function getVisitHoursWarnings(hours, date, start, end) {
  const weekday = (new Date(date + 'T00:00:00Z').getUTCDay() + 6) % 7
  if (
    !Number.isInteger(weekday) ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= start
  ) {
    return ['Opening hours unavailable']
  }
  const minutes = (value) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3))
  const windows = []
  for (const offset of [-1, 0, 1]) {
    const entry = hours?.[days[(weekday + offset + 7) % 7]]
    const midnight = offset * 1440
    if (!entry || entry.open24h === true) {
      // shortcut: missing catalogue hours keep the existing open assumption; require verified hours when the catalogue is complete.
      windows.push({ open: midnight, close: midnight + 1440 })
    } else if (
      !entry.closed &&
      time.test(entry.open) &&
      time.test(entry.close) &&
      entry.open !== entry.close
    ) {
      const open = minutes(entry.open)
      const close = minutes(entry.close)
      windows.push({ open: midnight + open, close: midnight + close + (close < open ? 1440 : 0) })
    }
  }
  // Join continuous hours across midnight so a visit can span two open days.
  windows.sort((a, b) => a.open - b.open)
  const merged = []
  for (const window of windows) {
    const previous = merged[merged.length - 1]
    if (previous && window.open <= previous.close)
      previous.close = Math.max(previous.close, window.close)
    else merged.push({ ...window })
  }
  const today = merged.filter((window) => window.close > 0 && window.open < 1440)
  if (today.some((window) => start >= window.open && end <= window.close)) return []
  if (!today.length) return ['Closed on this day']
  const next = today.find((window) => start < window.close)
  const opensLater = next && start < next.open
  const boundary = opensLater ? next.open : (next ?? today[today.length - 1]).close
  const clock = ((boundary % 1440) + 1440) % 1440
  const label =
    String(Math.floor(clock / 60)).padStart(2, '0') + ':' + String(clock % 60).padStart(2, '0')
  return [(opensLater ? 'Opens at ' : 'Closes at ') + label + (boundary >= 1440 ? ' next day' : '')]
}
