// routes/dashboard.js
// ─────────────────────────────────────────────────────────────────────────────
// RentMate — Seeker Dashboard Aggregation API
//
// Endpoints:
//   GET  /api/dashboard/seeker          → all stats + recent activity
//   POST /api/dashboard/track-view      → record a listing view for the user
// ─────────────────────────────────────────────────────────────────────────────

const express        = require('express')
const router         = express.Router()
const db             = require('../db')
const authMiddleware = require('../middleware/auth')

// ── Auto-migrate listing_views table on first load ────────────────────────────
;(async () => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS listing_views (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        user_id    INT NOT NULL,
        listing_id INT NOT NULL,
        viewed_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user    (user_id),
        INDEX idx_listing (listing_id),
        INDEX idx_user_date (user_id, viewed_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
  } catch (e) {
    // ER_TABLE_EXISTS_ERROR is expected on subsequent server restarts
    if (e.code !== 'ER_TABLE_EXISTS_ERROR') {
      console.warn('[dashboard] listing_views table check warning:', e.message)
    }
  }
})()

// ── Helper: relative time label ───────────────────────────────────────────────
function relativeTime(dateStr) {
  if (!dateStr) return ''
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60)        return 'Just now'
  if (diff < 3600)      return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400)     return `${Math.floor(diff / 3600)}h ago`
  if (diff < 172800)    return '1 day ago'
  if (diff < 604800)    return `${Math.floor(diff / 86400)} days ago`
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

// ── GET /api/dashboard/seeker ─────────────────────────────────────────────────
// Aggregates all dashboard data for the logged-in seeker in one request.
// Returns:
//   stats       — { listingsViewed, todayViewed, aiMatches, newMatches,
//                   savedListings, recentSaved, messages, unreadMessages }
//   recentActivity — latest 10 events across all modules, chronologically sorted
router.get('/seeker', authMiddleware, async (req, res) => {
  const userId = req.user.id
  const today  = new Date().toISOString().split('T')[0]  // YYYY-MM-DD

  try {
    // ── 1. Listings Viewed ────────────────────────────────────────────────────
    const [[viewStats]] = await db.query(
      `SELECT
         COUNT(DISTINCT listing_id)                                           AS total_viewed,
         COUNT(DISTINCT CASE WHEN DATE(viewed_at) = ? THEN listing_id END)   AS today_viewed
       FROM listing_views
       WHERE user_id = ?`,
      [today, userId]
    ).catch(() => [[{ total_viewed: 0, today_viewed: 0 }]])

    // ── 2. AI Matches (roommate compatibility records) ────────────────────────
    // Count unique seekers this user has been matched with via the matcher route.
    // "new" = matches calculated in the last 7 days.
    const [[matchStats]] = await db.query(
      `SELECT
         COUNT(DISTINCT CASE WHEN user_a_id = ? THEN user_b_id ELSE user_a_id END) AS total_matches,
         SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS new_matches
       FROM seeker_matches
       WHERE user_a_id = ? OR user_b_id = ?`,
      [userId, userId, userId]
    ).catch(() => [[{ total_matches: 0, new_matches: 0 }]])  // table may not exist yet

    // ── 3. Saved (Bookmarked) Listings ────────────────────────────────────────
    const [[bookmarkStats]] = await db.query(
      `SELECT
         COUNT(*)                                      AS total_saved,
         SUM(DATE(created_at) >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)) AS recent_saved
       FROM bookmarks
       WHERE user_id = ?`,
      [userId]
    )

    // ── 4. Messages ───────────────────────────────────────────────────────────
    // Count distinct conversations AND total unread messages received
    const [[msgStats]] = await db.query(
      `SELECT
         COUNT(DISTINCT CONCAT(
           LEAST(sender_id, receiver_id), '-', GREATEST(sender_id, receiver_id),
           '-', COALESCE(listing_id, 0)
         ))                                           AS total_convos,
         SUM(CASE WHEN receiver_id = ? AND is_read = 0 THEN 1 ELSE 0 END) AS unread_count
       FROM messages
       WHERE sender_id = ? OR receiver_id = ?`,
      [userId, userId, userId]
    ).catch(() => [[{ total_convos: 0, unread_count: 0 }]])

    // ── 5. Build Recent Activity (last 10 events, newest first) ───────────────

    // 5a. Notifications (matches, listing alerts, visit updates, messages)
    const [notifRows] = await db.query(
      `SELECT id, type, title, message, is_read, created_at
       FROM notifications
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 15`,
      [userId]
    )

    // 5b. Recent bookmarks (user saved a listing)
    const [bookmarkRows] = await db.query(
      `SELECT b.id, b.created_at, l.title AS listing_title, l.location
       FROM bookmarks b
       JOIN listings l ON l.id = b.listing_id
       WHERE b.user_id = ?
       ORDER BY b.created_at DESC
       LIMIT 5`,
      [userId]
    )

    // 5c. Visit status changes
    const [visitRows] = await db.query(
      `SELECT v.id, v.status, v.visit_date, v.updated_at, v.created_at, l.title AS listing_title
       FROM visits v
       JOIN listings l ON l.id = v.listing_id
       WHERE v.seeker_id = ?
       ORDER BY COALESCE(v.updated_at, v.created_at) DESC
       LIMIT 5`,
      [userId]
    ).catch(() => [[]]) // visits may be empty

    // 5d. Recent messages received
    const [msgRows] = await db.query(
      `SELECT m.id, m.created_at, u.name AS sender_name, l.title AS listing_title
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       LEFT JOIN listings l ON l.id = m.listing_id
       WHERE m.receiver_id = ?
       ORDER BY m.created_at DESC
       LIMIT 5`,
      [userId]
    ).catch(() => [[]])

    // ── Merge & sort all activity events ──────────────────────────────────────
    const events = []

   for (const n of notifRows) {
  let text = n.message || n.title || ''
  // Fallback for legacy notifications stored before the name-lookup fix
  if (/^undefined\s+sent you/i.test(text)) {
    text = text.replace(/^undefined/i, 'Someone')
  }
  events.push({
    id:    `notif-${n.id}`,
    type:  n.type || 'system',
    text,
    time:  relativeTime(n.created_at),
    ts:    new Date(n.created_at).getTime(),
    read:  !!n.is_read,
    color: colorForType(n.type),
  })
}

    for (const b of bookmarkRows) {
      events.push({
        id:    `bm-${b.id}`,
        type:  'bookmark',
        text:  `You saved "${b.listing_title}" in ${b.location || 'your bookmarks'}`,
        time:  relativeTime(b.created_at),
        ts:    new Date(b.created_at).getTime(),
        read:  true,
        color: '#6366f1',
      })
    }

    for (const v of visitRows) {
      const statusLabel = {
        pending:   'Visit requested',
        confirmed: 'Visit confirmed ✅',
        cancelled: 'Visit cancelled',
        completed: 'Visit completed',
      }[v.status] || `Visit ${v.status}`

      events.push({
        id:    `visit-${v.id}`,
        type:  'visit',
        text:  `${statusLabel} — "${v.listing_title}" on ${v.visit_date}`,
        time:  relativeTime(v.updated_at || v.created_at),
        ts:    new Date(v.updated_at || v.created_at).getTime(),
        read:  true,
        color: visitColor(v.status),
      })
    }

    for (const m of msgRows) {
      events.push({
        id:    `msg-${m.id}`,
        type:  'message',
        text:  `Message from ${m.sender_name}${m.listing_title ? ` — ${m.listing_title}` : ''}`,
        time:  relativeTime(m.created_at),
        ts:    new Date(m.created_at).getTime(),
        read:  true,
        color: '#f59e0b',
      })
    }

    // Sort by timestamp descending, take top 10
    events.sort((a, b) => b.ts - a.ts)
    const recentActivity = events.slice(0, 10)

    // ── 6. Build stats response ────────────────────────────────────────────────
    const stats = {
      listingsViewed:  Number(viewStats.total_viewed)     || 0,
      todayViewed:     Number(viewStats.today_viewed)     || 0,
      aiMatches:       Number(matchStats?.total_matches ?? 0),
      newMatches:      Number(matchStats?.new_matches  ?? 0),
      savedListings:   Number(bookmarkStats.total_saved)  || 0,
      recentSaved:     Number(bookmarkStats.recent_saved) || 0,
      messages:        Number(msgStats?.total_convos   ?? 0),
      unreadMessages:  Number(msgStats?.unread_count   ?? 0),
    }

    res.json({ stats, recentActivity })
  } catch (err) {
    console.error('[dashboard/seeker] error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ── Color helpers ─────────────────────────────────────────────────────────────
function colorForType(type) {
  const map = {
    match:   '#10b981',
    message: '#f59e0b',
    visit:   '#3b82f6',
    listing: 'var(--text-primary)',
    fraud:   '#ef4444',
    system:  'var(--text-primary)',
  }
  return map[type] || 'var(--text-primary)'
}

function visitColor(status) {
  const map = {
    confirmed: '#10b981',
    cancelled: '#ef4444',
    completed: '#6366f1',
    pending:   '#3b82f6',
  }
  return map[status] || '#3b82f6'
}

module.exports = router

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/dashboard/owner
// ──────────────────────────────────────────────────────────────────────────────
// Aggregates all real-time stats + recent activity for the logged-in owner.
//
// Returns:
//   stats  — { totalListings, activeListings, totalViews, todayViews,
//               inquiries, newInquiries, unreadMessages, pendingVisits,
//               totalVisits, agreements, avgRating, newReviews }
//   recentActivity — latest 10 cross-module events (visits, messages, reviews,
//                    inquiries, notifications), sorted newest-first
// ══════════════════════════════════════════════════════════════════════════════

router.get('/owner', authMiddleware, async (req, res) => {
  const ownerId = req.user.id

  try {
    // ── 1. Listing counts & view totals ──────────────────────────────────────
    const [[listingStats]] = await db.query(
      `SELECT
         COUNT(*)                                                         AS total_listings,
         SUM(CASE WHEN status = 'verified' AND is_active = 1 THEN 1 ELSE 0 END) AS active_listings,
         COALESCE(SUM(inquiries), 0)                                      AS total_inquiries_col
       FROM listings
       WHERE owner_id = ?`,
      [ownerId]
    )

    // ── 1b. Total views from listing_views table (the only source of truth) ──
    const [[viewTotals]] = await db.query(
      `SELECT COALESCE(COUNT(DISTINCT lv.user_id, lv.listing_id), 0) AS total_views
       FROM listing_views lv
       JOIN listings l ON l.id = lv.listing_id
       WHERE l.owner_id = ?`,
      [ownerId]
    ).catch(() => [[{ total_views: 0 }]])

    // ── 2. Views today (from listing_views, keyed on viewer side) ────────────
    // We count distinct listing_view records for THIS owner's listings today.
    const [[todayViewStats]] = await db.query(
      `SELECT COUNT(DISTINCT lv.user_id, lv.listing_id) AS today_views
       FROM listing_views lv
       JOIN listings l ON l.id = lv.listing_id
       WHERE l.owner_id = ? AND DATE(lv.viewed_at) = CURDATE()`,
      [ownerId]
    ).catch(() => [[{ today_views: 0 }]])

    // ── 3. Inquiries (contact_unlocks on owner's listings) ───────────────────
    const [[inquiryStats]] = await db.query(
      `SELECT
         COUNT(*) AS total_inquiries,
         SUM(CASE WHEN cu.unlocked_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS new_inquiries
       FROM contact_unlocks cu
       JOIN listings l ON l.id = cu.listing_id
       WHERE l.owner_id = ?`,
      [ownerId]
    ).catch(() => [[{ total_inquiries: 0, new_inquiries: 0 }]])

    // ── 4. Messages — unread count received by owner ─────────────────────────
    const [[msgStats]] = await db.query(
      `SELECT
         SUM(CASE WHEN receiver_id = ? AND is_read = 0 THEN 1 ELSE 0 END) AS unread_count,
         COUNT(DISTINCT CONCAT(
           LEAST(sender_id, receiver_id), '-', GREATEST(sender_id, receiver_id),
           '-', COALESCE(listing_id, 0)
         )) AS total_convos
       FROM messages
       WHERE sender_id = ? OR receiver_id = ?`,
      [ownerId, ownerId, ownerId]
    ).catch(() => [[{ unread_count: 0, total_convos: 0 }]])

    // ── 5. Visits — pending + total ───────────────────────────────────────────
    const [[visitStats]] = await db.query(
      `SELECT
         COUNT(*) AS total_visits,
         SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END)   AS pending_visits,
         SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END)  AS confirmed_visits
       FROM visits
       WHERE owner_id = ?`,
      [ownerId]
    ).catch(() => [[{ total_visits: 0, pending_visits: 0, confirmed_visits: 0 }]])

    // ── 6. Agreements ─────────────────────────────────────────────────────────
    const [[agreeStats]] = await db.query(
      `SELECT COUNT(*) AS total_agreements FROM rental_agreements WHERE owner_id = ?`,
      [ownerId]
    ).catch(() => [[{ total_agreements: 0 }]])

    // ── 7. Reviews — avg rating + new this week ───────────────────────────────
    const [[reviewStats]] = await db.query(
      `SELECT
         COUNT(*)              AS total_reviews,
         ROUND(AVG(r.rating), 1) AS avg_rating,
         SUM(CASE WHEN r.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS new_reviews
       FROM reviews r
       JOIN listings l ON l.id = r.listing_id
       WHERE l.owner_id = ?`,
      [ownerId]
    ).catch(() => [[{ total_reviews: 0, avg_rating: null, new_reviews: 0 }]])

    // ── 8. Build Recent Activity ──────────────────────────────────────────────

    // 8a. Recent visit requests (newest first)
    const [visitRows] = await db.query(
      `SELECT v.id, v.status, v.visit_date, v.visit_time, v.created_at, v.updated_at,
              l.title AS listing_title, u.name AS seeker_name
       FROM visits v
       JOIN listings l ON l.id = v.listing_id
       JOIN users   u ON u.id = v.seeker_id
       WHERE v.owner_id = ?
       ORDER BY COALESCE(v.updated_at, v.created_at) DESC
       LIMIT 5`,
      [ownerId]
    ).catch(() => [[]])

    // 8b. Recent messages received by owner
    const [msgRows] = await db.query(
      `SELECT m.id, m.created_at, u.name AS sender_name, l.title AS listing_title
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       LEFT JOIN listings l ON l.id = m.listing_id
       WHERE m.receiver_id = ?
       ORDER BY m.created_at DESC
       LIMIT 5`,
      [ownerId]
    ).catch(() => [[]])

    // 8c. Recent reviews on owner's listings
    const [reviewRows] = await db.query(
      `SELECT r.id, r.rating, r.comment, r.created_at,
              l.title AS listing_title, u.name AS reviewer_name
       FROM reviews r
       JOIN listings l ON l.id = r.listing_id
       JOIN users   u ON u.id = r.user_id
       WHERE l.owner_id = ?
       ORDER BY r.created_at DESC
       LIMIT 5`,
      [ownerId]
    ).catch(() => [[]])

    // 8d. Recent contact unlocks (new inquiries) on owner's listings
    const [unlockRows] = await db.query(
      `SELECT cu.id, cu.unlocked_at, l.title AS listing_title, u.name AS seeker_name
       FROM contact_unlocks cu
       JOIN listings l ON l.id = cu.listing_id
       JOIN users   u ON u.id = cu.user_id
       WHERE l.owner_id = ?
       ORDER BY cu.unlocked_at DESC
       LIMIT 5`,
      [ownerId]
    ).catch(() => [[]])

    // 8e. Owner-facing system notifications
    const [notifRows] = await db.query(
      `SELECT id, type, title, message, is_read, created_at
       FROM notifications
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 10`,
      [ownerId]
    ).catch(() => [[]])

    // ── Merge and sort all activity events ────────────────────────────────────
    const events = []

    for (const v of visitRows) {
      const statusLabel = {
        pending:   '🔔 New visit request',
        confirmed: '✅ Visit confirmed',
        cancelled: '❌ Visit cancelled',
        completed: '🏁 Visit completed',
      }[v.status] || `Visit ${v.status}`

      events.push({
        id:    `visit-${v.id}`,
        type:  'visit',
        text:  `${statusLabel} from ${v.seeker_name} — "${v.listing_title}" on ${v.visit_date}`,
        time:  relativeTime(v.updated_at || v.created_at),
        ts:    new Date(v.updated_at || v.created_at).getTime(),
        read:  v.status !== 'pending',
        color: visitColor(v.status),
      })
    }

    for (const m of msgRows) {
      events.push({
        id:    `msg-${m.id}`,
        type:  'message',
        text:  `New message from ${m.sender_name}${m.listing_title ? ` — "${m.listing_title}"` : ''}`,
        time:  relativeTime(m.created_at),
        ts:    new Date(m.created_at).getTime(),
        read:  false,
        color: '#f59e0b',
      })
    }

    for (const r of reviewRows) {
      const stars = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating)
      events.push({
        id:    `review-${r.id}`,
        type:  'review',
        text:  `${r.reviewer_name} left a ${r.rating}-star review on "${r.listing_title}" ${stars}`,
        time:  relativeTime(r.created_at),
        ts:    new Date(r.created_at).getTime(),
        read:  true,
        color: r.rating >= 4 ? '#10b981' : r.rating >= 3 ? '#f59e0b' : '#ef4444',
      })
    }

    for (const u of unlockRows) {
      events.push({
        id:    `inquiry-${u.id}`,
        type:  'inquiry',
        text:  `${u.seeker_name} unlocked your contact for "${u.listing_title}"`,
        time:  relativeTime(u.unlocked_at),
        ts:    new Date(u.unlocked_at).getTime(),
        read:  false,
        color: '#6366f1',
      })
    }

    for (const n of notifRows) {
      // Skip dupes already covered by typed events above
      if (['visit', 'message', 'inquiry'].includes(n.type)) continue
      let text = n.message || n.title || ''
      if (/^undefined\s+/i.test(text)) text = text.replace(/^undefined/i, 'Someone')
      events.push({
        id:    `notif-${n.id}`,
        type:  n.type || 'system',
        text,
        time:  relativeTime(n.created_at),
        ts:    new Date(n.created_at).getTime(),
        read:  !!n.is_read,
        color: colorForType(n.type),
      })
    }

    events.sort((a, b) => b.ts - a.ts)
    const recentActivity = events.slice(0, 10)

    // ── 9. Compose final stats ────────────────────────────────────────────────
    const stats = {
      totalListings:    Number(listingStats.total_listings)    || 0,
      activeListings:   Number(listingStats.active_listings)   || 0,
      totalViews:       Number(viewTotals.total_views)           || 0,
      todayViews:       Number(todayViewStats.today_views)      || 0,
      inquiries:        Number(inquiryStats.total_inquiries)    || 0,
      newInquiries:     Number(inquiryStats.new_inquiries)      || 0,
      unreadMessages:   Number(msgStats.unread_count)           || 0,
      totalConvos:      Number(msgStats.total_convos)           || 0,
      totalVisits:      Number(visitStats.total_visits)         || 0,
      pendingVisits:    Number(visitStats.pending_visits)       || 0,
      confirmedVisits:  Number(visitStats.confirmed_visits)     || 0,
      agreements:       Number(agreeStats.total_agreements)     || 0,
      totalReviews:     Number(reviewStats.total_reviews)       || 0,
      avgRating:        reviewStats.avg_rating ? parseFloat(reviewStats.avg_rating) : null,
      newReviews:       Number(reviewStats.new_reviews)         || 0,
    }

    res.json({ stats, recentActivity })
  } catch (err) {
    console.error('[dashboard/owner] error:', err)
    res.status(500).json({ error: err.message })
  }
})