// Light (Brunch Club) or dark (Supper Club) colours for the whole app.
// Bootstrap and src/assets/styles.css switch every colour when <html> has data-bs-theme="dark".
// By default this follows the phone or computer's own setting; picking Light or Dark in the
// navbar theme picker overrides it for the rest of the browser tab.

// Same key the navbar theme picker saves its choice under (NavBarTheme.vue)
const PICKER_KEY = 'wad2do-nav-theme'

const systemDark =
  typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null

// 'light', 'dark', or null to follow the system
let choice = null

function apply() {
  const dark = choice ? choice === 'dark' : Boolean(systemDark?.matches)
  document.documentElement.setAttribute('data-bs-theme', dark ? 'dark' : 'light')
}

// Any picker value works: only 'light' and 'dark' force a mode, the rest follow the system.
export function setColorMode(pickerValue) {
  choice = pickerValue === 'light' || pickerValue === 'dark' ? pickerValue : null
  apply()
}

// Called once before the app mounts, so the first paint already has the right colours.
export function startColorMode() {
  let saved = null
  try {
    saved = sessionStorage.getItem(PICKER_KEY)
  } catch {
    // Storage blocked (e.g. private window): follow the system.
  }
  setColorMode(saved)
  systemDark?.addEventListener('change', apply)
}
