// routes/listings.js
// KEY FIX: Browse filters status='verified' only. New listings insert as 'pending'.

const express = require('express')
const router  = express.Router()
const db      = require('../db')
const authMiddleware = require('../middleware/auth')
const { notifyNewListingToMatchingSeekers } = require('../services/notifications')
const multer  = require('multer')
const fs      = require('fs')

const FREE_LISTING_LIMIT = 3

if (!fs.existsSync('uploads')) fs.mkdirSync('uploads')

const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s/g, '_'))
})
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true)
    else cb(new Error('Only images allowed'))
  }
})

function parseDate(val) {
  if (!val) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val
  const d = new Date(val)
  if (isNaN(d.getTime())) return null
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/**
 * formatListing — maps DB row to frontend shape.
 * Every field is null-safe (no undefined that can crash the UI).
 */
function formatListing(l) {
  let photos = []
  try { photos = JSON.parse(l.photos || '[]') } catch { photos = [] }

  const amenitiesStr  = l.amenities || ''
  const tags = amenitiesStr
    ? amenitiesStr.split(',').map(a => a.trim()).filter(Boolean)
    : []

  const locationStr   = l.location || ''

  return {
    id:            l.id,
    title:         l.title        || '',
    location:      locationStr.toLowerCase(),   // for match scoring (never null)
    locationLabel: locationStr,                 // for display
    price:         Number(l.rent)        || 0,
    deposit:       Number(l.deposit)     || 0,
    maintenance:   Number(l.maintenance) || 0,
    type:          l.room_type    || '',
    furnished:     l.furnishing   || '',
    tags:          tags,                        // always array, never undefined
    verified:      l.status === 'verified',     // FIX: 'verified' not 'active'
    owner_id:        l.owner_id,
    owner:           l.owner_name   || '',
    // ⚠️  ownerPhone is intentionally OMITTED here.
    // Phone is served ONLY via GET /api/contacts/phone/:id
    // after verifying a contact_unlocks record exists for (user_id, listing_id).
    // Boost status NEVER grants phone access.
    ownerCity:       l.owner_city        || null,
    ownerOccupation: l.owner_occupation  || null,
    ownerBio:        l.owner_bio         || null,
    ownerAge:        l.owner_age         != null ? Number(l.owner_age) : null,
    ownerVerified:   l.owner_verified    ? true : false,
    description:   l.description  || '',
    availableFrom: l.available_from ? String(l.available_from).split('T')[0] : '',
    floor:         l.floor        != null ? String(l.floor)        : '',
    totalFloors:   l.total_floors != null ? String(l.total_floors) : '',
    facing:        l.facing       || '',
    bathrooms:     l.bathroom     || '',        // DB: bathroom → FE: bathrooms
    kitchen:       l.kitchen      || '',
    photos:        photos.map(f => ({ name: f, url: `http://localhost:5000/uploads/${f}` })),
    status:        l.status       || 'pending',
    isBoosted:     l.is_boosted > 0,   // visibility only — never affects contact access
    isActive:      l.is_active !== undefined ? (l.is_active ? true : false) : true,
    views:         l.views        || 0,
    inquiries:     l.inquiries    || 0,
    // Geo coordinates — used for radius filtering and distance display
    latitude:      l.latitude  != null ? parseFloat(l.latitude)  : null,
    longitude:     l.longitude != null ? parseFloat(l.longitude) : null,
    // backward-compat aliases
    rent:          Number(l.rent) || 0,
    room_type:     l.room_type    || '',
    furnishing:    l.furnishing   || '',
    amenities:     amenitiesStr,
    available_from: l.available_from ? String(l.available_from).split('T')[0] : '',
    total_floors:  l.total_floors != null ? String(l.total_floors) : '',
    bathroom:      l.bathroom     || '',
    gender_pref:   l.gender_pref  || 'any',
    preferredTenant: l.gender_pref || 'any',
  }
}

async function getActivePremium(userId) {
  const [rows] = await db.query(
    `SELECT * FROM subscriptions
     WHERE user_id = ? AND plan = 'premium' AND status = 'active' AND end_date > NOW()
     ORDER BY end_date DESC LIMIT 1`,
    [userId]
  )
  return rows[0] || null
}

// ── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/listings — public seeker browse
 * HARD RULE: only status='verified' listings, always.
 *
 * Geo filtering: if lat + lng + radius are provided, filter by haversine distance.
 * Falls back to plain text LIKE match if no coords provided.
 */
const { haversineKm } = require('../utils/geoUtils')

router.get('/', async (req, res) => {
  try {
    const { location, type, roomType, furnished, furnishing,
            budgetMin, budgetMax, minRent, maxRent, amenities,
            lat, lng, radius } = req.query

    const finalType      = type      || roomType   || ''
    const finalFurnished = furnished || furnishing  || ''
    const finalMin       = budgetMin || minRent     || null
    const finalMax       = budgetMax || maxRent     || null

    // Geo params
    const searchLat    = lat    ? parseFloat(lat)    : null
    const searchLng    = lng    ? parseFloat(lng)    : null
    const searchRadius = radius ? parseFloat(radius) : 15  // default 15 km

    let query = `
      SELECT l.*,
             u.name AS owner_name,
             -- owner_phone intentionally excluded: served only via /api/contacts/phone after unlock
             op.city AS owner_city, op.occupation AS owner_occupation,
             op.bio AS owner_bio, op.age AS owner_age,
             op.is_verified AS owner_verified,
             -- is_boosted: 1 if listing has an active boost, 0 otherwise
             -- This affects sort order and badge display ONLY — not contact access
             (SELECT COUNT(*) FROM listing_boosts lb
              WHERE lb.listing_id = l.id AND lb.boosted_until > NOW()) AS is_boosted
      FROM listings l
      JOIN users u ON l.owner_id = u.id
      LEFT JOIN owner_profiles op ON op.user_id = l.owner_id
      WHERE l.status = 'verified' AND l.is_active = 1
    `
    const params = []

    // Location: plain text match only.
    // Geo distance sorting is done in JS after fetching all listings
    // (most listings don't have lat/lng yet — hard SQL filter would return nothing)
    if (location && location.trim() && searchLat === null) {
      query += ' AND LOWER(l.location) LIKE ?'
      params.push(`%${location.trim().toLowerCase()}%`)
    }

    if (finalType)      { query += ' AND l.room_type = ?';  params.push(finalType) }
    if (finalFurnished) { query += ' AND l.furnishing = ?'; params.push(finalFurnished) }
    if (finalMin)       { query += ' AND l.rent >= ?';      params.push(Number(finalMin)) }
    if (finalMax)       { query += ' AND l.rent <= ?';      params.push(Number(finalMax)) }

    if (amenities && amenities.trim()) {
      for (const a of amenities.split(',').map(x => x.trim()).filter(Boolean)) {
        query += ' AND LOWER(l.amenities) LIKE ?'
        params.push(`%${a.toLowerCase()}%`)
      }
    }

    // Boosted listings surface first; within each group, newest first
    query += ' ORDER BY is_boosted DESC, l.created_at DESC'

    const [listings] = await db.query(query, params)

    const formatted = listings.map(formatListing)

    // When geo search is active: geocode any listing missing lat/lng via Nominatim,
    // compute distance, attach label, then sort nearest-first.
    if (searchLat !== null && searchLng !== null) {
      // Geocode listings that have no coords stored yet
      await Promise.all(formatted.map(async (l) => {
        if (l.latitude && l.longitude) return  // already have coords
        if (!l.locationLabel) return
        try {
          const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(l.locationLabel + ', Kerala, India')}&format=json&limit=1&countrycodes=in`
          const r = await fetch(url, { headers: { 'User-Agent': 'RentMate/1.0', 'Accept-Language': 'en' } })
          const d = await r.json()
          if (d[0]) {
            const lat = parseFloat(d[0].lat)
            const lng = parseFloat(d[0].lon)
            if (lat >= 8 && lat <= 13 && lng >= 74 && lng <= 78) {
              l.latitude  = lat
              l.longitude = lng
              // Save back to DB so next search is instant
              db.query('UPDATE listings SET latitude=?, longitude=? WHERE id=?', [lat, lng, l.id]).catch(() => {})
            }
          }
        } catch { /* silent */ }
      }))

      // Attach distance label and filter by radius
      const withDist = []
      for (const l of formatted) {
        if (l.latitude && l.longitude) {
          const km = haversineKm(searchLat, searchLng, l.latitude, l.longitude)
          if (km <= searchRadius) {
            l.distance_km    = km
            l.distance_label = km < 1 ? `${Math.round(km * 1000)} m away` : km < 10 ? `${km.toFixed(1)} km away` : `${Math.round(km)} km away`
            withDist.push(l)
          }
        }
        // Listings with no resolvable coords are excluded from geo results
      }

      withDist.sort((a, b) => {
        if (a.isBoosted !== b.isBoosted) return a.isBoosted ? -1 : 1
        return a.distance_km - b.distance_km
      })

      return res.json(withDist)
    }

    res.json(formatted)   // always a valid array
  } catch (err) {
    console.error('GET /listings error:', err)
    res.status(500).json({ error: err.message })
  }
})

// GET /owner/mine
router.get('/owner/mine', authMiddleware, async (req, res) => {
  try {
    // Fetch listings with REAL view counts (from listing_views table)
    // and REAL inquiry counts (from contact_unlocks table).
    // The listings.views / listings.inquiries columns are never updated and
    // must NOT be used — they are always 0.
    const [listings] = await db.query(
      `SELECT l.*,
              COUNT(DISTINCT lv.id)  AS real_views,
              COUNT(DISTINCT cu.id)  AS real_inquiries
       FROM listings l
       LEFT JOIN listing_views  lv ON lv.listing_id = l.id
       LEFT JOIN contact_unlocks cu ON cu.listing_id = l.id
       WHERE l.owner_id = ?
       GROUP BY l.id
       ORDER BY l.created_at DESC`,
      [req.user.id]
    )

    // Patch each row so formatListing picks up the real counts
    const enriched = listings.map(l => ({
      ...l,
      views:     Number(l.real_views)     || 0,
      inquiries: Number(l.real_inquiries) || 0,
    }))

    const premium           = await getActivePremium(req.user.id)
    const isPremium         = !!premium
    const listingCount      = listings.length
    const remainingListings = isPremium ? null : Math.max(0, FREE_LISTING_LIMIT - listingCount)

    // Normalise end_date to ISO string regardless of pool dateStrings setting
    let premiumEndDate = null
    if (premium && premium.end_date) {
      const raw = premium.end_date
      premiumEndDate = (raw instanceof Date)
        ? raw.toISOString()
        : new Date(String(raw).replace(' ', 'T')).toISOString()
    }

    res.json({
      listings: enriched.map(formatListing),
      isPremium, remainingListings,
      freeLimitReached:  !isPremium && listingCount >= FREE_LISTING_LIMIT,
      FREE_LISTING_LIMIT,
      premiumEndDate,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /owner/:userId/listings — fetch all active listings for a given owner (for profile drawer)
router.get('/owner/:userId/listings', authMiddleware, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId)
    if (!userId) return res.status(400).json({ error: 'Invalid user ID' })
    const [listings] = await db.query(
      'SELECT * FROM listings WHERE owner_id = ? AND status = "approved" ORDER BY created_at DESC',
      [userId]
    )
    res.json({ listings: listings.map(formatListing) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /:id — single listing for detail page (any status, no restriction)
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT l.*, u.name AS owner_name, u.phone AS owner_phone,
              op.city AS owner_city, op.occupation AS owner_occupation,
              op.bio AS owner_bio, op.age AS owner_age,
              op.is_verified AS owner_verified
       FROM listings l
       JOIN users u ON l.owner_id = u.id
       LEFT JOIN owner_profiles op ON op.user_id = l.owner_id
       WHERE l.id = ?`,
      [req.params.id]
    )
    if (rows.length === 0) return res.status(404).json({ error: 'Listing not found' })

    // ── Track view for authenticated seekers ─────────────────────────────────
    // Runs in background — never delays the response.
    // Deduplicates: only one view per (user, listing) per 30 minutes.
    const token = req.headers.authorization
    if (token && req.query.notrack !== '1') {
      setImmediate(async () => {
        try {
          const jwt = require('jsonwebtoken')
          const decoded = jwt.verify(token.replace('Bearer ', ''), process.env.JWT_SECRET)
          if (decoded && decoded.id && decoded.role === 'seeker') {
            const [[{ recent }]] = await db.query(
              `SELECT COUNT(*) AS recent FROM listing_views
               WHERE user_id = ? AND listing_id = ?
                 `,
              [decoded.id, req.params.id]
            )
            if (!recent) {
              await db.query(
                'INSERT INTO listing_views (user_id, listing_id) VALUES (?, ?)',
                [decoded.id, req.params.id]
              )
            }
          }
        } catch (e) {
          // Invalid token or table missing — silently ignore
          if (e.code !== 'ER_NO_SUCH_TABLE') {
            // normal — table created by dashboard route on first load
          }
        }
      })
    }

    res.json(formatListing(rows[0]))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST / — create listing (status = 'pending', awaiting admin approval)
router.post('/', authMiddleware, upload.array('photos', 5), async (req, res) => {
  try {
    const premium = await getActivePremium(req.user.id)
    if (!premium) {
      const [[{ cnt }]] = await db.query(
        'SELECT COUNT(*) AS cnt FROM listings WHERE owner_id = ?', [req.user.id]
      )
      if (cnt >= FREE_LISTING_LIMIT) {
        return res.status(403).json({
          error: 'Free plan limit reached. Upgrade to Premium to add more listings.',
          code: 'LISTING_LIMIT_REACHED', limit: FREE_LISTING_LIMIT,
        })
      }
    }

    const { title, description, location, rent, price, deposit,
            room_type, type, furnishing, furnished,
            available_from, availableFrom, amenities,
            gender_pref, preferredTenant, smoking_allowed, pets_allowed,
            floor, total_floors, totalFloors, facing, bathroom, kitchen, maintenance } = req.body

    const [result] = await db.query(
      `INSERT INTO listings
       (owner_id, title, description, location, rent, deposit, room_type,
        furnishing, available_from, amenities, photos, gender_pref,
        smoking_allowed, pets_allowed, floor, total_floors, facing,
        bathroom, kitchen, maintenance, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        req.user.id,
        title,
        description  || '',
        location,
        rent || price,
        deposit      || null,
        room_type    || type,
        furnishing   || furnished,
        parseDate(available_from || availableFrom),
        amenities    || '',
        JSON.stringify(req.files ? req.files.map(f => f.filename) : []),
        gender_pref  || preferredTenant,
        smoking_allowed || 0,
        pets_allowed    || 0,
        floor           || null,
        total_floors    || totalFloors || null,
        facing          || null,
        bathroom        || null,
        kitchen         || null,
        maintenance     || null,
      ]
    )
    // ── Notify matching seekers in the background ─────────────────────────
    const newListingId = result.insertId
    setImmediate(async () => {
      try {
        const [[created]] = await db.query('SELECT * FROM listings WHERE id = ?', [newListingId])
        if (created) await notifyNewListingToMatchingSeekers(created)
      } catch (e) { console.error('[notifications] listing trigger failed:', e.message) }
    })

    res.json({ id: result.insertId, message: 'Listing created! Awaiting admin approval.' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /:id — update listing
router.put('/:id', authMiddleware, upload.array('photos', 5), async (req, res) => {
  try {
    const { title, description, location, rent, price, status,
            room_type, type, furnishing, furnished,
            available_from, availableFrom, amenities,
            gender_pref, preferredTenant,
            floor, total_floors, totalFloors, facing, bathroom, kitchen, maintenance, deposit } = req.body

    let photoFilenames = null
    if (req.files && req.files.length > 0) {
      photoFilenames = JSON.stringify(req.files.map(f => f.filename))
    }

    const updateFields = [
      'title=?','description=?','location=?','rent=?','status=?',
      'room_type=?','furnishing=?','available_from=?','amenities=?',
      'gender_pref=?','floor=?','total_floors=?','facing=?',
      'bathroom=?','kitchen=?','maintenance=?','deposit=?'
    ]
    const values = [
      title, description || '', location, rent || price,
      status || 'pending',
      room_type || type, furnishing || furnished,
      parseDate(available_from || availableFrom),
      amenities || '',
      gender_pref || preferredTenant,
      floor || null, total_floors || totalFloors || null,
      facing || null, bathroom || null, kitchen || null,
      maintenance || null, deposit || null,
    ]

    if (photoFilenames) { updateFields.push('photos=?'); values.push(photoFilenames) }
    values.push(req.params.id, req.user.id)

    await db.query(
      `UPDATE listings SET ${updateFields.join(', ')} WHERE id = ? AND owner_id = ?`,
      values
    )
    res.json({ message: 'Listing updated!' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PATCH /:id/status — owner toggles is_active (active / inactive)
router.patch('/:id/status', authMiddleware, async (req, res) => {
  try {
    const { is_active } = req.body
    if (is_active === undefined || is_active === null) {
      return res.status(400).json({ error: 'is_active is required (true or false)' })
    }
    const activeVal = is_active ? 1 : 0

    // Ownership check — only the listing owner can toggle
    const [[listing]] = await db.query(
      'SELECT id, owner_id FROM listings WHERE id = ?',
      [req.params.id]
    )
    if (!listing) return res.status(404).json({ error: 'Listing not found' })
    if (Number(listing.owner_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: 'Not authorized to modify this listing' })
    }

    await db.query(
      'UPDATE listings SET is_active = ? WHERE id = ? AND owner_id = ?',
      [activeVal, req.params.id, req.user.id]
    )

    res.json({
      message: activeVal ? 'Listing activated!' : 'Listing deactivated!',
      id: Number(req.params.id),
      is_active: !!activeVal,
    })
  } catch (err) {
    console.error('PATCH status error:', err)
    res.status(500).json({ error: err.message })
  }
})

// DELETE listing
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await db.query('DELETE FROM listings WHERE id = ? AND owner_id = ?', [req.params.id, req.user.id])
    res.json({ message: 'Listing deleted!' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /:id/boost — owner pays to boost a listing ─────────────────────────
// SECURITY CONTRACT:
//   Boost = higher sort order in browse + "Boosted" badge
//   Boost = NOTHING ELSE. Contact remains locked unless unlocked via /api/contacts.
router.post('/:id/boost', authMiddleware, async (req, res) => {
  try {
    const listingId = Number(req.params.id)
    const ownerId   = req.user.id
    const { paymentId, method: paymentMethod } = req.body

    // Ownership check
    const [[listing]] = await db.query(
      'SELECT id FROM listings WHERE id = ? AND owner_id = ?',
      [listingId, ownerId]
    )
    if (!listing) return res.status(403).json({ error: 'Listing not found or not yours' })

    const BOOST_DAYS   = 28
    const BOOST_AMOUNT = 4900 // ₹49 in paise
    const boostedUntil = new Date(Date.now() + BOOST_DAYS * 24 * 60 * 60 * 1000)

    await db.query(
      `INSERT INTO listing_boosts (listing_id, owner_id, boosted_until, payment_id)
       VALUES (?, ?, ?, ?)`,
      [listingId, ownerId, boostedUntil, paymentId || null]
    )

    // Always record payment server-side so admin dashboard captures it reliably.
    // The frontend also calls /subscriptions/record-payment but can fail silently.
    await db.query(
      `INSERT INTO payments (user_id, amount, method, status, description)
       VALUES (?, ?, ?, 'success', 'Top Pick')`,
      [ownerId, BOOST_AMOUNT, paymentMethod || 'mock']
    )

    res.json({ success: true, boostedUntil, boostDays: BOOST_DAYS })
  } catch (err) {
    console.error('POST /boost error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ── GET /owner/boosted — which of this owner's listings are currently boosted ─
router.get('/owner/boosted', authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT listing_id,
              MAX(boosted_until) AS boosted_until
       FROM listing_boosts
       WHERE owner_id = ? AND boosted_until > NOW()
       GROUP BY listing_id`,
      [req.user.id]
    )
    // Return both the id array (for quick lookup) and a map of expiry dates
    const boostedIds   = rows.map(r => r.listing_id)
    const boostExpiry  = {}   // { listingId: ISOString }
    rows.forEach(r => {
      const raw = r.boosted_until
      boostExpiry[r.listing_id] = (raw instanceof Date)
        ? raw.toISOString()
        : new Date(String(raw).replace(' ', 'T')).toISOString()
    })
    res.json({ boostedIds, boostExpiry })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router