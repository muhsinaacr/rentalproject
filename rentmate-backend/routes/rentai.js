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
  const recommendation = getPriceRecommendation(location, roomType, amenities, furnished)
  const evaluation = userPrice ? evaluateUserPrice(userPrice, recommendation.min, recommendation.max) : null
  res.json({ recommendation, evaluation })
})

// ── AI-powered Rent Analysis (Anthropic Claude) ───────────────────────────────
// POST /api/ai/rent-analysis
// Body: { location, rent, type, furnished, amenities }
// Auth: required (owner only)
router.post('/rent-analysis', authMiddleware, async (req, res) => {
  try {
    const { location, rent, type, furnished, amenities } = req.body

    if (!location || !rent) {
      return res.status(400).json({ error: 'Location and rent are required' })
    }

    // ── Rule-based market data (always computed as fallback + context) ────────
    const ruleResult = getPriceRecommendation(location, type || 'Single', amenities || '', furnished || 'Fully Furnished')
    const evaluation = evaluateUserPrice(Number(rent), ruleResult.min, ruleResult.max)

    // ── Fetch comparable listings from DB for real market context ─────────────
    let comparables = []
    try {
      const locKeyword = location.split(',')[0].trim()
      const [rows] = await db.query(
        `SELECT rent, room_type, furnished, amenities, title
         FROM listings
         WHERE status = 'active'
           AND (location LIKE ? OR title LIKE ?)
           AND room_type = ?
         ORDER BY created_at DESC
         LIMIT 10`,
        [`%${locKeyword}%`, `%${locKeyword}%`, type || 'Single']
      )
      comparables = rows
    } catch (dbErr) {
      console.warn('[rent-analysis] DB comparable fetch skipped:', dbErr.message)
    }

    const comparableSummary = comparables.length > 0
      ? comparables.map(c => `₹${c.rent}/mo (${c.furnished || 'unknown furnishing'})`).join(', ')
      : 'No live listings found in DB for this area'

    // ── Call Anthropic Claude API ─────────────────────────────────────────────
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
    if (!ANTHROPIC_API_KEY) {
      return res.json(buildRuleBasedResponse(ruleResult, evaluation, Number(rent), location, type, furnished, amenities))
    }

    const prompt = `You are a rental market expert for Kerala, India. Analyze this owner's rental listing and provide a detailed rent analysis.

LISTING DETAILS:
- Location: ${location}
- Room Type: ${type || 'Single'}
- Current Rent: ₹${rent}/month
- Furnishing: ${furnished || 'Fully Furnished'}
- Amenities: ${amenities || 'None listed'}

RULE-BASED MARKET ESTIMATE:
- Market range for this area: ₹${ruleResult.min.toLocaleString()} – ₹${ruleResult.max.toLocaleString()}/month
- Optimal price: ₹${Math.round((ruleResult.min + ruleResult.max) / 2 / 100) * 100}/month
- Rule evaluation: ${evaluation.status} — ${evaluation.message}
- Location multiplier: ${ruleResult.breakdown.locationMultiplier}x
- ${ruleResult.advice}

LIVE DB COMPARABLES (same area, same type):
${comparableSummary}

Provide a JSON response (no markdown, no backticks) with this exact structure:
{
  "verdict": "One clear sentence about whether this price is good or bad",
  "status": "too_low | low | optimal | high | too_high",
  "marketMin": <number>,
  "marketMax": <number>,
  "optimalPrice": <number>,
  "priceGapAmount": <positive number, how much to raise or lower>,
  "priceGapDirection": "raise | lower | none",
  "insights": [
    "Insight 1 about location demand",
    "Insight 2 about furnishing/amenities impact",
    "Insight 3 about occupancy expectation",
    "Insight 4 about how to improve the listing"
  ],
  "tips": [
    "Actionable tip 1",
    "Actionable tip 2"
  ],
  "demandLevel": "High | Moderate | Low",
  "expectedOccupancyDays": <number of days to fill, e.g. 7>,
  "confidenceNote": "Brief note on data confidence"
}`

    const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!aiResponse.ok) {
      const errText = await aiResponse.text()
      console.error('[rent-analysis] Anthropic API error:', errText)
      return res.json(buildRuleBasedResponse(ruleResult, evaluation, Number(rent), location, type, furnished, amenities))
    }

    const aiData = await aiResponse.json()
    const rawText = aiData.content?.map(b => b.text || '').join('').trim()

    let parsed
    try {
      const clean = rawText.replace(/```json|```/g, '').trim()
      parsed = JSON.parse(clean)
    } catch (parseErr) {
      console.error('[rent-analysis] JSON parse error:', parseErr.message, '\nRaw:', rawText)
      return res.json(buildRuleBasedResponse(ruleResult, evaluation, Number(rent), location, type, furnished, amenities))
    }

    res.json({
      source: 'ai',
      userRent: Number(rent),
      location,
      type: type || 'Single',
      furnished: furnished || 'Fully Furnished',
      amenities: amenities || '',
      ruleMarketMin: ruleResult.min,
      ruleMarketMax: ruleResult.max,
      comparablesCount: comparables.length,
      ...parsed,
    })
  } catch (err) {
    console.error('[rent-analysis] Unexpected error:', err.message)
    res.status(500).json({ error: 'Rent analysis failed. Please try again.' })
  }
})

// ── Helper: build rule-based response ────────────────────────────────────────
function buildRuleBasedResponse(ruleResult, evaluation, userRent, location, type, furnished, amenities) {
  const optimal = Math.round((ruleResult.min + ruleResult.max) / 2 / 100) * 100
  const statusMap = {
    good: 'optimal',
    low: userRent < ruleResult.min * 0.85 ? 'too_low' : 'low',
    high: userRent > ruleResult.max * 1.15 ? 'too_high' : 'high',
  }
  const status = statusMap[evaluation.status] || 'optimal'
  const gap = status === 'low' || status === 'too_low'
    ? ruleResult.min - userRent
    : userRent > ruleResult.max ? userRent - ruleResult.max : 0
  const direction = gap > 0 ? (status.includes('low') ? 'raise' : 'lower') : 'none'

  return {
    source: 'rule-based',
    userRent,
    location,
    type: type || 'Single',
    furnished: furnished || 'Fully Furnished',
    amenities: amenities || '',
    status,
    verdict: evaluation.message.replace(/^[✅⚠️]\s*/, ''),
    marketMin: ruleResult.min,
    marketMax: ruleResult.max,
    optimalPrice: optimal,
    ruleMarketMin: ruleResult.min,
    ruleMarketMax: ruleResult.max,
    priceGapAmount: Math.abs(gap),
    priceGapDirection: direction,
    demandLevel: status === 'optimal' ? 'High' : status === 'low' || status === 'high' ? 'Moderate' : 'Low',
    expectedOccupancyDays: status === 'optimal' ? 7 : status === 'too_high' ? 30 : 14,
    insights: [
      `Market range for ${type || 'Single'} (${furnished || 'Fully Furnished'}) here: ₹${ruleResult.min.toLocaleString()} – ₹${ruleResult.max.toLocaleString()}/month`,
      ruleResult.furnishingLabel || '',
      `Location multiplier is ${ruleResult.breakdown.locationMultiplier}x the base rate`,
      ruleResult.advice,
      `${ruleResult.breakdown.premiumAmenitiesFound} premium amenities detected — adding ₹${ruleResult.breakdown.amenityBonus.toLocaleString()} bonus`,
    ],
    tips: [
      status === 'too_high' ? `Consider reducing by ₹${Math.abs(gap).toLocaleString()} to enter market range` : 'Your pricing is well-positioned',
      'Add more amenity details to improve your listing visibility',
    ],
    confidenceNote: ruleResult.advice,
    comparablesCount: 0,
  }
}

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