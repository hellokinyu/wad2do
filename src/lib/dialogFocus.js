// Keep Tab inside dialogs when Safari skips native control stops.
const TABBABLE = 'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])'

export function moveDialogFocus(event) {
  const controls = [...event.currentTarget.querySelectorAll(TABBABLE)].filter(
    (element) => !element.matches(':disabled') && element.getClientRects().length,
  )
  const index = controls.indexOf(document.activeElement)
  const next = event.shiftKey
    ? controls[index - 1] || controls.at(-1)
    : controls[index + 1] || controls[0]
  next?.focus()
}
