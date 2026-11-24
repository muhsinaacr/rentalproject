// src/utils/unlocks.js  (UPDATED)
//
// The fake localStorage-based premium unlock has been REMOVED.
// Premium status is now driven entirely by the backend (subscriptions table).
//
// This file is kept for any other unlock features (e.g. contact-reveal for seekers).
// Do NOT use isUnlocked / unlock for premium_listings anymore.
// ─────────────────────────────────────────────────────────────────────────────

/** Generic per-feature unlock (for non-subscription features only). */
export function isUnlocked(key) {
  if (key === 'premium_listings') {
    console.warn(
      '[unlocks] isUnlocked("premium_listings") is deprecated. ' +
      'Use subscription state from backend instead.'
    )
    return false   // always false — let backend decide
  }
  const unlocks = JSON.parse(sessionStorage.getItem('unlocks') || '{}')
  return !!unlocks[key]
}

/** @deprecated Do not use for premium_listings — use api.activateMockPremium() */
export function unlock(key) {
  if (key === 'premium_listings') {
    console.warn(
      '[unlocks] unlock("premium_listings") is deprecated. ' +
      'Use api.activateMockPremium() or the payment flow instead.'
    )
    return
  }
  const unlocks = JSON.parse(localStorage.getItem('unlocks') || '{}')
  unlocks[key] = true
  sessionStorage.setItem('unlocks', JSON.stringify(unlocks))
}

// FREE_LISTING_LIMIT is now authoritative on the backend (3).
// Exported here only so any stale imports don't crash — value kept in sync.
export const FREE_LISTING_LIMIT = 3