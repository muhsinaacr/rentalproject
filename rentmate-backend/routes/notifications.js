// routes/notifications.js  (FULL REPLACEMENT)
// ─────────────────────────────────────────────────────────────────────────────
// RentMate — Seeker & Owner Notifications API
//
// Endpoints:
//   GET    /api/notifications              → fetch all for logged-in user
//   GET    /api/notifications/unread-count → badge number only
//   PATCH  /api/notifications/read-all     → mark every notification as read  ← NEW
//   PUT    /api/notifications/read-all     → same (backward compat)
//   PATCH  /api/notifications/:id/read     → mark one notification as read
//   DELETE /api/notifications/:id          → dismiss / delete one notification
// ─────────────────────────────────────────────────────────────────────────────

const express        = require('express')
const router         = express.Router()
const db             = require('../db')
const authMiddleware = require('../middleware/auth')

// ── Helper: relative timestamp ────────────────────────────────────────────────
function relativeTime(dateStr) {
  const now  = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = Math.floor((now - then) / 1000)

  if (diff < 60)        return 'Just now'
  if (diff < 3600)      return `${Math.floor(diff / 60)} min ago`
  if (diff < 86400)     return `${Math.floor(diff / 3600)} hour${Math.floor(diff / 3600) > 1 ? 's' : ''} ago`
  if (diff < 86400 * 2) return '1 day ago'
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} days ago`
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

// ── Helper: safely parse meta JSON ───────────────────────────────────────────
function parseMeta(raw) {
  if (!raw) return null
  if (typeof raw === 'object') return raw
  try { return JSON.parse(raw) } catch { return null }
}

// ── GET /api/notifications ────────────────────────────────────────────────────
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { type, unread } = req.query
    let sql    = 'SELECT * FROM notifications WHERE user_id = ?'
    const args = [req.user.id]

    if (type && type !== 'all') {
      sql += ' AND type = ?'
      args.push(type.toLowerCase())
    }
    if (unread === '1') {
      sql += ' AND is_read = 0'
    }
    sql += ' ORDER BY created_at DESC LIMIT 200'

    const [rows] = await db.query(sql, args)

    const notifications = rows.map(n => ({
      id:         n.id,
      type:       n.type,
      title:      n.title,
      text:       n.message,
      message:    n.message,
      time:       relativeTime(n.created_at),
      created_at: n.created_at,
      read:       n.is_read === 1 || n.is_read === true,
      related_id: n.related_id ?? null,
      meta:       parseMeta(n.meta),
    }))

    const unreadCount = notifications.filter(n => !n.read).length
    res.json({ notifications, unreadCount })
  } catch (err) {
    console.error('GET /notifications error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/notifications/unread-count ──────────────────────────────────────
router.get('/unread-count', authMiddleware, async (req, res) => {
  try {
    const [[{ cnt }]] = await db.query(
      'SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = ? AND is_read = 0',
      [req.user.id]
    )
    res.json({ count: cnt })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── PATCH /api/notifications/read-all ────────────────────────────────────────
// Mark every notification for this user as read.
// NOTE: this route MUST be declared before /:id/read or Express will
//       treat "read-all" as the :id parameter.
router.patch('/read-all', authMiddleware, async (req, res) => {
  try {
    await db.query(
      'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0',
      [req.user.id]
    )
    res.json({ message: 'All notifications marked as read' })
  } catch (err) {
    console.error('PATCH /read-all error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ── PUT /api/notifications/read-all ──────────────────────────────────────────
// Backward-compat alias (old frontend used PUT)
router.put('/read-all', authMiddleware, async (req, res) => {
  try {
    await db.query(
      'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0',
      [req.user.id]
    )
    res.json({ message: 'All notifications marked as read' })
  } catch (err) {
    console.error('PUT /read-all error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ── PATCH /api/notifications/:id/read ────────────────────────────────────────
router.patch('/:id/read', authMiddleware, async (req, res) => {
  try {
    const [result] = await db.query(
      'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    )
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Notification not found' })
    }
    res.json({ message: 'Notification marked as read' })
  } catch (err) {
    console.error('PATCH /:id/read error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ── DELETE /api/notifications/:id ────────────────────────────────────────────
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const [result] = await db.query(
      'DELETE FROM notifications WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    )
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Notification not found' })
    }
    res.json({ message: 'Notification deleted' })
  } catch (err) {
    console.error('DELETE /:id error:', err)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router