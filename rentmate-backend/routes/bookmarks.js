// routes/bookmarks.js — RentMate AI
// Seeker-side bookmark CRUD.
// ─────────────────────────────────────────────────────────────────────────────
// Rules enforced here:
//  1. Bookmarks are strictly user-specific (user_id from JWT)
//  2. INSERT IGNORE prevents duplicates at the DB level
//  3. GET /  — returns full listing details for all active bookmarked listings.
//  4. GET /ids — lightweight; returns ONLY listing IDs the user has bookmarked
//              (used by Browse & Detail pages to sync the heart/save button
//               without fetching full listing data again).
// ─────────────────────────────────────────────────────────────────────────────

const express        = require('express')
const router         = express.Router()
const db             = require('../db')
const authMiddleware = require('../middleware/auth')

// ── Auto-migrate missing columns ──────────────────────────────────────────────
// Runs once when the route module is first loaded. Guards against the case
// where migration scripts were never executed. Missing columns cause the SELECT
// query to throw a MySQL error — the frontend silently shows an empty Bookmarks
// page even though saves succeed.
async function ensureBookmarkColumns() {
  const run = async (sql) => {
    try {
      await db.query(sql)
    } catch (e) {
      // ER_DUP_FIELDNAME  = column already exists (expected/safe)
      // ER_PARSE_ERROR     = MySQL < 8.0 doesn't support IF NOT EXISTS on ALTER
      // ER_TABLE_EXISTS_ERROR = table already exists (safe)
      const safe = ['ER_DUP_FIELDNAME', 'ER_PARSE_ERROR', 'ER_TABLE_EXISTS_ERROR']
      if (!safe.includes(e.code)) {
        console.warn('[bookmarks] migration warning:', e.code, e.message)
      }
    }
  }

  // bookmarks.note — added by migrate_bookmarks_note.js (may not have been run)
  await run(`ALTER TABLE bookmarks ADD COLUMN IF NOT EXISTS note TEXT DEFAULT NULL`)

  // bookmarks.created_at — needed for ORDER BY in GET /
  await run(`ALTER TABLE bookmarks ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`)

  // listings.is_active — added by migrate_listing_active.js (may not have been run)
  await run(`ALTER TABLE listings ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE`)
  try {
    await db.query(`UPDATE listings SET is_active = TRUE WHERE is_active IS NULL`)
  } catch (e) { /* safe to ignore */ }

  // listing_boosts table — added by migrate_listing_boosts.js (may not have been run)
  // Without this table the EXISTS subquery in GET / throws "Table doesn't exist"
  await run(`
    CREATE TABLE IF NOT EXISTS listing_boosts (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      listing_id    INT NOT NULL,
      owner_id      INT NOT NULL,
      boosted_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      boosted_until DATETIME NOT NULL,
      payment_id    VARCHAR(100) DEFAULT NULL,
      KEY idx_listing (listing_id),
      KEY idx_until   (boosted_until),
      CONSTRAINT fk_boost_listing FOREIGN KEY (listing_id)
        REFERENCES listings(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
}
ensureBookmarkColumns()

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseDate(val) {
  if (!val) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val
  const d = new Date(val)
  if (isNaN(d.getTime())) return null
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function formatBookmarkedListing(l) {
  let photos = []
  try { photos = JSON.parse(l.photos || '[]') } catch { photos = [] }

  const tags = (l.amenities || '')
    .split(',')
    .map(a => a.trim())
    .filter(Boolean)

  return {
    id:            l.id,
    title:         l.title        || '',
    location:      (l.location    || '').toLowerCase(),
    locationLabel: l.location     || '',
    price:         Number(l.rent)        || 0,
    deposit:       Number(l.deposit)     || 0,
    maintenance:   Number(l.maintenance) || 0,
    type:          l.room_type    || '',
    furnished:     l.furnishing   || '',
    tags,
    verified:      l.status === 'verified',
    owner_id:      l.owner_id,
    owner:         l.owner_name   || '',
    description:   l.description  || '',
    availableFrom: parseDate(l.available_from),
    floor:         l.floor        != null ? l.floor       : null,
    totalFloors:   l.total_floors != null ? l.total_floors : null,
    facing:        l.facing       || '',
    bathrooms:     l.bathrooms    || l.bathroom || '',
    kitchen:       l.kitchen      || '',
    photos:        photos.map(f => typeof f === 'string' ? { name: f, url: `http://localhost:5000/uploads/${f}` } : f),
    latitude:      l.latitude  ? Number(l.latitude)  : null,
    longitude:     l.longitude ? Number(l.longitude) : null,
    isBoosted:     !!l.is_boosted,
    note:          l.note || '',
  }
}

// ── GET /api/bookmarks ────────────────────────────────────────────────────────
router.get('/', authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT l.*,
              u.name AS owner_name,
              b.note AS note,
              EXISTS (
                SELECT 1 FROM listing_boosts lb
                WHERE lb.listing_id = l.id AND lb.boosted_until > NOW()
              ) AS is_boosted
         FROM bookmarks b
         JOIN listings l ON b.listing_id = l.id
         JOIN users    u ON l.owner_id   = u.id
        WHERE b.user_id   = ?
          AND l.is_active = 1
        ORDER BY b.created_at DESC`,
      [req.user.id]
    )
    res.json(rows.map(formatBookmarkedListing))
  } catch (err) {
    console.error('[GET /api/bookmarks] error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/bookmarks/ids ────────────────────────────────────────────────────
router.get('/ids', authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT b.listing_id AS id
         FROM bookmarks b
         JOIN listings l ON b.listing_id = l.id
        WHERE b.user_id   = ?
          AND l.is_active = 1`,
      [req.user.id]
    )
    res.json(rows.map(r => r.id))
  } catch (err) {
    console.error('[GET /api/bookmarks/ids] error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/bookmarks/:listingId ────────────────────────────────────────────
router.post('/:listingId', authMiddleware, async (req, res) => {
  const listingId = req.params.listingId
  try {
    // Check listing exists and is active. Do NOT filter by status = 'verified' —
    // that caused silent save failures: optimistic UI showed "Saved" but the
    // backend returned 404 and nothing was ever written to the DB.
    const [[listing]] = await db.query(
      `SELECT id FROM listings WHERE id = ? AND is_active = 1`,
      [listingId]
    )
    if (!listing) {
      return res.status(404).json({ error: 'Listing not available for bookmarking' })
    }
    await db.query(
      'INSERT IGNORE INTO bookmarks (user_id, listing_id) VALUES (?, ?)',
      [req.user.id, listingId]
    )
    res.json({ bookmarked: true, listing_id: listingId })
  } catch (err) {
    console.error('[POST /api/bookmarks] error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── DELETE /api/bookmarks/:listingId ─────────────────────────────────────────
router.delete('/:listingId', authMiddleware, async (req, res) => {
  try {
    await db.query(
      'DELETE FROM bookmarks WHERE user_id = ? AND listing_id = ?',
      [req.user.id, req.params.listingId]
    )
    res.json({ bookmarked: false, listing_id: req.params.listingId })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── PATCH /api/bookmarks/:listingId/note ─────────────────────────────────────
router.patch('/:listingId/note', authMiddleware, async (req, res) => {
  const { note } = req.body
  try {
    const [result] = await db.query(
      'UPDATE bookmarks SET note = ? WHERE user_id = ? AND listing_id = ?',
      [note || '', req.user.id, req.params.listingId]
    )
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Bookmark not found' })
    }
    res.json({ note: note || '' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router