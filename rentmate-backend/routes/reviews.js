// routes/reviews.js  (FULL REPLACEMENT)
// ─────────────────────────────────────────────────────────────────────────────
// Changes vs original:
//   • POST / now calls notifyOwnerReview() with full review details
//     (seekerName, listingTitle, rating, reviewText) — no undefined values
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express')
const router  = express.Router()
const db      = require('../db')
const auth    = require('../middleware/auth')
const { notifyOwnerReview, notifySeekerOwnerReply } = require('../services/notifications')

// ── GET /api/reviews ──────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { listing_id } = req.query
    let sql = `
      SELECT
        r.id,
        r.listing_id,
        r.rating,
        r.text,
        r.created_at,
        u.name      AS reviewer_name,
        u.role      AS reviewer_role,
        l.title     AS listing_title
      FROM reviews r
      JOIN users    u ON u.id = r.user_id
      JOIN listings l ON l.id = r.listing_id
    `
    const params = []
    if (listing_id) {
      sql += ' WHERE r.listing_id = ?'
      params.push(listing_id)
    }
    sql += ' ORDER BY r.created_at DESC'

    const [rows] = await db.query(sql, params)
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/reviews/listing/:listingId ───────────────────────────────────────
router.get('/listing/:listingId', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT
         r.id,
         r.user_id,
         r.rating,
         r.text,
         r.created_at,
         u.name AS reviewer_name,
         u.role AS reviewer_role
       FROM reviews r
       JOIN users u ON u.id = r.user_id
       WHERE r.listing_id = ?
       ORDER BY r.created_at DESC`,
      [req.params.listingId]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/reviews/owner/badge ─────────────────────────────────────────────
// Returns count of unread review notifications for the logged-in owner.
// Used by the Navbar to show the review badge.
router.get('/owner/badge', auth, async (req, res) => {
  try {
    const [[row]] = await db.query(
      `SELECT COUNT(*) AS cnt
       FROM notifications
       WHERE user_id = ? AND type = 'review' AND is_read = 0`,
      [req.user.id]
    )
    res.json({ count: Number(row.cnt) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── PATCH /api/reviews/owner/mark-seen ───────────────────────────────────────
// Marks all review-type notifications as read for the logged-in owner.
// Called when owner opens the Reviews page.
router.patch('/owner/mark-seen', auth, async (req, res) => {
  try {
    await db.query(
      `UPDATE notifications SET is_read = 1
       WHERE user_id = ? AND type = 'review' AND is_read = 0`,
      [req.user.id]
    )
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/reviews/stats ────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const [[agg]] = await db.query(
      `SELECT
         COUNT(*)          AS total,
         AVG(rating)       AS avg_rating,
         SUM(rating = 5)   AS five,
         SUM(rating = 4)   AS four,
         SUM(rating = 3)   AS three,
         SUM(rating = 2)   AS two,
         SUM(rating = 1)   AS one
       FROM reviews`
    )
    res.json({
      total:      Number(agg.total),
      avg_rating: agg.avg_rating ? parseFloat(Number(agg.avg_rating).toFixed(1)) : 0,
      histogram:  {
        5: Number(agg.five),
        4: Number(agg.four),
        3: Number(agg.three),
        2: Number(agg.two),
        1: Number(agg.one),
      }
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/reviews ─────────────────────────────────────────────────────────
// Submit a new review. Auth required.
// Body: { listing_id, rating (1-5), text }
//
// ✅ Notifies the listing owner with:
//    seekerName, listingTitle, rating, reviewText
router.post('/', auth, async (req, res) => {
  const { listing_id, rating, text } = req.body
  const userId = req.user.id

  if (!listing_id || !rating || !text?.trim()) {
    return res.status(400).json({ error: 'listing_id, rating and text are required' })
  }
  if (rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Rating must be between 1 and 5' })
  }

  try {
    // Prevent duplicate reviews
    const [existing] = await db.query(
      'SELECT id FROM reviews WHERE listing_id = ? AND user_id = ?',
      [listing_id, userId]
    )
    if (existing.length > 0) {
      return res.status(409).json({ error: 'You have already reviewed this listing' })
    }

    const [result] = await db.query(
      'INSERT INTO reviews (listing_id, user_id, rating, text) VALUES (?, ?, ?, ?)',
      [listing_id, userId, Number(rating), text.trim()]
    )

    // Fetch full review with joined data
    const [[review]] = await db.query(
      `SELECT
         r.id,
         r.listing_id,
         r.rating,
         r.text,
         r.created_at,
         u.name      AS reviewer_name,
         u.role      AS reviewer_role,
         l.title     AS listing_title,
         l.owner_id  AS owner_id
       FROM reviews r
       JOIN users    u ON u.id = r.user_id
       JOIN listings l ON l.id = r.listing_id
       WHERE r.id = ?`,
      [result.insertId]
    )

    // ── Notify the owner about this review ────────────────────────────────
    // All values resolved from DB — never undefined
    if (review.owner_id && review.owner_id !== userId) {
      try {
        await notifyOwnerReview(
          review.owner_id,
          review.reviewer_name || 'A seeker',  // seekerName — from DB JOIN
          review.listing_title || 'your listing', // listingTitle — from DB JOIN
          review.rating,                          // rating number
          review.text,                            // reviewText (message)
          review.id,                              // reviewId (related_id)
          review.listing_id,
          userId                                  // seekerId
        )
      } catch (notifyErr) {
        console.error('[reviews] notify owner failed:', notifyErr.message)
      }
    }

    res.status(201).json(review)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── PUT /api/reviews/:id ──────────────────────────────────────────────────────
router.put('/:id', auth, async (req, res) => {
  const { rating, text } = req.body
  if (!rating || !text?.trim()) {
    return res.status(400).json({ error: 'rating and text are required' })
  }
  if (rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Rating must be between 1 and 5' })
  }
  try {
    const [rows] = await db.query('SELECT user_id FROM reviews WHERE id = ?', [req.params.id])
    if (rows.length === 0) return res.status(404).json({ error: 'Review not found' })
    if (rows[0].user_id !== req.user.id) return res.status(403).json({ error: 'Not your review' })

    await db.query(
      'UPDATE reviews SET rating = ?, text = ? WHERE id = ?',
      [Number(rating), text.trim(), req.params.id]
    )

    const [[review]] = await db.query(
      `SELECT
         r.id,
         r.user_id,
         r.listing_id,
         r.rating,
         r.text,
         r.created_at,
         u.name AS reviewer_name,
         u.role AS reviewer_role
       FROM reviews r
       JOIN users u ON u.id = r.user_id
       WHERE r.id = ?`,
      [req.params.id]
    )
    res.json(review)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── DELETE /api/reviews/:id ───────────────────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT user_id FROM reviews WHERE id = ?', [req.params.id])
    if (rows.length === 0) return res.status(404).json({ error: 'Review not found' })
    if (rows[0].user_id !== req.user.id) return res.status(403).json({ error: 'Not your review' })

    await db.query('DELETE FROM reviews WHERE id = ?', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/reviews/:id/reply ────────────────────────────────────────────────
router.get('/:id/reply', async (req, res) => {
  try {
    const [[reply]] = await db.query(
      `SELECT rr.id, rr.review_id, rr.owner_id, rr.text, rr.created_at, rr.updated_at,
              u.name AS owner_name
       FROM review_replies rr
       JOIN users u ON u.id = rr.owner_id
       WHERE rr.review_id = ?`,
      [req.params.id]
    )
    if (!reply) return res.json(null)
    res.json(reply)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/reviews/:id/reply ───────────────────────────────────────────────
router.post('/:id/reply', auth, async (req, res) => {
  const { text } = req.body
  if (!text?.trim()) return res.status(400).json({ error: 'text is required' })
  try {
    const [[review]] = await db.query(
      `SELECT r.id, r.user_id AS seeker_id, l.owner_id, l.id AS listing_id, l.title AS listing_title
       FROM reviews r JOIN listings l ON l.id = r.listing_id WHERE r.id = ?`,
      [req.params.id]
    )
    if (!review) return res.status(404).json({ error: 'Review not found' })
    if (review.owner_id !== req.user.id) return res.status(403).json({ error: 'Not your listing' })

    await db.query(
      `INSERT INTO review_replies (review_id, owner_id, text) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE text = VALUES(text), updated_at = CURRENT_TIMESTAMP`,
      [req.params.id, req.user.id, text.trim()]
    )
    const [[saved]] = await db.query(
      `SELECT rr.id, rr.review_id, rr.owner_id, rr.text, rr.created_at, rr.updated_at, u.name AS owner_name
       FROM review_replies rr JOIN users u ON u.id = rr.owner_id WHERE rr.review_id = ?`,
      [req.params.id]
    )

    // ── Notify the seeker that the owner replied to their review ─────────────
    if (review.seeker_id && review.seeker_id !== req.user.id) {
      try {
        await notifySeekerOwnerReply(
          review.seeker_id,
          saved.owner_name || 'The owner',
          review.listing_title || 'your listing',
          Number(req.params.id),  // reviewId
          review.listing_id,
          req.user.id             // ownerId
        )
      } catch (notifyErr) {
        console.error('[reviews] notify seeker reply failed:', notifyErr.message)
      }
    }

    res.status(201).json(saved)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── DELETE /api/reviews/:id/reply ─────────────────────────────────────────────
router.delete('/:id/reply', auth, async (req, res) => {
  try {
    const [[reply]] = await db.query('SELECT owner_id FROM review_replies WHERE review_id = ?', [req.params.id])
    if (!reply) return res.status(404).json({ error: 'Reply not found' })
    if (reply.owner_id !== req.user.id) return res.status(403).json({ error: 'Not your reply' })
    await db.query('DELETE FROM review_replies WHERE review_id = ?', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router