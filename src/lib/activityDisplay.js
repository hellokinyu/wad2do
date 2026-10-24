// Display helpers only: these do not decide ranking or build itineraries.
export function getPrice(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (typeof value === 'string' && !value.trim()) return null
  const price = Number(value)
  return Number.isFinite(price) && price >= 0 ? price : null
}

export function formatPrice(value) {
  const price = getPrice(value)
  if (price === null) return 'Price unavailable'
  return price === 0 ? 'Free' : 'S$' + price.toFixed(2)
}

export function formatDuration(value) {
  const minutes = Number(value)
  if (!Number.isFinite(minutes) || minutes <= 0) return 'Duration unavailable'
  const hours = Math.floor(minutes / 60)
  const remaining = minutes % 60
  return [hours ? hours + ' h' : '', remaining ? remaining + ' min' : ''].filter(Boolean).join(' ')
}

export function getSetting(indoor) {
  if (indoor === true) return 'Indoor'
  if (indoor === false) return 'Outdoor'
  return 'Setting unavailable'
}

// Show the address and area separately only when they contain different text.
export function getLocation(activity) {
  const address = activity?.address?.trim() || ''
  const area = activity?.area?.trim() || ''
  const different = address && area && address.toLowerCase() !== area.toLowerCase()
  return { address: address || area, area: different ? area : '' }
}

function formatDayHours(value) {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (!value || typeof value !== 'object') return 'Hours unavailable'
  if (value.closed) return 'Closed'
  if (value.open24h) return 'Open 24 hours'
  if (value.open && value.close) return value.open + '–' + value.close
  return 'Hours unavailable'
}

// Accept the team's weekday map, or a provider's weekday_text array.
// Example map: { Mon: { open: '10:00', close: '18:00' }, Sun: { closed: true } }.
export function getWeeklyHours(value) {
  let hours = value
  if (typeof hours === 'string') {
    try {
      hours = JSON.parse(hours)
    } catch {
      hours = hours.split(/\r?\n/).filter(Boolean)
    }
  }

  const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const today = new Date().toLocaleDateString('en-SG', {
    weekday: 'long',
    timeZone: 'Asia/Singapore',
  })
  const textRows = Array.isArray(hours) ? hours : hours?.weekday_text
  const rows = weekdays.map((day) => {
    let entry

    if (Array.isArray(textRows)) {
      const line = textRows.find(
        (text) =>
          typeof text === 'string' &&
          (text.toLowerCase().startsWith(day.toLowerCase() + ':') ||
            text.toLowerCase().startsWith(day.slice(0, 3).toLowerCase() + ':')),
      )
      if (line) entry = line.slice(line.indexOf(':') + 1).trim()
    } else if (hours && typeof hours === 'object') {
      entry = hours[day] ?? hours[day.toLowerCase()] ?? hours[day.slice(0, 3)]
    }

    return { day, hours: formatDayHours(entry), isToday: day === today }
  })

  return {
    rows,
    available: rows.some((row) => row.hours !== 'Hours unavailable'),
  }
}

export function getWebsiteUrl(activity) {
  const value = activity?.website_url || activity?.website
  if (!value) return null
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null
  } catch {
    return null
  }
}

export function getMapUrl(activity) {
  if (!activity) return null
  const lat = Number(activity.lat)
  const lng = Number(activity.lng)
  const hasCoordinates =
    activity.lat != null &&
    activity.lat !== '' &&
    activity.lng != null &&
    activity.lng !== '' &&
    Number.isFinite(lat) &&
    Math.abs(lat) <= 90 &&
    Number.isFinite(lng) &&
    Math.abs(lng) <= 180

  const location = getLocation(activity)
  const address = [location.address, location.area].filter(Boolean).join(', ')
  if (!hasCoordinates && !address) return null
  const query = hasCoordinates ? lat + ',' + lng : address + ', Singapore'
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query)
}

export function getRating(activity) {
  const value = activity?.rating
  if (value == null || value === '') return null
  const rating = Number(value)
  return Number.isFinite(rating) && rating >= 0 && rating <= 5 ? rating.toFixed(1) : null
}
