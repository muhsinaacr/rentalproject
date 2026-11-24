// routes/matcher.js
const express = require('express')
const router  = express.Router()
const db      = require('../db')
const authMiddleware = require('../middleware/auth')
const { calculateRoommateCompatibility } = require('../services/roommateCompatibility')
const { haversineKm, formatDistance } = require('../utils/geoUtils')

function buildPublicProfile(user, sp) {
  return {
    id:                 user.id,
    name:               user.name,
    occupation:         sp.occupation        || '',
    about:              sp.about             || '',
    budget_min:         sp.budget_min,
    budget_max:         sp.budget_max,
    preferred_location: sp.preferred_location || '',
    // New aligned column names
    food_preference:    sp.food_preference   || sp.food_pref  || 'any',
    smoking:            sp.smoking           || 'no',
    drinking:           sp.drinking          || 'no',
    pets:               sp.pets              || 'no',
    gender_preference:  sp.gender_preference || sp.gender_pref || 'any',
    move_in_date:       sp.move_in_date,
    personality_type:   sp.personality_type  || 'ambivert',
    sleep_schedule:     sp.sleep_schedule    || sp.sleep_time  || 'flexible',
    cleanliness_level:  sp.cleanliness_level || 'moderate',
    noise_tolerance:    sp.noise_tolerance   || 'moderate',
    guest_preference:   sp.guest_preference  || 'sometimes',
    latitude:           sp.latitude  ? parseFloat(sp.latitude)  : null,
    longitude:          sp.longitude ? parseFloat(sp.longitude) : null,
    photo:              user.photo || null,
  }
}

// GET /api/matcher/profiles
router.get('/profiles', authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT u.id AS user_id, u.name, u.photo, sp.*
       FROM users u
       JOIN seeker_profiles sp ON sp.user_id = u.id
       WHERE u.role = 'seeker' AND u.id != ?
       ORDER BY u.created_at DESC`,
      [req.user.id]
    )
    const profiles = rows.map(r => buildPublicProfile({ id: r.user_id, name: r.name, photo: r.photo }, r))
    res.json({ profiles, total: profiles.length })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/matcher/compatibility
router.post('/compatibility', authMiddleware, async (req, res) => {
  try {
    const { currentUserId, targetUserId } = req.body
    if (!currentUserId || !targetUserId)
      return res.status(400).json({ error: 'currentUserId and targetUserId are required' })
    if (parseInt(currentUserId) !== req.user.id)
      return res.status(403).json({ error: 'You can only check your own compatibility' })

    await db.query(
      `INSERT IGNORE INTO seeker_profiles (user_id, food_preference, smoking, drinking, personality_type, sleep_schedule, cleanliness_level, noise_tolerance, guest_preference)
       VALUES (?, 'any', 'no', 'no', 'ambivert', 'flexible', 'moderate', 'moderate', 'sometimes')`,
      [currentUserId]
    )
    await db.query(
      `INSERT IGNORE INTO seeker_profiles (user_id, food_preference, smoking, drinking, personality_type, sleep_schedule, cleanliness_level, noise_tolerance, guest_preference)
       VALUES (?, 'any', 'no', 'no', 'ambivert', 'flexible', 'moderate', 'moderate', 'sometimes')`,
      [targetUserId]
    )

    const [rowsA] = await db.query(
      `SELECT u.id, u.name, sp.* FROM users u JOIN seeker_profiles sp ON sp.user_id = u.id WHERE u.id = ?`,
      [currentUserId]
    )
    const [rowsB] = await db.query(
      `SELECT u.id, u.name, u.photo, sp.* FROM users u JOIN seeker_profiles sp ON sp.user_id = u.id WHERE u.id = ?`,
      [targetUserId]
    )

    if (!rowsA.length) return res.status(404).json({ error: 'Could not load your profile. Please try again.' })
    if (!rowsB.length) return res.status(404).json({ error: 'Target profile not found' })

    const result = calculateRoommateCompatibility(rowsA[0], rowsB[0])

    // ── Persist match score for dashboard counting ──────────────────────────
    // Canonical order: smaller user_id goes in user_a_id to prevent duplicates.
    const [uidA, uidB] = [parseInt(currentUserId), parseInt(targetUserId)].sort((a, b) => a - b)
    try {
      await db.query(
        `INSERT INTO seeker_matches (user_a_id, user_b_id, score)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE score = VALUES(score), created_at = NOW()`,
        [uidA, uidB, result.score]
      )
    } catch (e) {
      // seeker_matches table may not exist yet — silently skip
      if (e.code !== 'ER_NO_SUCH_TABLE') console.warn('[matcher] persist warning:', e.message)
    }

    res.json({
      score:       result.score,
      strengths:   result.strengths,
      risks:       result.risks,
      suggestions: result.suggestions,
      breakdown:   result.breakdown,
      targetUser: {
        id:         rowsB[0].id,
        name:       rowsB[0].name,
        photo:      rowsB[0].photo || null,
        occupation: rowsB[0].occupation || '',
      },
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/matcher/search  — body: { lat, lng, locationLabel }
router.post('/search', authMiddleware, async (req, res) => {
  try {
    const { lat, lng, locationLabel } = req.body
    if (lat == null || lng == null)
      return res.status(400).json({ error: 'lat and lng are required' })

    const originLat = parseFloat(lat)
    const originLng = parseFloat(lng)
    if (isNaN(originLat) || isNaN(originLng))
      return res.status(400).json({ error: 'lat and lng must be valid numbers' })

    const [rows] = await db.query(
      `SELECT u.id AS user_id, u.name, u.photo, sp.*
       FROM users u
       JOIN seeker_profiles sp ON sp.user_id = u.id
       WHERE u.role = 'seeker' AND u.id != ?`,
      [req.user.id]
    )

    const profiles = rows.map(r => {
      const p = buildPublicProfile({ id: r.user_id, name: r.name, photo: r.photo }, r)
      if (p.latitude != null && p.longitude != null) {
        const km = haversineKm(originLat, originLng, p.latitude, p.longitude)
        p.distance_km    = km
        p.distance_label = formatDistance(km)
      } else {
        p.distance_km    = null
        p.distance_label = null
      }
      return p
    })

    profiles.sort((a, b) => {
      if (a.distance_km == null && b.distance_km == null) return 0
      if (a.distance_km == null) return 1
      if (b.distance_km == null) return -1
      return a.distance_km - b.distance_km
    })

    res.json({ profiles, total: profiles.length, searchLocation: locationLabel || null, originCoords: { lat: originLat, lng: originLng } })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/matcher/search?lat=x&lng=y  (backward compat)
router.get('/search', authMiddleware, async (req, res) => {
  try {
    const { lat, lng, location } = req.query

    if (lat && lng) {
      const originLat = parseFloat(lat)
      const originLng = parseFloat(lng)
      const [rows] = await db.query(
        `SELECT u.id AS user_id, u.name, u.photo, sp.*
         FROM users u
         JOIN seeker_profiles sp ON sp.user_id = u.id
         WHERE u.role = 'seeker' AND u.id != ?`,
        [req.user.id]
      )
      const profiles = rows.map(r => {
        const p = buildPublicProfile({ id: r.user_id, name: r.name, photo: r.photo }, r)
        if (p.latitude != null && p.longitude != null) {
          const km = haversineKm(originLat, originLng, p.latitude, p.longitude)
          p.distance_km    = km
          p.distance_label = formatDistance(km)
        } else {
          p.distance_km = null
          p.distance_label = null
        }
        return p
      })
      profiles.sort((a, b) => {
        if (a.distance_km == null && b.distance_km == null) return 0
        if (a.distance_km == null) return 1
        if (b.distance_km == null) return -1
        return a.distance_km - b.distance_km
      })
      return res.json({ profiles, total: profiles.length, searchLocation: location || null, originCoords: { lat: originLat, lng: originLng } })
    }

    // No coords: return all profiles
    const [rows] = await db.query(
      `SELECT u.id AS user_id, u.name, u.photo, sp.*
       FROM users u
       JOIN seeker_profiles sp ON sp.user_id = u.id
       WHERE u.role = 'seeker' AND u.id != ?
       ORDER BY u.created_at DESC`,
      [req.user.id]
    )
    const profiles = rows.map(r => buildPublicProfile({ id: r.user_id, name: r.name, photo: r.photo }, r))
    res.json({ profiles, total: profiles.length, searchLocation: null, originCoords: null })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/matcher/chat/start
router.post('/chat/start', authMiddleware, async (req, res) => {
  try {
    const { targetUserId } = req.body
    if (!targetUserId) return res.status(400).json({ error: 'targetUserId is required' })
    const myId    = req.user.id
    const otherId = parseInt(targetUserId)
    if (myId === otherId) return res.status(400).json({ error: 'Cannot chat with yourself' })

    const [users] = await db.query('SELECT id, name, role, photo FROM users WHERE id = ?', [otherId])
    if (!users.length) return res.status(404).json({ error: 'User not found' })

    const [messages] = await db.query(
      `SELECT m.id, m.sender_id, m.receiver_id, m.content, m.created_at, u.name as sender_name
       FROM messages m JOIN users u ON m.sender_id = u.id
       WHERE (m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?)
       ORDER BY m.created_at ASC`,
      [myId, otherId, otherId, myId]
    )
    res.json({ targetUser: users[0], messages, conversationExists: messages.length > 0 })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router