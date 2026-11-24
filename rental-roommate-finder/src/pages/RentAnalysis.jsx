import { useTheme } from '../context/ThemeContext'
import { useState } from 'react'
import LocationAutocomplete from '../components/LocationAutocomplete'
import RentTrendChart from '../components/RentTrendChart' 

const API_BASE = 'http://localhost:5000/api'

export default function RentAnalysis() {
  const { isDark } = useTheme()
  const [form, setForm] = useState({
    location: '',
    type: 'Single',
    bhk: '1BHK',
    rent: '',
    furnished: 'Fully Furnished',
    amenities: '',
  })
  const [result, setResult]   = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  function handleLocationChange(text) {
    setForm(prev => ({ ...prev, location: text }))
  }

  function handleLocationSelect(place) {
    setForm(prev => ({ ...prev, location: place.short }))
  }

  function validate() {
    const errs = {}
    const loc = (form.location || '').trim()
    if (!loc) {
      errs.location = 'Please enter a location'
    } else if (loc.length < 4) {
      errs.location = 'Please enter a more specific location (e.g. Vyttila, Kochi)'
    } else if (/^\d+$/.test(loc)) {
      errs.location = 'Location cannot be a number — enter a place name'
    }
    const rentNum = Number(form.rent)
    if (form.rent === '' || form.rent === null || form.rent === undefined) {
      errs.rent = 'Please enter your current rent'
    } else if (isNaN(rentNum) || rentNum <= 0) {
      errs.rent = 'Rent must be a positive number'
    } else if (rentNum < 500) {
      errs.rent = 'Rent is too low — minimum valid rent is ₹500/month'
    } else if (rentNum > 500000) {
      errs.rent = 'Rent seems unusually high — please double-check'
    }
    return errs
  }

  async function analyzeRent() {
    const errs = validate()
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs)
      return
    }
    setFieldErrors({})
    setLoading(true)
    setResult(null)
    setError(null)

    const effectiveType = form.type === 'Apartment' ? `Apartment - ${form.bhk}` : form.type

    try {
      const token = sessionStorage.getItem('token')
      const res = await fetch(`${API_BASE}/ai/rent-analysis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ ...form, type: effectiveType }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Analysis failed')
      }

      const data = await res.json()
      setResult(data)
    } catch (err) {
      if (err.message.includes('fetch') || err.message.includes('Failed') || err.message.includes('NetworkError')) {
        const effectiveType2 = form.type === 'Apartment' ? `Apartment - ${form.bhk}` : form.type
        setResult(clientSideFallback({ ...form, type: effectiveType2 }))
      } else {
        setError(err.message)
      }
    } finally {
      setLoading(false)
    }
  }

  const statusConfig = {
    too_low:  { color: '#1e40af', bg: '#eff6ff',  label: 'Too Low',        icon: '📉' },
    low:      { color: '#92400e', bg: '#fffbeb',  label: 'Slightly Low',   icon: '⬇️' },
    optimal:  { color: '#166534', bg: '#f0fdf4',  label: 'Optimal ✓',      icon: '✅' },
    high:     { color: '#92400e', bg: '#fffbeb',  label: 'Slightly High',  icon: '⬆️' },
    too_high: { color: '#cc0000', bg: '#fff0f0',  label: 'Too High',       icon: '📈' },
  }
  const cfg = result ? (statusConfig[result.status] || statusConfig.optimal) : null

  return (
    <div style={s.page}>
      <div style={s.topbar}>
        <div>
          <h2 style={s.title}>Rent Analysis</h2>
          <p style={s.sub}>AI-powered rent optimization for your listing</p>
        </div>
      </div>

      <div style={s.content}>
        <div style={s.grid}>

          {/* ── Form ── */}
          <div style={s.formCard}>
            <h3 style={s.cardTitle}>Your Listing Details</h3>

            <div style={s.field}>
              <label style={s.label}>Location</label>
              <LocationAutocomplete
                value={form.location}
                onChange={handleLocationChange}
                onSelect={handleLocationSelect}
                onClear={() => setForm(prev => ({ ...prev, location: '' }))}
                placeholder="e.g. Ernakulam, Kochi"
                variant="filter"
              />
              {fieldErrors.location && (
                <div style={s.fieldError}>⚠️ {fieldErrors.location}</div>
              )}
            </div>

            <div style={s.field}>
              <label style={s.label}>Your Current Rent (₹/month)</label>
              <input
                style={s.input}
                type="number"
                name="rent"
                placeholder="e.g. 7500"
                value={form.rent}
                onChange={handleChange}
                min="500"
              />
              {fieldErrors.rent && (
                <div style={s.fieldError}>⚠️ {fieldErrors.rent}</div>
              )}
            </div>

            <div style={s.field}>
              <label style={s.label}>Room Type</label>
              <select style={s.input} name="type" value={form.type} onChange={handleChange}>
                {['Single', 'Shared', 'Studio', 'Apartment'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>

            {form.type === 'Apartment' && (
              <div style={s.field}>
                <label style={s.label}>BHK Type</label>
                <select style={s.input} name="bhk" value={form.bhk} onChange={handleChange}>
                  {['1BHK', '2BHK', '3BHK', '4BHK'].map(b => <option key={b}>{b}</option>)}
                </select>
              </div>
            )}

            <div style={s.field}>
              <label style={s.label}>Furnishing</label>
              <select style={s.input} name="furnished" value={form.furnished} onChange={handleChange}>
                {['Fully Furnished', 'Semi Furnished', 'Unfurnished'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>

            <div style={s.field}>
              <label style={s.label}>Amenities (comma separated)</label>
              <input
                style={s.input}
                type="text"
                name="amenities"
                placeholder="AC, WiFi, Parking, Gym..."
                value={form.amenities}
                onChange={handleChange}
              />
            </div>

            {error && (
              <div style={s.errorBox}>⚠️ {error}</div>
            )}

            <button
              style={{ ...s.analyzeBtn, opacity: loading ? 0.6 : 1 }}
              onClick={analyzeRent}
              disabled={loading}
            >
              {loading ? '⏳ Analyzing...' : '🤖 Analyze My Rent →'}
            </button>
          </div>

          {/* ── Results ── */}
          <div>
            {!result && !loading && (
              <div style={s.empty}>
                <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.15 }}>📊</div>
                <div style={s.emptyTitle}>Enter your listing details</div>
                <div style={s.emptyText}>AI will analyze your rent against current market rates</div>
              </div>
            )}

            {loading && (
              <div style={s.empty}>
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>⏳</div>
                <div style={s.emptyText}>Analyzing market data with AI...</div>
              </div>
            )}

            {result && cfg && (
              <div style={s.results}>

                {/* Status */}
                <div style={{ ...s.statusCard, background: cfg.bg, border: `1.5px solid ${cfg.color}33` }}>
                  <div style={s.statusTop}>
                    <span style={{ fontSize: '32px' }}>{cfg.icon}</span>
                    <div>
                      <div style={{ ...s.statusLabel, color: cfg.color }}>{cfg.label}</div>
                      <div style={s.statusVerdict}>{result.verdict}</div>
                    </div>
                  </div>
                  {result.priceGapAmount > 0 && result.priceGapDirection !== 'none' && (
                    <div style={{ ...s.tipBox, color: cfg.color }}>
                      💡 {result.priceGapDirection === 'raise'
                        ? `You could raise by ₹${result.priceGapAmount.toLocaleString()} to hit market range`
                        : `Reduce by ₹${result.priceGapAmount.toLocaleString()} to attract more inquiries`}
                    </div>
                  )}
                  <div style={s.sourceBadge}>
                    {result.source === 'ai' ? '🤖 AI-powered analysis' : '📐 Rule-based estimate'}
                    {result.comparablesCount > 0 && ` · ${result.comparablesCount} live listings compared`}
                  </div>
                </div>

                {/* Price Range */}
                <div style={s.rangeCard}>
                  <h4 style={s.rangeTitle}>Market Rate Breakdown</h4>
                  <div style={s.rangeGrid}>
                    {[
                      { label: 'Minimum',   value: result.marketMin,    desc: 'Lowest acceptable' },
                      { label: 'Optimal',   value: result.optimalPrice, desc: 'Best for inquiries' },
                      { label: 'Maximum',   value: result.marketMax,    desc: 'Highest market rate' },
                      { label: 'Your Rent', value: result.userRent,     desc: 'Current price', highlight: true },
                    ].map((r, i) => (
                      <div key={i} style={{ ...s.rangeItem, ...(r.highlight ? s.rangeItemHighlight : {}) }}>
                        <div style={{ ...s.rangeItemLabel, ...(r.highlight ? { color: '#999' } : {}) }}>{r.label}</div>
                        <div style={{ ...s.rangeItemValue, ...(r.highlight ? { color: 'var(--btn-primary-text)' } : {}) }}>
                          ₹{(r.value || 0).toLocaleString()}
                        </div>
                        <div style={{ ...s.rangeItemDesc, ...(r.highlight ? { color: '#999' } : {}) }}>{r.desc}</div>
                      </div>
                    ))}
                  </div>
                  <div style={s.barSection}>
                    <div style={s.barTrack}>
                      <div style={{
                        ...s.barFill,
                        width: `${Math.min(((result.userRent || 0) / (result.marketMax || 1)) * 100, 100)}%`,
                        background: cfg.color,
                      }} />
                      <div style={{
                        ...s.barMarker,
                        left: `${Math.min(((result.optimalPrice || 0) / (result.marketMax || 1)) * 100, 100)}%`,
                      }} />
                    </div>
                    <div style={s.barLabels}>
                      <span style={s.barLabel}>₹{(result.marketMin || 0).toLocaleString()}</span>
                      <span style={s.barLabel}>Optimal: ₹{(result.optimalPrice || 0).toLocaleString()}</span>
                      <span style={s.barLabel}>₹{(result.marketMax || 0).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* Demand */}
                <div style={s.demandRow}>
                  <div style={s.demandCard}>
                    <div style={s.demandIcon}>📣</div>
                    <div style={s.demandLabel}>Demand Level</div>
                    <div style={{
                      ...s.demandValue,
                      color: result.demandLevel === 'High' ? '#166534' : result.demandLevel === 'Low' ? '#cc0000' : '#92400e',
                    }}>{result.demandLevel || 'Moderate'}</div>
                  </div>
                  <div style={s.demandCard}>
                    <div style={s.demandIcon}>📅</div>
                    <div style={s.demandLabel}>Est. Days to Fill</div>
                    <div style={s.demandValue}>{result.expectedOccupancyDays || '—'} days</div>
                  </div>
                </div>
                {/* Rent Trend Chart */}
                <RentTrendChart
                  currentRent={result.userRent}
                  location={form.location}
                  type={form.type === 'Apartment' ? `Apartment - ${form.bhk}` : form.type}
                />

                {/* Insights */}
                {result.insights?.length > 0 && (
                  <div style={s.insightsCard}>
                    <h4 style={s.rangeTitle}>AI Insights</h4>
                    {result.insights.map((ins, i) => (
                      <div key={i} style={s.insightItem}>
                        <div style={s.insightDot} />
                        <div style={s.insightText}>{ins}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Tips */}
                {result.tips?.length > 0 && (
                  <div style={s.tipsCard}>
                    <h4 style={{ ...s.rangeTitle, color: '#166534' }}>💡 Actionable Tips</h4>
                    {result.tips.map((tip, i) => (
                      <div key={i} style={s.tipItem}>
                        <span style={s.tipNum}>{i + 1}</span>
                        <div style={s.insightText}>{tip}</div>
                      </div>
                    ))}
                  </div>
                )}

                {result.confidenceNote && (
                  <div style={s.confNote}>ℹ️ {result.confidenceNote}</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Offline fallback ──────────────────────────────────────────────────────────
function clientSideFallback({ location, rent, type, furnished, amenities }) {
  const multipliers = { ernakulam: 1.3, kakkanad: 1.1, edapally: 1.2, aluva: 0.9, thrippunithura: 0.85, palarivattom: 1.25, vyttila: 1.2, kochi: 1.15 }
  const basePrice = {
    Single: 6000, Shared: 4000, Studio: 9000,
    'Apartment - 1BHK': 10000, 'Apartment - 2BHK': 15000,
    'Apartment - 3BHK': 22000, 'Apartment - 4BHK': 30000,
  }[type] || 6000

  // Furnishing multiplier: Fully Furnished commands the highest rent
  const furnishingMultiplier = {
    'Fully Furnished': 1.20,
    'Semi Furnished':  1.08,
    'Unfurnished':     1.00,
  }[furnished] || 1.0
  const furnishingLabel = {
    'Fully Furnished': 'Fully furnished adds a 20% premium over unfurnished',
    'Semi Furnished':  'Semi furnished adds an 8% premium over unfurnished',
    'Unfurnished':     'Unfurnished baseline — furnishing would increase market value',
  }[furnished] || ''

  const loc = location.toLowerCase()
  const matchedKey = Object.keys(multipliers).find(k => loc.includes(k))
  const factor = matchedKey ? multipliers[matchedKey] : 1.0
  const amenityBonus = (amenities.toLowerCase().match(/ac|gym|parking|wifi/g) || []).length * 300
  const min = Math.round((basePrice * factor * furnishingMultiplier + amenityBonus) / 100) * 100
  const max = Math.round((min * 1.25) / 100) * 100
  const optimalPrice = Math.round((min + max) / 2 / 100) * 100
  const userRent = Number(rent)
  let status, verdict
  if (userRent < min * 0.85)       { status = 'too_low';  verdict = 'Your rent is significantly below market rate' }
  else if (userRent < min)         { status = 'low';      verdict = 'Your rent is slightly below market rate' }
  else if (userRent <= max)        { status = 'optimal';  verdict = 'Your rent is in the optimal range!' }
  else if (userRent <= max * 1.15) { status = 'high';     verdict = 'Your rent is slightly above market rate' }
  else                             { status = 'too_high'; verdict = 'Your rent is significantly above market rate' }
  const gap = status.includes('low') ? min - userRent : status.includes('high') ? userRent - max : 0
  return {
    source: 'rule-based', userRent, status, verdict, marketMin: min, marketMax: max, optimalPrice,
    priceGapAmount: Math.abs(gap), priceGapDirection: gap > 0 ? (status.includes('low') ? 'raise' : 'lower') : 'none',
    demandLevel: status === 'optimal' ? 'High' : status === 'too_high' || status === 'too_low' ? 'Low' : 'Moderate',
    expectedOccupancyDays: status === 'optimal' ? 7 : status === 'too_high' ? 30 : 14,
    insights: [
      `Market range for ${type} (${furnished}): ₹${min.toLocaleString()} – ₹${max.toLocaleString()}/month`,
      `Optimal price point: ₹${optimalPrice.toLocaleString()}/month`,
      furnishingLabel,
      matchedKey ? `${matchedKey.charAt(0).toUpperCase() + matchedKey.slice(1)} has a ${factor}x location premium` : 'Location not in local DB — using general Kerala rates',
      `Your listing is at ₹${userRent.toLocaleString()}/month`,
    ].filter(Boolean),
    tips: [
      status === 'too_high' ? `Reduce by ₹${(userRent - max).toLocaleString()} to enter the optimal range` : 'Your pricing is well-positioned for this area',
      furnished === 'Unfurnished' ? 'Adding basic furnishing (bed, wardrobe, fan) could raise your market rate by 8–20%' : 'List all amenities clearly to justify your price point',
    ],
    confidenceNote: 'Offline estimate — connect to backend for full AI-powered analysis with live comparables',
    comparablesCount: 0,
  }
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = {
  page:               { minHeight: '100vh', background: 'var(--bg-primary)', fontFamily: "'Segoe UI', sans-serif" },
  topbar:             { background: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)', padding: '20px 32px' },
  title:              { fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.5px' },
  sub:                { fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' },
  content:            { padding: '28px 32px' },
  grid:               { display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '24px' },
  formCard:           { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '24px' },
  cardTitle:          { fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '20px' },
  field:              { marginBottom: '16px' },
  label:              { display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '7px' },
  input:              { width: '100%', padding: '11px 14px', borderRadius: '10px', border: '1.5px solid var(--input-border)', fontSize: '14px', outline: 'none', boxSizing: 'border-box', color: 'var(--text-primary)', background: 'var(--bg-card)' },
  analyzeBtn:         { width: '100%', padding: '13px', background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', marginTop: '4px' },
  errorBox:           { background: '#fff0f0', border: '1px solid #fca5a5', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#cc0000', marginBottom: '12px' },
  empty:              { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '60px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  emptyTitle:         { fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px' },
  emptyText:          { fontSize: '13px', color: 'var(--text-placeholder)' },
  results:            { display: 'flex', flexDirection: 'column', gap: '16px' },
  statusCard:         { borderRadius: '16px', padding: '20px' },
  statusTop:          { display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '12px' },
  statusLabel:        { fontSize: '16px', fontWeight: '800', marginBottom: '4px' },
  statusVerdict:      { fontSize: '13px', color: 'var(--text-secondary)' },
  tipBox:             { fontSize: '13px', fontWeight: '600', padding: '10px 14px', background: 'rgba(255,255,255,0.6)', borderRadius: '8px', marginBottom: '8px' },
  sourceBadge:        { fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' },
  rangeCard:          { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '20px' },
  rangeTitle:         { fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '16px' },
  rangeGrid:          { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '16px' },
  rangeItem:          { background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '12px', textAlign: 'center' },
  rangeItemHighlight: { background: 'var(--btn-primary-bg)', border: '1px solid #111' },
  rangeItemLabel:     { fontSize: '11px', color: 'var(--text-placeholder)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' },
  rangeItemValue:     { fontSize: '16px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '2px' },
  rangeItemDesc:      { fontSize: '11px', color: 'var(--text-placeholder)' },
  barSection:         { marginTop: '8px' },
  barTrack:           { height: '8px', background: 'var(--bg-secondary)', borderRadius: '4px', position: 'relative', marginBottom: '6px' },
  barFill:            { height: '8px', borderRadius: '4px', transition: 'width 0.5s' },
  barMarker:          { position: 'absolute', top: '-4px', width: '16px', height: '16px', background: 'var(--btn-primary-bg)', borderRadius: '50%', transform: 'translateX(-50%)', border: '2px solid white' },
  barLabels:          { display: 'flex', justifyContent: 'space-between' },
  barLabel:           { fontSize: '11px', color: 'var(--text-placeholder)' },
  demandRow:          { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },
  demandCard:         { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '16px', textAlign: 'center' },
  demandIcon:         { fontSize: '24px', marginBottom: '6px' },
  demandLabel:        { fontSize: '11px', color: 'var(--text-placeholder)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' },
  demandValue:        { fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)' },
  insightsCard:       { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '20px' },
  insightItem:        { display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '10px' },
  insightDot:         { width: '6px', height: '6px', borderRadius: '50%', background: 'var(--btn-primary-bg)', flexShrink: 0, marginTop: '6px' },
  insightText:        { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6' },
  tipsCard:           { background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '16px', padding: '20px' },
  tipItem:            { display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '10px' },
  tipNum:             { width: '20px', height: '20px', borderRadius: '50%', background: '#166534', color: 'var(--btn-primary-text)', fontSize: '11px', fontWeight: '800', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' },
  confNote:           { fontSize: '12px', color: 'var(--text-placeholder)', textAlign: 'center', padding: '8px' },
  fieldError:         { fontSize: '12px', color: '#cc0000', marginTop: '5px' },
}