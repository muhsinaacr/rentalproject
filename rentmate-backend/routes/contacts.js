// routes/contacts.js
// ─────────────────────────────────────────────────────────────────────────────
// SECURITY: Contact access is controlled per (user_id, owner_id).
//
// When a seeker pays to unlock ONE listing from an owner, they gain access
// to ALL listings by that same owner — they've paid to contact the owner,
// not a specific room. This prevents seekers from being charged multiple
// times just because the same owner has several listings.
//
// Boost status has ZERO effect on contact visibility.
//
// Endpoints:
//   GET  /api/contacts/status/:listingId   → { unlocked: bool }  (auth required)
//   POST /api/contacts/unlock/:listingId   → record unlock after payment
//   GET  /api/contacts/phone/:listingId    → { phone } (only if unlocked)
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express')
const router  = express.Router()
const db      = require('../db')
const auth    = require('../middleware/auth')

// ── Helper: check if user has unlocked ANY listing by the same owner ─────────
// This is the core of the owner-level unlock logic.
async function isOwnerUnlocked(userId, listingId) {
  // First get the owner_id of the requested listing
  const [[listing]] = await db.query(
    'SELECT owner_id FROM listings WHERE id = ?',
    [listingId]
  )
  if (!listing) return false

  const ownerId = listing.owner_id

  // Check if this user has unlocked ANY listing owned by that owner
  const [rows] = await db.query(
    `SELECT cu.id
     FROM contact_unlocks cu
     JOIN listings l ON cu.listing_id = l.id
     WHERE cu.user_id = ? AND l.owner_id = ?
     LIMIT 1`,
    [userId, ownerId]
  )

  return rows.length > 0
}

// ── GET /api/contacts/unlocked-ids ───────────────────────────────────────────
// Returns ALL listing IDs the authenticated seeker has unlocked (or has access
// to via the owner-level unlock rule). Used by BrowseListings on mount so the
// Message / Book Visit buttons are shown correctly without per-listing calls.
router.get('/unlocked-ids', auth, async (req, res) => {
  try {
    const userId = req.user.id
    // Get every listing whose owner has been unlocked by this user
    const [rows] = await db.query(
      `SELECT l.id
       FROM listings l
       WHERE l.owner_id IN (
         SELECT DISTINCT l2.owner_id
         FROM contact_unlocks cu
         JOIN listings l2 ON cu.listing_id = l2.id
         WHERE cu.user_id = ?
       )`,
      [userId]
    )
    res.json({ ids: rows.map(r => r.id) })
  } catch (err) {
    console.error('GET /contacts/unlocked-ids error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/contacts/status/:listingId ──────────────────────────────────────
// Returns whether the authenticated seeker has unlocked this owner's contact.
// Unlocking any ONE listing by an owner grants access to all their listings.
router.get('/status/:listingId', auth, async (req, res) => {
  try {
    const userId    = req.user.id
    const listingId = Number(req.params.listingId)

    if (!listingId) return res.status(400).json({ error: 'Invalid listing ID' })

    const unlocked = await isOwnerUnlocked(userId, listingId)
    res.json({ unlocked })
  } catch (err) {
    console.error('GET /contacts/status error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/contacts/unlock/:listingId ─────────────────────────────────────
// Records a contact unlock for (user_id, listing_id) after payment is verified.
// Body: { paymentId }  — payment reference for audit trail
router.post('/unlock/:listingId', auth, async (req, res) => {
  try {
    const userId    = req.user.id
    const listingId = Number(req.params.listingId)
    const { paymentId } = req.body

    if (!listingId) return res.status(400).json({ error: 'Invalid listing ID' })

    // Verify listing exists
    const [[listing]] = await db.query(
      'SELECT id, owner_id FROM listings WHERE id = ?',
      [listingId]
    )
    if (!listing) return res.status(404).json({ error: 'Listing not found' })

    // Owners cannot unlock their own listings (no-op guard)
    if (Number(listing.owner_id) === Number(userId)) {
      return res.status(400).json({ error: 'Owners cannot unlock their own listings' })
    }

    // If already unlocked via any other listing from this owner, skip payment record
    const alreadyUnlocked = await isOwnerUnlocked(userId, listingId)
    if (alreadyUnlocked) {
      return res.json({ success: true, unlocked: true, alreadyUnlocked: true })
    }

    // Upsert — safe to call multiple times (idempotent)
    await db.query(
      `INSERT INTO contact_unlocks (user_id, listing_id, unlocked_at, payment_id)
       VALUES (?, ?, NOW(), ?)
       ON DUPLICATE KEY UPDATE unlocked_at = unlocked_at`,
      [userId, listingId, paymentId || null]
    )

    // Record payment in the central payments table so admin dashboard captures it
    const CONTACT_UNLOCK_AMOUNT = 2900 // ₹29 in paise
    await db.query(
      `INSERT INTO payments (user_id, amount, method, status, description)
       VALUES (?, ?, 'mock', 'success', 'Contact & Chat')`,
      [userId, CONTACT_UNLOCK_AMOUNT]
    )

    res.json({ success: true, unlocked: true })
  } catch (err) {
    console.error('POST /contacts/unlock error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/contacts/phone/:listingId ───────────────────────────────────────
// Returns owner phone ONLY if user has unlocked any listing by this owner.
// This is the ONLY place ownerPhone should be served to seekers.
// Boost status is irrelevant here.
router.get('/phone/:listingId', auth, async (req, res) => {
  try {
    const userId    = req.user.id
    const listingId = Number(req.params.listingId)

    if (!listingId) return res.status(400).json({ error: 'Invalid listing ID' })

    // Verify unlock exists for THIS user + ANY listing by the same owner
    const unlocked = await isOwnerUnlocked(userId, listingId)

    if (!unlocked) {
      return res.status(403).json({
        error: 'Contact locked. Please unlock to view contact details.',
        code: 'CONTACT_LOCKED'
      })
    }

    // Only NOW fetch the phone number
    const [[row]] = await db.query(
      'SELECT u.phone FROM listings l JOIN users u ON l.owner_id = u.id WHERE l.id = ?',
      [listingId]
    )

    if (!row) return res.status(404).json({ error: 'Listing not found' })

    res.json({ phone: row.phone || null })
  } catch (err) {
    console.error('GET /contacts/phone error:', err)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router