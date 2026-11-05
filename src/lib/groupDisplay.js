// How a group's dates and planning stage are shown. The Groups list cards and the
// group page hero both use these, so the two always agree.
import { getPrice } from '@/lib/activityDisplay'

// "Voting" -> "Time picked" -> "Planned"
export const stages = ['Voting', 'Time picked', 'Planned']

export function getStatus(group) {
  // No plan yet comes back as [] or null, depending on how the table is set up
  if (group.itineraries && group.itineraries.length !== 0) return 'Planned'
  if (group.chosen_start) return 'Time picked'
  return 'Voting'
}

// Today as YYYY-MM-DD in the user's time zone, so it compares with start_date/end_date
export function getToday() {
  return new Date().toLocaleDateString('en-CA')
}

// The outing day as YYYY-MM-DD: the day the group picked (in Singapore time, like the
// Availability tab), or the only day for a one-day group. '' while the day is still open.
export function getOutingDay(group) {
  if (group.chosen_start) {
    return new Date(group.chosen_start).toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' })
  }
  return group.start_date === group.end_date ? group.start_date : ''
}

// Over once the outing day (or, with no day picked, the whole date range) has gone by
export function isPast(group, today = getToday()) {
  return (getOutingDay(group) || group.end_date) < today
}

// The day on the ticket stub. A past group that never picked one shows when its range began,
// because a "?" would suggest the day can still be decided.
export function getStubDay(group, today = getToday()) {
  return getOutingDay(group) || (isPast(group, today) ? group.start_date : '')
}

// "2026-10-30" -> a local Date (new Date("2026-10-30") would read it as UTC)
function toDate(value) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

// Browsers write September as "Sept"; "Sep" keeps every month three letters on the stub
export function formatPart(value, options) {
  return toDate(value).toLocaleDateString('en-SG', options).replace('Sept', 'Sep')
}

// "31 Oct – 1 Nov", with the year only when it isn't this year
export function formatRange(group, today = getToday()) {
  const options = { day: 'numeric', month: 'short' }
  if (group.start_date.slice(0, 4) !== today.slice(0, 4)) options.year = 'numeric'
  const start = formatPart(group.start_date, options)
  if (group.end_date === group.start_date) return start
  return start + ' – ' + formatPart(group.end_date, options)
}

// "10am" or "2:30pm" in Singapore time
function formatTime(timestamp) {
  return new Date(timestamp)
    .toLocaleTimeString('en-SG', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Singapore',
    })
    .replace(':00', '')
    .replace(' ', '')
    .toLowerCase()
}

// Just the picked time, e.g. "10am to 2pm", or '' before one is picked. The group page hero
// uses this, since its stub already shows the day.
export function getTimeRange(group) {
  if (!group.chosen_start || !group.chosen_end) return ''
  return formatTime(group.chosen_start) + ' to ' + formatTime(group.chosen_end)
}

// "Sat 7 Nov, 10am to 2pm" once a time is picked, otherwise the range the group is choosing from
export function getWhenText(group, today = getToday()) {
  if (group.chosen_start && group.chosen_end) {
    // en-SG adds a comma after the weekday, which doubles up with the one below
    const day = formatPart(getOutingDay(group), {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).replace(',', '')
    return day + ', ' + formatTime(group.chosen_start) + ' to ' + formatTime(group.chosen_end)
  }
  return formatRange(group, today)
}

// "Today", "Tomorrow" or "in 9 days" once the outing day is known; '' otherwise or once it's over
export function getCountdown(group, today = getToday()) {
  const day = getOutingDay(group)
  if (!day || day < today) return ''
  const days = Math.round((toDate(day) - toDate(today)) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  return 'in ' + days + ' days'
}

// e.g. 'S$50 per person', or 'S$12.50 per person'
export function getBudgetText(group) {
  const budget = getPrice(group.budget_per_person)
  if (budget === null) return 'No budget set'
  return 'S$' + (Number.isInteger(budget) ? budget : budget.toFixed(2)) + ' per person'
}

// Amber until the group has a plan, then green; past outings go grey whatever stage they
// reached. "Time picked" stays amber because the itinerary is built straight after, so a
// colour of its own would only flash before turning green.
// `ink` is the text colour on top, `tear` the dashed line beside the stub, and `mark` the
// colour for small marks on white (dots, progress bars), which grey needs darker.
const inProgress = { stage: '#f4b400', ink: '#111', tear: 'rgb(0 0 0 / 22%)' } // amber
const stageColours = {
  Voting: inProgress,
  'Time picked': inProgress,
  Planned: { stage: '#15803d', ink: 'white', tear: 'rgb(255 255 255 / 45%)' }, // green: ready
  past: { stage: '#ececec', ink: '#555', tear: 'rgb(0 0 0 / 15%)', mark: '#9a9a9a' },
}

// CSS variables for a group's ticket, used as :style="getStageStyle(group)"
export function getStageStyle(group, today = getToday()) {
  const colours = stageColours[isPast(group, today) ? 'past' : getStatus(group)]
  return {
    '--stage': colours.stage,
    '--stage-ink': colours.ink,
    '--tear': colours.tear,
    '--stage-mark': colours.mark || colours.stage,
  }
}
