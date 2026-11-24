// Fraud Detection Service
// Checks listings for suspicious patterns and flags them

function analyzeListing(listing) {
  const flags = []
  const warnings = []
  let riskScore = 0

  const title = (listing.title || '').toLowerCase()
  const description = (listing.description || '').toLowerCase()
  const rent = Number(listing.rent || listing.price || 0)
  const location = (listing.location || '').toLowerCase()

  // ── Price too low ──────────────────────────────────────
  if (rent > 0 && rent < 1500) {
    flags.push('🚨 Rent is suspiciously low (under ₹1500)')
    riskScore += 35
  } else if (rent > 0 && rent < 2500) {
    warnings.push('⚠️ Rent is quite low — verify carefully')
    riskScore += 15
  }

  // ── Description too short ──────────────────────────────
  if (description.length < 20) {
    flags.push('🚨 Description is too short or missing')
    riskScore += 20
  }

  // ── Suspicious words ───────────────────────────────────
  const suspiciousWords = [
    'whatsapp only', 'call only', 'no visits',
    'send advance', 'pay first', 'western union',
    'money transfer', 'abroad', 'working abroad',
    'urgent sale', 'god bless', 'trust me'
  ]
  const foundSuspicious = suspiciousWords.filter(w =>
    title.includes(w) || description.includes(w)
  )
  if (foundSuspicious.length > 0) {
    flags.push(`🚨 Suspicious phrases found: "${foundSuspicious.join('", "')}"`)
    riskScore += foundSuspicious.length * 25
  }

  // ── No photos ──────────────────────────────────────────
  let photos = []
  try { photos = JSON.parse(listing.photos || '[]') } catch { photos = [] }
  if (photos.length === 0) {
    warnings.push('⚠️ No photos uploaded — seekers trust listings with photos more')
    riskScore += 10
  }

  // ── No location ────────────────────────────────────────
  if (!location || location.length < 3) {
    flags.push('🚨 Location is missing or too vague')
    riskScore += 20
  }

  // ── Determine risk level ───────────────────────────────
  let riskLevel = 'low'
  let riskColor = '#10b981'
  let riskLabel = '✅ Looks Safe'

  if (riskScore >= 50) {
    riskLevel = 'high'
    riskColor = '#ef4444'
    riskLabel = '🚨 High Risk — Likely Fraud'
  } else if (riskScore >= 25) {
    riskLevel = 'medium'
    riskColor = '#f59e0b'
    riskLabel = '⚠️ Medium Risk — Verify Carefully'
  }

  return {
    riskLevel,
    riskScore: Math.min(riskScore, 100),
    riskColor,
    riskLabel,
    flags,
    warnings,
    isFlagged: riskLevel === 'high'
  }
}

module.exports = { analyzeListing }