import { useState } from 'react'

const TIME_SLOTS = ['9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM']

const SAMPLE_REQUESTS = [
  { id: 1, seekerName: 'Arjun P S', listing: 'MG Road listing', date: '2026-04-05', time: '10:00 AM', status: 'pending', phone: '9876543210' },
  { id: 2, seekerName: 'Alan Willy', listing: 'MG Road listing', date: '2026-04-06', time: '2:00 PM', status: 'approved', phone: '9876543211' },
  { id: 3, seekerName: 'Deepa K', listing: 'Kakkanad listing', date: '2026-04-07', time: '11:00 AM', status: 'rejected', phone: '9876543212' },
]

export default function VisitScheduler() {
  const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}')
  const isOwner = currentUser.role === 'owner'
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ date: '', time: '', listing: 'MG Road listing', message: '' })
  const [requests, setRequests] = useState(SAMPLE_REQUESTS)
  const [submitted, setSubmitted] = useState(false)
  const [myVisits, setMyVisits] = useState([])

  function handleSubmit(e) {
    e.preventDefault()
    const newVisit = {
      id: Date.now(),
      seekerName: currentUser.name,
      listing: form.listing,
      date: form.date,
      time: form.time,
      status: 'pending',
      phone: currentUser.phone || 'N/A',
      message: form.message
    }
    setMyVisits([...myVisits, newVisit])
    setRequests([...requests, newVisit])
    setSubmitted(true)
    setTimeout(() => { setShowModal(false); setSubmitted(false) }, 2000)
  }

  function updateStatus(id, status) {
    setRequests(requests.map(r => r.id === id ? { ...r, status } : r))
  }

  const statusStyle = (status) => ({
    pending: { background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' },
    approved: { background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' },
    rejected: { background: '#fff0f0', color: '#cc0000', border: '1px solid #ffd0d0' },
  }[status] || {})

  return (
    <div style={s.page}>
      <div style={s.topbar}>
        <div>
          <h2 style={s.title}>Visit Scheduler</h2>
          <p style={s.sub}>{isOwner ? 'Manage visit requests from seekers' : 'Schedule a visit to your favourite room'}</p>
        </div>
        {!isOwner && (
          <button style={s.bookBtn} onClick={() => setShowModal(true)}>+ Book a Visit</button>
        )}
      </div>

      <div style={s.content}>
        {/* Seeker: My Visits */}
        {!isOwner && (
          <>
            {myVisits.length === 0 && (
              <div style={s.empty}>
                <div style={{ fontSize: '40px', marginBottom: '12px', opacity: 0.15 }}>📅</div>
                <div style={s.emptyTitle}>No visits scheduled yet</div>
                <div style={s.emptySub}>Click "Book a Visit" to schedule your first room visit</div>
              </div>
            )}
            {myVisits.length > 0 && (
              <div style={s.visitsList}>
                <h3 style={s.sectionTitle}>My Scheduled Visits</h3>
                {myVisits.map(v => (
                  <div key={v.id} style={s.visitCard}>
                    <div style={s.visitLeft}>
                      <div style={s.visitIcon}>📅</div>
                      <div>
                        <div style={s.visitListing}>{v.listing}</div>
                        <div style={s.visitDateTime}>{v.date} at {v.time}</div>
                      </div>
                    </div>
                    <span style={{ ...s.statusBadge, ...statusStyle(v.status) }}>{v.status}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Owner: Incoming Requests */}
        {isOwner && (
          <>
            <div style={s.statsRow}>
              {[
                { label: 'Total Requests', value: requests.length },
                { label: 'Pending', value: requests.filter(r => r.status === 'pending').length },
                { label: 'Approved', value: requests.filter(r => r.status === 'approved').length },
                { label: 'Rejected', value: requests.filter(r => r.status === 'rejected').length },
              ].map((st, i) => (
                <div key={i} style={s.statCard}>
                  <div style={s.statLabel}>{st.label}</div>
                  <div style={s.statValue}>{st.value}</div>
                </div>
              ))}
            </div>

            <h3 style={s.sectionTitle}>Visit Requests</h3>
            <div style={s.requestsList}>
              {requests.map(r => (
                <div key={r.id} style={s.requestCard}>
                  <div style={s.requestLeft}>
                    <div style={s.requestAvatar}>{r.seekerName.charAt(0)}</div>
                    <div>
                      <div style={s.requestName}>{r.seekerName}</div>
                      <div style={s.requestDetails}>📍 {r.listing} · 📅 {r.date} · ⏰ {r.time}</div>
                      <div style={s.requestPhone}>📞 {r.phone}</div>
                    </div>
                  </div>
                  <div style={s.requestRight}>
                    <span style={{ ...s.statusBadge, ...statusStyle(r.status) }}>{r.status}</span>
                    {r.status === 'pending' && (
                      <div style={s.requestActions}>
                        <button style={s.approveBtn} onClick={() => updateStatus(r.id, 'approved')}>✓ Approve</button>
                        <button style={s.rejectBtn} onClick={() => updateStatus(r.id, 'rejected')}>✕ Reject</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Book Visit Modal */}
      {showModal && (
        <div style={s.overlay}>
          <div style={s.modal}>
            <div style={s.modalHeader}>
              <h3 style={s.modalTitle}>Book a Visit</h3>
              <button style={s.closeBtn} onClick={() => setShowModal(false)}>✕</button>
            </div>

            {submitted ? (
              <div style={s.successMsg}>
                <div style={s.successIcon}>✓</div>
                <div style={s.successText}>Visit request sent successfully!</div>
                <div style={s.successSub}>The owner will confirm shortly</div>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <div style={s.field}>
                  <label style={s.label}>Select Listing</label>
                  <select style={s.input} value={form.listing} onChange={e => setForm({ ...form, listing: e.target.value })}>
                    {['MG Road listing', 'Kakkanad listing', 'Edapally listing', 'Aluva listing'].map(l => <option key={l}>{l}</option>)}
                  </select>
                </div>
                <div style={s.grid2}>
                  <div style={s.field}>
                    <label style={s.label}>Select Date</label>
                    <input style={s.input} type="date" value={form.date} min={new Date().toISOString().split('T')[0]} onChange={e => setForm({ ...form, date: e.target.value })} required />
                  </div>
                  <div style={s.field}>
                    <label style={s.label}>Select Time Slot</label>
                    <select style={s.input} value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} required>
                      <option value="">Choose time...</option>
                      {TIME_SLOTS.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <div style={s.timeSlots}>
                  {TIME_SLOTS.map(t => (
                    <div key={t} style={{ ...s.timeSlot, ...(form.time === t ? s.timeSlotOn : {}) }} onClick={() => setForm({ ...form, time: t })}>
                      {t}
                    </div>
                  ))}
                </div>
                <div style={s.field}>
                  <label style={s.label}>Message to Owner (optional)</label>
                  <textarea style={s.textarea} placeholder="e.g. I am interested in a long term stay..." value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} rows={3} />
                </div>
                <button style={s.submitBtn} type="submit" disabled={!form.date || !form.time}>
                  Send Visit Request →
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const s = {
  page: { minHeight: '100vh', background: '#fafafa', fontFamily: "'Segoe UI', sans-serif" },
  topbar: { background: '#fff', borderBottom: '1px solid #f0f0f0', padding: '20px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: '20px', fontWeight: '800', color: '#111', letterSpacing: '-0.5px' },
  sub: { fontSize: '13px', color: '#888', marginTop: '2px' },
  bookBtn: { background: '#111', color: 'white', border: 'none', borderRadius: '10px', padding: '10px 20px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' },
  content: { padding: '28px 32px' },
  empty: { textAlign: 'center', padding: '80px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  emptyTitle: { fontSize: '18px', fontWeight: '700', color: '#111', marginBottom: '6px' },
  emptySub: { fontSize: '14px', color: '#aaa' },
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '28px' },
  statCard: { background: '#fff', border: '1px solid #f0f0f0', borderRadius: '14px', padding: '20px' },
  statLabel: { fontSize: '12px', color: '#aaa', fontWeight: '500', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' },
  statValue: { fontSize: '32px', fontWeight: '800', color: '#111', letterSpacing: '-1px' },
  sectionTitle: { fontSize: '14px', fontWeight: '700', color: '#111', marginBottom: '14px' },
  requestsList: { display: 'flex', flexDirection: 'column', gap: '12px' },
  requestCard: { background: '#fff', border: '1px solid #f0f0f0', borderRadius: '14px', padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  requestLeft: { display: 'flex', alignItems: 'center', gap: '14px' },
  requestAvatar: { width: '44px', height: '44px', borderRadius: '50%', background: '#111', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: '700', flexShrink: 0 },
  requestName: { fontSize: '14px', fontWeight: '700', color: '#111', marginBottom: '4px' },
  requestDetails: { fontSize: '12px', color: '#888', marginBottom: '3px' },
  requestPhone: { fontSize: '12px', color: '#aaa' },
  requestRight: { display: 'flex', alignItems: 'center', gap: '12px' },
  requestActions: { display: 'flex', gap: '8px' },
  approveBtn: { background: '#111', color: 'white', border: 'none', borderRadius: '8px', padding: '7px 14px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' },
  rejectBtn: { background: 'white', color: '#cc0000', border: '1px solid #ffd0d0', borderRadius: '8px', padding: '7px 14px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' },
  statusBadge: { fontSize: '11px', fontWeight: '700', padding: '4px 10px', borderRadius: '20px' },
  visitsList: { display: 'flex', flexDirection: 'column', gap: '12px' },
  visitCard: { background: '#fff', border: '1px solid #f0f0f0', borderRadius: '14px', padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  visitLeft: { display: 'flex', alignItems: 'center', gap: '14px' },
  visitIcon: { fontSize: '28px' },
  visitListing: { fontSize: '14px', fontWeight: '700', color: '#111', marginBottom: '4px' },
  visitDateTime: { fontSize: '13px', color: '#888' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: '#fff', borderRadius: '20px', padding: '28px', width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' },
  modalTitle: { fontSize: '18px', fontWeight: '800', color: '#111', letterSpacing: '-0.5px' },
  closeBtn: { background: 'none', border: '1.5px solid #e5e7eb', borderRadius: '8px', padding: '6px 12px', fontSize: '14px', cursor: 'pointer', color: '#555' },
  field: { marginBottom: '16px' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' },
  label: { display: 'block', fontSize: '13px', fontWeight: '600', color: '#111', marginBottom: '7px' },
  input: { width: '100%', padding: '11px 14px', borderRadius: '10px', border: '1.5px solid #e5e7eb', fontSize: '14px', outline: 'none', boxSizing: 'border-box', color: '#111', background: 'white' },
  textarea: { width: '100%', padding: '11px 14px', borderRadius: '10px', border: '1.5px solid #e5e7eb', fontSize: '14px', outline: 'none', boxSizing: 'border-box', resize: 'vertical', color: '#111' },
  timeSlots: { display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' },
  timeSlot: { padding: '7px 14px', border: '1.5px solid #e5e7eb', borderRadius: '8px', fontSize: '12px', fontWeight: '500', color: '#555', cursor: 'pointer' },
  timeSlotOn: { border: '1.5px solid #111', background: '#111', color: 'white' },
  submitBtn: { width: '100%', padding: '13px', background: '#111', color: 'white', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', cursor: 'pointer' },
  successMsg: { textAlign: 'center', padding: '32px 20px' },
  successIcon: { width: '48px', height: '48px', borderRadius: '50%', background: '#111', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: '700', margin: '0 auto 16px' },
  successText: { fontSize: '16px', fontWeight: '700', color: '#111', marginBottom: '6px' },
  successSub: { fontSize: '13px', color: '#888' },
}