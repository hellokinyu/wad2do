// Returns the page to go back to after logging in, e.g. "/groups/12?invite=ABC234".
// Only paths inside this app are allowed, so a link can't send people to another website.
export function safeRedirect(value) {
  if (typeof value !== 'string') return null
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null
  return value
}
