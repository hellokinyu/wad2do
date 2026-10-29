// Keep Tab inside dialogs when Safari skips native control stops.
export function moveDialogFocus(event) {
  const controls = [
    ...event.currentTarget.querySelectorAll('button, input, select, a[href]'),
  ].filter((element) => !element.matches(':disabled') && element.getClientRects().length)
  const index = controls.indexOf(document.activeElement)
  const next = event.shiftKey
    ? controls[index - 1] || controls.at(-1)
    : controls[index + 1] || controls[0]
  next?.focus()
}
