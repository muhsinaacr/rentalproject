const express = require('express')
const router = express.Router()
const db = require('../db')
const authMiddleware = require('../middleware/auth')
const { getPriceRecommendation, evaluateUserPrice } = require('../services/priceRecommendation')
const { calculateMatchScore } = require('../services/aiMatcher')
const { analyzeListing } = require('../services/fraudDetection')
const { notifyAIMatch, notifyFraudAlert } = require('../services/notifications')

// ── Price recommendation ──────────────────────────────────────────────────────
router.get('/price-recommendation', async (req, res) => {
  const { location, roomType, amenities, userPrice } = req.query
  const recommendation = getPriceRecommendation(location, roomType, amenities)
  const evaluation = userPrice ? evaluateUserPrice(userPrice, recommendation.min, recommendation.max) : null
  res.json({ recommendation, evaluation })
})

// ── Match score for a seeker against one listing ──────────────────────────────
router.get('/match-score/:listingId', authMiddleware, async (req, res) => {
  try {
    const [profiles] = await db.query(
      'SELECT * FROM seeker_profiles WHERE user_id = ?', [req.user.id]
    )
    if (profiles.length === 0) {
      return res.json({ score: 0, label: 'Complete your profile for AI matching', reasons: [], mismatches: [] })
    }

    const [listings] = await db.query(
      'SELECT * FROM listings WHERE id = ?', [req.params.listingId]
    )
    if (listings.length === 0) return res.status(404).json({ error: 'Listing not found' })

    const result = calculateMatchScore(profiles[0], listings[0])
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Top AI matches for a seeker ───────────────────────────────────────────────
router.get('/matches', authMiddleware, async (req, res) => {
  try {
    const [profiles] = await db.query(
      'SELECT * FROM seeker_profiles WHERE user_id = ?', [req.user.id]
    )
    if (profiles.length === 0) {
      return res.json({ matches: [], message: 'Complete your profile to get AI matches' })
    }

    const [listings] = await db.query(
      'SELECT l.*, u.name as owner_name FROM listings l JOIN users u ON l.owner_id = u.id WHERE l.status = "active"'
    )

    const matches = listings
      .map(listing => ({
        ...listing,
        matchResult: calculateMatchScore(profiles[0], listing)
      }))
      .sort((a, b) => b.matchResult.score - a.matchResult.score)
      .slice(0, 10)

    // ── Fire 'AI Match' notification for the top match if score ≥ 70 ────
    const top = matches[0]
    if (top && top.matchResult?.score >= 70) {
      // Only notify once per listing (avoid spam on repeated page loads)
      const seekerId = req.user.id
      const [[existing]] = await db.query(
        `SELECT id FROM notifications
         WHERE user_id = ? AND type = 'match'
           AND JSON_EXTRACT(meta, '$.listing_id') = ?
           AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
         LIMIT 1`,
        [seekerId, top.id]
      ).catch(() => [[]])
      if (!existing) {
        await notifyAIMatch(seekerId, top.title, top.matchResult.score, top.id)
      }
    }

    res.json({ matches, profileUsed: profiles[0] })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Fraud check a listing ─────────────────────────────────────────────────────
router.get('/fraud-check/:listingId', async (req, res) => {
  try {
    const [listings] = await db.query('SELECT * FROM listings WHERE id = ?', [req.params.listingId])
    if (listings.length === 0) return res.status(404).json({ error: 'Not found' })
    const result = analyzeListing(listings[0])

    // ── Notify seekers who bookmarked this listing if it's flagged ────────
    if (result.flagged) {
      setImmediate(async () => {
        try {
          const [bookmarkers] = await db.query(
            'SELECT user_id FROM bookmarks WHERE listing_id = ?', [req.params.listingId]
          )
          for (const { user_id } of bookmarkers) {
            // Avoid duplicate fraud alerts for same (user, listing)
            const [[dup]] = await db.query(
              `SELECT id FROM notifications
               WHERE user_id = ? AND type = 'fraud'
                 AND JSON_EXTRACT(meta, '$.listing_id') = ?
               LIMIT 1`,
              [user_id, req.params.listingId]
            )
            if (!dup) {
              await notifyFraudAlert(user_id, Number(req.params.listingId), listings[0].title)
            }
          }
        } catch (e) { console.error('[notifications] fraud alert dispatch failed:', e.message) }
      })
    }

    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router