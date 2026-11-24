// routes/ownerNotifications.js
// ─────────────────────────────────────────────────────────────────────────────
// RentMate — Owner Notifications API
//
// Endpoints:
//   GET   /api/owner/notifications          → all notifications for logged-in owner
//   PATCH /api/owner/notifications/:id/read → mark one notification as read
//   PATCH /api/owner/notifications/read-all → mark all owner notifications as read
// ─────────────────────────────────────────────────────────────────────────────

const express        = require('express')
const router         = express.Router()
const db             = require('../db')
const authMiddleware = require('../middleware/auth')

// ── Helper: format a relative timestamp ──────────────────────────────────────
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

// ── Helper: resolve senderName from meta, never returns undefined ─────────────
function resolveSenderName(meta) {
  if (!meta) return null
  const parsed = typeof meta === 'string' ? (() => { try { return JSON.parse(meta) } catch { return {} } })() : meta

  // Review notifications store seeker_name directly in meta
  if (parsed.seeker_name && parsed.seeker_name !== 'undefined') return parsed.seeker_name

  return null
}

// ── PATCH /api/owner/notifications/read-all ───────────────────────────────────
// MUST be declared BEFORE /:id/read to avoid Express treating "read-all" as :id
router.patch('/read-all', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id
    await db.query(
      'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0',
      [userId]
    )
    res.json({ message: 'All owner notifications marked as read' })
  } catch (err) {
    console.error('PATCH /owner/notifications/read-all error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ── PATCH /api/owner/notifications/:id/read ───────────────────────────────────
router.patch('/:id/read', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id
    const [result] = await db.query(
      'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
      [req.params.id, userId]
    )
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Notification not found' })
    }
    res.json({ message: 'Notification marked as read' })
  } catch (err) {
    console.error('PATCH /owner/notifications/:id/read error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/owner/notifications ─────────────────────────────────────────────
// Returns all notifications for the logged-in owner, newest first.
// Optional filters:
//   ?type=visit|message|inquiry|review|performance|system|all
//   ?unread=1   → only unread
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { type, unread } = req.query
    const userId = req.user.id

    // Verify user is an owner
    const [[user]] = await db.query('SELECT role FROM users WHERE id = ?', [userId])
    if (!user || user.role !== 'owner') {
      return res.status(403).json({ error: 'Only owners can access this endpoint' })
    }

    let sql    = 'SELECT * FROM notifications WHERE user_id = ?'
    const args = [userId]

    if (type && type !== 'all') {
      sql += ' AND type = ?'
      args.push(type.toLowerCase())
    }
    if (unread === '1') {
      sql += ' AND is_read = 0'
    }

    sql += ' ORDER BY created_at DESC LIMIT 200'

    const [rows] = await db.query(sql, args)

    const notifications = rows.map(n => {
      const metaParsed = n.meta
        ? (typeof n.meta === 'string' ? (() => { try { return JSON.parse(n.meta) } catch { return {} } })() : n.meta)
        : null

      // Resolve senderName — always a string, never undefined
      let senderName = resolveSenderName(metaParsed)
      if (!senderName && metaParsed?.sender_id) {
        // Will be enriched below via batch query; placeholder for now
        senderName = null
      }

      return {
        id:         n.id,
        type:       n.type,
        title:      n.title,
        message:    n.message,
        text:       n.message,          // alias for frontend compatibility
        time:       relativeTime(n.created_at),
        created_at: n.created_at,
        read:       n.is_read === 1 || n.is_read === true,
        is_read:    n.is_read === 1 || n.is_read === true,
        related_id: n.related_id ?? null,
        meta:       metaParsed,
        senderName, // may still be null for message/visit types — enriched below
      }
    })

    // ── Enrich senderName for message/visit/inquiry notifications ────────────
    // Collect distinct sender_ids that still need a name lookup
    const needsLookup = notifications.filter(
      n => n.senderName === null && n.meta?.sender_id
    )

    if (needsLookup.length > 0) {
      const senderIds = [...new Set(needsLookup.map(n => n.meta.sender_id))]
      const [userRows] = await db.query(
        `SELECT id, name FROM users WHERE id IN (${senderIds.map(() => '?').join(',')})`,
        senderIds
      )
      const nameMap = Object.fromEntries(userRows.map(u => [u.id, u.name]))

      notifications.forEach(n => {
        if (n.senderName === null && n.meta?.sender_id) {
          n.senderName = nameMap[n.meta.sender_id] || 'Unknown Seeker'
        }
      })
    }

    // Final guard: ensure no notification has undefined/null senderName for types that need it
    notifications.forEach(n => {
      if (['message', 'visit', 'inquiry', 'review'].includes(n.type) && !n.senderName) {
        n.senderName = 'A seeker'
      }
    })

    const unreadCount = notifications.filter(n => !n.read).length

    res.json({ notifications, unreadCount })
  } catch (err) {
    console.error('GET /owner/notifications error:', err)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router