// routes/visits.js  (FULL REPLACEMENT)
// ─────────────────────────────────────────────────────────────────────────────
// Changes vs original:
//   • Uses notifyOwnerVisitRequest() instead of bare createNotification()
//     so senderName is always resolved from DB (never undefined)
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express')
const router  = express.Router()
const db      = require('../db')
const authMiddleware = require('../middleware/auth')
const {
  notifyVisitBooked,
  notifyVisitUpdate,
  notifyOwnerVisitRequest,
  createNotification,
} = require('../services/notifications')

// ─── POST /api/visits ─────────────────────────────────────────────────────────
router.post('/', authMiddleware, async (req, res) => {
  const { listing_id, owner_id, visit_date, visit_time, message } = req.body
  const seeker_id = req.user.id

  if (!listing_id || !owner_id || !visit_date || !visit_time) {
    return res.status(400).json({ error: 'listing_id, owner_id, visit_date, and visit_time are required' })
  }

  const today = new Date().toISOString().split('T')[0]
  if (visit_date < today) {
    return res.status(400).json({ error: 'Cannot book a visit in the past' })
  }

  try {
    const [existing] = await db.query(
      `SELECT id FROM visits WHERE seeker_id = ? AND listing_id = ? AND visit_date = ? AND visit_time = ? AND status != 'cancelled'`,
      [seeker_id, listing_id, visit_date, visit_time]
    )
    if (existing.length > 0) {
      return res.status(409).json({ error: 'You already have a booking for this listing at this date and time' })
    }

    // Always resolve seeker name from DB — never from JWT (avoids undefined)
    const [[seekerRow]] = await db.query('SELECT name FROM users WHERE id = ?', [seeker_id])
    const seekerName = seekerRow?.name || 'A seeker'

    const [[listing]] = await db.query('SELECT title FROM listings WHERE id = ?', [listing_id])
    const listingTitle = listing?.title || 'a listing'

    const [result] = await db.query(
      `INSERT INTO visits (seeker_id, listing_id, owner_id, visit_date, visit_time, message, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      [seeker_id, listing_id, owner_id, visit_date, visit_time, message || null]
    )

    const visitId = result.insertId

    // ── Notify OWNER — with seekerName resolved from DB ───────────────────
    await notifyOwnerVisitRequest(
      Number(owner_id),
      seekerName,
      listingTitle,
      visit_date,
      visit_time,
      visitId,
      Number(listing_id),
      seeker_id
    )

    // ── Notify SEEKER that their request was sent ─────────────────────────
    await notifyVisitBooked(seeker_id, listingTitle, visit_date, visitId)

    res.json({ message: 'Visit requested successfully!', visit_id: visitId })
  } catch (err) {
    console.error('Book visit error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ─── GET /api/visits/mine ─────────────────────────────────────────────────────
router.get('/mine', authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT v.id, v.listing_id, v.owner_id, v.visit_date, v.visit_time,
              v.message, v.status, v.created_at,
              l.title AS listing_title, l.location AS listing_location, l.photos AS listing_photos,
              u.name AS owner_name, u.phone AS owner_phone
       FROM visits v
       JOIN listings l ON v.listing_id = l.id
       JOIN users   u ON v.owner_id   = u.id
       WHERE v.seeker_id = ?
       ORDER BY v.created_at DESC`,
      [req.user.id]
    )
    res.json(rows)
  } catch (err) {
    console.error('Get seeker visits error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ─── GET /api/visits/owner ────────────────────────────────────────────────────
router.get('/owner', authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT v.id, v.listing_id, v.seeker_id, v.visit_date, v.visit_time,
              v.message, v.status, v.created_at,
              l.title AS listing_title, l.location AS listing_location,
              u.name AS seeker_name, u.phone AS seeker_phone, u.email AS seeker_email
       FROM visits v
       JOIN listings l ON v.listing_id = l.id
       JOIN users   u ON v.seeker_id   = u.id
       WHERE v.owner_id = ?
       ORDER BY v.created_at DESC`,
      [req.user.id]
    )

    // Compute effective status: if visit date has passed and still pending/approved,
    // return 'expired' in the response without writing to DB (avoids ENUM constraint)
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const result = rows.map(v => {
      const visitDate = v.visit_date ? new Date(v.visit_date) : null
      if (visitDate && visitDate < today && (v.status === 'pending' || v.status === 'approved')) {
        return { ...v, status: 'expired' }
      }
      return v
    })

    res.json(result)
  } catch (err) {
    console.error('Get owner visits error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ─── PATCH /api/visits/:id/status ─────────────────────────────────────────────
router.patch('/:id/status', authMiddleware, async (req, res) => {
  const { status } = req.body
  const visitId    = req.params.id
  const userId     = req.user.id

  const ALLOWED = ['pending', 'approved', 'rejected', 'cancelled']
  if (!ALLOWED.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Allowed: ${ALLOWED.join(', ')}` })
  }

  try {
    const [[visit]] = await db.query(
      `SELECT v.*, l.title AS listing_title FROM visits v
       JOIN listings l ON v.listing_id = l.id WHERE v.id = ?`,
      [visitId]
    )
    if (!visit) return res.status(404).json({ error: 'Visit not found' })

    const isOwner  = visit.owner_id  === userId
    const isSeeker = visit.seeker_id === userId

    if (!isOwner && !isSeeker) {
      return res.status(403).json({ error: 'Not authorized to update this visit' })
    }
    if (isSeeker && !isOwner && status !== 'cancelled') {
      return res.status(403).json({ error: 'Seekers can only cancel visits' })
    }

    await db.query(
      `UPDATE visits SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [status, visitId]
    )

    if (isOwner && (status === 'approved' || status === 'rejected')) {
      await notifyVisitUpdate(
        visit.seeker_id,
        visit.listing_title,
        visit.visit_date,
        status,
        visitId
      )
    }

    if (isSeeker && status === 'cancelled') {
      await createNotification(
        visit.owner_id,
        'visit',
        'Visit Cancelled',
        `A seeker cancelled their visit request for "${visit.listing_title}" on ${visit.visit_date}.`,
        { visit_id: visitId, listing_id: visit.listing_id },
        visitId
      )
    }

    res.json({ message: `Visit ${status} successfully` })
  } catch (err) {
    console.error('Update visit status error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ─── Legacy PUT ───────────────────────────────────────────────────────────────
router.put('/:id', authMiddleware, async (req, res) => {
  const { status } = req.body
  try {
    await db.query('UPDATE visits SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, req.params.id])
    res.json({ message: 'Visit updated' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router