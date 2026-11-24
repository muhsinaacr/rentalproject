import { useState, useMemo } from 'react'
import { api } from '../utils/api'

// ── Time slot definitions (24h values used for comparison) ───────────────────
const TIME_SLOTS = [
  { label: '9:00 AM',  hour: 9  },
  { label: '10:00 AM', hour: 10 },
  { label: '11:00 AM', hour: 11 },
  { label: '12:00 PM', hour: 12 },
  { label: '2:00 PM',  hour: 14 },
  { label: '3:00 PM',  hour: 15 },
  { label: '4:00 PM',  hour: 16 },
  { label: '5:00 PM',  hour: 17 },
]

// ── Date helpers ──────────────────────────────────────────────────────────────
function toLocalDateStr(date) {
  // Returns YYYY-MM-DD in LOCAL timezone (not UTC)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function getMaxDate() {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  return toLocalDateStr(d)
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-')
  const date = new Date(Number(y), Number(m) - 1, Number(d))
  return date.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function isToday(dateStr) {
  return dateStr === toLocalDateStr(new Date())
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function BookVisitModal({ listing, onClose }) {
  const [form, setForm]           = useState({ date: '', time: '', message: '' })
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading]     = useState(false)
  const [dateError, setDateError] = useState('')
  const [timeError, setTimeError] = useState('')
  const [submitError, setSubmitError] = useState('')

  const today  = toLocalDateStr(new Date())
  const maxDate = getMaxDate()
  const nowHour = new Date().getHours() // current hour in local time

  // Which slots are unavailable — only applies when selected date is TODAY
  const unavailableSlots = useMemo(() => {
    if (!form.date || !isToday(form.date)) return new Set()
    // Block slots whose hour <= current hour (must book a FUTURE slot)
    return new Set(TIME_SLOTS.filter(s => s.hour <= nowHour).map(s => s.label))
  }, [form.date, nowHour])

  // All slots disabled today = no available slots
  const noSlotsToday = isToday(form.date) && unavailableSlots.size === TIME_SLOTS.length

  function handleDateChange(val) {
    setDateError('')
    setTimeError('')
    // If switching date, clear time if it was a now-invalid past slot
    setForm(prev => ({ ...prev, date: val, time: '' }))

    if (!val) { setDateError('Please select a date'); return }

    const selected = new Date(val + 'T00:00:00') // force local parse
    const todayDate = new Date(today + 'T00:00:00')
    const maxDate7  = new Date(maxDate + 'T00:00:00')

    if (selected < todayDate) {
      setDateError('Cannot book a past date — please select today or a future date')
      return
    }
    if (selected > maxDate7) {
      setDateError(`Visits can only be booked within 7 days — latest available date is ${formatDisplayDate(maxDate)}`)
      return
    }
  }

  function handleTimeSelect(slot) {
    setTimeError('')
    if (unavailableSlots.has(slot.label)) return // ignore clicks on disabled slots
    setForm(prev => ({ ...prev, time: slot.label }))
  }

  function validate() {
    let valid = true

    if (!form.date) {
      setDateError('Please select a visit date')
      valid = false
    } else if (dateError) {
      valid = false // already has a date error
    }

    if (!form.time) {
      setTimeError('Please select a time slot')
      valid = false
    } else if (unavailableSlots.has(form.time)) {
      setTimeError('The selected time has passed — please choose a future time slot')
      valid = false
    }

    return valid
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitError('')
    if (!validate()) return

    setLoading(true)
    try {
      await api.bookVisit({
        listing_id: listing.id,
        owner_id:   listing.owner_id,
        visit_date: form.date,
        visit_time: form.time,
        message:    form.message,
      })
      setSubmitted(true)
      setTimeout(onClose, 2800)
    } catch (err) {
      setSubmitError(err.message || 'Failed to book visit. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── Success screen ──────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div style={s.overlay}>
        <div style={s.modal}>
          <div style={s.success}>
            <div style={s.successIcon}>✓</div>
            <div style={s.successTitle}>Visit Requested!</div>
            <div style={s.successSub}>The owner will confirm shortly</div>
            <div style={s.successDetail}>
              <span style={s.successDetailLabel}>Listing</span>
              <span style={s.successDetailVal}>{listing.title}</span>
            </div>
            <div style={s.successDetail}>
              <span style={s.successDetailLabel}>Date</span>
              <span style={s.successDetailVal}>{formatDisplayDate(form.date)}</span>
            </div>
            <div style={s.successDetail}>
              <span style={s.successDetailLabel}>Time</span>
              <span style={s.successDetailVal}>{form.time}</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Form screen ─────────────────────────────────────────────────────────────
  return (
    <div style={s.overlay}>
      <div style={s.modal}>
        <div style={s.header}>
          <div>
            <h3 style={s.title}>Book a Visit</h3>
            <p style={s.listingName}>📍 {listing.title}</p>
          </div>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        {submitError && <div style={s.errorBox}>⚠ {submitError}</div>}

        <form onSubmit={handleSubmit} noValidate>

          {/* ── Date picker ── */}
          <div style={s.field}>
            <label style={s.label}>Select Date <span style={s.req}>*</span></label>
            <input
              style={{ ...s.input, ...(dateError ? s.inputError : form.date && !dateError ? s.inputOk : {}) }}
              type="date"
              min={today}
              max={maxDate}
              value={form.date}
              onChange={e => handleDateChange(e.target.value)}
            />
            {/* Date constraint hint */}
            <div style={s.hint}>
              📅 Only dates from <strong>today</strong> to <strong>{formatDisplayDate(maxDate)}</strong> (within 7 days)
            </div>
            {dateError && <div style={s.fieldError}>⚠ {dateError}</div>}
            {form.date && !dateError && (
              <div style={s.fieldOk}>✓ {formatDisplayDate(form.date)}{isToday(form.date) ? ' — Today' : ''}</div>
            )}
          </div>

          {/* ── Time slots ── */}
          <div style={s.field}>
            <label style={s.label}>
              Select Time Slot <span style={s.req}>*</span>
              {isToday(form.date) && !noSlotsToday && (
                <span style={s.todayNote}> — past slots are disabled for today</span>
              )}
            </label>

            {/* No slots left today */}
            {noSlotsToday ? (
              <div style={s.noSlotsBox}>
                🕐 All time slots for today have passed. Please select a future date.
              </div>
            ) : (
              <div style={s.timeGrid}>
                {TIME_SLOTS.map(slot => {
                  const disabled = unavailableSlots.has(slot.label)
                  const selected = form.time === slot.label
                  return (
                    <div
                      key={slot.label}
                      style={{
                        ...s.timeSlot,
                        ...(disabled
                          ? s.timeSlotDisabled
                          : selected
                            ? s.timeSlotOn
                            : s.timeSlotOff),
                      }}
                      onClick={() => !disabled && handleTimeSelect(slot)}
                      title={disabled ? 'This time has already passed today' : slot.label}
                    >
                      {slot.label}
                      {disabled && <div style={s.pastLabel}>Past</div>}
                    </div>
                  )
                })}
              </div>
            )}

            {timeError && <div style={s.fieldError}>⚠ {timeError}</div>}
            {form.time && !timeError && <div style={s.fieldOk}>✓ {form.time} selected</div>}
          </div>

          {/* ── Message ── */}
          <div style={s.field}>
            <label style={s.label}>
              Message to Owner <span style={s.optional}>(optional)</span>
            </label>
            <textarea
              style={s.textarea}
              placeholder="e.g. I am interested in a long term stay..."
              value={form.message}
              onChange={e => setForm(prev => ({ ...prev, message: e.target.value }))}
              rows={3}
            />
          </div>

          <div style={s.btnRow}>
            <button type="button" style={s.cancelBtn} onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button
              type="submit"
              style={{ ...s.submitBtn, opacity: loading ? 0.7 : 1 }}
              disabled={loading || !!dateError || noSlotsToday}
            >
              {loading ? 'Sending...' : 'Send Visit Request →'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const s = {
  overlay:            { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal:              { background: 'var(--bg-card)', borderRadius: '20px', padding: '28px', width: '100%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto', fontFamily: "'Segoe UI', sans-serif" },
  header:             { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' },
  title:              { fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '6px', letterSpacing: '-0.5px' },
  listingName:        { fontSize: '13px', color: 'var(--text-faint)', fontWeight: '500' },
  closeBtn:           { background: 'none', border: '1.5px solid var(--border-strong)', borderRadius: '8px', padding: '6px 12px', fontSize: '14px', cursor: 'pointer', color: 'var(--text-muted)', flexShrink: 0 },
  errorBox:           { background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger-text)', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px' },
  field:              { marginBottom: '18px' },
  label:              { display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' },
  req:                { color: '#ef4444' },
  optional:           { fontSize: '12px', color: 'var(--text-faint)', fontWeight: '400' },
  todayNote:          { fontSize: '11px', color: '#f59e0b', fontWeight: '500' },
  input:              { width: '100%', padding: '11px 14px', borderRadius: '10px', border: '1.5px solid var(--border-strong)', fontSize: '14px', outline: 'none', boxSizing: 'border-box', color: 'var(--text-primary)', background: 'var(--input-bg)', transition: 'border-color 0.15s' },
  inputError:         { borderColor: '#fca5a5', background: '#fff5f5' },
  inputOk:            { borderColor: '#6ee7b7', background: '#f0fdf4' },
  hint:               { fontSize: '11px', color: 'var(--text-faint)', marginTop: '6px', lineHeight: '1.5' },
  fieldError:         { fontSize: '12px', color: '#dc2626', marginTop: '6px', lineHeight: '1.4', fontWeight: '500' },
  fieldOk:            { fontSize: '12px', color: '#059669', marginTop: '6px', fontWeight: '600' },
  timeGrid:           { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' },
  timeSlot:           { padding: '9px 6px', borderRadius: '8px', fontSize: '12px', fontWeight: '500', cursor: 'pointer', textAlign: 'center', userSelect: 'none', position: 'relative' },
  timeSlotOff:        { border: '1.5px solid var(--border-strong)', background: 'var(--bg-card)', color: 'var(--text-muted)' },
  timeSlotOn:         { border: '1.5px solid var(--accent)', background: 'var(--accent)', color: 'var(--accent-fg)' },
  timeSlotDisabled:   { border: '1.5px solid #e5e7eb', background: '#f3f4f6', color: '#d1d5db', cursor: 'not-allowed', opacity: 0.6 },
  pastLabel:          { fontSize: '9px', color: '#9ca3af', marginTop: '2px', letterSpacing: '0.03em' },
  noSlotsBox:         { background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '10px', padding: '14px 16px', fontSize: '13px', color: '#92400e', lineHeight: '1.5' },
  textarea:           { width: '100%', padding: '11px 14px', borderRadius: '10px', border: '1.5px solid var(--border-strong)', fontSize: '14px', outline: 'none', boxSizing: 'border-box', resize: 'vertical', color: 'var(--text-primary)', background: 'var(--input-bg)' },
  btnRow:             { display: 'flex', gap: '10px', marginTop: '4px' },
  cancelBtn:          { flex: 1, padding: '12px', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1.5px solid var(--border-strong)', borderRadius: '10px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' },
  submitBtn:          { flex: 2, padding: '12px', background: 'var(--accent)', color: 'var(--accent-fg)', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', cursor: 'pointer' },
  success:            { textAlign: 'center', padding: '24px 16px' },
  successIcon:        { width: '56px', height: '56px', borderRadius: '50%', background: 'var(--accent)', color: 'var(--accent-fg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', fontWeight: '700', margin: '0 auto 16px' },
  successTitle:       { fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '6px', letterSpacing: '-0.5px' },
  successSub:         { fontSize: '14px', color: 'var(--text-faint)', marginBottom: '20px' },
  successDetail:      { display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-muted)', borderRadius: '8px', marginBottom: '8px' },
  successDetailLabel: { fontSize: '12px', color: 'var(--text-faint)' },
  successDetailVal:   { fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' },
}