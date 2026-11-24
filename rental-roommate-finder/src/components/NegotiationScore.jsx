// src/components/NegotiationScore.jsx
//
// Shows "How likely is this owner to negotiate?" on a listing detail page.
// Uses data already available in every listing object — no new API needed.
//
// USAGE (in ListingDetail.jsx, right above or below the contact/price section):
//
//   import NegotiationScore from '../components/NegotiationScore'
//   <NegotiationScore listing={listing} />
//
// The `listing` prop needs: rent, created_at, views, inquiries, is_boosted, furnished
// All of these are already returned by your /api/listings endpoint.

// ─── Score engine ─────────────────────────────────────────────────────────────
// Returns a score 0–100 and per-factor breakdown
function calcNegotiationScore(listing) {
  const factors = []
  let total = 0

  // 1. Listing age (max 35 pts)
  //    The older a listing sits unsold, the more desperate the owner is
  const createdAt  = listing.created_at ? new Date(listing.created_at) : null
  const daysOld    = createdAt ? Math.floor((Date.now() - createdAt.getTime()) / 86400000) : 0
  let ageScore = 0
  let ageLabel = ''
  if (daysOld >= 60)      { ageScore = 35; ageLabel = `Listed ${daysOld} days ago — likely eager to fill` }
  else if (daysOld >= 30) { ageScore = 25; ageLabel = `Listed ${daysOld} days ago — open to offers` }
  else if (daysOld >= 14) { ageScore = 15; ageLabel = `Listed ${daysOld} days ago — some room to negotiate` }
  else if (daysOld >= 7)  { ageScore =  8; ageLabel = `Listed ${daysOld} days ago — still fresh` }
  else                    { ageScore =  0; ageLabel = `Listed ${daysOld} days ago — very new, owner unlikely to budge` }
  total += ageScore
  factors.push({
    label:   'Listing Age',
    emoji:   '📅',
    score:   ageScore,
    max:     35,
    detail:  ageLabel,
  })

  // 2. Views vs Inquiries ratio (max 25 pts)
  //    High views + low inquiries = low demand = more negotiation power
  const views     = listing.views     || 0
  const inquiries = listing.inquiries || 0
  let demandScore = 0
  let demandLabel = ''
  if (views === 0) {
    demandScore = 10
    demandLabel = 'No view data yet'
  } else {
    const convRate = inquiries / views  // 0 to 1
    if (convRate < 0.05)       { demandScore = 25; demandLabel = `Only ${inquiries} inquiries from ${views} views — low demand` }
    else if (convRate < 0.15)  { demandScore = 15; demandLabel = `${inquiries} inquiries from ${views} views — moderate interest` }
    else if (convRate < 0.30)  { demandScore =  8; demandLabel = `${inquiries} inquiries from ${views} views — good demand` }
    else                       { demandScore =  0; demandLabel = `${inquiries} inquiries from ${views} views — high demand, hard to negotiate` }
  }
  total += demandScore
  factors.push({
    label:   'Demand Level',
    emoji:   '👁️',
    score:   demandScore,
    max:     25,
    detail:  demandLabel,
  })

  // 3. Furnished status (max 20 pts)
  //    Unfurnished = owner has less investment = more flexible on price
  const furnished = (listing.furnished || '').toLowerCase()
  let furnishScore = 0
  let furnishLabel = ''
  if (furnished.includes('unfurnish') || furnished === 'no' || furnished === '') {
    furnishScore = 20
    furnishLabel = 'Unfurnished — owner has lower costs, more price flexibility'
  } else if (furnished.includes('semi')) {
    furnishScore = 12
    furnishLabel = 'Semi-furnished — moderate flexibility'
  } else {
    furnishScore = 4
    furnishLabel = 'Fully furnished — owner invested more, less likely to drop price'
  }
  total += furnishScore
  factors.push({
    label:   'Furnishing',
    emoji:   '🛋️',
    score:   furnishScore,
    max:     20,
    detail:  furnishLabel,
  })

  // 4. Boosted listing (max 20 pts — inverted)
  //    If owner is paying to boost, they really need a tenant → good for you
  const isBoosted = listing.is_boosted || listing.isBoosted || false
  let boostScore = 0
  let boostLabel = ''
  if (isBoosted) {
    boostScore = 20
    boostLabel = 'Owner is paying to boost this listing — they need a tenant urgently'
  } else {
    boostScore = 5
    boostLabel = 'Not a boosted listing'
  }
  total += boostScore
  factors.push({
    label:   'Boost Status',
    emoji:   '🚀',
    score:   boostScore,
    max:     20,
    detail:  boostLabel,
  })

  const score = Math.min(Math.round(total), 100)
  return { score, factors }
}

// ─── Score → label/color ──────────────────────────────────────────────────────
function getVerdict(score) {
  if (score >= 70) return {
    label:       'Very Likely to Negotiate',
    color:       '#166534',
    bg:          '#f0fdf4',
    border:      '#bbf7d0',
    advice:      'This owner is in a weak position. Start with a bold offer — 15–20% below asking.',
  }
  if (score >= 45) return {
    label:       'Moderate Chance',
    color:       '#92400e',
    bg:          '#fffbeb',
    border:      '#fde68a',
    advice:      'There\'s room to negotiate. Try 8–12% below asking and emphasize a long stay.',
  }
  return {
    label:       'Unlikely to Negotiate',
    color:       '#991b1b',
    bg:          '#fff1f2',
    border:      '#fecdd3',
    advice:      'This listing has high demand or is new. Focus on non-price terms like free maintenance or flexible move-in.',
  }
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function NegotiationScore({ listing }) {
  if (!listing) return null

  const { score, factors } = calcNegotiationScore(listing)
  const verdict = getVerdict(score)

  // Arc SVG — a simple semi-circle gauge
  const radius  = 36
  const cx = 52, cy = 52
  const circumference = Math.PI * radius          // half circle
  const filled = (score / 100) * circumference

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-default)',
      borderRadius: '16px',
      padding: '20px',
      marginBottom: '16px',
    }}>

      {/* Header */}
      <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '16px' }}>
        🤝 Negotiation Likelihood
      </div>

      {/* Score gauge + verdict row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '16px' }}>

        {/* SVG gauge */}
        <div style={{ flexShrink: 0, position: 'relative', width: '104px', height: '60px' }}>
          <svg width="104" height="60" viewBox="0 0 104 60">
            {/* Track */}
            <path
              d={`M 16 52 A ${radius} ${radius} 0 0 1 88 52`}
              fill="none"
              stroke="var(--border-default)"
              strokeWidth="8"
              strokeLinecap="round"
            />
            {/* Fill */}
            <path
              d={`M 16 52 A ${radius} ${radius} 0 0 1 88 52`}
              fill="none"
              stroke={verdict.color}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${filled} ${circumference}`}
              style={{ transition: 'stroke-dasharray 0.6s ease' }}
            />
          </svg>
          {/* Score number centered below arc */}
          <div style={{
            position: 'absolute', bottom: '0px', left: '50%', transform: 'translateX(-50%)',
            fontSize: '20px', fontWeight: '800', color: verdict.color, lineHeight: 1,
          }}>{score}</div>
        </div>

        {/* Verdict text */}
        <div style={{ flex: 1 }}>
          <div style={{
            display: 'inline-block',
            fontSize: '12px', fontWeight: '700',
            padding: '3px 10px', borderRadius: '20px',
            background: verdict.bg, color: verdict.color,
            border: `1px solid ${verdict.border}`,
            marginBottom: '6px',
          }}>{verdict.label}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
            {verdict.advice}
          </div>
        </div>
      </div>

      {/* Factor breakdown */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {factors.map(({ label, emoji, score: fs, max, detail }) => {
          const pct = Math.round((fs / max) * 100)
          const barColor = pct >= 66 ? '#166534' : pct >= 33 ? '#92400e' : '#6b7280'
          return (
            <div key={label}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                <span style={{ fontSize: '13px', width: '18px' }}>{emoji}</span>
                <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', flex: 1 }}>{label}</span>
                <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>{fs}/{max}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '18px' }} />
                <div style={{ flex: 1, height: '5px', background: 'var(--border-default)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: '3px', transition: 'width 0.4s ease' }} />
                </div>
              </div>
              <div style={{ paddingLeft: '26px', fontSize: '11px', color: 'var(--text-faint)', marginTop: '2px', lineHeight: '1.4' }}>
                {detail}
              </div>
            </div>
          )
        })}
      </div>

    </div>
  )
}