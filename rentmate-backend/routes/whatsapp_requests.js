// routes/whatsapp_requests.js
// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp Privacy Request System
//
// A seeker must REQUEST access to another seeker's WhatsApp number.
// The target user can ACCEPT or REJECT the request.
// WhatsApp number is ONLY revealed after acceptance.
//
// Endpoints:
//   POST /api/whatsapp-requests/request/:targetUserId    → send a request
//   GET  /api/whatsapp-requests/status/:targetUserId     → check request status
//   GET  /api/whatsapp-requests/incoming                 → my pending incoming requests
//   GET  /api/whatsapp-requests/all-incoming             → all incoming (all statuses)
//   GET  /api/whatsapp-requests/sent                     → all requests I sent
//   POST /api/whatsapp-requests/respond/:requestId       → accept or reject
//   GET  /api/whatsapp-requests/number/:targetUserId     → get number if accepted
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express')
const router  = express.Router()
const db      = require('../db')
const auth    = require('../middleware/auth')

// ── POST /api/whatsapp-requests/request/:targetUserId ────────────────────────
// Send a WhatsApp contact request to another user.
router.post('/request/:targetUserId', auth, async (req, res) => {
  try {
    const requesterId   = req.user.id
    const targetUserId  = parseInt(req.params.targetUserId)
    const { message }   = req.body

    if (!targetUserId || isNaN(targetUserId))
      return res.status(400).json({ error: 'Invalid target user ID' })

    if (requesterId === targetUserId)
      return res.status(400).json({ error: 'You cannot request your own number' })

    // Check target user exists
    const [[target]] = await db.query(
      'SELECT id, name FROM users WHERE id = ?', [targetUserId]
    )
    if (!target) return res.status(404).json({ error: 'User not found' })

    // Upsert — if already exists and was rejected, allow re-request (reset to pending)
    await db.query(
      `INSERT INTO contact_requests (requester_id, target_user_id, status, message)
       VALUES (?, ?, 'pending', ?)
       ON DUPLICATE KEY UPDATE
         status    = IF(status = 'rejected', 'pending', status),
         message   = IF(status = 'rejected', VALUES(message), message),
         updated_at = CURRENT_TIMESTAMP`,
      [requesterId, targetUserId, message || null]
    )

    // Notify target user
    try {
      const requesterName = req.user.name || 'Someone'
      await db.query(
        `INSERT INTO notifications (user_id, type, message, created_at)
         VALUES (?, 'whatsapp_request', ?, NOW())`,
        [targetUserId, `${requesterName} requested your WhatsApp number`]
      )
    } catch { /* notifications table may not exist yet — ignore */ }

    res.json({ success: true, message: 'Request sent successfully' })
  } catch (err) {
    console.error('POST /whatsapp-requests/request error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/whatsapp-requests/status/:targetUserId ──────────────────────────
// Returns the status of MY request to a specific user.
router.get('/status/:targetUserId', auth, async (req, res) => {
  try {
    const requesterId  = req.user.id
    const targetUserId = parseInt(req.params.targetUserId)

    const [[row]] = await db.query(
      `SELECT id, status, created_at FROM contact_requests
       WHERE requester_id = ? AND target_user_id = ?`,
      [requesterId, targetUserId]
    )

    if (!row) return res.json({ status: 'none' })
    res.json({ status: row.status, requestId: row.id, createdAt: row.created_at })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/whatsapp-requests/incoming ──────────────────────────────────────
// Get all PENDING incoming requests for the current user.
router.get('/incoming', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT cr.id, cr.requester_id, cr.status, cr.message, cr.created_at,
              u.name AS requester_name, u.photo AS requester_photo,
              sp.occupation, sp.personality_type, sp.preferred_location
       FROM contact_requests cr
       JOIN users u ON cr.requester_id = u.id
       LEFT JOIN seeker_profiles sp ON sp.user_id = cr.requester_id
       WHERE cr.target_user_id = ? AND cr.status = 'pending'
       ORDER BY cr.created_at DESC`,
      [req.user.id]
    )
    res.json({ requests: rows })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/whatsapp-requests/all-incoming ───────────────────────────────────
// All incoming requests (pending + accepted + rejected) for the current user.
router.get('/all-incoming', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT cr.id, cr.requester_id, cr.status, cr.message, cr.created_at, cr.updated_at,
              u.name AS requester_name, u.photo AS requester_photo,
              sp.occupation, sp.preferred_location
       FROM contact_requests cr
       JOIN users u ON cr.requester_id = u.id
       LEFT JOIN seeker_profiles sp ON sp.user_id = cr.requester_id
       WHERE cr.target_user_id = ?
       ORDER BY cr.created_at DESC`,
      [req.user.id]
    )
    res.json({ requests: rows })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/whatsapp-requests/sent ──────────────────────────────────────────
// All requests sent BY the current user (outgoing).
router.get('/sent', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT cr.id, cr.target_user_id, cr.status, cr.message, cr.created_at, cr.updated_at,
              u.name AS target_name,
              sp.occupation, sp.preferred_location
       FROM contact_requests cr
       JOIN users u ON cr.target_user_id = u.id
       LEFT JOIN seeker_profiles sp ON sp.user_id = cr.target_user_id
       WHERE cr.requester_id = ?
       ORDER BY cr.created_at DESC`,
      [req.user.id]
    )
    res.json({ requests: rows })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/whatsapp-requests/respond/:requestId ───────────────────────────
// Accept or reject an incoming request. Only the target user can respond.
router.post('/respond/:requestId', auth, async (req, res) => {
  try {
    const requestId = parseInt(req.params.requestId)
    const { action } = req.body // 'accepted' | 'rejected'

    if (!['accepted', 'rejected'].includes(action))
      return res.status(400).json({ error: 'action must be "accepted" or "rejected"' })

    // Verify this request belongs to current user as target
    const [[request]] = await db.query(
      'SELECT id, requester_id, target_user_id, status FROM contact_requests WHERE id = ?',
      [requestId]
    )
    if (!request) return res.status(404).json({ error: 'Request not found' })
    if (request.target_user_id !== req.user.id)
      return res.status(403).json({ error: 'You can only respond to your own incoming requests' })
    if (request.status !== 'pending')
      return res.status(400).json({ error: `Request already ${request.status}` })

    await db.query(
      'UPDATE contact_requests SET status = ?, updated_at = NOW() WHERE id = ?',
      [action, requestId]
    )

    // Notify the requester
    try {
      const targetName = req.user.name || 'Your contact'
      const msg = action === 'accepted'
        ? `${targetName} accepted your WhatsApp request! You can now view their number.`
        : `${targetName} declined your WhatsApp request.`
      await db.query(
        `INSERT INTO notifications (user_id, type, message, created_at)
         VALUES (?, 'whatsapp_response', ?, NOW())`,
        [request.requester_id, msg]
      )
    } catch { /* ignore */ }

    res.json({ success: true, status: action })
  } catch (err) {
    console.error('POST /whatsapp-requests/respond error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/whatsapp-requests/number/:targetUserId ──────────────────────────
// Returns the WhatsApp number ONLY if the current user's request was accepted.
router.get('/number/:targetUserId', auth, async (req, res) => {
  try {
    const requesterId  = req.user.id
    const targetUserId = parseInt(req.params.targetUserId)

    // Verify acceptance
    const [[request]] = await db.query(
      `SELECT status FROM contact_requests
       WHERE requester_id = ? AND target_user_id = ? AND status = 'accepted'`,
      [requesterId, targetUserId]
    )

    if (!request) {
      return res.status(403).json({
        error: 'Access not granted. Request the WhatsApp number first.',
        code: 'NOT_ACCEPTED'
      })
    }

    // Fetch the WhatsApp number from seeker_profiles
    const [[profile]] = await db.query(
      'SELECT whatsapp, phone FROM seeker_profiles WHERE user_id = ?',
      [targetUserId]
    )

    if (!profile) return res.status(404).json({ error: 'Profile not found' })

    const number = profile.whatsapp || profile.phone || null
    if (!number) return res.json({ number: null, message: 'User has not set a WhatsApp number' })

    res.json({ number })
  } catch (err) {
    console.error('GET /whatsapp-requests/number error:', err)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router