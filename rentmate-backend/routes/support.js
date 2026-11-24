// routes/support.js  —  Contact Us / Support Queries
// ─────────────────────────────────────────────────────────────────────────────

const express        = require('express')
const router         = express.Router()
const db             = require('../db')
const authMiddleware = require('../middleware/auth')

// ── Admin-only guard ──────────────────────────────────────────────────────────
function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
  next()
}

// ══════════════════════════════════════════════════════════════════════════════
// USER ENDPOINTS  (seeker / owner)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/support/query
 * Submit a new support query to admin.
 */
router.post('/query', authMiddleware, async (req, res) => {
  try {
    const { subject, category = 'other', message } = req.body
    const userId   = req.user.id
    const userRole = req.user.role

    if (!subject || !message) {
      return res.status(400).json({ error: 'Subject and message are required.' })
    }
    if (userRole === 'admin') {
      return res.status(400).json({ error: 'Admins cannot submit support queries.' })
    }

    const [result] = await db.query(
      `INSERT INTO support_queries (user_id, user_role, subject, category, message)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, userRole, subject.trim(), category, message.trim()]
    )

    res.status(201).json({
      success: true,
      id: result.insertId,
      message: 'Your query has been submitted. Admin will respond soon.',
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/support/my-queries
 * Fetch the current user's own submitted queries.
 */
router.get('/my-queries', authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, subject, category, message, status, admin_reply, replied_at, created_at
       FROM support_queries
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [req.user.id]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN ENDPOINTS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/support/admin/queries
 * List all support queries with optional filters.
 * Query params: status, role, search, page, limit
 */
router.get('/admin/queries', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { status, role, search, page = 1, limit = 20 } = req.query
    const offset = (parseInt(page) - 1) * parseInt(limit)

    let where = ['1=1']
    let params = []

    if (status)  { where.push('sq.status = ?');    params.push(status) }
    if (role)    { where.push('sq.user_role = ?');  params.push(role)   }
    if (search)  {
      where.push('(sq.subject LIKE ? OR sq.message LIKE ? OR u.name LIKE ?)')
      const s = `%${search}%`
      params.push(s, s, s)
    }

    const [rows] = await db.query(
      `SELECT
         sq.id, sq.subject, sq.category, sq.message,
         sq.status, sq.is_flagged, sq.admin_reply, sq.replied_at,
         sq.created_at, sq.updated_at,
         sq.user_role,
         u.id   AS user_id,
         u.name AS user_name,
         u.email AS user_email
       FROM support_queries sq
       JOIN users u ON u.id = sq.user_id
       WHERE ${where.join(' AND ')}
       ORDER BY
         sq.is_flagged DESC,
         CASE sq.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
         sq.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    )

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total
       FROM support_queries sq
       JOIN users u ON u.id = sq.user_id
       WHERE ${where.join(' AND ')}`,
      params
    )

    res.json({ queries: rows, total, page: parseInt(page), limit: parseInt(limit) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/support/admin/unread-count
 * Count of open (unread) queries for admin badge.
 */
router.get('/admin/unread-count', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [[{ count }]] = await db.query(
      `SELECT COUNT(*) AS count FROM support_queries WHERE status = 'open'`
    )
    res.json({ count })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * PATCH /api/support/admin/queries/:id/flag
 * Toggle the is_flagged (urgent/pinned) state of a query.
 */
router.patch('/admin/queries/:id/flag', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { id } = req.params
    // Toggle: flip current value
    await db.query(
      'UPDATE support_queries SET is_flagged = NOT is_flagged WHERE id = ?',
      [id]
    )
    const [[updated]] = await db.query(
      'SELECT id, is_flagged FROM support_queries WHERE id = ?',
      [id]
    )
    res.json({ success: true, is_flagged: updated.is_flagged })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * PATCH /api/support/admin/queries/:id
 * Update status and/or send admin reply.
 * Body: { status?, admin_reply? }
 */
router.patch('/admin/queries/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { id }                = req.params
    const { status, admin_reply } = req.body

    const updates = []
    const params  = []

    if (status) {
      const allowed = ['open', 'in_progress', 'resolved', 'closed']
      if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' })
      updates.push('status = ?')
      params.push(status)
    }

    if (admin_reply !== undefined) {
      updates.push('admin_reply = ?', 'replied_at = NOW()')
      params.push(admin_reply)
      // Auto-mark as resolved when reply is sent
      if (!status) {
        updates.push('status = ?')
        params.push('resolved')
      }
    }

    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' })

    params.push(id)
    await db.query(`UPDATE support_queries SET ${updates.join(', ')} WHERE id = ?`, params)

    const [[updated]] = await db.query(
      `SELECT sq.*, u.name AS user_name, u.email AS user_email
       FROM support_queries sq JOIN users u ON u.id = sq.user_id
       WHERE sq.id = ?`,
      [id]
    )
    res.json({ success: true, query: updated })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * DELETE /api/support/admin/queries/:id
 * Delete a resolved/closed query.
 */
router.delete('/admin/queries/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    await db.query('DELETE FROM support_queries WHERE id = ?', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router