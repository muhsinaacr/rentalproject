// routes/admin.js — RentMate AI (Complete Admin Backend)
// Covers: Users, Listings, Reports (user + property), Analytics, Payments
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express')
const router  = express.Router()
const db      = require('../db')
const authMiddleware = require('../middleware/auth')
const { createNotification } = require('../services/notifications')

let analyzeListing
try {
  analyzeListing = require('../services/fraudDetection').analyzeListing
} catch {
  analyzeListing = null
}

// ── Middleware ─────────────────────────────────────────────────────────────────

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
  next()
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeDate(val) {
  if (!val) return ''
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) return val
  const d = val instanceof Date ? val : new Date(val)
  if (isNaN(d.getTime())) return ''
  const yyyy = d.getUTCFullYear()
  const mm   = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd   = String(d.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function safePhotos(raw) {
  let arr = []
  try { arr = JSON.parse(raw || '[]') } catch { arr = [] }
  if (!Array.isArray(arr)) arr = []
  return arr.map(f => ({ name: f, url: `http://localhost:5000/uploads/${f}` }))
}

function buildTrustScore(listing) {
  if (analyzeListing) {
    try { return analyzeListing(listing) } catch { /* fall through */ }
  }
  const flags = [], warnings = []
  let riskScore = 0
  const title       = (listing.title       || '').toLowerCase()
  const description = (listing.description || '').toLowerCase()
  const rent        = Number(listing.rent  || listing.price || 0)
  const location    = (listing.location    || '').toLowerCase()

  if (rent > 0 && rent < 1500) { flags.push('🚨 Rent is suspiciously low (under ₹1,500)'); riskScore += 35 }
  else if (rent > 0 && rent < 2500) { warnings.push('⚠️ Rent is quite low — verify carefully'); riskScore += 15 }
  if (description.length < 20) { flags.push('🚨 Description too short or missing'); riskScore += 20 }
  const suspWords = ['whatsapp only','call only','no visits','send advance','pay first','western union','money transfer']
  const found = suspWords.filter(w => title.includes(w) || description.includes(w))
  if (found.length > 0) { flags.push(`🚨 Suspicious phrases: "${found.join('", "')}"`); riskScore += found.length * 25 }
  let photosArr = []
  try { photosArr = JSON.parse(listing.photos || '[]') } catch {}
  if (photosArr.length === 0) { warnings.push('⚠️ No photos uploaded'); riskScore += 10 }
  if (!location || location.length < 3) { flags.push('🚨 Location missing or too vague'); riskScore += 20 }
  riskScore = Math.min(riskScore, 100)
  let riskLevel = 'low', riskColor = '#10b981', riskLabel = '✅ Looks Genuine'
  if (riskScore >= 50) { riskLevel = 'high'; riskColor = '#ef4444'; riskLabel = '🚨 High Risk — Likely Fraud' }
  else if (riskScore >= 25) { riskLevel = 'medium'; riskColor = '#f59e0b'; riskLabel = '⚠️ Needs Review' }
  return { riskLevel, riskScore, riskColor, riskLabel, flags, warnings, isFlagged: riskLevel === 'high' }
}

// ══════════════════════════════════════════════════════════════════════════════
// OVERVIEW / STATS
// ══════════════════════════════════════════════════════════════════════════════

// ── Badge count endpoints ─────────────────────────────────────────────────────

/**
 * GET /api/admin/listings-count
 * Pending listing count — used by frontend badge polling.
 */
router.get('/listings-count', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [[{ count }]] = await db.query("SELECT COUNT(*) AS count FROM listings WHERE status = 'pending'")
    res.json({ count })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/admin/reports-count
 * Total pending report count — used by frontend badge polling.
 */
router.get('/reports-count', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [[{ count }]] = await db.query(
      "SELECT COUNT(*) AS count FROM admin_reports WHERE status = 'pending'"
    )
    res.json({ count })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/stats', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [[{ users }]]       = await db.query('SELECT COUNT(*) as users FROM users WHERE role != "admin"')
    const [[{ listings }]]    = await db.query('SELECT COUNT(*) as listings FROM listings')
    const [[{ visits }]]      = await db.query('SELECT COUNT(*) as visits FROM visits')
    const [[{ messages }]]    = await db.query('SELECT COUNT(*) as messages FROM messages')
    const [[{ revenue }]]     = await db.query("SELECT COALESCE(SUM(amount),0) as revenue FROM payments WHERE status = 'success'")
    const [[{ transactions }]]= await db.query("SELECT COUNT(*) as transactions FROM payments WHERE status = 'success'")
    let ai_matches = 0
    try {
      const [[aml]] = await db.query('SELECT COUNT(*) as ai_matches FROM seeker_matches')
      ai_matches = Number(aml.ai_matches)
    } catch {}
    const [[{ reports_pending }]] = await db.query("SELECT COUNT(*) as reports_pending FROM admin_reports WHERE status = 'pending'")
    res.json({ users, listings, visits, messages, revenue, transactions, ai_matches, reports_pending })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// USERS MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════

// GET all users
router.get('/users', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { role, search } = req.query
    let sql = `
      SELECT u.id, u.name, u.email, u.role, u.phone, u.photo, u.created_at,
             u.banned,
             (SELECT COUNT(*) FROM listings WHERE owner_id = u.id) AS listing_count,
             (SELECT COUNT(*) FROM bookmarks WHERE user_id = u.id) AS bookmark_count,
             (SELECT COUNT(*) FROM visits WHERE seeker_id = u.id) AS visit_count,
             (SELECT COUNT(*) FROM admin_reports WHERE reporter_id = u.id) AS reports_filed,
             (SELECT COUNT(*) FROM admin_reports WHERE target_user_id = u.id) AS reports_received
      FROM users u WHERE u.role != 'admin'`
    const params = []
    if (role) { sql += ' AND u.role = ?'; params.push(role) }
    if (search) { sql += ' AND (u.name LIKE ? OR u.email LIKE ?)'; params.push(`%${search}%`, `%${search}%`) }
    sql += ' ORDER BY u.created_at DESC'
    const [rows] = await db.query(sql, params)
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET single user detail
router.get('/users/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [[user]] = await db.query(
      `SELECT u.id, u.name, u.email, u.role, u.phone, u.photo, u.created_at,
              sp.occupation, sp.preferred_location, sp.budget_min, sp.budget_max,
              sp.move_in_date, sp.food_pref, sp.gender_pref
       FROM users u
       LEFT JOIN seeker_profiles sp ON sp.user_id = u.id
       WHERE u.id = ?`, [req.params.id]
    )
    if (!user) return res.status(404).json({ error: 'User not found' })

    const [listings]     = await db.query('SELECT id, title, location, status FROM listings WHERE owner_id = ?', [req.params.id])
    const [reportsFiled] = await db.query(
      `SELECT r.*, COALESCE(tu.name, l.title) AS target_name
       FROM admin_reports r
       LEFT JOIN users u ON u.id = r.target_user_id
       LEFT JOIN listings l ON l.id = r.target_listing_id
       LEFT JOIN users tu ON tu.id = r.target_user_id
       WHERE r.reporter_id = ? ORDER BY r.created_at DESC`, [req.params.id]
    )
    const [reportsReceived] = await db.query(
      'SELECT * FROM admin_reports WHERE target_user_id = ? ORDER BY created_at DESC', [req.params.id]
    )

    res.json({ ...user, listings, reportsFiled, reportsReceived })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT update user role / ban
router.put('/users/:id', authMiddleware, adminOnly, async (req, res) => {
  const { role, banned } = req.body
  try {
    const updates = []
    const params  = []
    if (role    !== undefined) { updates.push('role = ?');   params.push(role) }
    if (banned  !== undefined) { updates.push('banned = ?'); params.push(banned ? 1 : 0) }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' })
    params.push(req.params.id)
    await db.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params)
    res.json({ message: 'User updated' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE user
router.delete('/users/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    await db.query('DELETE FROM users WHERE id = ?', [req.params.id])
    res.json({ message: 'User deleted' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// LISTINGS MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════

// GET all listings
router.get('/listings', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { status, search } = req.query
    let sql = `
      SELECT l.*, u.name AS owner_name, u.phone AS owner_phone
      FROM listings l
      JOIN users u ON l.owner_id = u.id`
    const params = []
    const where  = []
    if (status) { where.push('l.status = ?'); params.push(status) }
    if (search) { where.push('(l.title LIKE ? OR l.location LIKE ?)'); params.push(`%${search}%`, `%${search}%`) }
    if (where.length) sql += ' WHERE ' + where.join(' AND ')
    sql += ' ORDER BY l.created_at DESC'

    const [rows] = await db.query(sql, params)
    const formatted = rows.map(l => {
      const trust = buildTrustScore(l)
      return {
        id:            l.id,
        title:         l.title        || '',
        location:      l.location     || '',
        price:         Number(l.rent) || 0,
        deposit:       Number(l.deposit) || 0,
        type:          l.room_type    || '',
        furnished:     l.furnishing   || '',
        owner:         l.owner_name   || '',
        ownerPhone:    l.owner_phone  || '',
        amenities:     l.amenities    || '',
        description:   l.description  || '',
        availableFrom: safeDate(l.available_from),
        photos:        safePhotos(l.photos),
        status:        l.status       || 'pending',
        maintenance:   Number(l.maintenance) || 0,
        floor:         l.floor        || '',
        totalFloors:   l.total_floors || '',
        facing:        l.facing       || '',
        bathroom:      l.bathroom     || '',
        kitchen:       l.kitchen      || '',
        createdAt:     l.created_at,
        trustScore:    trust.riskScore,
        trustLevel:    trust.riskLevel,
        trustLabel:    trust.riskLabel,
        trustColor:    trust.riskColor,
        trustFlags:    trust.flags,
        trustWarnings: trust.warnings,
      }
    })
    res.json(formatted)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT update listing status
router.put('/listings/:id/status', authMiddleware, adminOnly, async (req, res) => {
  const { status, admin_note } = req.body
  const allowed = ['pending', 'verified', 'flagged', 'inactive', 'active']
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${allowed.join(', ')}` })
  }
  try {
    // Fetch listing + owner before updating
    const [[listing]] = await db.query(
      'SELECT id, title, owner_id FROM listings WHERE id = ?', [req.params.id]
    )

    await db.query('UPDATE listings SET status = ? WHERE id = ?', [status, req.params.id])

    // Notify the owner about the status change
    if (listing?.owner_id) {
      const statusMessages = {
        verified: {
          title: '✅ Listing Verified',
          message: `Your listing "${listing.title}" has been verified by our admin team. It is now marked as trusted.`,
          type: 'system',
        },
        flagged: {
          title: '🚩 Listing Flagged',
          message: `Your listing "${listing.title}" has been flagged by our admin team for review.${admin_note ? ` Reason: ${admin_note}` : ' Please ensure it complies with our community guidelines.'}`,
          type: 'warning',
        },
        inactive: {
          title: '⏸️ Listing Deactivated',
          message: `Your listing "${listing.title}" has been deactivated by an admin.${admin_note ? ` Reason: ${admin_note}` : ''}`,
          type: 'warning',
        },
        active: {
          title: '▶️ Listing Reactivated',
          message: `Your listing "${listing.title}" has been reactivated and is now visible to seekers.`,
          type: 'system',
        },
        pending: {
          title: '🔄 Listing Set to Pending',
          message: `Your listing "${listing.title}" has been set back to pending review by an admin.`,
          type: 'system',
        },
      }
      const notif = statusMessages[status]
      if (notif) {
        try {
          await createNotification(
            listing.owner_id, notif.type, notif.title, notif.message,
            { listing_id: listing.id }, listing.id
          )
        } catch (notifyErr) {
          console.error('[admin] notify owner listing status failed:', notifyErr.message)
        }
      }
    }

    res.json({ message: 'Status updated', id: Number(req.params.id), status })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE listing
router.delete('/listings/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    // Fetch listing before deleting so we can notify the owner
    const [[listing]] = await db.query(
      'SELECT id, title, owner_id FROM listings WHERE id = ?', [req.params.id]
    )

    await db.query('DELETE FROM listings WHERE id = ?', [req.params.id])

    // Notify owner their listing was removed
    if (listing?.owner_id) {
      try {
        await createNotification(
          listing.owner_id,
          'warning',
          '🗑️ Listing Removed by Admin',
          `Your listing "${listing.title}" has been permanently removed by our admin team for violating community guidelines.`,
          { listing_id: listing.id },
          listing.id
        )
      } catch (notifyErr) {
        console.error('[admin] notify owner listing deleted failed:', notifyErr.message)
      }
    }

    res.json({ message: 'Listing deleted' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// REPORTS (user reports + property reports)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/admin/reports
 * Submit a new report (user or listing).
 * Called by seekers/owners — NOT admin-only.
 * Body: { type: 'user'|'listing', target_id, reason, details? }
 */
router.post('/reports', authMiddleware, async (req, res) => {
  const { type, target_id, reason, details, report_category } = req.body
  if (!type || !target_id || !reason) {
    return res.status(400).json({ error: 'type, target_id and reason are required' })
  }
  if (!['user', 'listing'].includes(type)) {
    return res.status(400).json({ error: 'type must be "user" or "listing"' })
  }

  // Validate report_category matches type
  const validCategories = { user: ['owner', 'roommate', 'seeker'], listing: ['listing'] }
  const category = report_category || (type === 'listing' ? 'listing' : null)
  if (category && !validCategories[type]?.includes(category) && type !== 'listing') {
    return res.status(400).json({ error: 'Invalid report_category for this type' })
  }

  try {
    // Verify target exists
    if (type === 'user') {
      const [[target]] = await db.query('SELECT id FROM users WHERE id = ?', [target_id])
      if (!target) return res.status(404).json({ error: 'Target user not found' })
    } else {
      const [[target]] = await db.query('SELECT id FROM listings WHERE id = ?', [target_id])
      if (!target) return res.status(404).json({ error: 'Target listing not found' })
    }

    // Prevent self-reporting
    if (type === 'user' && Number(target_id) === req.user.id) {
      return res.status(400).json({ error: 'You cannot report yourself' })
    }

    // Prevent duplicate pending reports from same user on same target
    const dupCheck = type === 'user'
      ? 'SELECT id FROM admin_reports WHERE reporter_id = ? AND target_user_id = ? AND status = "pending"'
      : 'SELECT id FROM admin_reports WHERE reporter_id = ? AND target_listing_id = ? AND status = "pending"'
    const [[existing]] = await db.query(dupCheck, [req.user.id, target_id])
    if (existing) return res.status(409).json({ error: 'You already have a pending report for this target' })

    const [result] = await db.query(
      `INSERT INTO admin_reports
        (reporter_id, type, report_category, target_user_id, target_listing_id, reason, details, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        req.user.id,
        type,
        category || null,
        type === 'user'    ? target_id : null,
        type === 'listing' ? target_id : null,
        reason,
        details || null,
      ]
    )

    res.status(201).json({ message: 'Report submitted', id: result.insertId })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/admin/reports
 * Admin: fetch all reports with optional filters.
 * Query: ?type=user|listing  ?status=pending|resolved|dismissed
 */
router.get('/reports', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { type, status, category } = req.query
    let sql = `
      SELECT
        r.id,
        r.type,
        r.report_category,
        r.reason,
        r.details,
        r.status,
        r.admin_note,
        r.created_at,
        r.resolved_at,
        -- Reporter info
        reporter.id   AS reporter_id,
        reporter.name AS reporter_name,
        reporter.email AS reporter_email,
        reporter.role AS reporter_role,
        -- Target user info (when type = 'user')
        tu.id   AS target_user_id,
        tu.name AS target_user_name,
        tu.email AS target_user_email,
        -- Target listing info (when type = 'listing')
        tl.id       AS target_listing_id,
        tl.title    AS target_listing_title,
        tl.location AS target_listing_location,
        tl.rent     AS target_listing_rent
      FROM admin_reports r
      JOIN users reporter ON reporter.id = r.reporter_id
      LEFT JOIN users    tu ON tu.id = r.target_user_id
      LEFT JOIN listings tl ON tl.id = r.target_listing_id`

    const params = []
    const where  = []
    if (type)     { where.push('r.type = ?');            params.push(type) }
    if (status)   { where.push('r.status = ?');          params.push(status) }
    if (category) { where.push('r.report_category = ?'); params.push(category) }
    if (where.length) sql += ' WHERE ' + where.join(' AND ')
    sql += ' ORDER BY r.created_at DESC'

    const [rows] = await db.query(sql, params)

    const formatted = rows.map(r => {
      // If the reporter is an owner reporting a user, it's a seeker report
      const inferredCategory = (r.reporter_role === 'owner' && r.type === 'user')
        ? 'seeker'
        : r.report_category || (r.type === 'listing' ? 'listing' : 'owner')
      return {
        id:             r.id,
        type:           r.type,
        report_category: inferredCategory,
        reason:         r.reason,
        details:        r.details  || '',
        status:         r.status,
        adminNote:      r.admin_note || '',
        createdAt:      r.created_at,
        resolvedAt:     r.resolved_at || null,
        reporter: {
          id:    r.reporter_id,
          name:  r.reporter_name,
          email: r.reporter_email,
          role:  r.reporter_role,
        },
        target: r.type === 'user'
          ? { id: r.target_user_id, name: r.target_user_name, email: r.target_user_email }
          : { id: r.target_listing_id, title: r.target_listing_title, location: r.target_listing_location, rent: r.target_listing_rent },
      }
    })

    res.json(formatted)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/admin/reports/summary
 * Quick counts for the Reports tab badge.
 */
router.get('/reports/summary', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [[{ total }]]    = await db.query('SELECT COUNT(*) as total FROM admin_reports')
    const [[{ pending }]]  = await db.query("SELECT COUNT(*) as pending FROM admin_reports WHERE status = 'pending'")
    const [[{ resolved }]] = await db.query("SELECT COUNT(*) as resolved FROM admin_reports WHERE status = 'resolved'")
    const [[{ dismissed }]]= await db.query("SELECT COUNT(*) as dismissed FROM admin_reports WHERE status = 'dismissed'")
    const [[{ owner_reports }]]    = await db.query("SELECT COUNT(*) as owner_reports FROM admin_reports WHERE report_category = 'owner'")
    const [[{ roommate_reports }]] = await db.query("SELECT COUNT(*) as roommate_reports FROM admin_reports WHERE report_category = 'roommate'")
    const [[{ listing_reports }]]  = await db.query("SELECT COUNT(*) as listing_reports FROM admin_reports WHERE report_category = 'listing' OR type = 'listing'")
    const [[{ seeker_reports }]]   = await db.query("SELECT COUNT(*) as seeker_reports FROM admin_reports WHERE report_category = 'seeker'")
    res.json({ total, pending, resolved, dismissed, owner_reports, roommate_reports, listing_reports, seeker_reports })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * PUT /api/admin/reports/:id/resolve
 * Mark a report as resolved.
 * Body: { admin_note? }
 */
router.put('/reports/:id/resolve', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { admin_note } = req.body

    // Fetch report to get reporter info
    const [[report]] = await db.query(
      'SELECT reporter_id, reason FROM admin_reports WHERE id = ?', [req.params.id]
    )

    await db.query(
      "UPDATE admin_reports SET status = 'resolved', admin_note = ?, resolved_at = NOW() WHERE id = ?",
      [admin_note || null, req.params.id]
    )

    // Send thank-you notification to reporter
    if (report && report.reporter_id) {
      await db.query(
        `INSERT INTO notifications (user_id, type, title, message, is_read, created_at)
         VALUES (?, 'system', ?, ?, 0, NOW())`,
        [
          report.reporter_id,
          '✅ Your Report Has Been Resolved',
          `Thank you for reporting. We've reviewed your report regarding "${report.reason}" and have taken the necessary action. We appreciate you helping keep our community safe.`
        ]
      )
    }

    res.json({ message: 'Report resolved', id: Number(req.params.id), status: 'resolved' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * PUT /api/admin/reports/:id/dismiss
 * Dismiss a report (no action needed).
 * Body: { admin_note? }
 */
router.put('/reports/:id/dismiss', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { admin_note } = req.body

    // Fetch report to get reporter info
    const [[report]] = await db.query(
      'SELECT reporter_id, reason FROM admin_reports WHERE id = ?', [req.params.id]
    )

    await db.query(
      "UPDATE admin_reports SET status = 'dismissed', admin_note = ?, resolved_at = NOW() WHERE id = ?",
      [admin_note || null, req.params.id]
    )

    // Send update notification to reporter
    if (report && report.reporter_id) {
      await db.query(
        `INSERT INTO notifications (user_id, type, title, message, is_read, created_at)
         VALUES (?, 'system', ?, ?, 0, NOW())`,
        [
          report.reporter_id,
          'ℹ️ Update on Your Report',
          `Thank you for your report regarding "${report.reason}". After careful review, our team found insufficient evidence to take action at this time. We appreciate your effort in keeping the community safe.`
        ]
      )
    }

    res.json({ message: 'Report dismissed', id: Number(req.params.id), status: 'dismissed' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * PUT /api/admin/reports/:id/reviewing
 * Mark a report as "under review".
 */
router.put('/reports/:id/reviewing', authMiddleware, adminOnly, async (req, res) => {
  try {
    await db.query(
      "UPDATE admin_reports SET status = 'reviewing' WHERE id = ?",
      [req.params.id]
    )
    res.json({ message: 'Report marked as reviewing', id: Number(req.params.id), status: 'reviewing' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// ANALYTICS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/admin/analytics/user-growth
 * Monthly seeker vs owner signups for the past 12 months.
 */
router.get('/analytics/user-growth', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        DATE_FORMAT(created_at, '%Y-%m') AS month,
        role,
        COUNT(*) AS count
      FROM users
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
        AND role != 'admin'
      GROUP BY month, role
      ORDER BY month ASC
    `)

    // Pivot into { month, seekers, owners }
    const map = {}
    for (const row of rows) {
      if (!map[row.month]) map[row.month] = { month: row.month, seekers: 0, owners: 0 }
      if (row.role === 'seeker') map[row.month].seekers = Number(row.count)
      if (row.role === 'owner')  map[row.month].owners  = Number(row.count)
    }
    res.json(Object.values(map))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/admin/analytics/fraud
 * Listing safety breakdown: safe / suspicious / flagged counts.
 */
router.get('/analytics/fraud', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id, title, description, rent, location, photos FROM listings')
    let safe = 0, suspicious = 0, flagged = 0
    for (const l of rows) {
      const t = buildTrustScore(l)
      if (t.riskLevel === 'high')   flagged++
      else if (t.riskLevel === 'medium') suspicious++
      else safe++
    }
    res.json({ safe, suspicious, flagged, total: rows.length })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/admin/analytics/locations
 * Top searched/listed locations by volume.
 */
router.get('/analytics/locations', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT location, COUNT(*) as count
      FROM listings
      WHERE location IS NOT NULL AND location != ''
      GROUP BY location
      ORDER BY count DESC
      LIMIT 10
    `)
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/admin/analytics/rent-trends
 * Average monthly rent by room type for the last 6 months.
 */
router.get('/analytics/rent-trends', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        DATE_FORMAT(created_at, '%Y-%m') AS month,
        room_type,
        ROUND(AVG(rent)) AS avg_rent
      FROM listings
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
        AND rent > 0
      GROUP BY month, room_type
      ORDER BY month ASC
    `)
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/admin/analytics/ai-matches
 * AI match success stats.
 */
router.get('/analytics/ai-matches', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [[stats]] = await db.query(`
      SELECT
        COUNT(*) AS total_matches,
        ROUND(AVG(score)) AS avg_score,
        SUM(CASE WHEN score >= 70 THEN 1 ELSE 0 END) AS high_quality
      FROM seeker_matches
    `)
    res.json({
      total_matches: Number(stats.total_matches || 0),
      avg_score:     Number(stats.avg_score     || 0),
      high_quality:  Number(stats.high_quality  || 0),
    })
  } catch (err) {
    res.json({ total_matches: 0, avg_score: 0, high_quality: 0 })
  }
})

/**
 * GET /api/admin/analytics/overview
 * Full overview snapshot for the admin dashboard Overview tab.
 */
router.get('/analytics/overview', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [[{ total_users }]]    = await db.query("SELECT COUNT(*) as total_users FROM users WHERE role != 'admin'")
    const [[{ new_users }]]      = await db.query("SELECT COUNT(*) as new_users FROM users WHERE role != 'admin' AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)")
    const [[{ active_listings }]]= await db.query("SELECT COUNT(*) as active_listings FROM listings WHERE status IN ('active','verified')")
    const [[{ new_listings }]]   = await db.query("SELECT COUNT(*) as new_listings FROM listings WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)")
    const [[{ total_revenue }]]  = await db.query("SELECT COALESCE(SUM(amount),0) as total_revenue FROM payments WHERE status = 'success'")
    const [[{ transactions }]]   = await db.query("SELECT COUNT(*) as transactions FROM payments WHERE status = 'success'")

    // Revenue change: compare this month vs last month
    const [[{ this_month_rev }]] = await db.query("SELECT COALESCE(SUM(amount),0) as this_month_rev FROM payments WHERE status = 'success' AND created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')")
    const [[{ last_month_rev }]] = await db.query("SELECT COALESCE(SUM(amount),0) as last_month_rev FROM payments WHERE status = 'success' AND created_at >= DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 1 MONTH), '%Y-%m-01') AND created_at < DATE_FORMAT(NOW(), '%Y-%m-01')")
    const revenue_change = last_month_rev > 0 ? Math.round(((this_month_rev - last_month_rev) / last_month_rev) * 100) : (this_month_rev > 0 ? 100 : 0)

    // Repeat users: users who have made more than 1 successful payment
    let repeat_users = 0
    try {
      const [repeatRows] = await db.query(`
        SELECT COUNT(*) AS cnt FROM (
          SELECT user_id FROM payments
          WHERE status = 'success'
          GROUP BY user_id
          HAVING COUNT(*) > 1
        ) AS repeat_payers
      `)
      repeat_users = Number(repeatRows[0]?.cnt || 0)
    } catch { repeat_users = 0 }

    // Repeat user rate as percentage of total users
    const repeat_user_rate = total_users > 0 ? Math.round((repeat_users / total_users) * 100) : 0

    let ai_matches = 0, match_rate = 0
    try {
      const [[ml]] = await db.query("SELECT COUNT(*) as ai_matches FROM seeker_matches")
      ai_matches = Number(ml.ai_matches)
      const [[mr]] = await db.query("SELECT ROUND(AVG(score)) as match_rate FROM seeker_matches WHERE score >= 0")
      if (mr.match_rate != null) match_rate = Number(mr.match_rate)
    } catch {}

    res.json({
      totalUsers:        Number(total_users),
      newUsersThisMonth: Number(new_users),
      activeListings:    Number(active_listings),
      newListingsWeek:   Number(new_listings),
      totalRevenue:      Number(total_revenue) / 100,  // paise → ₹
      transactions:      Number(transactions),
      revenueChange:     revenue_change,
      repeatUserRate:    repeat_user_rate,
      aiMatches:         ai_matches,
      matchSuccessRate:  match_rate,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// PAYMENTS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/admin/payments
 * All payments with user info.
 * Query: ?status=success|failed|pending  ?limit=50  ?offset=0
 */
router.get('/payments', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query
    let sql = `
      SELECT
        p.id,
        p.amount,
        p.status,
        p.created_at,
        p.method                                             AS payment_method,
        COALESCE(p.razorpay_payment_id, CONCAT('PAY_', p.id)) AS transaction_ref,
        p.description                                          AS description,
        p.subscription_id                                      AS subscription_id,
        COALESCE(s.plan, NULL)                                  AS plan,
        u.name                                               AS user_name,
        u.email                                              AS user_email,
        u.role                                               AS user_role
      FROM payments p
      JOIN users u ON u.id = p.user_id
      LEFT JOIN subscriptions s ON s.id = p.subscription_id`
    const params = []
    if (status) { sql += ' WHERE p.status = ?'; params.push(status) }
    sql += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?'
    params.push(Number(limit), Number(offset))

    const [rows] = await db.query(sql, params)
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) as total FROM payments${status ? ' WHERE status = ?' : ''}`,
      status ? [status] : []
    )
    res.json({ rows, total: Number(total), limit: Number(limit), offset: Number(offset) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/admin/payments/summary
 * Revenue summary stats.
 */
router.get('/payments/summary', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [[stats]] = await db.query(`
      SELECT
        COALESCE(SUM(amount), 0)  AS total_revenue,
        COUNT(*)                  AS total_transactions,
        COALESCE(SUM(CASE WHEN status = 'success' THEN amount ELSE 0 END), 0) AS successful_revenue,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END)  AS successful_count,
        SUM(CASE WHEN status = 'failed'  THEN 1 ELSE 0 END)  AS failed_count,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END)  AS pending_count,
        COALESCE(SUM(CASE WHEN status = 'success' AND description = 'Top Pick' THEN amount ELSE 0 END), 0) AS top_pick_revenue,
        SUM(CASE WHEN status = 'success' AND description = 'Top Pick' THEN 1 ELSE 0 END) AS top_pick_count
      FROM payments
    `)

    // Monthly revenue for trend chart (last 6 months)
    const [monthly] = await db.query(`
      SELECT
        DATE_FORMAT(created_at, '%Y-%m') AS month,
        COALESCE(SUM(CASE WHEN status = 'success' THEN amount ELSE 0 END), 0) AS revenue,
        COUNT(*) AS transactions
      FROM payments
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
      GROUP BY month
      ORDER BY month ASC
    `)

    res.json({ ...stats, monthly })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * PUT /api/admin/reports/:id/warn
 * Warns the reported user by inserting a notification, then resolves the report.
 * Both owners and seekers share the same `notifications` table (user_id column).
 * Body: { admin_note? }
 */
router.put('/reports/:id/warn', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { admin_note } = req.body

    const [[report]] = await db.query(
      'SELECT * FROM admin_reports WHERE id = ?', [req.params.id]
    )
    if (!report) return res.status(404).json({ error: 'Report not found' })
    if (!report.target_user_id) {
      return res.status(400).json({ error: 'This report has no target user to warn' })
    }

    const warningTitle = '⚠️ Account Warning'
    const warningMsg   = `Your account has received an official warning. Reason: "${report.reason}".` +
      (admin_note ? ` Admin note: ${admin_note}` : ' Please ensure your behaviour follows our community guidelines.')

    // Both owners and seekers use the same `notifications` table with user_id
    await db.query(
      `INSERT INTO notifications (user_id, type, title, message, is_read, created_at)
       VALUES (?, 'warning', ?, ?, 0, NOW())`,
      [report.target_user_id, warningTitle, warningMsg]
    )

    // Use UPDATE to avoid unique-key conflicts on status column
    await db.query(
      "UPDATE admin_reports SET status = 'resolved', admin_note = ?, resolved_at = NOW() WHERE id = ?",
      [admin_note || 'User warned via notification', req.params.id]
    )

    // Also notify the reporter that action was taken
    if (report.reporter_id) {
      await db.query(
        `INSERT INTO notifications (user_id, type, title, message, is_read, created_at)
         VALUES (?, 'system', ?, ?, 0, NOW())`,
        [
          report.reporter_id,
          '✅ Action Taken on Your Report',
          `Thank you for reporting. We've reviewed your report regarding "${report.reason}" and have issued a formal warning to the user. We appreciate you helping keep our community safe.`
        ]
      )
    }

    res.json({ message: 'User warned and report resolved', id: Number(req.params.id), status: 'resolved' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// ANALYTICS — EXTENDED ENDPOINTS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/admin/analytics/platform-health
 * Overall platform activity: visits, messages, contact requests, bookmarks, reviews
 */
router.get('/analytics/platform-health', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [[{ total_visits }]]   = await db.query("SELECT COUNT(*) as total_visits FROM visits")
    const [[{ pending_visits }]] = await db.query("SELECT COUNT(*) as pending_visits FROM visits WHERE status = 'pending'")
    const [[{ total_messages }]] = await db.query("SELECT COUNT(*) as total_messages FROM messages")
    const [[{ total_bookmarks }]]= await db.query("SELECT COUNT(*) as total_bookmarks FROM bookmarks")

    let total_reviews = 0, avg_rating = 0
    try {
      const [[rv]] = await db.query("SELECT COUNT(*) as total_reviews, ROUND(AVG(rating),1) as avg_rating FROM reviews")
      total_reviews = Number(rv.total_reviews || 0)
      avg_rating    = Number(rv.avg_rating    || 0)
    } catch {}

    let total_contacts = 0
    try {
      const [[cc]] = await db.query("SELECT COUNT(*) as total_contacts FROM contact_requests")
      total_contacts = Number(cc.total_contacts || 0)
    } catch {}

    let total_agreements = 0
    try {
      const [[ag]] = await db.query("SELECT COUNT(*) as total_agreements FROM rental_agreements")
      total_agreements = Number(ag.total_agreements || 0)
    } catch {}

    // Week-over-week visit growth
    const [[{ visits_this_week }]] = await db.query("SELECT COUNT(*) as visits_this_week FROM visits WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)")
    const [[{ visits_last_week }]] = await db.query("SELECT COUNT(*) as visits_last_week FROM visits WHERE created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY) AND created_at < DATE_SUB(NOW(), INTERVAL 7 DAY)")
    const visits_change = visits_last_week > 0 ? Math.round(((visits_this_week - visits_last_week) / visits_last_week) * 100) : (visits_this_week > 0 ? 100 : 0)

    res.json({
      total_visits, pending_visits, visits_this_week, visits_last_week, visits_change,
      total_messages, total_bookmarks, total_reviews, avg_rating,
      total_contacts, total_agreements
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/admin/analytics/revenue-trend
 * Monthly revenue breakdown for the past 12 months.
 */
router.get('/analytics/revenue-trend', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        DATE_FORMAT(created_at, '%Y-%m') AS month,
        COALESCE(SUM(CASE WHEN status = 'success' THEN amount ELSE 0 END), 0) AS revenue,
        COUNT(CASE WHEN status = 'success' THEN 1 END) AS transactions,
        COUNT(CASE WHEN status = 'failed'  THEN 1 END) AS failed
      FROM payments
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
      GROUP BY month
      ORDER BY month ASC
    `)
    res.json(rows.map(r => ({
      month:        r.month,
      revenue:      Number(r.revenue)      / 100, // paise → ₹
      transactions: Number(r.transactions  || 0),
      failed:       Number(r.failed        || 0),
    })))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/admin/analytics/visits-trend
 * Monthly visit requests for the past 12 months.
 */
router.get('/analytics/visits-trend', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        DATE_FORMAT(created_at, '%Y-%m') AS month,
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved,
        SUM(CASE WHEN status = 'pending'  THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected
      FROM visits
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
      GROUP BY month
      ORDER BY month ASC
    `)
    res.json(rows.map(r => ({
      month:    r.month,
      total:    Number(r.total    || 0),
      approved: Number(r.approved || 0),
      pending:  Number(r.pending  || 0),
      rejected: Number(r.rejected || 0),
    })))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/admin/analytics/listing-types
 * Breakdown of listing types, furnishing, and avg rent per type.
 */
router.get('/analytics/listing-types', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [typeRows] = await db.query(`
      SELECT
        COALESCE(room_type, 'Unknown') AS type,
        COUNT(*) AS count,
        ROUND(AVG(rent)) AS avg_rent,
        SUM(CASE WHEN status IN ('active','verified') THEN 1 ELSE 0 END) AS active_count
      FROM listings
      GROUP BY room_type
      ORDER BY count DESC
    `)

    const [furnishRows] = await db.query(`
      SELECT
        COALESCE(furnishing, 'Unknown') AS furnishing,
        COUNT(*) AS count
      FROM listings
      GROUP BY furnishing
      ORDER BY count DESC
    `)

    const [statusRows] = await db.query(`
      SELECT
        COALESCE(status, 'pending') AS status,
        COUNT(*) AS count
      FROM listings
      GROUP BY status
      ORDER BY count DESC
    `)

    res.json({
      by_type:      typeRows.map(r => ({ type: r.type, count: Number(r.count), avg_rent: Number(r.avg_rent || 0), active: Number(r.active_count || 0) })),
      by_furnishing: furnishRows.map(r => ({ furnishing: r.furnishing, count: Number(r.count) })),
      by_status:    statusRows.map(r => ({ status: r.status, count: Number(r.count) })),
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/admin/analytics/report-trends
 * Monthly report activity for the past 6 months.
 */
router.get('/analytics/report-trends', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        DATE_FORMAT(created_at, '%Y-%m') AS month,
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'resolved'  THEN 1 ELSE 0 END) AS resolved,
        SUM(CASE WHEN status = 'pending'   THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status = 'dismissed' THEN 1 ELSE 0 END) AS dismissed
      FROM admin_reports
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
      GROUP BY month
      ORDER BY month ASC
    `)

    const [categoryRows] = await db.query(`
      SELECT
        COALESCE(report_category, type) AS category,
        COUNT(*) AS count
      FROM admin_reports
      GROUP BY report_category, type
    `)

    res.json({
      trend:      rows.map(r => ({ month: r.month, total: Number(r.total), resolved: Number(r.resolved), pending: Number(r.pending), dismissed: Number(r.dismissed) })),
      by_category: categoryRows.map(r => ({ category: r.category, count: Number(r.count) })),
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/admin/analytics/top-listings
 * Top listings by bookmark count and view count.
 */
router.get('/analytics/top-listings', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        l.id, l.title, l.location, l.rent, l.room_type,
        u.name AS owner_name,
        COUNT(DISTINCT b.id) AS bookmarks,
        COUNT(DISTINCT v.id) AS visits
      FROM listings l
      LEFT JOIN bookmarks b ON b.listing_id = l.id
      LEFT JOIN visits    v ON v.listing_id = l.id
      LEFT JOIN users     u ON u.id = l.owner_id
      GROUP BY l.id
      ORDER BY (COUNT(DISTINCT b.id) + COUNT(DISTINCT v.id)) DESC
      LIMIT 10
    `)
    res.json(rows.map(r => ({
      id:        r.id,
      title:     r.title,
      location:  r.location,
      rent:      Number(r.rent    || 0),
      type:      r.room_type,
      owner:     r.owner_name,
      bookmarks: Number(r.bookmarks || 0),
      visits:    Number(r.visits    || 0),
      score:     Number(r.bookmarks || 0) + Number(r.visits || 0),
    })))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router