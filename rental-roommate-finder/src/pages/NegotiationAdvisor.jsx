import { useState } from 'react'
import LocationAutocomplete from '../components/LocationAutocomplete'

// ── Validation ─────────────────────────────────────────────────────────────────
function validate(form) {
  const errors = {}

  const asking = Number(form.listingPrice)
  const budget = Number(form.budget)

  if (!form.listingPrice || isNaN(asking) || asking <= 0) {
    errors.listingPrice = 'Please enter a valid asking rent greater than ₹0'
  } else if (asking < 500) {
    errors.listingPrice = 'Asking rent seems too low — minimum ₹500/month'
  } else if (asking > 500000) {
    errors.listingPrice = 'Asking rent seems too high — please double-check'
  }

  if (!form.budget || isNaN(budget) || budget <= 0) {
    errors.budget = 'Please enter a valid budget greater than ₹0'
  } else if (budget < 500) {
    errors.budget = 'Budget seems too low — minimum ₹500/month'
  } else if (!errors.listingPrice) {
    const gap    = asking - budget
    const gapPct = (gap / asking) * 100

    if (budget >= asking) {
      errors.budget = 'Your budget should be less than the asking rent — negotiation only makes sense if you want to pay less'
    } else if (budget < asking * 0.4) {
      errors.budget = `Your budget (₹${budget.toLocaleString()}) is less than 40% of asking rent — this gap is too large for realistic negotiation`
    } else if (gap < 500) {
      errors.budget = `The difference is only ₹${gap} — too small to negotiate meaningfully. Your budget must be at least ₹500 less than the asking rent`
    } else if (gapPct < 5) {
      errors.budget = `Your budget is only ${gapPct.toFixed(1)}% below asking (₹${gap} difference). A gap of at least 5% (₹${Math.ceil(asking * 0.05).toLocaleString()} off) is needed to make negotiation worthwhile`
    }
  }

  if (!form.location || form.location.trim().length < 3) {
    errors.location = 'Please enter a location (e.g. MG Road, Kochi)'
  }

  return errors
}

// ── Result builder ─────────────────────────────────────────────────────────────
function buildResult(form) {
  const asking  = Number(form.listingPrice)
  const budget  = Number(form.budget)
  const diff    = asking - budget
  const pct     = (diff / asking) * 100
  const effectiveType = form.roomType === 'Apartment' ? `${form.bhk} Apartment` : form.roomType

  // Target: midpoint between budget and asking, skewed toward the budget
  const target = Math.round(budget + diff * 0.25)
  const savings = asking - target

  // Tip quality depends on how far apart asking vs budget is
  const negotiationStrength = pct <= 10 ? 'strong' : pct <= 20 ? 'moderate' : 'aggressive'

  const tips = [
    `Start by offering ₹${budget.toLocaleString()} — a ${pct.toFixed(1)}% reduction. ${
      pct <= 10 ? 'This is a reasonable ask and has a good chance of success.' :
      pct <= 20 ? 'This is a moderate ask — be ready to meet halfway at ~₹' + target.toLocaleString() + '.' :
      'This is a significant reduction — prepare a strong case with comparable listings.'
    }`,
    `Mention you are looking for a ${form.duration} stay — owners strongly prefer long-term tenants over frequent turnovers.`,
    'Ask if maintenance, water, and electricity charges are included — these are often negotiable and can save ₹500–₹2,000/month.',
    `Offer to pay ${form.duration === '< 3 months' ? '1 month' : '2 months'} advance upfront to sweeten the deal — owners value financial security.`,
    'Visit in person — face-to-face negotiations are significantly more effective than messaging or calls.',
    `Research similar ${effectiveType.toLowerCase()} rooms in ${form.location} and mention if comparable listings are priced lower nearby.`,
  ]

  const redFlags = [
    'Owner refuses any negotiation whatsoever — this could signal overpricing.',
    'No written rental agreement offered — always insist on a signed document.',
    'Full advance payment demanded before you visit the property — a major fraud red flag.',
    'Photos don\'t match the actual property — always inspect in person before paying.',
  ]

  const confidenceNote =
    negotiationStrength === 'strong'  ? 'High chance of success — the gap is small and reasonable.'
  : negotiationStrength === 'moderate' ? 'Moderate chance — be flexible and willing to settle near ₹' + target.toLocaleString() + '.'
  :                                       'Challenging gap — use comparable listings and a long-stay commitment as leverage.'

  const script =
    `"Hi, I am very interested in your ${effectiveType.toLowerCase()} at ${form.location}. ` +
    `I have been searching in this area for a while and your property really stands out. ` +
    `I am planning to stay for ${form.duration}, which means stable, reliable income for you with no vacancy gaps. ` +
    `Given the current market rates nearby, would you consider ₹${budget.toLocaleString()} per month? ` +
    `I can offer ${form.duration === '< 3 months' ? '1 month' : '2 months'} advance payment right away to make it easy for you."`

  return { target, savings, pct, tips, redFlags, script, confidenceNote, negotiationStrength }
}

// ─────────────────────────────────────────────────────────────────────────────

export default function NegotiationAdvisor() {
  const [form, setForm] = useState({
    listingPrice: '',
    budget:       '',
    location:     '',
    roomType:     'Single',
    bhk:          '1BHK',
    duration:     '6 months',
  })
  const [errors,  setErrors]  = useState({})
  const [touched, setTouched] = useState({})
  const [loading, setLoading] = useState(false)
  const [result,  setResult]  = useState(null)

  function handleChange(e) {
    const { name, value } = e.target
    setForm(f => ({ ...f, [name]: value }))
    // Clear error for this field as user types
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: undefined }))
    // If roomType changes away from Apartment, clear result so stale advice is removed
    if (name === 'roomType') setResult(null)
  }

  function handleBlur(e) {
    setTouched(prev => ({ ...prev, [e.target.name]: true }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    // Mark all fields touched so all errors show
    setTouched({ listingPrice: true, budget: true, location: true })
    const errs = validate(form)
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    setLoading(true)
    setResult(null)
    await new Promise(r => setTimeout(r, 1400))
    setResult(buildResult(form))
    setLoading(false)
  }

  const strengthColor = {
    strong:     '#10b981',
    moderate:   '#f59e0b',
    aggressive: '#ef4444',
  }

  return (
    <div style={s.page}>
      <div style={s.topbar}>
        <h2 style={s.title}>AI Negotiation Advisor</h2>
        <p style={s.sub}>Get smart tips to negotiate your rent down</p>
      </div>

      <div style={s.content}>
        <div style={s.grid}>

          {/* ── Input Form ── */}
          <div style={s.formCard}>
            <h3 style={s.cardTitle}>Tell us about the listing</h3>

            <form onSubmit={handleSubmit} noValidate>

              {/* Asking Rent */}
              <div style={s.field}>
                <label style={s.label}>Asking Rent (₹/month) <span style={s.required}>*</span></label>
                <input
                  style={{ ...s.input, ...(touched.listingPrice && errors.listingPrice ? s.inputError : {}) }}
                  type="number"
                  name="listingPrice"
                  placeholder="e.g. 9000"
                  value={form.listingPrice}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  min="1"
                />
                {touched.listingPrice && errors.listingPrice && (
                  <div style={s.errorMsg}>⚠ {errors.listingPrice}</div>
                )}
              </div>

              {/* Budget */}
              <div style={s.field}>
                <label style={s.label}>Your Budget (₹/month) <span style={s.required}>*</span></label>
                <input
                  style={{ ...s.input, ...(touched.budget && errors.budget ? s.inputError : {}) }}
                  type="number"
                  name="budget"
                  placeholder="e.g. 7000"
                  value={form.budget}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  min="1"
                />
                {touched.budget && errors.budget && (
                  <div style={s.errorMsg}>⚠ {errors.budget}</div>
                )}
              </div>

              {/* Location */}
              <div style={s.field}>
                <label style={s.label}>Location <span style={s.required}>*</span></label>
                <div style={touched.location && errors.location ? s.locationErrorWrap : {}}>
                  <LocationAutocomplete
                    variant="filter"
                    value={form.location}
                    placeholder="e.g. MG Road, Kochi"
                    onChange={(text) => {
                      setForm(f => ({ ...f, location: text }))
                      if (errors.location) setErrors(prev => ({ ...prev, location: undefined }))
                    }}
                    onSelect={(place) => {
                      setForm(f => ({ ...f, location: place.short }))
                      setErrors(prev => ({ ...prev, location: undefined }))
                    }}
                    onClear={() => setForm(f => ({ ...f, location: '' }))}
                  />
                </div>
                {touched.location && errors.location && (
                  <div style={s.errorMsg}>⚠ {errors.location}</div>
                )}
              </div>

              {/* Room Type */}
              <div style={s.field}>
                <label style={s.label}>Room Type</label>
                <select style={s.input} name="roomType" value={form.roomType} onChange={handleChange}>
                  {['Single', 'Shared', 'Studio', 'Apartment'].map(t => <option key={t}>{t}</option>)}
                </select>
              </div>

              {form.roomType === 'Apartment' && (
                <div style={s.field}>
                  <label style={s.label}>BHK Type</label>
                  <select style={s.input} name="bhk" value={form.bhk} onChange={handleChange}>
                    {['1BHK', '2BHK', '3BHK', '4BHK'].map(b => <option key={b}>{b}</option>)}
                  </select>
                </div>
              )}

              {/* Duration */}
              <div style={s.field}>
                <label style={s.label}>Expected Stay Duration</label>
                <select style={s.input} name="duration" value={form.duration} onChange={handleChange}>
                  {['< 3 months', '3 months', '6 months', '1 year', '2+ years'].map(t => <option key={t}>{t}</option>)}
                </select>
              </div>

              {/* Budget hint */}
              {form.listingPrice && form.budget &&
               Number(form.budget) > 0 && Number(form.listingPrice) > 0 &&
               !errors.listingPrice && !errors.budget && (
                <div style={s.hintBox}>
                  💡 You want to negotiate <strong>
                    ₹{(Number(form.listingPrice) - Number(form.budget)).toLocaleString()}
                  </strong> off — that's a <strong>
                    {(((Number(form.listingPrice) - Number(form.budget)) / Number(form.listingPrice)) * 100).toFixed(1)}%
                  </strong> reduction from the asking price.
                </div>
              )}

              <button style={{ ...s.btn, ...(loading ? s.btnDisabled : {}) }} type="submit" disabled={loading}>
                {loading ? '🤖 Analyzing...' : '🤖 Get AI Advice →'}
              </button>
            </form>
          </div>

          {/* ── Results Panel ── */}
          <div>
            {!result && !loading && (
              <div style={s.empty}>
                <div style={{ fontSize: '40px', marginBottom: '12px', opacity: 0.2 }}>🤝</div>
                <div style={s.emptyTitle}>Ready to help you negotiate</div>
                <div style={s.emptyText}>Fill in the form with the listing details and your budget to get personalized negotiation tips.</div>
              </div>
            )}

            {loading && (
              <div style={s.empty}>
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>⏳</div>
                <div style={s.emptyTitle}>Analyzing negotiation strategy...</div>
                <div style={s.emptyText}>Building the best approach for your situation.</div>
              </div>
            )}

            {result && (
              <div style={s.results}>

                {/* Target Price Card */}
                <div style={s.targetCard}>
                  <div style={s.targetLabel}>Recommended Target Price</div>
                  <div style={s.targetPrice}>
                    ₹{result.target.toLocaleString()}
                    <span style={s.perMonth}>/month</span>
                  </div>
                  <div style={s.savingsText}>Potential savings: ₹{result.savings.toLocaleString()}/month</div>
                  <div style={{ ...s.strengthBadge, background: strengthColor[result.negotiationStrength] + '22', color: strengthColor[result.negotiationStrength], border: `1px solid ${strengthColor[result.negotiationStrength]}55` }}>
                    {result.negotiationStrength === 'strong'     ? '✅ Strong position'
                   : result.negotiationStrength === 'moderate'   ? '🟡 Moderate — be flexible'
                   :                                               '🔴 Challenging — build your case well'}
                  </div>
                  <div style={s.confidenceNote}>{result.confidenceNote}</div>
                </div>

                {/* Tips */}
                <div style={s.section}>
                  <h4 style={s.sectionTitle}>💡 Negotiation Tips</h4>
                  {result.tips.map((t, i) => (
                    <div key={i} style={s.tipItem}>
                      <div style={s.tipNum}>{i + 1}</div>
                      <div style={s.tipText}>{t}</div>
                    </div>
                  ))}
                </div>

                {/* Script */}
                <div style={s.section}>
                  <h4 style={s.sectionTitle}>🗣️ What to Say</h4>
                  <div style={s.scriptBox}>{result.script}</div>
                </div>

                {/* Red Flags */}
                <div style={s.section}>
                  <h4 style={s.sectionTitle}>⚠️ Watch Out For</h4>
                  {result.redFlags.map((r, i) => (
                    <div key={i} style={s.redFlagItem}>
                      <span style={s.redDot}>!</span>
                      <span style={s.redText}>{r}</span>
                    </div>
                  ))}
                </div>

              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const s = {
  page:        { minHeight: '100vh', background: 'var(--bg-page)', fontFamily: "'Segoe UI', sans-serif" },
  topbar:      { background: 'var(--bg-topbar)', borderBottom: '1px solid var(--border-default)', padding: '20px 32px' },
  title:       { fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.5px' },
  sub:         { fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' },
  content:     { padding: '28px 32px' },
  grid:        { display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: '24px' },
  formCard:    { background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: '16px', padding: '24px' },
  cardTitle:   { fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '20px' },
  field:       { marginBottom: '16px' },
  label:       { display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '7px' },
  required:    { color: '#ef4444', marginLeft: '2px' },
  input:       { width: '100%', padding: '11px 14px', borderRadius: '10px', border: '1.5px solid var(--input-border)', fontSize: '14px', outline: 'none', boxSizing: 'border-box', color: 'var(--input-text)', background: 'var(--input-bg)' },
  inputError:  { borderColor: '#ef4444', background: '#fff5f5' },
  locationErrorWrap: { borderRadius: '10px', outline: '1.5px solid #ef4444' },
  errorMsg:    { fontSize: '12px', color: '#ef4444', marginTop: '5px', display: 'flex', alignItems: 'flex-start', gap: '4px', lineHeight: '1.4' },
  hintBox:     { background: 'var(--bg-subtle, #f8f9fa)', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: '1.5' },
  btn:         { width: '100%', padding: '13px', background: 'var(--accent)', color: 'var(--accent-fg)', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', cursor: 'pointer' },
  btnDisabled: { opacity: 0.6, cursor: 'not-allowed' },
  empty:       { background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: '16px', padding: '60px 28px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '280px' },
  emptyTitle:  { fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' },
  emptyText:   { fontSize: '13px', color: 'var(--text-faint)', lineHeight: '1.6', maxWidth: '280px' },
  results:     { display: 'flex', flexDirection: 'column', gap: '16px' },
  targetCard:  { background: 'var(--accent)', borderRadius: '16px', padding: '24px', color: 'var(--accent-fg)' },
  targetLabel: { fontSize: '11px', color: 'rgba(255,255,255,0.6)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: '600' },
  targetPrice: { fontSize: '36px', fontWeight: '800', letterSpacing: '-1px', marginBottom: '6px', color: 'var(--accent-fg)' },
  perMonth:    { fontSize: '16px', fontWeight: '400', opacity: 0.6 },
  savingsText: { fontSize: '13px', color: 'var(--stat-change)', marginBottom: '12px' },
  strengthBadge: { display: 'inline-block', padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '700', marginBottom: '8px' },
  confidenceNote: { fontSize: '12px', color: 'rgba(255,255,255,0.75)', lineHeight: '1.5' },
  section:     { background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: '14px', padding: '20px' },
  sectionTitle:{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '14px' },
  tipItem:     { display: 'flex', gap: '12px', marginBottom: '12px', alignItems: 'flex-start' },
  tipNum:      { width: '22px', height: '22px', borderRadius: '6px', background: 'var(--bg-muted)', border: '1px solid var(--border-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', color: 'var(--text-primary)', flexShrink: 0 },
  tipText:     { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6' },
  scriptBox:   { background: 'var(--bg-muted)', border: '1px solid var(--border-strong)', borderRadius: '10px', padding: '16px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.7', fontStyle: 'italic' },
  redFlagItem: { display: 'flex', gap: '10px', marginBottom: '10px', alignItems: 'flex-start' },
  redDot:      { width: '20px', height: '20px', minWidth: '20px', borderRadius: '50%', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger-text)', fontSize: '11px', fontWeight: '800', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  redText:     { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' },
}