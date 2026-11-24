// routes/report.js — RentMate AI
// Seeker Export Report — fetches real per-user data for all sections
// and returns a structured JSON payload for PDF generation on the frontend.
// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/report/seeker/data
// GET  /api/report/seeker/data?sections=bookmarks,matches,visits,history,notifications
// ─────────────────────────────────────────────────────────────────────────────

const express        = require('express')
const router         = express.Router()
const db             = require('../db')
const authMiddleware = require('../middleware/auth')
const { calculateMatchScore } = require('../services/aiMatcher')

// ── Helper: safely parse JSON columns ────────────────────────────────────────
function safeJSON(val, fallback = []) {
  try { return JSON.parse(val || '[]') } catch { return fallback }
}

// ── Helper: format a date string as readable text ────────────────────────────
function fmtDate(d) {
  if (!d) return 'N/A'
  return new Date(d).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric'
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/report/seeker/data
// ─────────────────────────────────────────────────────────────────────────────
router.get('/seeker/data', authMiddleware, async (req, res) => {
  const userId = req.user.id

  // Which sections to fetch (default: all)
  const requested = req.query.sections
    ? req.query.sections.split(',').map(s => s.trim().toLowerCase())
    : ['bookmarks', 'matches', 'visits', 'history', 'notifications']

  const wants = (s) => requested.includes(s)

  try {
    // ── 1. User profile ──────────────────────────────────────────────────────
    const [[user]] = await db.query(
      `SELECT u.id, u.name, u.email, u.phone, u.role, u.created_at,
              sp.occupation, sp.preferred_location, sp.budget_min, sp.budget_max,
              sp.move_in_date, sp.about
       FROM users u
       LEFT JOIN seeker_profiles sp ON sp.user_id = u.id
       WHERE u.id = ?`,
      [userId]
    )
    if (!user) return res.status(404).json({ error: 'User not found' })

    const report = {
      generatedAt: new Date().toISOString(),
      user: {
        name:              user.name               || 'Room Seeker',
        email:             user.email              || '',
        phone:             user.phone              || '',
        role:              'Room Seeker',
        occupation:        user.occupation         || '',
        preferredLocation: user.preferred_location || '',
        budgetMin:         user.budget_min         || null,
        budgetMax:         user.budget_max         || null,
        memberSince:       fmtDate(user.created_at),
      },
      sections: {},
      counts:   {},
    }

    // ── 2. Saved Listings (bookmarks) ────────────────────────────────────────
    if (wants('bookmarks')) {
      let bookmarkRows = []
      try {
        ;[bookmarkRows] = await db.query(
          `SELECT l.id, l.title, l.location, l.rent, l.deposit,
                  l.room_type, l.furnishing, l.available_from, l.photos,
                  l.amenities, l.gender_pref, l.food_pref,
                  u.name  AS owner_name,
                  b.note  AS note,
                  b.created_at AS saved_at
           FROM bookmarks b
           JOIN listings  l ON b.listing_id = l.id
           JOIN users     u ON l.owner_id   = u.id
           WHERE b.user_id = ?
           ORDER BY b.created_at DESC`,
          [userId]
        )
      } catch (e) {
        console.error('[report] bookmarks query failed:', e.message)
        bookmarkRows = []
      }

      report.sections.bookmarks = bookmarkRows.map(l => ({
        id:            l.id,
        title:         l.title        || 'Untitled Listing',
        location:      l.location     || '',
        rent:          l.rent         ? `₹${Number(l.rent).toLocaleString('en-IN')}/month` : 'N/A',
        deposit:       l.deposit      ? `₹${Number(l.deposit).toLocaleString('en-IN')}` : 'N/A',
        roomType:      l.room_type    || '',
        furnishing:    l.furnishing   || '',
        availableFrom: fmtDate(l.available_from),
        ownerName:     l.owner_name   || '',
        note:          l.note         || '',
        savedOn:       fmtDate(l.saved_at),
        amenities:     (l.amenities || '').split(',').map(a => a.trim()).filter(Boolean),
      }))
      report.counts.bookmarks = bookmarkRows.length
    }

    // ── 3. AI Match Results ───────────────────────────────────────────────────
    if (wants('matches')) {
      let matchRows = []
      let profileFound = false

      try {
        const [spRows] = await db.query(
          'SELECT * FROM seeker_profiles WHERE user_id = ?', [userId]
        )
        const profile = spRows[0] || null

        if (profile) {
          profileFound = true
          const [listings] = await db.query(
            `SELECT l.*, u.name AS owner_name
             FROM listings l
             JOIN users u ON l.owner_id = u.id
             WHERE l.status = 'active'
             ORDER BY l.created_at DESC
             LIMIT 50`
          )
          matchRows = listings
            .map(l => ({ ...l, matchResult: calculateMatchScore(profile, l) }))
            .filter(l => l.matchResult.score > 0)
            .sort((a, b) => b.matchResult.score - a.matchResult.score)
            .slice(0, 10)
        }
      } catch (e) {
        console.error('[report] matches query failed:', e.message)
      }

      report.sections.matches = matchRows.map(l => ({
        id:         l.id,
        title:      l.title      || 'Untitled Listing',
        location:   l.location   || '',
        rent:       l.rent       ? `₹${Number(l.rent).toLocaleString('en-IN')}/month` : 'N/A',
        roomType:   l.room_type  || '',
        ownerName:  l.owner_name || '',
        score:      l.matchResult.score,
        label:      l.matchResult.label      || '',
        reasons:    l.matchResult.reasons    || [],
        mismatches: l.matchResult.mismatches || [],
      }))
      report.sections.matchProfileUsed = profileFound
      report.counts.matches = matchRows.length
    }

    // ── 4. Visit Bookings ────────────────────────────────────────────────────
    if (wants('visits')) {
      let visitRows = []
      try {
        ;[visitRows] = await db.query(
          `SELECT v.id, v.visit_date, v.visit_time, v.status, v.message,
                  v.created_at,
                  l.title    AS listing_title,
                  l.location AS listing_location,
                  u.name     AS owner_name,
                  u.phone    AS owner_phone
           FROM visits v
           JOIN listings l ON v.listing_id = l.id
           JOIN users    u ON v.owner_id   = u.id
           WHERE v.seeker_id = ?
           ORDER BY v.visit_date DESC, v.visit_time DESC`,
          [userId]
        )
      } catch (e) {
        console.error('[report] visits query failed:', e.message)
        visitRows = []
      }

      report.sections.visits = visitRows.map(v => ({
        id:              v.id,
        listingTitle:    v.listing_title    || 'N/A',
        listingLocation: v.listing_location || '',
        visitDate:       fmtDate(v.visit_date),
        visitTime:       v.visit_time       || '',
        status:          v.status           || 'pending',
        message:         v.message          || '',
        ownerName:       v.owner_name       || '',
        bookedOn:        fmtDate(v.created_at),
      }))
      report.counts.visits = visitRows.length
    }

    // ── 5. Search History / Activity Summary ──────────────────────────────────
    if (wants('history')) {
      let bookmarkTotal = 0, visitTotal = 0, msgTotal = 0, unlockTotal = 0
      let recentViews = []

      try {
        ;[[{ bookmarkTotal }]] = await db.query(
          'SELECT COUNT(*) AS bookmarkTotal FROM bookmarks WHERE user_id = ?', [userId]
        )
      } catch (e) { console.error('[report] bookmarkTotal:', e.message) }

      try {
        ;[[{ visitTotal }]] = await db.query(
          'SELECT COUNT(*) AS visitTotal FROM visits WHERE seeker_id = ?', [userId]
        )
      } catch (e) { console.error('[report] visitTotal:', e.message) }

      try {
        ;[[{ msgTotal }]] = await db.query(
          'SELECT COUNT(*) AS msgTotal FROM messages WHERE sender_id = ?', [userId]
        )
      } catch (e) {
        console.error('[report] msgTotal:', e.message)
        msgTotal = 0
      }

      try {
        ;[[{ unlockTotal }]] = await db.query(
          'SELECT COUNT(*) AS unlockTotal FROM contact_unlocks WHERE user_id = ?', [userId]
        )
      } catch (e) {
        console.error('[report] unlockTotal:', e.message)
        unlockTotal = 0
      }

      try {
        ;[recentViews] = await db.query(
          `SELECT created_at
           FROM notifications
           WHERE user_id = ? AND type = 'listing'
           ORDER BY created_at DESC
           LIMIT 24`,
          [userId]
        )
      } catch (e) {
        console.error('[report] recentViews:', e.message)
        recentViews = []
      }

      report.sections.history = {
        summary: {
          totalListingsViewed: recentViews.length    || 0,
          totalBookmarks:      Number(bookmarkTotal) || 0,
          totalVisits:         Number(visitTotal)    || 0,
          totalMessagesSent:   Number(msgTotal)      || 0,
          totalUnlocks:        Number(unlockTotal)   || 0,
        },
      }
      report.counts.history = recentViews.length
    }

    // ── 6. Activity Log (notifications) ──────────────────────────────────────
    if (wants('notifications')) {
      let notifRows = []
      try {
        // Column is `message` (not `body`) — confirmed from migrate_notifications.js
        ;[notifRows] = await db.query(
          `SELECT id, type, title, message, is_read, created_at
           FROM notifications
           WHERE user_id = ?
           ORDER BY created_at DESC
           LIMIT 50`,
          [userId]
        )
      } catch (e) {
        console.error('[report] notifications query failed:', e.message)
        notifRows = []
      }

      report.sections.notifications = notifRows.map(n => ({
        id:     n.id,
        type:   n.type    || 'system',
        title:  n.title   || '',
        body:   n.message || '',  // table column is `message`, exposed as `body` to PDF builder
        isRead: !!n.is_read,
        time:   fmtDate(n.created_at),
      }))
      report.counts.notifications = notifRows.length
    }

    res.json(report)

  } catch (err) {
    console.error('[GET /api/report/seeker/data] fatal error:', err)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router