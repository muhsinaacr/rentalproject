export function initializeApp() {
  const users = JSON.parse(localStorage.getItem('users') || '[]')
  const adminExists = users.find(u => u.role === 'admin')
  if (!adminExists) {
    users.push({
      id: 'admin001',
      name: 'Administrator',
      email: 'admin@rentmate.ai',
      password: 'admin123',
      role: 'admin'
    })
    localStorage.setItem('users', JSON.stringify(users))
  }
}

export function getCurrentUser() {
  if (window.location.pathname.startsWith('/admin')) {
    try { return JSON.parse(sessionStorage.getItem('adminUser') || '{}') } catch {}
    return {}
  }
  try { return JSON.parse(sessionStorage.getItem('currentUser') || '{}') } catch {}
  return {}
}

export function getCurrentRole() {
  const user = getCurrentUser()
  return user.role || null
}

export function setCurrentUser(user) {
  sessionStorage.setItem('currentUser', JSON.stringify(user))
}

export function logout() {
  if (window.location.pathname.startsWith('/admin')) {
    sessionStorage.removeItem('adminUser')
    sessionStorage.removeItem('adminToken')
  } else {
    sessionStorage.removeItem('currentUser')
    sessionStorage.removeItem('token')
  }
}

export function getBookmarks() {
  return JSON.parse(localStorage.getItem('bookmarks') || '[]')
}

export function isBookmarked(listingId) {
  return getBookmarks().some(b => b.id === listingId)
}

export function toggleBookmark(listing) {
  const bookmarks = getBookmarks()
  const exists = bookmarks.some(b => b.id === listing.id)
  if (exists) {
    localStorage.setItem('bookmarks', JSON.stringify(bookmarks.filter(b => b.id !== listing.id)))
    return false
  } else {
    localStorage.setItem('bookmarks', JSON.stringify([...bookmarks, listing]))
    return true
  }
}