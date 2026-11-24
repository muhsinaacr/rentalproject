import { useTheme } from '../context/ThemeContext'
import { useState } from 'react'
import jsPDF from 'jspdf'
import PaymentModal from '../components/PaymentModal'
import { recordPayment } from '../utils/payments'
import { api } from '../utils/api'

// Defined outside AgreementGenerator so React never remounts it on re-render,
// which would cause inputs to lose focus after every keystroke.
function Field({ name, label, type = 'text', placeholder, options, form, onChange, error, min, max }) {
  return (
    <div style={s.field}>
      <label style={s.label}>{label}</label>
      {options ? (
        <select style={{ ...s.input, ...(error ? s.inputError : {}) }} name={name} value={form[name]} onChange={onChange}>
          {options.map(o => <option key={o}>{o}</option>)}
        </select>
      ) : (
        <input
          style={{ ...s.input, ...(error ? s.inputError : {}) }}
          type={type} name={name} placeholder={placeholder}
          value={form[name]} onChange={onChange}
          min={min} max={max}
        />
      )}
      {error && <div style={s.fieldError}>⚠️ {error}</div>}
    </div>
  )
}

export default function AgreementGenerator() {
  const { isDark } = useTheme()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [generated, setGenerated] = useState(false)
  const [isPaid, setIsPaid] = useState(false)
  const [showPayment, setShowPayment] = useState(false)
  const [errors, setErrors] = useState({})

  const [form, setForm] = useState({
    ownerName: '', ownerPhone: '', ownerAddress: '',
    tenantName: '', tenantPhone: '', tenantAddress: '',
    propertyAddress: '', propertyType: 'Apartment', rentAmount: '', advanceAmount: '',
    startDate: '', duration: '11 months', maintenanceCharges: '',
    noticePeriod: '1 month', furnished: 'Fully Furnished',
    restrictions: '', additionalClauses: ''
  })

  function handleChange(e) { setForm({ ...form, [e.target.name]: e.target.value }) }

  // ── today & max date helpers ──────────────────────────────────────────────
  function todayStr() {
    return new Date().toISOString().split('T')[0]
  }
  function maxDateStr() {
    const d = new Date()
    d.setMonth(d.getMonth() + 3)
    return d.toISOString().split('T')[0]
  }

  // ── Step 1 validation ─────────────────────────────────────────────────────
  function validateStep1() {
    const e = {}
    const nameRe = /^[a-zA-Z\s.'-]{2,}$/
    if (!form.ownerName.trim())            e.ownerName    = 'Owner name is required'
    else if (!nameRe.test(form.ownerName)) e.ownerName    = 'Name cannot contain numbers or special characters'
    if (!form.ownerPhone.trim())           e.ownerPhone   = 'Owner phone is required'
    else if (!/^[6-9]\d{9}$/.test(form.ownerPhone.trim())) e.ownerPhone = 'Enter a valid 10-digit Indian mobile number'
    if (!form.ownerAddress.trim())         e.ownerAddress = 'Owner address is required'
    else if (form.ownerAddress.trim().length < 30) e.ownerAddress = `Address too short — at least 30 characters (${form.ownerAddress.trim().length}/30)`

    if (!form.tenantName.trim())             e.tenantName    = 'Tenant name is required'
    else if (!nameRe.test(form.tenantName))  e.tenantName    = 'Name cannot contain numbers or special characters'
    if (!form.tenantPhone.trim())            e.tenantPhone   = 'Tenant phone is required'
    else if (!/^[6-9]\d{9}$/.test(form.tenantPhone.trim())) e.tenantPhone = 'Enter a valid 10-digit Indian mobile number'
    if (!form.tenantAddress.trim())          e.tenantAddress = 'Tenant address is required'
    else if (form.tenantAddress.trim().length < 30) e.tenantAddress = `Address too short — at least 30 characters (${form.tenantAddress.trim().length}/30)`

    setErrors(e)
    return Object.keys(e).length === 0
  }

  // ── Step 2 validation ─────────────────────────────────────────────────────
  function validateStep2() {
    const e = {}
    const rent = Number(form.rentAmount)
    const deposit = Number(form.advanceAmount)
    const maintenance = Number(form.maintenanceCharges || 0)

    if (!form.propertyType) e.propertyType = 'Please select a property type'

    if (!form.propertyAddress.trim()) e.propertyAddress = 'Property address is required'
    else if (form.propertyAddress.trim().length < 30) e.propertyAddress = `Address too short — at least 30 characters (${form.propertyAddress.trim().length}/30)`

    if (!form.rentAmount) e.rentAmount = 'Monthly rent is required'
    else if (isNaN(rent) || rent < 500) e.rentAmount = 'Rent must be at least ₹500/month'

    if (!form.advanceAmount) e.advanceAmount = 'Security deposit is required'
    else if (deposit < rent) e.advanceAmount = 'Security deposit must be at least 1 month’s rent'
    else if (deposit > rent * 3) e.advanceAmount = 'Security deposit cannot exceed 3 months’ rent'

    if (form.maintenanceCharges && maintenance > 0) {
      const maxMaint = Math.round(rent * 0.05)
      if (maintenance > maxMaint) e.maintenanceCharges = `Maintenance exceeds 5% of rent — max allowed is ₹${maxMaint.toLocaleString()}`
    }

    if (!form.startDate) e.startDate = 'Start date is required'
    else {
      const today = todayStr()
      const maxD  = maxDateStr()
      if (form.startDate < today) e.startDate = 'Start date cannot be in the past'
      else if (form.startDate > maxD) e.startDate = 'Start date cannot be more than 3 months from today'
    }

    setErrors(e)
    return Object.keys(e).length === 0
  }


  async function generateAgreement() {
    setLoading(true)
    await new Promise(r => setTimeout(r, 1500))
    setLoading(false)
    setGenerated(true)
    setStep(3)
  }

  function downloadAgreement() {
    const doc = new jsPDF()
    const pageW = doc.internal.pageSize.getWidth()
    let y = 20

    // Header
    doc.setFillColor(10, 10, 10)
    doc.rect(0, 0, pageW, 45, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.text('RENTAL AGREEMENT', pageW / 2, 18, { align: 'center' })
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(170, 170, 170)
    doc.text('Generated by RentMate AI Platform', pageW / 2, 28, { align: 'center' })
    doc.text(`Date: ${form.startDate || new Date().toLocaleDateString('en-IN')}`, pageW / 2, 38, { align: 'center' })

    y = 60

    // Paid badge
    doc.setFillColor(240, 253, 244)
    doc.roundedRect(14, y, pageW - 28, 14, 3, 3, 'F')
    doc.setTextColor(22, 101, 52)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('✓ PAID AGREEMENT — RentMate AI Verified', pageW / 2, y + 9, { align: 'center' })
    y += 24

    const section = (title) => {
      doc.setFillColor(245, 245, 245)
      doc.rect(14, y, pageW - 28, 10, 'F')
      doc.setTextColor(17, 17, 17)
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.text(title, 18, y + 7)
      y += 16
    }

    const row = (label, value) => {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(100, 100, 100)
      doc.text(label + ':', 18, y)
      doc.setTextColor(17, 17, 17)
      doc.setFont('helvetica', 'bold')
      doc.text(value || '—', 80, y)
      y += 8
    }

    section('LANDLORD / OWNER DETAILS')
    row('Name', form.ownerName)
    row('Phone', form.ownerPhone)
    row('Address', form.ownerAddress)
    y += 4

    section('TENANT DETAILS')
    row('Name', form.tenantName)
    row('Phone', form.tenantPhone)
    row('Address', form.tenantAddress)
    y += 4

    section('PROPERTY DETAILS')
    row('Address', form.propertyAddress)
    row('Property Type', form.propertyType)
    row('Furnishing', form.furnished)
    row('Duration', form.duration)
    row('Start Date', form.startDate)
    y += 4

    section('FINANCIAL TERMS')
    row('Monthly Rent', `Rs. ${Number(form.rentAmount || 0).toLocaleString()}`)
    row('Security Deposit', `Rs. ${Number(form.advanceAmount || 0).toLocaleString()}`)
    row('Maintenance', `Rs. ${Number(form.maintenanceCharges || 0).toLocaleString()}/month`)
    row('Notice Period', form.noticePeriod)
    y += 4

    if (y > 220) { doc.addPage(); y = 20 }

    section('TERMS & CONDITIONS')
    // Build terms dynamically so numbering always stays correct
    const termsArr = [
      '1. Rent must be paid on or before the 5th of every month.',
      '2. Security deposit will be refunded on vacating, subject to deductions.',
      `3. Agreement is valid for ${form.duration} from the start date.`,
      `4. Either party must give ${form.noticePeriod} notice before terminating.`,
      '5. Tenant shall maintain the property in good condition.',
      '6. Tenant shall pay all utility bills separately.',
    ]
    if (form.restrictions?.trim()) {
      termsArr.push(`${termsArr.length + 1}. Restrictions: ${form.restrictions.trim()}`)
    } else {
      termsArr.push(`${termsArr.length + 1}. Standard restrictions apply as per local laws.`)
    }
    if (form.additionalClauses?.trim()) {
      // Split by newline so each clause gets its own numbered item
      form.additionalClauses.trim().split(/\n+/).filter(Boolean).forEach(clause => {
        termsArr.push(`${termsArr.length + 1}. ${clause.trim()}`)
      })
    }
    const terms = termsArr
    terms.forEach(t => {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(80, 80, 80)
      const lines = doc.splitTextToSize(t, pageW - 36)
      doc.text(lines, 18, y)
      y += lines.length * 6 + 2
    })

    y += 10
    section('SIGNATURES')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(100, 100, 100)
    doc.text('Owner Signature: _______________________', 18, y + 8)
    doc.text('Date: ______________', 140, y + 8)
    doc.text(`Name: ${form.ownerName || ''}`, 18, y + 16)
    y += 28
    doc.text('Tenant Signature: ______________________', 18, y + 8)
    doc.text('Date: ______________', 140, y + 8)
    doc.text(`Name: ${form.tenantName || ''}`, 18, y + 16)
    y += 28
    doc.text('Witness 1: _____________________________', 18, y + 8)
    doc.text('Witness 2: _____________________________', 18, y + 20)

    // Footer
    const footerY = doc.internal.pageSize.getHeight() - 12
    doc.setFillColor(10, 10, 10)
    doc.rect(0, footerY - 4, pageW, 16, 'F')
    doc.setTextColor(170, 170, 170)
    doc.setFontSize(8)
    doc.text('RentMate AI · Generated Agreement · Legally valid template', pageW / 2, footerY + 4, { align: 'center' })

    doc.save(`rental_agreement_${form.tenantName || 'tenant'}_${new Date().toISOString().split('T')[0]}.pdf`)
  }

  return (
    <div style={s.page}>
      <div style={s.topbar}>
        <div>
          <h2 style={s.title}>Agreement Generator</h2>
          <p style={s.sub}>Generate a professional rental agreement in seconds</p>
        </div>
      </div>

      <div style={s.content}>
        {/* Steps */}
        <div style={s.steps}>
          {['Owner & Tenant Details', 'Property & Financial Terms', 'Generated Agreement'].map((label, i) => (
            <div key={i} style={s.stepItem}>
              <div style={{ ...s.stepCircle, ...(step > i + 1 ? s.stepDone : step === i + 1 ? s.stepActive : {}) }}>
                {step > i + 1 ? '✓' : i + 1}
              </div>
              <span style={{ ...s.stepLabel, ...(step === i + 1 ? s.stepLabelActive : {}) }}>{label}</span>
              {i < 2 && <div style={{ ...s.stepLine, ...(step > i + 1 ? s.stepLineDone : {}) }} />}
            </div>
          ))}
        </div>

        <div style={s.grid}>
          {/* Form */}
          <div style={s.formCard}>
            {step === 1 && (
              <>
                <h3 style={s.cardTitle}>Owner Details</h3>
                <div style={s.grid2}>
                  <Field name="ownerName" error={errors.ownerName} label="Owner Full Name" placeholder="e.g. Rahul Menon" form={form} onChange={handleChange} />
                  <Field name="ownerPhone" error={errors.ownerPhone} label="Owner Phone" placeholder="e.g. 9876543210" form={form} onChange={handleChange} />
                </div>
                <Field name="ownerAddress" error={errors.ownerAddress} label="Owner Permanent Address" placeholder="Full address" form={form} onChange={handleChange} />

                <h3 style={{ ...s.cardTitle, marginTop: '20px' }}>Tenant Details</h3>
                <div style={s.grid2}>
                  <Field name="tenantName" error={errors.tenantName} label="Tenant Full Name" placeholder="e.g. Arjun P S" form={form} onChange={handleChange} />
                  <Field name="tenantPhone" error={errors.tenantPhone} label="Tenant Phone" placeholder="e.g. 9876543210" form={form} onChange={handleChange} />
                </div>
                <Field name="tenantAddress" error={errors.tenantAddress} label="Tenant Permanent Address" placeholder="Full address" form={form} onChange={handleChange} />

                <button style={s.btn} onClick={() => { if (validateStep1()) setStep(2) }}>Next → Property Details</button>
              </>
            )}

            {step === 2 && (
              <>
                <h3 style={s.cardTitle}>Property Details</h3>
                <Field name="propertyType" error={errors.propertyType} label="Property Type" options={['Apartment', 'Single Room', 'Shared Room', 'Studio']} form={form} onChange={handleChange} />
                <Field name="propertyAddress" error={errors.propertyAddress} label="Property Address" placeholder="Full property address" form={form} onChange={handleChange} />
                <div style={s.grid2}>
                  <Field name="furnished" label="Furnishing Status" options={['Fully Furnished', 'Semi Furnished', 'Unfurnished']} form={form} onChange={handleChange} />
                  <Field name="duration" label="Agreement Duration" options={['6 months', '11 months', '1 year', '2 years']} form={form} onChange={handleChange} />
                </div>

                <h3 style={{ ...s.cardTitle, marginTop: '20px' }}>Financial Terms</h3>
                <div style={s.grid2}>
                  <Field name="rentAmount" error={errors.rentAmount} label="Monthly Rent (₹)" type="number" placeholder="e.g. 7500" form={form} onChange={handleChange} />
                  <Field name="advanceAmount" error={errors.advanceAmount} label="Security Deposit (₹)" type="number" placeholder="e.g. 15000" form={form} onChange={handleChange} />
                  <Field name="maintenanceCharges" error={errors.maintenanceCharges} label="Maintenance (₹/month)" type="number" placeholder="e.g. 500" form={form} onChange={handleChange} />
                  <Field name="startDate" error={errors.startDate} label="Start Date" type="date" min={todayStr()} max={maxDateStr()} form={form} onChange={handleChange} />
                  <Field name="noticePeriod" label="Notice Period" options={['15 days', '1 month', '2 months']} form={form} onChange={handleChange} />
                </div>

                <h3 style={{ ...s.cardTitle, marginTop: '20px' }}>Additional Terms</h3>
                <div style={s.field}>
                  <label style={s.label}>Restrictions (optional)</label>
                  <textarea style={s.textarea} name="restrictions" placeholder="e.g. No pets, No smoking, No guests after 10pm..." value={form.restrictions} onChange={handleChange} rows={3} />
                </div>
                <div style={s.field}>
                  <label style={s.label}>Additional Clauses (optional)</label>
                  <textarea style={s.textarea} name="additionalClauses" placeholder="Any other terms..." value={form.additionalClauses} onChange={handleChange} rows={3} />
                </div>

                <div style={s.btnRow}>
                  <button type="button" style={s.btnOutline} onClick={() => setStep(1)}>← Back</button>
                  <button
                    style={s.btn}
                    type="button"
                    onClick={() => {
                      if (!validateStep2()) return
                      if (!isPaid) setShowPayment(true)
                      else generateAgreement()
                    }}
                    disabled={loading}
                  >
                    {loading ? '⏳ Generating...' : isPaid ? '📄 Generate Agreement →' : '💳 Pay ₹29 & Generate →'}
                  </button>
                </div>
              </>
            )}

            {step === 3 && generated && (
              <>
                <div style={s.successBanner}>
                  <div style={s.successIcon}>✓</div>
                  <div>
                    <div style={s.successTitle}>Agreement Generated!</div>
                    <div style={s.successSub}>Your rental agreement is ready to download</div>
                  </div>
                </div>
                <div style={s.summaryGrid}>
                  {[
                    ['Owner', form.ownerName],
                    ['Tenant', form.tenantName],
                    ['Property', form.propertyAddress],
                    ['Type', form.propertyType],
                    ['Monthly Rent', `Rs. ${Number(form.rentAmount).toLocaleString()}`],
                    ['Deposit', `Rs. ${Number(form.advanceAmount).toLocaleString()}`],
                    ['Duration', form.duration],
                    ['Start Date', form.startDate],
                    ['Notice Period', form.noticePeriod],
                  ].map(([key, val]) => (
                    <div key={key} style={s.summaryItem}>
                      <div style={s.summaryKey}>{key}</div>
                      <div style={s.summaryVal}>{val || '—'}</div>
                    </div>
                  ))}
                </div>
                <button style={s.downloadBtn} onClick={downloadAgreement}>⬇ Download PDF Agreement</button>
                <button style={s.btnOutline} onClick={() => { setStep(1); setGenerated(false); setIsPaid(false) }}>Generate New Agreement</button>
              </>
            )}
          </div>

          {/* Info Panel */}
          <div>
            <div style={s.infoCard}>
              <h3 style={s.cardTitle}>What's included</h3>
              {[
                ['📋', 'Owner & tenant details', 'Full names, contacts and addresses'],
                ['🏠', 'Property information', 'Address, furnishing and condition'],
                ['💰', 'Financial terms', 'Rent, deposit, maintenance charges'],
                ['📅', 'Duration & dates', 'Start date, duration, notice period'],
                ['⚖️', 'Legal clauses', 'Standard Indian rental law terms'],
                ['✍️', 'Signature section', 'Space for both parties and witnesses'],
              ].map(([icon, title, desc]) => (
                <div key={title} style={s.infoItem}>
                  <span style={{ fontSize: '18px' }}>{icon}</span>
                  <div>
                    <div style={s.infoTitle}>{title}</div>
                    <div style={s.infoDesc}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={s.legalNote}>
              <div style={s.legalTitle}>⚖️ Legal Note</div>
              <div style={s.legalText}>This agreement is generated based on standard Indian rental law. It is recommended to get it reviewed by a lawyer and registered at your local sub-registrar office for full legal validity.</div>
            </div>
          </div>
        </div>
      </div>

      {showPayment && (
        <PaymentModal
          feature="Agreement Generator"
          price={29}
          onSuccess={async (paymentId, method, feature) => {
            // Record in DB so admin dashboard captures it
            try { await api.recordPayment({ feature: feature || 'Agreement Generator', amount: 29, method: method || 'mock' }) } catch {}
            setIsPaid(true)
            setShowPayment(false)
            generateAgreement()
          }}
          onClose={() => setShowPayment(false)}
        />
      )}
    </div>
  )
}

const s = {
  page: { minHeight: '100vh', background: 'var(--bg-primary)', fontFamily: "'Segoe UI', sans-serif" },
  topbar: { background: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)', padding: '20px 32px' },
  title: { fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.5px' },
  sub: { fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' },
  content: { padding: '28px 32px' },
  steps: { display: 'flex', alignItems: 'center', marginBottom: '28px' },
  stepItem: { display: 'flex', alignItems: 'center', gap: '8px' },
  stepCircle: { width: '28px', height: '28px', borderRadius: '50%', border: '2px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '700', color: 'var(--text-placeholder)', flexShrink: 0, background: 'var(--bg-card)' },
  stepActive: { border: '2px solid #111', color: 'var(--text-primary)' },
  stepDone: { background: 'var(--btn-primary-bg)', border: '2px solid #111', color: 'white' },
  stepLabel: { fontSize: '12px', color: 'var(--text-placeholder)', fontWeight: '500', whiteSpace: 'nowrap' },
  stepLabelActive: { color: 'var(--text-primary)', fontWeight: '700' },
  stepLine: { width: '40px', height: '2px', background: 'var(--input-border)', margin: '0 8px' },
  stepLineDone: { background: 'var(--btn-primary-bg)' },
  grid: { display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '24px' },
  formCard: { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '28px' },
  cardTitle: { fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '16px' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' },
  field: { marginBottom: '14px' },
  label: { display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '6px' },
  input: { width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1.5px solid var(--input-border)', fontSize: '13px', outline: 'none', boxSizing: 'border-box', color: 'var(--text-primary)', background: 'var(--bg-card)' },
  textarea: { width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1.5px solid var(--input-border)', fontSize: '13px', outline: 'none', boxSizing: 'border-box', resize: 'vertical', color: 'var(--text-primary)' },
  btn: { width: '100%', padding: '12px', background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', marginTop: '8px' },
  btnOutline: { width: '100%', padding: '12px', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1.5px solid var(--input-border)', borderRadius: '10px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', marginTop: '8px' },
  btnRow: { display: 'flex', gap: '12px', marginTop: '8px' },
  successBanner: { background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' },
  successIcon: { width: '36px', height: '36px', borderRadius: '50%', background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: '700', flexShrink: 0 },
  successTitle: { fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' },
  successSub: { fontSize: '12px', color: 'var(--text-muted)' },
  summaryGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' },
  summaryItem: { background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px 14px' },
  summaryKey: { fontSize: '11px', color: 'var(--text-placeholder)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' },
  summaryVal: { fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' },
  downloadBtn: { width: '100%', padding: '13px', background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', marginBottom: '10px' },
  infoCard: { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '24px', marginBottom: '16px' },
  infoItem: { display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '14px' },
  infoTitle: { fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '2px' },
  infoDesc: { fontSize: '12px', color: 'var(--text-muted)' },
  legalNote: { background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', padding: '16px 20px' },
  legalTitle: { fontSize: '13px', fontWeight: '700', color: '#92400e', marginBottom: '8px' },
  legalText: { fontSize: '12px', color: '#92400e', lineHeight: '1.6' },
  fieldError:  { fontSize: '11.5px', color: '#cc0000', marginTop: '4px' },
  inputError:  { borderColor: '#fca5a5', background: '#fff8f8' },
}