// routes/profile.js
const express       = require('express')
const router        = express.Router()
const db            = require('../db')
const authMiddleware = require('../middleware/auth')
const multer        = require('multer')
const fs            = require('fs')
const path          = require('path')

// ── ID document upload setup ───────────────────────────────────────────────────
const ID_UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'id_docs')
if (!fs.existsSync(ID_UPLOAD_DIR)) fs.mkdirSync(ID_UPLOAD_DIR, { recursive: true })

const idStorage = multer.diskStorage({
  destination: ID_UPLOAD_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    cb(null, `id_${req.user.id}_${Date.now()}${ext}`)
  }
})
const idUpload = multer({
  storage: idStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.pdf']
    const ext = path.extname(file.originalname).toLowerCase()
    if (allowed.includes(ext)) cb(null, true)
    else cb(new Error('Only JPG, PNG or PDF allowed'))
  }
})

// ── GET /profile  — current user full profile ──────────────────────────────────
router.get('/', authMiddleware, async (req, res) => {
  try {
    const [[user]] = await db.query(
      'SELECT id, name, email, role, phone, photo FROM users WHERE id = ?',
      [req.user.id]
    )
    if (!user) return res.status(404).json({ error: 'User not found' })

    if (user.role === 'seeker') {
      const [[profile]] = await db.query(
        'SELECT * FROM seeker_profiles WHERE user_id = ?', [req.user.id]
      )
      return res.json({ ...user, profile: profile || {} })
    } else {
      const [[profile]] = await db.query(
        'SELECT * FROM owner_profiles WHERE user_id = ?', [req.user.id]
      )
      return res.json({ ...user, profile: profile || {} })
    }
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── GET /profile/owner/:userId  — fetch any owner's profile (for listings/chat) ─
router.get('/owner/:userId', authMiddleware, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId)
    if (!userId) return res.status(400).json({ error: 'Invalid user ID' })

    const [[user]] = await db.query(
      'SELECT id, name, email, phone FROM users WHERE id = ? AND role = "owner"',
      [userId]
    )
    if (!user) return res.status(404).json({ error: 'Owner not found' })

    const [[profile]] = await db.query(
      'SELECT * FROM owner_profiles WHERE user_id = ?', [userId]
    )

    res.json({
      id:          user.id,
      name:        user.name,
      email:       user.email,
      phone:       user.phone || profile?.phone || null,
      profile:     profile || {},
      city:        profile?.city        || null,
      occupation:  profile?.occupation  || null,
      bio:         profile?.bio         || null,
      age:         profile?.age         || null,
      is_verified: profile?.is_verified ? true : false,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── GET /profile/seeker/:userId  — fetch any seeker's public profile (for chat) ─
router.get('/seeker/:userId', authMiddleware, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId)
    if (!userId) return res.status(400).json({ error: 'Invalid user ID' })

    const [[user]] = await db.query(
      'SELECT id, name, email FROM users WHERE id = ? AND role = "seeker"',
      [userId]
    )
    if (!user) return res.status(404).json({ error: 'Seeker not found' })

    const [[profile]] = await db.query(
      'SELECT * FROM seeker_profiles WHERE user_id = ?', [userId]
    )

    res.json({
      id:                 user.id,
      name:               user.name,
      email:              user.email,
      occupation:         profile?.occupation         || null,
      budget_min:         profile?.budget_min         || null,
      budget_max:         profile?.budget_max         || null,
      preferred_location: profile?.preferred_location || null,
      bio:                profile?.bio                || null,
      food_preference:    profile?.food_preference    || null,
      smoking:            profile?.smoking            || null,
      drinking:           profile?.drinking           || null,
      sleep_schedule:     profile?.sleep_schedule     || null,
      cleanliness_level:  profile?.cleanliness_level  || null,
      personality_type:   profile?.personality_type   || null,
      noise_tolerance:    profile?.noise_tolerance    || null,
      guest_preference:   profile?.guest_preference   || null,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /profile/owner  — UPSERT full owner profile ──────────────────────────
// Handles both JSON (Step 1) and multipart (Step 2 with ID doc)
router.post('/owner', authMiddleware, idUpload.single('id_document'), async (req, res) => {
  try {
    const { name, age, occupation, phone, city, bio, id_type, id_number } = req.body

    let id_document_url = null
    let is_verified = 0

    if (req.file) {
      id_document_url = `id_docs/${req.file.filename}`
      is_verified = 1
    }

    await db.query(
      `INSERT INTO owner_profiles
         (user_id, age, occupation, phone, city, bio,
          id_type, id_number, id_document_url, is_verified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         age             = COALESCE(VALUES(age),             age),
         occupation      = COALESCE(VALUES(occupation),      occupation),
         phone           = COALESCE(VALUES(phone),           phone),
         city            = COALESCE(VALUES(city),            city),
         bio             = COALESCE(VALUES(bio),             bio),
         id_type         = COALESCE(VALUES(id_type),         id_type),
         id_number       = COALESCE(VALUES(id_number),       id_number),
         id_document_url = COALESCE(VALUES(id_document_url), id_document_url),
         is_verified     = is_verified OR VALUES(is_verified),
         updated_at      = CURRENT_TIMESTAMP`,
      [
        req.user.id,
        age ? parseInt(age) : null,
        occupation || null,
        phone      || null,
        city       || null,
        bio        || null,
        id_type    || null,
        id_number  || null,
        id_document_url,
        is_verified,
      ]
    )

    if (phone) {
      await db.query('UPDATE users SET phone = ? WHERE id = ?', [phone, req.user.id])
    }
    if (name && name.trim()) {
      await db.query('UPDATE users SET name = ? WHERE id = ?', [name.trim(), req.user.id])
    }

    const [[saved]] = await db.query(
      'SELECT * FROM owner_profiles WHERE user_id = ?', [req.user.id]
    )

    const [[savedUser]] = await db.query('SELECT name FROM users WHERE id = ?', [req.user.id])
    res.json({
      message:     'Profile saved!',
      is_verified: saved.is_verified ? true : false,
      profile:     saved,
      name:        savedUser.name,
    })
  } catch (err) {
    console.error('Owner profile save error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ── POST /profile/seeker  — UPSERT full seeker profile ────────────────────────
router.post('/seeker', authMiddleware, async (req, res) => {
  try {
    const {
      name,
      age, phone, whatsapp, contact_email,
      occupation, budget_min, budget_max,
      preferred_location, latitude, longitude,
      personality_type, sleep_schedule,
      food_preference, cleanliness_level,
      smoking, drinking, pets,
      guest_preference, noise_tolerance, gender_preference,
      about, move_in_date,
    } = req.body

    const lat = latitude  ? parseFloat(latitude)  : null
    const lng = longitude ? parseFloat(longitude) : null

    await db.query(
      `INSERT INTO seeker_profiles
         (user_id, age, phone, whatsapp, contact_email,
          occupation, budget_min, budget_max,
          preferred_location, latitude, longitude,
          personality_type, sleep_schedule,
          food_preference, cleanliness_level,
          smoking, drinking, pets,
          guest_preference, noise_tolerance, gender_preference,
          about, move_in_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         age=VALUES(age), phone=VALUES(phone),
         whatsapp=VALUES(whatsapp), contact_email=VALUES(contact_email),
         occupation=VALUES(occupation), budget_min=VALUES(budget_min),
         budget_max=VALUES(budget_max), preferred_location=VALUES(preferred_location),
         latitude=VALUES(latitude), longitude=VALUES(longitude),
         personality_type=VALUES(personality_type), sleep_schedule=VALUES(sleep_schedule),
         food_preference=VALUES(food_preference), cleanliness_level=VALUES(cleanliness_level),
         smoking=VALUES(smoking), drinking=VALUES(drinking), pets=VALUES(pets),
         guest_preference=VALUES(guest_preference), noise_tolerance=VALUES(noise_tolerance),
         gender_preference=VALUES(gender_preference), about=VALUES(about),
         move_in_date=VALUES(move_in_date)`,
      [
        req.user.id,
        age || null, phone || null, whatsapp || null, contact_email || null,
        occupation || null, budget_min || null, budget_max || null,
        preferred_location || null, lat, lng,
        personality_type  || 'ambivert',
        sleep_schedule    || 'flexible',
        food_preference   || 'any',
        cleanliness_level || 'moderate',
        smoking  || 'no', drinking || 'no', pets || 'no',
        guest_preference  || 'occasionally',
        noise_tolerance   || 'moderate',
        gender_preference || 'any',
        about || null, move_in_date || null,
      ]
    )
    if (name && name.trim()) {
      await db.query('UPDATE users SET name = ? WHERE id = ?', [name.trim(), req.user.id])
    }
    res.json({ message: 'Profile saved!', latitude: lat, longitude: lng })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /profile/update-coords ───────────────────────────────────────────────
router.post('/update-coords', authMiddleware, async (req, res) => {
  try {
    const { user_id, latitude, longitude, preferred_location } = req.body
    if (latitude == null || longitude == null)
      return res.status(400).json({ error: 'latitude and longitude required' })

    const targetId = parseInt(user_id) || req.user.id
    const vals = [parseFloat(latitude), parseFloat(longitude)]
    let sql = 'UPDATE seeker_profiles SET latitude=?, longitude=?'
    if (preferred_location) { sql += ', preferred_location=?'; vals.push(preferred_location) }
    sql += ' WHERE user_id=?'
    vals.push(targetId)

    await db.query(sql, vals)
    res.json({ ok: true, user_id: targetId, latitude, longitude })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router