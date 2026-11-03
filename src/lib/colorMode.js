// The whole app's colours: light (Brunch Club), dark (Supper Club), or a festive theme.
// Bootstrap and src/assets/styles.css switch every colour when <html> has data-bs-theme="dark",
// and festive themes also set data-app-theme so the pages pick up the navbar's colours.
// Light and Dark follow what you picked in the navbar theme picker; "auto" (the default)
// follows the date, the same way the navbar does.

// Same key the navbar theme picker saves its choice under (NavBarTheme.vue)
const PICKER_KEY = 'wad2do-nav-theme'

const SEASONAL_THEMES = ['newyear', 'nationalday', 'halloween', 'christmas']

// Each festive theme's big day (month is 1-based).
const FESTIVALS = [
  { theme: 'newyear', month: 1, day: 1 },
  { theme: 'nationalday', month: 8, day: 9 },
  { theme: 'halloween', month: 10, day: 31 },
  { theme: 'christmas', month: 12, day: 25 },
]

// Picks the festive theme whose day is nearest to today, before or after.
// e.g. early November is still Halloween; from late November it's Christmas.
export function seasonalTheme(date = new Date()) {
  const today = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  let nearest = 'light'
  let nearestGap = Infinity
  for (const festival of FESTIVALS) {
    // Check last year and next year too, so 30 Dec counts as close to 1 Jan.
    for (const offset of [-1, 0, 1]) {
      const day = new Date(today.getFullYear() + offset, festival.month - 1, festival.day)
      const gap = Math.abs(day - today)
      if (gap < nearestGap) {
        nearest = festival.theme
        nearestGap = gap
      }
    }
  }
  return nearest
}

const systemDark =
  typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null

// 'light', 'dark', a festive theme, or null to follow the system
let choice = null

function apply() {
  const root = document.documentElement
  const festive = SEASONAL_THEMES.includes(choice)
  // Festive pages are built on the dark palette, tinted with the theme's colours
  const dark = festive || (choice ? choice === 'dark' : Boolean(systemDark?.matches))
  root.setAttribute('data-bs-theme', dark ? 'dark' : 'light')
  if (festive) root.setAttribute('data-app-theme', choice)
  else root.removeAttribute('data-app-theme')
}

// Takes any picker value: 'auto' (or nothing saved) resolves to today's festive theme.
export function setColorMode(pickerValue) {
  const value = !pickerValue || pickerValue === 'auto' ? seasonalTheme() : pickerValue
  choice = value === 'light' || value === 'dark' || SEASONAL_THEMES.includes(value) ? value : null
  apply()
}

// Called once before the app mounts, so the first paint already has the right colours.
export function startColorMode() {
  let saved = null
  try {
    saved = sessionStorage.getItem(PICKER_KEY)
  } catch {
    // Storage blocked (e.g. private window): use the date's theme.
  }
  setColorMode(saved)
  systemDark?.addEventListener('change', apply)
}
