// src/components/CompatibilityBreakdown.jsx
// Drop-in explainability panel for the AI Matcher result panel.
// The backend already returns `result.breakdown` — this just renders it visually.

// WEIGHTS must match roommateCompatibility.js exactly
const WEIGHTS = {
  food:           15,
  smoking:        10,
  drinking:       10,
  cleanliness:    15,
  noise:          10,
  sleep_schedule: 10,
  personality:    15,
  guests:         15,
}

const META = {
  food:           { label: 'Food Preference',  emoji: '🍽️' },
  smoking:        { label: 'Smoking',          emoji: '🚭' },
  drinking:       { label: 'Drinking',         emoji: '🍺' },
  cleanliness:    { label: 'Cleanliness',      emoji: '🧹' },
  noise:          { label: 'Noise Tolerance',  emoji: '🔉' },
  sleep_schedule: { label: 'Sleep Schedule',   emoji: '🌙' },
  personality:    { label: 'Personality',      emoji: '🧠' },
  guests:         { label: 'Guest Preference', emoji: '🚪' },
}

function getPct(key, score) {
  return Math.round((score / WEIGHTS[key]) * 100)
}

function getBarColor(pct) {
  if (pct === 100) return '#166534'   // full match — green
  if (pct >= 50)  return '#92400e'   // partial   — amber
  return '#cc0000'                    // no match  — red
}

function getLabel(pct) {
  if (pct === 100) return { text: 'Perfect match', color: '#166534', bg: '#f0fdf4', border: '#bbf7d0' }
  if (pct >= 50)  return { text: 'Partial match',  color: '#92400e', bg: '#fffbeb', border: '#fde68a' }
  return                 { text: 'Mismatch',        color: '#991b1b', bg: '#fff1f2', border: '#fecdd3' }
}

export default function CompatibilityBreakdown({ breakdown, score }) {
  if (!breakdown) return null

  const entries = Object.keys(WEIGHTS).map(key => ({
    key,
    ...META[key],
    raw:   breakdown[key] ?? 0,
    max:   WEIGHTS[key],
    pct:   getPct(key, breakdown[key] ?? 0),
  }))

  // Sort: mismatches first so they stand out
  const sorted = [...entries].sort((a, b) => a.pct - b.pct)

  return (
    <div style={s.card}>
      {/* Header */}
      <div style={s.header}>
        <span style={s.title}>Score Breakdown</span>
        <span style={s.sub}>Why this score? See each factor below</span>
      </div>

      {/* Rows */}
      <div style={s.rows}>
        {sorted.map(({ key, label, emoji, pct, raw, max }) => {
          const bar   = getBarColor(pct)
          const badge = getLabel(pct)
          return (
            <div key={key} style={s.row}>
              {/* Left: emoji + label */}
              <div style={s.rowLeft}>
                <span style={s.emoji}>{emoji}</span>
                <span style={s.label}>{label}</span>
              </div>

              {/* Middle: bar */}
              <div style={s.barWrap}>
                <div style={s.barTrack}>
                  <div style={{
                    ...s.barFill,
                    width: `${pct}%`,
                    background: bar,
                  }} />
                </div>
                <span style={{ ...s.pctText, color: bar }}>{pct}%</span>
              </div>

              {/* Right: badge */}
              <div style={{
                ...s.badge,
                color:            badge.color,
                background:       badge.bg,
                border:           `1px solid ${badge.border}`,
              }}>
                {badge.text}
              </div>

              {/* Weight chip */}
              <div style={s.weight}>{raw}/{max} pts</div>
            </div>
          )
        })}
      </div>

      {/* Footer: total */}
      <div style={s.footer}>
        <div style={s.totalLabel}>Overall compatibility</div>
        <div style={{
          ...s.totalScore,
          color: score >= 80 ? '#166534' : score >= 60 ? '#92400e' : '#cc0000',
        }}>{score}%</div>
      </div>
    </div>
  )
}

const s = {
  card:       { background: 'var(--card-bg)', border: '1.5px solid var(--card-border-active)', borderRadius: '16px', padding: '20px', marginBottom: '16px' },
  header:     { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '16px', flexWrap: 'wrap', gap: '4px' },
  title:      { fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' },
  sub:        { fontSize: '11px', color: 'var(--text-faint)' },
  rows:       { display: 'flex', flexDirection: 'column', gap: '10px' },
  row:        { display: 'grid', gridTemplateColumns: '130px 1fr 90px 54px', alignItems: 'center', gap: '10px' },
  rowLeft:    { display: 'flex', alignItems: 'center', gap: '6px' },
  emoji:      { fontSize: '14px', lineHeight: 1, width: '20px', textAlign: 'center' },
  label:      { fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '500' },
  barWrap:    { display: 'flex', alignItems: 'center', gap: '8px' },
  barTrack:   { flex: 1, height: '6px', background: 'var(--border-default)', borderRadius: '3px', overflow: 'hidden' },
  barFill:    { height: '100%', borderRadius: '3px', transition: 'width 0.4s ease' },
  pctText:    { fontSize: '11px', fontWeight: '700', minWidth: '28px', textAlign: 'right' },
  badge:      { fontSize: '10px', fontWeight: '600', padding: '2px 7px', borderRadius: '20px', textAlign: 'center', whiteSpace: 'nowrap' },
  weight:     { fontSize: '10px', color: 'var(--text-faint)', textAlign: 'right', whiteSpace: 'nowrap' },
  footer:     { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-default)', marginTop: '16px', paddingTop: '14px' },
  totalLabel: { fontSize: '12px', color: 'var(--text-faint)' },
  totalScore: { fontSize: '22px', fontWeight: '800', letterSpacing: '-0.5px' },
}