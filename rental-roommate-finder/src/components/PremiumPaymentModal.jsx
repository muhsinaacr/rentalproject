// src/components/PremiumPaymentModal.jsx

import { useState } from 'react'
import { api } from '../utils/api'

const PLAN = {
  amount: 129,
  days:   28,
  label:  'Premium — Unlimited Listings',
}

export default function PremiumPaymentModal({ onClose, onSuccess }) {
  const [step, setStep]       = useState('choose')   // 'choose' | 'details' | 'paying' | 'success' | 'error'
  const [method, setMethod]   = useState('upi')
  const [errorMsg, setErrorMsg] = useState('')

  // Card fields
  const [cardData, setCardData] = useState({ number: '', expiry: '', cvv: '', name: '' })
  // UPI field
  const [upiId, setUpiId] = useState('')
  // Validation errors
  const [errors, setErrors] = useState({})

  function formatCardNumber(val) {
    return val.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim()
  }

  function formatExpiry(val) {
    const clean = val.replace(/\D/g, '').slice(0, 4)
    return clean.length >= 3 ? clean.slice(0, 2) + '/' + clean.slice(2) : clean
  }

  function validate() {
    const errs = {}
    if (method === 'card') {
      if (cardData.number.replace(/\s/g, '').length < 16) errs.number = 'Enter valid 16-digit card number'
      if (cardData.expiry.length < 5) errs.expiry = 'Enter valid expiry (MM/YY)'
      if (cardData.cvv.length < 3) errs.cvv = 'Enter valid CVV'
      if (!cardData.name.trim()) errs.name = 'Enter card holder name'
    }
    if (method === 'upi') {
      if (!upiId.includes('@') || upiId.trim().length < 5) errs.upi = 'Enter valid UPI ID (e.g. name@okaxis)'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handlePay() {
    if (!validate()) return
    setStep('paying')
    try {
      await api.activateMockPremium()
      setStep('success')
    } catch (err) {
      setErrorMsg(err.message || 'Payment failed. Please try again.')
      setStep('error')
    }
  }

  return (
    <div style={m.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={m.modal}>

        {/* ── Step 1: Choose Method ── */}
        {step === 'choose' && (
          <>
            <div style={m.header}>
              <div style={m.starIcon}>⭐</div>
              <h2 style={m.title}>Upgrade to Premium</h2>
              <p style={m.subtitle}>Post unlimited listings for 28 days</p>
              <button style={m.closeBtn} onClick={onClose}>✕</button>
            </div>

            <div style={m.planCard}>
              <div style={m.planRow}>
                <span style={m.planName}>{PLAN.label}</span>
                <span style={m.planPrice}>₹{PLAN.amount}</span>
              </div>
              <div style={m.planMeta}>Valid for {PLAN.days} days · No auto-renewal</div>
            </div>

            <ul style={m.featureList}>
              {[
                '✅ Unlimited listings (free plan: max 3)',
                '✅ Priority placement in search results',
                '✅ Listing boost available',
                '✅ Valid for 28 days from activation',
              ].map(f => <li key={f} style={m.featureItem}>{f}</li>)}
            </ul>

            <p style={m.sectionLabel}>Choose Payment Method</p>
            <div style={m.methodRow}>
              {['upi', 'card'].map(mt => (
                <button
                  key={mt}
                  style={{ ...m.methodBtn, ...(method === mt ? m.methodBtnOn : {}) }}
                  onClick={() => setMethod(mt)}
                >
                  {mt === 'upi' ? '📱 UPI' : '💳 Card'}
                </button>
              ))}
            </div>

            <p style={m.methodNote}>
              {method === 'upi'
                ? 'Google Pay, PhonePe, Paytm, any UPI app'
                : 'Visa, Mastercard, RuPay Debit / Credit'}
            </p>

            <button style={m.payBtn} onClick={() => setStep('details')}>
              Continue →
            </button>
          </>
        )}

        {/* ── Step 2: Enter Payment Details ── */}
        {step === 'details' && (
          <>
            <div style={m.header}>
              <button style={m.backBtn} onClick={() => { setErrors({}); setStep('choose') }}>← Back</button>
              <h2 style={m.title}>{method === 'upi' ? '📱 UPI Payment' : '💳 Card Payment'}</h2>
              <p style={m.subtitle}>Amount: <strong>₹{PLAN.amount}</strong></p>
              <button style={m.closeBtn} onClick={onClose}>✕</button>
            </div>

            {/* UPI Fields */}
            {method === 'upi' && (
              <div style={m.form}>
                <div style={m.field}>
                  <label style={m.label}>UPI ID</label>
                  <input
                    style={{ ...m.input, ...(errors.upi ? m.inputError : {}) }}
                    placeholder="yourname@okaxis / 9999999999@paytm"
                    value={upiId}
                    onChange={e => setUpiId(e.target.value)}
                  />
                  {errors.upi && <div style={m.error}>{errors.upi}</div>}
                  <div style={m.hint}>Enter your UPI ID linked to Google Pay, PhonePe, Paytm etc.</div>
                </div>

                <div style={m.upiApps}>
                  {['Google Pay', 'PhonePe', 'Paytm', 'BHIM'].map(app => (
                    <div key={app} style={m.upiAppTag}>{app}</div>
                  ))}
                </div>
              </div>
            )}

            {/* Card Fields */}
            {method === 'card' && (
              <div style={m.form}>
                <div style={m.field}>
                  <label style={m.label}>Card Number</label>
                  <input
                    style={{ ...m.input, ...(errors.number ? m.inputError : {}) }}
                    placeholder="1234 5678 9012 3456"
                    value={cardData.number}
                    onChange={e => setCardData({ ...cardData, number: formatCardNumber(e.target.value) })}
                    maxLength={19}
                  />
                  {errors.number && <div style={m.error}>{errors.number}</div>}
                </div>

                <div style={m.row2}>
                  <div style={m.field}>
                    <label style={m.label}>Expiry Date</label>
                    <input
                      style={{ ...m.input, ...(errors.expiry ? m.inputError : {}) }}
                      placeholder="MM/YY"
                      value={cardData.expiry}
                      onChange={e => setCardData({ ...cardData, expiry: formatExpiry(e.target.value) })}
                      maxLength={5}
                    />
                    {errors.expiry && <div style={m.error}>{errors.expiry}</div>}
                  </div>
                  <div style={m.field}>
                    <label style={m.label}>CVV</label>
                    <input
                      style={{ ...m.input, ...(errors.cvv ? m.inputError : {}) }}
                      placeholder="123"
                      type="password"
                      value={cardData.cvv}
                      onChange={e => setCardData({ ...cardData, cvv: e.target.value.replace(/\D/g, '').slice(0, 3) })}
                      maxLength={3}
                    />
                    {errors.cvv && <div style={m.error}>{errors.cvv}</div>}
                  </div>
                </div>

                <div style={m.field}>
                  <label style={m.label}>Card Holder Name</label>
                  <input
                    style={{ ...m.input, ...(errors.name ? m.inputError : {}) }}
                    placeholder="Name as on card"
                    value={cardData.name}
                    onChange={e => setCardData({ ...cardData, name: e.target.value })}
                  />
                  {errors.name && <div style={m.error}>{errors.name}</div>}
                </div>
              </div>
            )}

            <div style={m.summary}>
              <span style={m.summaryLabel}>Total Payable</span>
              <span style={m.summaryAmt}>₹{PLAN.amount}</span>
            </div>

            <button style={m.payBtn} onClick={handlePay}>
              Pay ₹{PLAN.amount} →
            </button>
            <p style={m.mockNote}>🔧 Dev mode: payment is simulated. No real charge.</p>
          </>
        )}

        {/* ── Step 3: Processing ── */}
        {step === 'paying' && (
          <div style={m.resultBox}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏳</div>
            <h3 style={m.resultTitle}>Processing Payment...</h3>
            <div style={m.progressBar}><div style={m.progressFill} /></div>
            <p style={m.resultSub}>Please do not close this window</p>
          </div>
        )}

        {/* ── Step 4: Success ── */}
        {step === 'success' && (
          <div style={m.resultBox}>
            <div style={m.successCircle}>✓</div>
            <h3 style={m.resultTitle}>Payment Successful!</h3>
            <p style={m.successAmt}>₹{PLAN.amount} paid via {method === 'upi' ? 'UPI' : 'Card'}</p>
            <p style={m.resultSub}>Premium activated for 28 days. You can now post unlimited listings.</p>
            <button style={m.payBtn} onClick={onSuccess}>Continue →</button>
          </div>
        )}

        {/* ── Error ── */}
        {step === 'error' && (
          <div style={m.resultBox}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>❌</div>
            <h3 style={m.resultTitle}>Payment Failed</h3>
            <p style={m.resultSub}>{errorMsg}</p>
            <button style={m.payBtn} onClick={() => setStep('details')}>Try Again</button>
          </div>
        )}

      </div>
    </div>
  )
}

const m = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '20px' },
  modal: { background: 'white', borderRadius: '20px', padding: '28px', width: '100%', maxWidth: '420px', position: 'relative', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' },

  header: { textAlign: 'center', marginBottom: '20px', position: 'relative' },
  starIcon: { fontSize: '36px', marginBottom: '8px' },
  title: { fontSize: '20px', fontWeight: '800', color: '#111', margin: '0 0 4px' },
  subtitle: { fontSize: '14px', color: '#888', margin: 0 },
  closeBtn: { position: 'absolute', top: '-4px', right: '-4px', background: '#f5f5f5', border: 'none', borderRadius: '50%', width: '30px', height: '30px', fontSize: '13px', cursor: 'pointer' },
  backBtn: { position: 'absolute', top: '-4px', left: '-4px', background: '#f5f5f5', border: 'none', borderRadius: '8px', padding: '4px 10px', fontSize: '12px', cursor: 'pointer', color: '#555', fontWeight: '600' },

  planCard: { background: '#f5f5ff', border: '1.5px solid #e0e0ff', borderRadius: '12px', padding: '14px 16px', marginBottom: '14px' },
  planRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' },
  planName: { fontSize: '13px', fontWeight: '700', color: '#111' },
  planPrice: { fontSize: '22px', fontWeight: '900', color: '#534AB7' },
  planMeta: { fontSize: '12px', color: '#888' },

  featureList: { listStyle: 'none', padding: 0, margin: '0 0 18px', display: 'flex', flexDirection: 'column', gap: '6px' },
  featureItem: { fontSize: '13px', color: '#374151' },

  sectionLabel: { fontSize: '12px', fontWeight: '700', color: '#374151', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' },
  methodRow: { display: 'flex', gap: '10px', marginBottom: '10px' },
  methodBtn: { flex: 1, padding: '11px', border: '1.5px solid #e5e7eb', borderRadius: '10px', background: 'white', fontSize: '13px', fontWeight: '600', cursor: 'pointer', color: '#555' },
  methodBtnOn: { background: '#111', color: 'white', borderColor: '#111' },
  methodNote: { fontSize: '12px', color: '#aaa', textAlign: 'center', margin: '0 0 18px' },

  form: { marginBottom: '16px' },
  field: { marginBottom: '12px' },
  row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },
  label: { display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '5px' },
  input: { width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1.5px solid #e5e7eb', fontSize: '14px', outline: 'none', boxSizing: 'border-box', color: '#111' },
  inputError: { border: '1.5px solid #fca5a5' },
  error: { fontSize: '11px', color: '#cc0000', marginTop: '4px' },
  hint: { fontSize: '11px', color: '#aaa', marginTop: '5px' },

  upiApps: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' },
  upiAppTag: { fontSize: '11px', background: '#f5f5f5', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '4px 10px', color: '#555', fontWeight: '500' },

  summary: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f9f9f9', borderRadius: '10px', padding: '12px 16px', marginBottom: '14px' },
  summaryLabel: { fontSize: '13px', fontWeight: '600', color: '#555' },
  summaryAmt: { fontSize: '18px', fontWeight: '800', color: '#111' },

  payBtn: { width: '100%', padding: '14px', background: '#111', color: 'white', border: 'none', borderRadius: '12px', fontSize: '15px', fontWeight: '700', cursor: 'pointer', marginBottom: '8px' },
  mockNote: { fontSize: '11px', color: '#bbb', textAlign: 'center', margin: '4px 0 0' },

  resultBox: { textAlign: 'center', padding: '24px 10px' },
  resultTitle: { fontSize: '20px', fontWeight: '800', color: '#111', marginBottom: '8px' },
  resultSub: { fontSize: '14px', color: '#888', marginBottom: '20px' },
  successCircle: { width: '64px', height: '64px', borderRadius: '50%', background: '#10b981', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', fontWeight: '700', margin: '0 auto 16px' },
  successAmt: { fontSize: '15px', fontWeight: '700', color: '#10b981', marginBottom: '8px' },

  progressBar: { height: '4px', background: '#f0f0f0', borderRadius: '2px', margin: '16px 0 12px', overflow: 'hidden' },
  progressFill: { height: '4px', background: '#111', borderRadius: '2px', width: '75%', transition: 'width 2.5s ease' },
}