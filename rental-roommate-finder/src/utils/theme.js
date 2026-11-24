// Get the current tab's user ID from sessionStorage (tab-specific)
function getUserKey() {
  try {
    const user = JSON.parse(sessionStorage.getItem('currentUser') || '{}')
    const id = user.id || user._id
    if (!id) return null          // not logged in — no key
    return `theme-${id}`
  } catch {
    return null
  }
}

export function getTheme() {
  const key = getUserKey()
  if (!key) return 'light'        // always default to light when not logged in
  return localStorage.getItem(key) || 'light'
}

export function setTheme(theme) {
  const key = getUserKey()
  if (key) localStorage.setItem(key, theme)
  document.documentElement.setAttribute('data-theme', theme)
}

export function toggleTheme() {
  const current = getTheme()
  const next = current === 'dark' ? 'light' : 'dark'
  setTheme(next)
  return next
}

export function initTheme() {
  const theme = getTheme()
  document.documentElement.setAttribute('data-theme', theme)
}