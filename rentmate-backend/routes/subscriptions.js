// routes/subscriptions.js
// ─────────────────────────────────────────────────────────────────────────────
// Handles:
//   GET  /api/subscriptions/status        → current plan info for logged-in owner
//   POST /api/subscriptions/mock-activate → activate premium instantly (mock / dev)
//   POST /api/subscriptions/create-order  → create Razorpay order (real payment)
//   POST /api/subscriptions/verify        → verify Razorpay signature & activate
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express')
const router  = express.Router()
const db      = require('../db')
const auth    = require('../middleware/auth')

const FREE_LISTING_LIMIT = 3
const PREMIUM_AMOUNT_INR = 129          // ₹129
const PREMIUM_DAYS       = 28

// ── Helper: check if user currently has an active premium subscription ────────
async function getActivePremium(userId) {
  const [rows] = await db.query(
    `SELECT * FROM subscriptions
     WHERE user_id = ? AND plan = 'premium' AND status = 'active'
       AND end_date > NOW()
     ORDER BY end_date DESC LIMIT 1`,
    [userId]
  )
  return rows[0] || null
}

// ── Helper: count current listings for a user ─────────────────────────────────
async function getListingCount(userId) {
  const [[{ cnt }]] = await db.query(
    'SELECT COUNT(*) AS cnt FROM listings WHERE owner_id = ?',
    [userId]
  )
  return cnt
}

// ────────────────────────────────────────────────────────────────────────────
// GET /api/subscriptions/status
// Returns: { isPremium, plan, endDate, remainingListings, listingCount }
// ────────────────────────────────────────────────────────────────────────────
router.get('/status', auth, async (req, res) => {
  try {
    const premium      = await getActivePremium(req.user.id)
    const listingCount = await getListingCount(req.user.id)
    const isPremium    = !!premium

    // Build a clean ISO endDate string regardless of dateStrings pool setting
    let endDate = null
    if (premium && premium.end_date) {
      // end_date may be a JS Date (dateStrings:false) or a string (dateStrings:true)
      const raw = premium.end_date
      endDate = (raw instanceof Date)
        ? raw.toISOString()
        : new Date(String(raw).replace(' ', 'T')).toISOString()
    }

    res.json({
      isPremium,
      plan:              isPremium ? 'premium' : 'free',
      endDate,                         // always ISO string or null
      listingCount,
      remainingListings: isPremium ? null : Math.max(0, FREE_LISTING_LIMIT - listingCount),
      freeLimitReached:  !isPremium && listingCount >= FREE_LISTING_LIMIT,
      FREE_LISTING_LIMIT,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ────────────────────────────────────────────────────────────────────────────
// POST /api/subscriptions/mock-activate
// For development / testing — instantly activates premium for 28 days.
// Remove or guard with NODE_ENV check in production.
// ────────────────────────────────────────────────────────────────────────────
router.post('/mock-activate', auth, async (req, res) => {
  try {
    // Expire any existing premium for this user
    await db.query(
      `UPDATE subscriptions SET status = 'expired'
       WHERE user_id = ? AND plan = 'premium'`,
      [req.user.id]
    )

    const startDate = new Date()
    const endDate   = new Date(startDate.getTime() + PREMIUM_DAYS * 24 * 60 * 60 * 1000)

    const [sub] = await db.query(
      `INSERT INTO subscriptions (user_id, plan, start_date, end_date, status)
       VALUES (?, 'premium', ?, ?, 'active')`,
      [req.user.id, startDate, endDate]
    )

    // Record a mock payment
    await db.query(
      `INSERT INTO payments (user_id, subscription_id, amount, method, status)
       VALUES (?, ?, ?, 'mock', 'success')`,
      [req.user.id, sub.insertId, PREMIUM_AMOUNT_INR * 100]
    )

    res.json({
      success: true,
      message: `Premium activated for ${PREMIUM_DAYS} days`,
      endDate,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ────────────────────────────────────────────────────────────────────────────
// POST /api/subscriptions/create-order
// Real Razorpay integration — creates an order server-side.
// Frontend receives the order_id and opens the Razorpay checkout widget.
//
// Setup:
//   npm install razorpay
//   Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to .env
// ────────────────────────────────────────────────────────────────────────────
router.post('/create-order', auth, async (req, res) => {
  try {
    // Lazily require so the app doesn't crash if razorpay isn't installed yet
    let Razorpay
    try {
      Razorpay = require('razorpay')
    } catch {
      return res.status(501).json({
        error: 'Razorpay not installed. Run: npm install razorpay',
      })
    }

    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return res.status(501).json({
        error: 'RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET not set in .env',
      })
    }

    const razorpay = new Razorpay({
      key_id:     process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    })

    const order = await razorpay.orders.create({
      amount:   PREMIUM_AMOUNT_INR * 100,   // in paise
      currency: 'INR',
      receipt:  `rentmate_${req.user.id}_${Date.now()}`,
      notes: {
        userId: req.user.id,
        feature: 'premium_listings',
      },
    })

    // Pre-create a pending payment row so we can verify later
    const [pay] = await db.query(
      `INSERT INTO payments (user_id, amount, method, status, razorpay_order_id)
       VALUES (?, ?, 'razorpay', 'pending', ?)`,
      [req.user.id, PREMIUM_AMOUNT_INR * 100, order.id]
    )

    res.json({
      orderId:    order.id,
      amount:     order.amount,
      currency:   order.currency,
      keyId:      process.env.RAZORPAY_KEY_ID,
      paymentRowId: pay.insertId,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ────────────────────────────────────────────────────────────────────────────
// POST /api/subscriptions/verify
// Called after successful Razorpay checkout.
// Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
// ────────────────────────────────────────────────────────────────────────────
router.post('/verify', auth, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body

    // Verify HMAC signature
    const crypto = require('crypto')
    const expectedSig = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex')

    if (expectedSig !== razorpay_signature) {
      return res.status(400).json({ error: 'Payment verification failed — invalid signature' })
    }

    // Activate subscription
    await db.query(
      `UPDATE subscriptions SET status = 'expired'
       WHERE user_id = ? AND plan = 'premium'`,
      [req.user.id]
    )

    const startDate = new Date()
    const endDate   = new Date(startDate.getTime() + PREMIUM_DAYS * 24 * 60 * 60 * 1000)

    const [sub] = await db.query(
      `INSERT INTO subscriptions (user_id, plan, start_date, end_date, status)
       VALUES (?, 'premium', ?, ?, 'active')`,
      [req.user.id, startDate, endDate]
    )

    // Update payment record
    await db.query(
      `UPDATE payments
       SET status = 'success', subscription_id = ?,
           razorpay_payment_id = ?, razorpay_signature = ?
       WHERE razorpay_order_id = ? AND user_id = ?`,
      [sub.insertId, razorpay_payment_id, razorpay_signature, razorpay_order_id, req.user.id]
    )

    res.json({
      success: true,
      message: `Premium activated for ${PREMIUM_DAYS} days`,
      endDate,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ────────────────────────────────────────────────────────────────────────────
// POST /api/subscriptions/record-payment
// Generic endpoint: records any mock payment (agreement, boost, contact unlock)
// into the payments table so the admin dashboard captures it.
// Body: { feature, amount, method }
// ────────────────────────────────────────────────────────────────────────────
router.post('/record-payment', auth, async (req, res) => {
  try {
    const { feature, amount, method = 'mock' } = req.body
    if (!feature || !amount) return res.status(400).json({ error: 'feature and amount are required' })

    // amount from frontend is in rupees — store in paise
    const amountPaise = Math.round(Number(amount) * 100)

    await db.query(
      `INSERT INTO payments (user_id, amount, method, status, description)
       VALUES (?, ?, ?, 'success', ?)`,
      [req.user.id, amountPaise, method, feature]
    )

    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router