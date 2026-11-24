import { useState } from 'react'
import { recordPayment } from '../utils/payments'

// ── Valid UPI handles (all major Indian banks & wallets) ──────────────────────
const VALID_UPI_HANDLES = [
  // Wallets
  'paytm', 'phonepe', 'gpay', 'freecharge', 'mobikwik', 'airtel',
  'jio', 'amazon', 'ybl', 'ibl', 'axl', 'superpes',
  // Banks
  'okaxis', 'okhdfcbank', 'okicici', 'oksbi',
  'axisbank', 'axisb', 'upi', 'okbizaxis',
  'hdfcbank', 'hdfc',
  'icici', 'icicibank',
  'sbi', 'sbipsg', 'sbibank',
  'pnb', 'pnbpay',
  'kotak', 'kmbl',
  'idbi', 'idbibank',
  'indus', 'indusind',
  'boi', 'bob',
  'citi', 'citibank',
  'hsbc',
  'federal', 'federalbank',
  'iob', 'indian',
  'canara', 'canarabank',
  'uco', 'ucob',
  'centralbank', 'cboi',
  'syndicate',
  'allahabad', 'allahabadbank',
  'vijayabank',
  'denabank',
  'corpbank',
  'rbl', 'rblbank',
  'yesbank', 'yesbankltd',
  'idfc', 'idfcbank', 'idfcfirst',
  'bandhan', 'barodampay',
  'dbs', 'dlb',
  'equitas',
  'ujjivan',
  'abfspay', 'abbank',
  'nsdl', 'npst',
  'tapicici', 'ikwik',
  'abfspay', 'mahb',
  'kalupur', 'kvb',
  'tjsb', 'uco',
  'pingpay', 'slice',
  'waytogo', 'jiomoney',
  'naviaxis', 'jupiteraxis',
  'rarecash', 'timecosmos',
  'barodapay', 'birla',
  'upwardly', 'sahaj',
  'payzapp', 'oxymoney',
  'ikwik', 'upiroot',
]

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatCardNumber(val) {
  return val.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim()
}

function formatExpiry(val) {
  const digits = val.replace(/\D/g, '').slice(0, 4)
  if (digits.length >= 3) return digits.slice(0, 2) + '/' + digits.slice(2)
  if (digits.length === 2) return digits + '/'
  return digits
}

function isExpiryValid(val) {
  if (!val || val.length < 5) return false
  const [mmStr, yyStr] = val.split('/')
  const mm = parseInt(mmStr, 10)
  const yy = parseInt(yyStr, 10)
  if (isNaN(mm) || isNaN(yy)) return false
  if (mm < 1 || mm > 12) return false
  const now = new Date()
  const currentYear  = now.getFullYear() % 100  // last 2 digits
  const currentMonth = now.getMonth() + 1
  if (yy < currentYear) return false
  if (yy === currentYear && mm < currentMonth) return false
  // Sanity: don't accept cards expiring more than 20 years from now
  if (yy > currentYear + 20) return false
  return true
}

function isExpiryExpired(val) {
  if (!val || val.length < 5) return false
  const [mmStr, yyStr] = val.split('/')
  const mm = parseInt(mmStr, 10)
  const yy = parseInt(yyStr, 10)
  if (isNaN(mm) || isNaN(yy)) return false
  const now = new Date()
  const currentYear  = now.getFullYear() % 100
  const currentMonth = now.getMonth() + 1
  return yy < currentYear || (yy === currentYear && mm < currentMonth)
}

function getUpiError(id) {
  const trimmed = id.trim()
  if (!trimmed) return 'Please enter your UPI ID'

  // Must contain exactly one @
  const parts = trimmed.split('@')
  if (parts.length < 2) return 'UPI ID must contain @ — e.g. name@okaxis'
  if (parts.length > 2) return 'UPI ID must have only one @ symbol'

  const [username, handle] = parts

  // Username validations
  if (!username) return 'Enter the part before @ — e.g. yourname@okaxis'
  if (username.length < 3) return 'Username part must be at least 3 characters'
  if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
    return 'Username can only contain letters, numbers, dots, hyphens, and underscores'
  }

  // Handle validations
  if (!handle) return 'Enter a valid bank/wallet handle after @ — e.g. @okaxis'
  if (!/^[a-zA-Z]+$/.test(handle)) return 'Handle after @ should contain only letters — e.g. okaxis, paytm'

  const handleLower = handle.toLowerCase()
  if (!VALID_UPI_HANDLES.includes(handleLower)) {
    return `"@${handle}" is not a recognised UPI handle. Try handles like @okaxis, @paytm, @ybl, @oksbi, @hdfcbank`
  }

  return null // valid
}

// ── Validate all fields ───────────────────────────────────────────────────────
function validate(method, cardData, upiId) {
  const errs = {}

  if (method === 'card') {
    const rawNum = cardData.number.replace(/\s/g, '')

    if (!rawNum) {
      errs.number = 'Card number is required'
    } else if (!/^\d+$/.test(rawNum)) {
      errs.number = 'Card number must contain digits only'
    } else if (rawNum.length < 16) {
      errs.number = `Card number must be 16 digits — you've entered ${rawNum.length}`
    }

    if (!cardData.expiry) {
      errs.expiry = 'Expiry date is required'
    } else if (cardData.expiry.length < 5) {
      errs.expiry = 'Enter expiry in MM/YY format'
    } else {
      const [mmStr, yyStr] = cardData.expiry.split('/')
      const mm = parseInt(mmStr, 10)
      if (mm < 1 || mm > 12) {
        errs.expiry = 'Month must be between 01 and 12'
      } else if (isExpiryExpired(cardData.expiry)) {
        errs.expiry = 'This card has expired — please use a current card'
      } else if (!isExpiryValid(cardData.expiry)) {
        errs.expiry = 'Enter a valid expiry date (MM/YY)'
      }
    }

    if (!cardData.cvv) {
      errs.cvv = 'CVV is required'
    } else if (!/^\d+$/.test(cardData.cvv)) {
      errs.cvv = 'CVV must be digits only'
    } else if (cardData.cvv.length < 3) {
      errs.cvv = `CVV must be 3 digits — you've entered ${cardData.cvv.length}`
    }

    // Card holder name is optional — no validation needed
  }

  if (method === 'upi') {
    const upiError = getUpiError(upiId)
    if (upiError) errs.upi = upiError
  }

  return errs
}

// ─────────────────────────────────────────────────────────────────────────────

export default function PaymentModal({ feature, price, onSuccess, onClose }) {
  const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}')
  const [step,     setStep]     = useState('method')
  const [method,   setMethod]   = useState('card')
  const [cardData, setCardData] = useState({ number: '', expiry: '', cvv: '', name: '' })
  const [upiId,    setUpiId]    = useState('')
  const [errors,   setErrors]   = useState({})
  const [touched,  setTouched]  = useState({})

  function handleCardChange(field, value) {
    let formatted = value
    if (field === 'number') formatted = formatCardNumber(value)
    if (field === 'expiry') formatted = formatExpiry(value)
    if (field === 'cvv')    formatted = value.replace(/\D/g, '').slice(0, 3)
    setCardData(prev => ({ ...prev, [field]: formatted }))
    // Clear error on change
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: undefined }))
  }

  function handleUpiChange(val) {
    // Lowercase handle part, keep username as-is
    setUpiId(val)
    if (errors.upi) setErrors(prev => ({ ...prev, upi: undefined }))
  }

  function markTouched(field) {
    setTouched(prev => ({ ...prev, [field]: true }))
  }

  async function handlePay() {
    // Mark all fields as touched to show all errors
    const allFields = method === 'card'
      ? { number: true, expiry: true, cvv: true }
      : { upi: true }
    setTouched(allFields)

    const errs = validate(method, cardData, upiId)
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    setStep('processing')
    await new Promise(r => setTimeout(r, 2500))
    recordPayment({
      userId: currentUser.id,
      name:   currentUser.name,
      role:   currentUser.role,
      feature,
      amount: price,
      method: method === 'card' ? 'Card' : 'UPI',
    })
    setStep('success')
    const paymentId = `MOCK_${Date.now()}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`
    setTimeout(() => { onSuccess(paymentId, method === 'card' ? 'card' : 'upi', feature); onClose() }, 1800)
  }

  // Live inline UPI check as user types (after first touch)
  const upiLiveError = touched.upi ? getUpiError(upiId) : null

  return (
    <div style={s.overlay}>
      <div style={s.modal}>

        {step === 'method' && (
          <>
            <div style={s.modalHeader}>
              <div>
                <div style={s.lockIcon}>🔒</div>
                <h3 style={s.title}>Unlock {feature}</h3>
                <p style={s.sub}>One-time payment of <strong>₹{price}</strong></p>
              </div>
              <button style={s.closeBtn} onClick={onClose}>✕</button>
            </div>

            <div style={s.priceCard}>
              <div style={s.priceLabel}>Amount to pay</div>
              <div style={s.price}>₹{price}</div>
            </div>

            <div style={s.benefits}>
              {feature === 'Contact & Chat'    && ['View owner phone number', 'Send unlimited messages', 'Book visit directly'].map((b, i) => <div key={i} style={s.benefit}><span style={s.tick}>✓</span>{b}</div>)}
              {feature === 'AI Insights'       && ['Full compatibility breakdown', 'Detailed match analysis', 'AI roommate suggestions'].map((b, i) => <div key={i} style={s.benefit}><span style={s.tick}>✓</span>{b}</div>)}
              {feature === 'Agreement PDF'     && ['Generate rental agreement', 'Download as PDF', 'Legally valid template'].map((b, i) => <div key={i} style={s.benefit}><span style={s.tick}>✓</span>{b}</div>)}
              {feature === 'Listing Boost'     && ['Top placement in search', 'Featured badge on listing', 'More visibility for 7 days'].map((b, i) => <div key={i} style={s.benefit}><span style={s.tick}>✓</span>{b}</div>)}
              {feature === 'Premium Listings'  && ['Post unlimited listings', 'Priority support', 'Analytics dashboard'].map((b, i) => <div key={i} style={s.benefit}><span style={s.tick}>✓</span>{b}</div>)}
              {feature === 'Owner Premium Chat'&& ['Unlimited chat replies', 'Priority visibility', 'Verified owner badge'].map((b, i) => <div key={i} style={s.benefit}><span style={s.tick}>✓</span>{b}</div>)}
            </div>

            {/* Payment Method Tabs */}
            <div style={s.methodRow}>
              {['card', 'upi'].map(m => (
                <div
                  key={m}
                  style={{ ...s.methodBtn, ...(method === m ? s.methodBtnOn : {}) }}
                  onClick={() => { setMethod(m); setErrors({}); setTouched({}) }}
                >
                  <span style={{ fontSize: '18px' }}>{m === 'card' ? '💳' : '📱'}</span>
                  <span style={s.methodLabel}>{m === 'card' ? 'Card' : 'UPI'}</span>
                </div>
              ))}
            </div>

            {/* ── Card Form ── */}
            {method === 'card' && (
              <div style={s.cardForm}>

                {/* Card Number */}
                <div style={s.field}>
                  <label style={s.label}>Card Number <span style={s.req}>*</span></label>
                  <div style={s.inputWrap}>
                    <input
                      style={{ ...s.input, ...(touched.number && errors.number ? s.inputError : touched.number && !errors.number && cardData.number.replace(/\s/g,'').length === 16 ? s.inputOk : {}) }}
                      placeholder="1234 5678 9012 3456"
                      value={cardData.number}
                      onChange={e => handleCardChange('number', e.target.value)}
                      onBlur={() => {
                        markTouched('number')
                        const errs = validate(method, cardData, upiId)
                        setErrors(prev => ({ ...prev, number: errs.number }))
                      }}
                      maxLength={19}
                      inputMode="numeric"
                    />
                    {touched.number && !errors.number && cardData.number.replace(/\s/g,'').length === 16 && (
                      <span style={s.checkMark}>✓</span>
                    )}
                  </div>
                  {touched.number && errors.number && <div style={s.error}>⚠ {errors.number}</div>}
                  {cardData.number && <div style={s.charCount}>{cardData.number.replace(/\s/g,'').length}/16 digits</div>}
                </div>

                {/* Expiry + CVV */}
                <div style={s.row2}>
                  <div style={s.field}>
                    <label style={s.label}>Expiry Date <span style={s.req}>*</span></label>
                    <input
                      style={{ ...s.input, ...(touched.expiry && errors.expiry ? s.inputError : touched.expiry && !errors.expiry && cardData.expiry.length === 5 ? s.inputOk : {}) }}
                      placeholder="MM/YY"
                      value={cardData.expiry}
                      onChange={e => handleCardChange('expiry', e.target.value)}
                      onBlur={() => {
                        markTouched('expiry')
                        const errs = validate(method, cardData, upiId)
                        setErrors(prev => ({ ...prev, expiry: errs.expiry }))
                      }}
                      maxLength={5}
                      inputMode="numeric"
                    />
                    {touched.expiry && errors.expiry && (
                      <div style={{ ...s.error, ...(isExpiryExpired(cardData.expiry) ? s.errorExpired : {}) }}>
                        {isExpiryExpired(cardData.expiry) ? '🚫' : '⚠'} {errors.expiry}
                      </div>
                    )}
                  </div>
                  <div style={s.field}>
                    <label style={s.label}>CVV <span style={s.req}>*</span></label>
                    <input
                      style={{ ...s.input, ...(touched.cvv && errors.cvv ? s.inputError : touched.cvv && !errors.cvv && cardData.cvv.length === 3 ? s.inputOk : {}) }}
                      placeholder="123"
                      type="password"
                      value={cardData.cvv}
                      onChange={e => handleCardChange('cvv', e.target.value)}
                      onBlur={() => {
                        markTouched('cvv')
                        const errs = validate(method, cardData, upiId)
                        setErrors(prev => ({ ...prev, cvv: errs.cvv }))
                      }}
                      maxLength={3}
                      inputMode="numeric"
                    />
                    {touched.cvv && errors.cvv && <div style={s.error}>⚠ {errors.cvv}</div>}
                  </div>
                </div>

                {/* Card Holder Name — Optional */}
                <div style={s.field}>
                  <label style={s.label}>
                    Card Holder Name
                    <span style={s.optionalTag}> (optional)</span>
                  </label>
                  <input
                    style={s.input}
                    placeholder="Name on card"
                    value={cardData.name}
                    onChange={e => setCardData(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>

              </div>
            )}

            {/* ── UPI Form ── */}
            {method === 'upi' && (
              <div style={s.cardForm}>
                <div style={s.field}>
                  <label style={s.label}>UPI ID <span style={s.req}>*</span></label>
                  <div style={s.inputWrap}>
                    <input
                      style={{
                        ...s.input,
                        ...(touched.upi && upiLiveError  ? s.inputError : {}),
                        ...(touched.upi && !upiLiveError && upiId.includes('@') ? s.inputOk : {}),
                      }}
                      placeholder="yourname@okaxis"
                      value={upiId}
                      onChange={e => handleUpiChange(e.target.value)}
                      onBlur={() => markTouched('upi')}
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                    {touched.upi && !upiLiveError && upiId.includes('@') && (
                      <span style={s.checkMark}>✓</span>
                    )}
                  </div>

                  {/* Live error */}
                  {touched.upi && upiLiveError && (
                    <div style={s.error}>⚠ {upiLiveError}</div>
                  )}

                  {/* Valid indicator */}
                  {touched.upi && !upiLiveError && upiId.includes('@') && (
                    <div style={s.upiValid}>✓ Valid UPI ID format</div>
                  )}

                  <div style={s.upiNote}>
                    Accepted formats: name@okaxis, number@paytm, user@ybl, id@oksbi
                  </div>

                  {/* UPI handle examples */}
                  <div style={s.upiChips}>
                    {['@okaxis', '@paytm', '@ybl', '@oksbi', '@hdfcbank', '@ibl'].map(h => (
                      <span
                        key={h}
                        style={s.chip}
                        onClick={() => {
                          const base = upiId.includes('@') ? upiId.split('@')[0] : upiId
                          if (base) {
                            setUpiId(base + h)
                            setErrors(prev => ({ ...prev, upi: undefined }))
                          }
                        }}
                      >{h}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div style={s.btnRow}>
              <button style={s.cancelBtn} onClick={onClose}>Cancel</button>
              <button style={s.payBtn} onClick={handlePay}>Pay ₹{price} →</button>
            </div>
          </>
        )}

        {step === 'processing' && (
          <div style={s.center}>
            <div style={s.processingAnim}>⏳</div>
            <div style={s.processingTitle}>Processing Payment...</div>
            <div style={s.processingBar}><div style={s.processingFill} /></div>
            <div style={s.processingSub}>Please do not close this window</div>
          </div>
        )}

        {step === 'success' && (
          <div style={s.center}>
            <div style={s.successCircle}>✓</div>
            <div style={s.successTitle}>Payment Successful!</div>
            <div style={s.successAmt}>₹{price} paid</div>
            <div style={s.successSub}>{feature} has been unlocked</div>
          </div>
        )}

      </div>
    </div>
  )
}

const s = {
  overlay:        { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 },
  modal:          { background: '#fff', borderRadius: '20px', padding: '28px', width: '100%', maxWidth: '420px', maxHeight: '90vh', overflowY: 'auto' },
  modalHeader:    { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' },
  lockIcon:       { fontSize: '28px', marginBottom: '8px' },
  title:          { fontSize: '20px', fontWeight: '800', color: '#111', marginBottom: '4px', letterSpacing: '-0.5px' },
  sub:            { fontSize: '14px', color: '#666' },
  closeBtn:       { background: 'none', border: '1.5px solid #e5e7eb', borderRadius: '8px', padding: '6px 12px', fontSize: '14px', cursor: 'pointer', color: '#555', flexShrink: 0 },
  priceCard:      { background: '#0a0a0a', borderRadius: '12px', padding: '16px 20px', marginBottom: '16px' },
  priceLabel:     { fontSize: '12px', color: '#888', marginBottom: '4px' },
  price:          { fontSize: '32px', fontWeight: '800', color: 'white', letterSpacing: '-1px', marginBottom: '4px' },
  priceNote:      { fontSize: '11px', color: '#555' },
  benefits:       { display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '18px' },
  benefit:        { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#374151' },
  tick:           { color: '#10b981', fontWeight: '700' },
  methodRow:      { display: 'flex', gap: '10px', marginBottom: '18px' },
  methodBtn:      { flex: 1, padding: '12px', border: '1.5px solid #e5e7eb', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer', background: 'white' },
  methodBtnOn:    { border: '1.5px solid #111', background: '#f5f5f5' },
  methodLabel:    { fontSize: '13px', fontWeight: '600', color: '#111' },
  cardForm:       { marginBottom: '16px' },
  field:          { marginBottom: '12px' },
  row2:           { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },
  label:          { display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '5px' },
  req:            { color: '#ef4444' },
  optionalTag:    { fontWeight: '400', color: '#9ca3af', fontSize: '11px' },
  inputWrap:      { position: 'relative' },
  input:          { width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1.5px solid #e5e7eb', fontSize: '14px', outline: 'none', boxSizing: 'border-box', color: '#111', transition: 'border-color 0.15s' },
  inputError:     { borderColor: '#fca5a5', background: '#fff5f5' },
  inputOk:        { borderColor: '#6ee7b7', background: '#f0fdf4' },
  checkMark:      { position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#10b981', fontWeight: '700', fontSize: '14px' },
  error:          { fontSize: '11px', color: '#dc2626', marginTop: '4px', lineHeight: '1.4' },
  errorExpired:   { color: '#b91c1c', fontWeight: '600' },
  charCount:      { fontSize: '10px', color: '#9ca3af', marginTop: '3px', textAlign: 'right' },
  upiValid:       { fontSize: '11px', color: '#059669', marginTop: '4px', fontWeight: '600' },
  upiNote:        { fontSize: '11px', color: '#9ca3af', marginTop: '6px', lineHeight: '1.5' },
  upiChips:       { display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' },
  chip:           { fontSize: '11px', padding: '3px 8px', borderRadius: '20px', border: '1px solid #e5e7eb', background: '#f9fafb', color: '#374151', cursor: 'pointer', userSelect: 'none' },
  btnRow:         { display: 'flex', gap: '10px', marginTop: '4px' },
  cancelBtn:      { flex: 1, padding: '13px', background: 'white', color: '#111', border: '1.5px solid #e5e7eb', borderRadius: '10px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' },
  payBtn:         { flex: 2, padding: '13px', background: '#111', color: 'white', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', cursor: 'pointer' },
  center:         { textAlign: 'center', padding: '32px 20px' },
  processingAnim: { fontSize: '48px', marginBottom: '16px' },
  processingTitle:{ fontSize: '18px', fontWeight: '700', color: '#111', marginBottom: '16px' },
  processingBar:  { height: '4px', background: '#f0f0f0', borderRadius: '2px', marginBottom: '12px', overflow: 'hidden' },
  processingFill: { height: '4px', background: '#111', borderRadius: '2px', width: '70%' },
  processingSub:  { fontSize: '13px', color: '#aaa' },
  successCircle:  { width: '64px', height: '64px', borderRadius: '50%', background: '#111', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', fontWeight: '700', margin: '0 auto 16px' },
  successTitle:   { fontSize: '22px', fontWeight: '800', color: '#111', marginBottom: '6px', letterSpacing: '-0.5px' },
  successAmt:     { fontSize: '16px', fontWeight: '700', color: '#10b981', marginBottom: '6px' },
  successSub:     { fontSize: '14px', color: '#888' },
}