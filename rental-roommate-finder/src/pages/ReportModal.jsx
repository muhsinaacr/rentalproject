import { useState } from 'react'
import { api } from '../utils/api'

// report_category: 'listing' | 'owner' | 'roommate'
const REASONS = {
  listing:  ['Fake photos', 'Wrong location', 'Incorrect price', 'Already rented', 'Scam listing', 'Other'],
  owner:    ['Harassment', 'Scam attempt', 'Fake profile', 'Inappropriate messages', 'Requesting money', 'Other'],
  roommate: ['Harassment', 'Fake profile', 'Inappropriate behavior', 'Spam messages', 'Suspicious activity', 'Other'],
  seeker:   ['Harassment', 'Spam messages', 'Fake profile', 'Inappropriate behavior', 'Scam attempt', 'Other'],
}

const TITLES = {
  listing:  'Report Listing',
  owner:    'Report Room Owner',
  roommate: 'Report Roommate',
  seeker:   'Report Seeker',
}

// category: 'listing' | 'owner' | 'roommate'
// targetId: the listing id or user id
// targetName: display name
export default function ReportModal({ category = 'listing', targetId, targetName = '', onClose }) {
  const [reason,    setReason]    = useState('')
  const [details,   setDetails]   = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!reason || !targetId) return
    setLoading(true)
    setError('')
    try {
      // DB ENUM: 'listing' | 'owner' | 'roommate'
      // After running migrate_seeker_report.js, 'seeker' is also valid.
      // Until then we send 'owner' so the INSERT never truncates.
      const backendCategory = category === 'seeker' ? 'owner' : category
      await api.submitReport({
        type:            category === 'listing' ? 'listing' : 'user',
        report_category: backendCategory,
        target_id:       targetId,
        reason,
        details: details.trim() || undefined,
      })
      setSubmitted(true)
      setTimeout(onClose, 2200)
    } catch (err) {
      // 409 = duplicate pending report
      if (err.message?.includes('409') || err.message?.toLowerCase().includes('pending report')) {
        setError('You already have a pending report for this person.')
      } else {
        setError(err.message || 'Failed to submit report. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  const reasons = REASONS[category] || REASONS.listing

  return (
    <div style={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={s.modal}>
        <div style={s.modalHeader}>
          <div>
            <h3 style={s.modalTitle}>{TITLES[category] || 'Report'}</h3>
            <p style={s.modalSub}>Reporting: <strong>{targetName}</strong></p>
          </div>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        {submitted ? (
          <div style={s.success}>
            <div style={s.successIcon}>✓</div>
            <div style={s.successText}>Report submitted successfully</div>
            <div style={s.successSub}>Our team will review this within 24 hours</div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={s.field}>
              <label style={s.label}>Reason for reporting</label>
              <div style={s.reasonGrid}>
                {reasons.map(r => (
                  <div key={r} style={{ ...s.reasonOption, ...(reason === r ? s.reasonOn : {}) }} onClick={() => setReason(r)}>
                    <div style={{ ...s.reasonDot, ...(reason === r ? s.reasonDotOn : {}) }} />
                    {r}
                  </div>
                ))}
              </div>
            </div>
            <div style={s.field}>
              <label style={s.label}>Additional details (optional)</label>
              <textarea
                style={s.textarea}
                placeholder="Describe the issue in detail..."
                value={details}
                onChange={e => setDetails(e.target.value)}
                rows={4}
              />
            </div>
            {error && <div style={s.errorBox}>⚠️ {error}</div>}
            <div style={s.warningBox}>
              ⚠️ False reports may result in account suspension. Please report only genuine issues.
            </div>
            <div style={s.btnRow}>
              <button type="button" style={s.cancelBtn} onClick={onClose} disabled={loading}>Cancel</button>
              <button type="submit" style={{ ...s.submitBtn, opacity: (!reason || loading) ? 0.5 : 1 }} disabled={!reason || loading}>
                {loading ? 'Submitting…' : 'Submit Report →'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

const s = {
  overlay:     { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal:       { background: '#fff', borderRadius: '20px', padding: '28px', width: '100%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' },
  modalTitle:  { fontSize: '18px', fontWeight: '800', color: '#111', marginBottom: '4px' },
  modalSub:    { fontSize: '13px', color: '#888' },
  closeBtn:    { background: 'none', border: '1.5px solid #e5e7eb', borderRadius: '8px', padding: '6px 12px', fontSize: '14px', cursor: 'pointer', color: '#555' },
  field:       { marginBottom: '18px' },
  label:       { display: 'block', fontSize: '13px', fontWeight: '600', color: '#111', marginBottom: '10px' },
  reasonGrid:  { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' },
  reasonOption:{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', border: '1.5px solid #e5e7eb', borderRadius: '10px', cursor: 'pointer', fontSize: '13px', color: '#555', fontWeight: '500' },
  reasonOn:    { border: '1.5px solid #111', background: '#f5f5f5', color: '#111' },
  reasonDot:   { width: '8px', height: '8px', borderRadius: '50%', border: '2px solid #e5e7eb', flexShrink: 0 },
  reasonDotOn: { background: '#111', border: '2px solid #111' },
  textarea:    { width: '100%', padding: '11px 14px', borderRadius: '10px', border: '1.5px solid #e5e7eb', fontSize: '14px', outline: 'none', boxSizing: 'border-box', resize: 'vertical', color: '#111' },
  errorBox:    { background: '#fff0f0', border: '1px solid #ffd0d0', borderRadius: '10px', padding: '12px 16px', fontSize: '12px', color: '#cc0000', marginBottom: '12px' },
  warningBox:  { background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '12px 16px', fontSize: '12px', color: '#92400e', marginBottom: '18px' },
  btnRow:      { display: 'flex', gap: '10px' },
  cancelBtn:   { flex: 1, padding: '12px', background: 'white', color: '#111', border: '1.5px solid #e5e7eb', borderRadius: '10px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' },
  submitBtn:   { flex: 1, padding: '12px', background: '#111', color: 'white', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', cursor: 'pointer' },
  success:     { textAlign: 'center', padding: '32px 20px' },
  successIcon: { width: '48px', height: '48px', borderRadius: '50%', background: '#111', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: '700', margin: '0 auto 16px' },
  successText: { fontSize: '16px', fontWeight: '700', color: '#111', marginBottom: '6px' },
  successSub:  { fontSize: '13px', color: '#888' },
}