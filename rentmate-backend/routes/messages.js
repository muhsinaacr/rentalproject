// routes/messages.js  (FULL REPLACEMENT)
// ─────────────────────────────────────────────────────────────────────────────
// Changes vs original:
//   • Uses notifyOwnerNewMessage() for owner-chat messages so senderName
//     is always resolved from DB and never returns "undefined"
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express')
const router  = express.Router()
const db      = require('../db')
const auth    = require('../middleware/auth')
const { notifyNewMessage, notifyOwnerNewMessage } = require('../services/notifications')

// ── internal: verify contact unlock ──────────────────────────────────────────
// Unlocking ANY listing by an owner grants access to ALL their listings.
// This mirrors the logic in contacts.js → isOwnerUnlocked().
async function isContactUnlocked(seekerId, listingId) {
  // Get the owner of this listing first
  const [[listing]] = await db.query(
    'SELECT owner_id FROM listings WHERE id = ?',
    [listingId]
  )
  if (!listing) return false

  // Check if the seeker has unlocked ANY listing belonging to this owner
  const [rows] = await db.query(
    `SELECT cu.id
     FROM contact_unlocks cu
     JOIN listings l ON cu.listing_id = l.id
     WHERE cu.user_id = ? AND l.owner_id = ?
     LIMIT 1`,
    [seekerId, listing.owner_id]
  )
  return rows.length > 0
}

// ── GET /api/messages/conversations ──────────────────────────────────────────
router.get('/conversations', auth, async (req, res) => {
  try {
    const userId = req.user.id

    const [ownerConvs] = await db.query(`
      SELECT
        conv.listing_id,
        l.title                 AS listing_title,
        l.location              AS listing_location,
        conv.other_user_id,
        u.name                  AS other_user_name,
        u.role                  AS other_user_role,
        last_msg.content        AS last_message,
        last_msg.created_at     AS last_time,
        COALESCE(unread.cnt, 0) AS unread_count,
        CASE
          WHEN EXISTS (
            SELECT 1 FROM contact_unlocks cu
            JOIN listings cl ON cu.listing_id = cl.id
            WHERE cl.owner_id = l.owner_id
              AND cu.user_id = ?
          ) THEN 1 ELSE 0
        END AS is_unlocked
      FROM (
        SELECT
          listing_id,
          IF(sender_id = ?, receiver_id, sender_id) AS other_user_id,
          MAX(id) AS last_msg_id
        FROM messages
        WHERE (sender_id = ? OR receiver_id = ?)
          AND chat_type = 'owner'
        GROUP BY listing_id, other_user_id
      ) conv
      JOIN listings  l        ON l.id        = conv.listing_id
      JOIN users     u        ON u.id        = conv.other_user_id
      JOIN messages  last_msg ON last_msg.id = conv.last_msg_id
      LEFT JOIN (
        SELECT listing_id, sender_id, COUNT(*) AS cnt
        FROM messages
        WHERE receiver_id = ? AND is_read = 0 AND chat_type = 'owner'
        GROUP BY listing_id, sender_id
      ) unread
        ON unread.listing_id = conv.listing_id
       AND unread.sender_id  = conv.other_user_id
      ORDER BY last_msg.created_at DESC
    `, [userId, userId, userId, userId, userId])

    const [roommateConvs] = await db.query(`
      SELECT
        conv.other_user_id,
        u.name                  AS other_user_name,
        COALESCE(sp.occupation, u.role) AS other_user_occupation,
        last_msg.content        AS last_message,
        last_msg.created_at     AS last_time,
        COALESCE(unread.cnt, 0) AS unread_count
      FROM (
        SELECT
          IF(sender_id = ?, receiver_id, sender_id) AS other_user_id,
          MAX(id) AS last_msg_id
        FROM messages
        WHERE (sender_id = ? OR receiver_id = ?)
          AND chat_type = 'roommate'
        GROUP BY other_user_id
      ) conv
      JOIN users u ON u.id = conv.other_user_id
      LEFT JOIN seeker_profiles sp ON sp.user_id = conv.other_user_id
      JOIN messages last_msg ON last_msg.id = conv.last_msg_id
      LEFT JOIN (
        SELECT sender_id, COUNT(*) AS cnt
        FROM messages
        WHERE receiver_id = ? AND is_read = 0 AND chat_type = 'roommate'
        GROUP BY sender_id
      ) unread ON unread.sender_id = conv.other_user_id
      ORDER BY last_msg.created_at DESC
    `, [userId, userId, userId, userId])

    res.json({ owner: ownerConvs, roommate: roommateConvs })
  } catch (err) {
    console.error('GET /conversations error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/messages/owner/:listingId/:otherId ───────────────────────────────
router.get('/owner/:listingId/:otherId', auth, async (req, res) => {
  try {
    const userId    = req.user.id
    const listingId = Number(req.params.listingId)
    const otherId   = Number(req.params.otherId)

    if (!listingId || !otherId) {
      return res.status(400).json({ error: 'Invalid listingId or otherId' })
    }

    const [rows] = await db.query(`
      SELECT
        m.id,
        m.sender_id,
        m.receiver_id,
        m.content,
        m.listing_id,
        m.chat_type,
        m.is_read,
        m.created_at,
        u.name AS sender_name
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.listing_id = ?
        AND m.chat_type  = 'owner'
        AND (
          (m.sender_id = ? AND m.receiver_id = ?)
          OR
          (m.sender_id = ? AND m.receiver_id = ?)
        )
      ORDER BY m.created_at ASC
    `, [listingId, userId, otherId, otherId, userId])

    db.query(
      `UPDATE messages SET is_read = 1
       WHERE listing_id = ? AND receiver_id = ? AND sender_id = ?
         AND chat_type = 'owner' AND is_read = 0`,
      [listingId, userId, otherId]
    ).catch(e => console.warn('read-mark error:', e.message))

    res.json(rows)
  } catch (err) {
    console.error('GET /owner thread error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/messages/roommate/:otherId ──────────────────────────────────────
router.get('/roommate/:otherId', auth, async (req, res) => {
  try {
    const userId  = req.user.id
    const otherId = Number(req.params.otherId)

    if (!otherId) return res.status(400).json({ error: 'Invalid otherId' })

    const [rows] = await db.query(`
      SELECT
        m.id,
        m.sender_id,
        m.receiver_id,
        m.content,
        m.chat_type,
        m.is_read,
        m.created_at,
        u.name AS sender_name
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.chat_type = 'roommate'
        AND (
          (m.sender_id = ? AND m.receiver_id = ?)
          OR
          (m.sender_id = ? AND m.receiver_id = ?)
        )
      ORDER BY m.created_at ASC
    `, [userId, otherId, otherId, userId])

    db.query(
      `UPDATE messages SET is_read = 1
       WHERE receiver_id = ? AND sender_id = ?
         AND chat_type = 'roommate' AND is_read = 0`,
      [userId, otherId]
    ).catch(e => console.warn('read-mark error:', e.message))

    res.json(rows)
  } catch (err) {
    console.error('GET /roommate thread error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/messages/owner ──────────────────────────────────────────────────
// Body: { receiver_id, listing_id, content }
router.post('/owner', auth, async (req, res) => {
  try {
    const userId = req.user.id
    const { receiver_id, listing_id, content } = req.body

    if (!receiver_id || !listing_id || !content?.trim()) {
      return res.status(400).json({
        error: 'receiver_id, listing_id, and content are required'
      })
    }

    // Always resolve sender info from DB — JWT name can be stale/undefined
    const [[senderRow]] = await db.query(
      'SELECT role, name FROM users WHERE id = ?', [userId]
    )
    const senderRole = senderRow?.role
    const senderName = senderRow?.name || 'Someone'
    const seekerId   = senderRole === 'owner' ? Number(receiver_id) : userId

    // Enforce unlock gate
    const unlocked = await isContactUnlocked(seekerId, listing_id)
    if (!unlocked) {
      return res.status(403).json({
        error: 'Contact locked. Please unlock this listing contact to send messages.',
        code:  'CONTACT_LOCKED'
      })
    }

    await db.query(
      `INSERT INTO messages (sender_id, receiver_id, content, listing_id, chat_type, is_read)
       VALUES (?, ?, ?, ?, 'owner', 0)`,
      [userId, receiver_id, content.trim(), listing_id]
    )

    // ── Notify receiver ───────────────────────────────────────────────────
    try {
      const [[listing]] = await db.query('SELECT title FROM listings WHERE id = ?', [listing_id])
      const listingTitle = listing?.title || 'a listing'

      // Determine receiver role to pick the right notification helper
      const [[receiverRow]] = await db.query('SELECT role FROM users WHERE id = ?', [Number(receiver_id)])

      if (receiverRow?.role === 'owner') {
        // Seeker sent message → notify owner
        await notifyOwnerNewMessage(
          Number(receiver_id),
          senderName,
          listingTitle,
          Number(listing_id),
          userId
        )
      } else {
        // Owner replied → notify seeker
        await notifyNewMessage(
          Number(receiver_id),
          senderName,
          listingTitle,
          Number(listing_id),
          userId
        )
      }
    } catch (_) { /* notification failure must never block the response */ }

    res.json({ success: true })
  } catch (err) {
    console.error('POST /owner message error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/messages/roommate ───────────────────────────────────────────────
// Body: { receiver_id, content }
router.post('/roommate', auth, async (req, res) => {
  try {
    const userId = req.user.id
    const { receiver_id, content } = req.body

    if (!receiver_id || !content?.trim()) {
      return res.status(400).json({ error: 'receiver_id and content are required' })
    }

    // Always resolve from DB
    const [[senderRow]] = await db.query('SELECT name FROM users WHERE id = ?', [userId])
    const senderName = senderRow?.name || 'Someone'

    await db.query(
      `INSERT INTO messages (sender_id, receiver_id, content, listing_id, chat_type, is_read)
       VALUES (?, ?, ?, NULL, 'roommate', 0)`,
      [userId, receiver_id, content.trim()]
    )

    try {
      await notifyNewMessage(
        Number(receiver_id),
        senderName,
        'your roommate chat',
        null,
        userId
      )
    } catch (_) { /* notification failure must never block the response */ }

    res.json({ success: true })
  } catch (err) {
    console.error('POST /roommate message error:', err)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router