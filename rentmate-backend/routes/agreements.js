// routes/agreements.js
// Agreement Generator — Owner-only routes
//
// POST   /api/agreements            → save a new agreement (requires payment)
// GET    /api/agreements            → list all agreements for logged-in owner
// GET    /api/agreements/:id        → get a single agreement (owner-only)
// DELETE /api/agreements/:id        → soft-delete / remove an agreement

const express        = require('express')
const router         = express.Router()
const db             = require('../db')
const authMiddleware = require('../middleware/auth')

// ── Helper: verify the agreement belongs to the requesting owner ──────────────
async function ownerAgreement(agreementId, ownerId) {
  const [[row]] = await db.query(
    'SELECT * FROM rental_agreements WHERE id = ? AND owner_id = ?',
    [agreementId, ownerId]
  )
  return row || null
}

// ── POST /api/agreements ──────────────────────────────────────────────────────
// Save a new rental agreement after payment is confirmed.
// Body mirrors the frontend `form` state object.
router.post('/', authMiddleware, async (req, res) => {
  const owner_id = req.user.id

  const {
    ownerName, ownerPhone, ownerAddress,
    tenantName, tenantPhone, tenantAddress,
    propertyAddress, furnished, rentAmount, advanceAmount,
    maintenanceCharges, startDate, duration, noticePeriod,
    restrictions, additionalClauses,
    paymentRef          // passed from frontend after payment succeeds
  } = req.body

  // ── Basic validation ──────────────────────────────────────────────────────
  const required = { ownerName, ownerPhone, ownerAddress, tenantName, tenantPhone, tenantAddress, propertyAddress, rentAmount, startDate }
  const missing  = Object.entries(required).filter(([, v]) => !v).map(([k]) => k)
  if (missing.length) {
    return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` })
  }

  if (isNaN(Number(rentAmount)) || Number(rentAmount) <= 0) {
    return res.status(400).json({ error: 'rentAmount must be a positive number' })
  }

  // ── Insert ────────────────────────────────────────────────────────────────
  try {
    const [result] = await db.query(
      `INSERT INTO rental_agreements
         (owner_id,
          owner_name, owner_phone, owner_address,
          tenant_name, tenant_phone, tenant_address,
          property_address, furnished,
          rent_amount, advance_amount, maintenance_charges,
          start_date, duration, notice_period,
          restrictions, additional_clauses,
          is_paid, payment_ref)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        owner_id,
        ownerName, ownerPhone, ownerAddress,
        tenantName, tenantPhone, tenantAddress,
        propertyAddress, furnished || 'Fully Furnished',
        Number(rentAmount),
        Number(advanceAmount)        || 0,
        Number(maintenanceCharges)   || 0,
        startDate,
        duration       || '11 months',
        noticePeriod   || '1 month',
        restrictions        || null,
        additionalClauses   || null,
        paymentRef ? 1 : 0,
        paymentRef || null,
      ]
    )

    res.status(201).json({
      message: 'Agreement saved successfully',
      agreement_id: result.insertId
    })
  } catch (err) {
    console.error('[agreements] POST error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/agreements ───────────────────────────────────────────────────────
// Returns all agreements created by the logged-in owner, newest first.
router.get('/', authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT
         id, tenant_name, tenant_phone,
         property_address, rent_amount, advance_amount,
         start_date, duration, is_paid, created_at
       FROM rental_agreements
       WHERE owner_id = ?
       ORDER BY created_at DESC`,
      [req.user.id]
    )
    res.json({ agreements: rows })
  } catch (err) {
    console.error('[agreements] GET list error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/agreements/:id ───────────────────────────────────────────────────
// Returns the full details of a single agreement owned by the logged-in user.
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const agreement = await ownerAgreement(req.params.id, req.user.id)
    if (!agreement) return res.status(404).json({ error: 'Agreement not found' })
    res.json({ agreement })
  } catch (err) {
    console.error('[agreements] GET one error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ── DELETE /api/agreements/:id ────────────────────────────────────────────────
// Permanently removes an agreement record owned by the logged-in user.
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const agreement = await ownerAgreement(req.params.id, req.user.id)
    if (!agreement) return res.status(404).json({ error: 'Agreement not found' })

    await db.query('DELETE FROM rental_agreements WHERE id = ?', [req.params.id])
    res.json({ message: 'Agreement deleted' })
  } catch (err) {
    console.error('[agreements] DELETE error:', err)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router