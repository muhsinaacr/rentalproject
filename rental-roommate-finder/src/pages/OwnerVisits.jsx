import { useState, useEffect, useCallback } from 'react'
import { api } from '../utils/api'

const STATUS_CONFIG = {
  pending:   { label: 'pending',   bg: '#fffbeb', color: '#92400e', border: '#fde68a' },
  approved:  { label: 'approved',  bg: '#f0fdf4', color: '#166534', border: '#bbf7d0' },
  rejected:  { label: 'rejected',  bg: '#fff0f0', color: '#cc0000', border: '#ffd0d0' },
  cancelled: { label: 'cancelled', bg: '#f5f5f5', color: '#888',    border: '#ddd'    },
  expired:   { label: 'expired',   bg: '#f0f0ff', color: '#4338ca', border: '#c7d2fe' },
}

// Returns 'expired' if the visit date has passed and status is still pending/approved
function effectiveStatus(v) {
  if (v.status === 'rejected' || v.status === 'cancelled') return v.status
  if (v.visit_date && new Date(v.visit_date) < new Date(new Date().toDateString())) return 'expired'
  return v.status
}

export default function OwnerVisits() {
  const [visits, setVisits]     = useState([])
  const [filter, setFilter]     = useState('all')
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [updating, setUpdating] = useState(null)

  const loadVisits = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api.getOwnerVisits()
      setVisits(Array.isArray(data) ? data : [])
    } catch (err) {
      setError('Failed to load visit requests: ' + err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadVisits() }, [loadVisits])

  async function handleStatusUpdate(visitId, status) {
    setUpdating(visitId)
    try {
      await api.updateVisitStatus(visitId, status)
      setVisits(prev => prev.map(v => v.id === visitId ? { ...v, status } : v))
    } catch (err) {
      alert('Failed to update: ' + err.message)
    } finally {
      setUpdating(null)
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const filtered = filter === 'all' ? visits : visits.filter(v => effectiveStatus(v) === filter)
  const counts = {
    all:       visits.length,
    pending:   visits.filter(v => effectiveStatus(v) === 'pending').length,
    approved:  visits.filter(v => effectiveStatus(v) === 'approved').length,
    rejected:  visits.filter(v => effectiveStatus(v) === 'rejected').length,
    cancelled: visits.filter(v => effectiveStatus(v) === 'cancelled').length,
    expired:   visits.filter(v => effectiveStatus(v) === 'expired').length,
  }

  return (
    <div style={s.page}>
      <div style={s.topbar}>
        <div>
          <h2 style={s.title}>Visit Requests</h2>
          <p style={s.sub}>Manage visit requests from room seekers</p>
        </div>
        <div style={s.pendingBadge}>{counts.pending} pending</div>
      </div>

      <div style={s.content}>
        <div style={s.statsRow}>
          {[
            { label: 'Total Requests', value: counts.all },
            { label: 'Pending',        value: counts.pending },
            { label: 'Approved',       value: counts.approved },
            { label: 'Rejected',       value: counts.rejected },
          ].map((st, i) => (
            <div key={i} style={s.statCard}>
              <div style={s.statLabel}>{st.label}</div>
              <div style={s.statValue}>{st.value}</div>
            </div>
          ))}
        </div>

        <div style={s.filterRow}>
          {['all', 'pending', 'approved', 'rejected', 'cancelled', 'expired'].map(f => (
            <button
              key={f}
              style={{ ...s.chip, ...(filter === f ? s.chipOn : {}) }}
              onClick={() => setFilter(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)} ({counts[f] ?? 0})
            </button>
          ))}
          <button style={s.refreshBtn} onClick={loadVisits} title="Refresh">↻</button>
        </div>

        {loading && <div style={s.loading}>Loading requests…</div>}
        {error && !loading && <div style={s.errorBox}>{error}</div>}

        {!loading && !error && filtered.length === 0 && (
          <div style={s.empty}>
            <div style={{ fontSize: '40px', marginBottom: '12px', opacity: 0.15 }}>📅</div>
            <div style={s.emptyTitle}>{filter === 'all' ? 'No visit requests yet' : `No ${filter} requests`}</div>
            <div style={s.emptySub}>{filter === 'all' ? 'Visit requests from seekers will appear here' : `You have no ${filter} requests`}</div>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div style={s.requestsList}>
            {filtered.map(v => {
              const effStatus = effectiveStatus(v)
              const sc   = STATUS_CONFIG[effStatus] || STATUS_CONFIG.pending
              const busy = updating === v.id
              return (
                <div key={v.id} style={s.requestCard}>
                  <div style={s.requestLeft}>
                    <div style={s.requestAvatar}>{(v.seeker_name || 'S').charAt(0).toUpperCase()}</div>
                    <div>
                      <div style={s.requestName}>{v.seeker_name}</div>
                      <div style={s.requestDetails}>📍 {v.listing_title} · 📅 {formatDate(v.visit_date)} · ⏰ {v.visit_time}</div>
                      {v.seeker_phone && <div style={s.requestPhone}>📞 {v.seeker_phone}</div>}
                      {v.message && <div style={s.requestMessage}>"{v.message}"</div>}
                      <div style={s.requestMeta}>Requested {formatDate(v.created_at)}</div>
                    </div>
                  </div>

                  <div style={s.requestRight}>
                    <span style={{ ...s.statusBadge, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>
                      {sc.label}
                    </span>

                    {effStatus === 'pending' && (
                      <div style={s.actionBtns}>
                        <button style={{ ...s.approveBtn, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => handleStatusUpdate(v.id, 'approved')}>
                          {busy ? '…' : '✓ Approve'}
                        </button>
                        <button style={{ ...s.rejectBtn, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => handleStatusUpdate(v.id, 'rejected')}>
                          {busy ? '…' : '✕ Reject'}
                        </button>
                      </div>
                    )}

                    {effStatus === 'approved' && (
                      <button style={{ ...s.rejectBtn, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => handleStatusUpdate(v.id, 'cancelled')}>
                        {busy ? '…' : 'Cancel'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

const s = {
  page:          { minHeight: '100vh', background: 'var(--bg-page)', fontFamily: "'Segoe UI', sans-serif" },
  topbar:        { background: 'var(--bg-topbar)', borderBottom: '1px solid var(--border-default)', padding: '20px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title:         { fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.5px' },
  sub:           { fontSize: '13px', color: 'var(--text-faint)', marginTop: '2px' },
  pendingBadge:  { background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', fontSize: '13px', fontWeight: '700', padding: '6px 16px', borderRadius: '20px' },
  content:       { padding: '28px 32px' },
  statsRow:      { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' },
  statCard:      { background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: '14px', padding: '20px' },
  statLabel:     { fontSize: '12px', color: 'var(--text-faint)', fontWeight: '500', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' },
  statValue:     { fontSize: '32px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-1px' },
  filterRow:     { display: 'flex', gap: '8px', marginBottom: '20px', alignItems: 'center', flexWrap: 'wrap' },
  chip:          { padding: '7px 16px', border: '1.5px solid var(--border-strong)', borderRadius: '30px', fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer', background: 'var(--bg-card)', fontWeight: '500' },
  chipOn:        { background: 'var(--accent)', color: 'var(--accent-fg)', borderColor: 'var(--accent)' },
  refreshBtn:    { marginLeft: 'auto', background: 'var(--bg-card)', border: '1.5px solid var(--border-strong)', borderRadius: '8px', padding: '7px 12px', fontSize: '16px', cursor: 'pointer', color: 'var(--text-muted)' },
  loading:       { textAlign: 'center', padding: '60px 20px', color: 'var(--text-faint)', fontSize: '14px' },
  errorBox:      { background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger-text)', padding: '12px 16px', borderRadius: '10px', fontSize: '13px', marginBottom: '16px' },
  empty:         { textAlign: 'center', padding: '60px 20px' },
  emptyTitle:    { fontSize: '16px', fontWeight: '700', color: 'var(--text-faint)' },
  emptySub:      { fontSize: '13px', color: 'var(--text-faint)', marginTop: '6px' },
  requestsList:  { display: 'flex', flexDirection: 'column', gap: '12px' },
  requestCard:   { background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: '14px', padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' },
  requestLeft:   { display: 'flex', alignItems: 'flex-start', gap: '14px', flex: 1 },
  requestAvatar: { width: '44px', height: '44px', borderRadius: '50%', background: 'var(--accent)', color: 'var(--accent-fg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: '700', flexShrink: 0 },
  requestName:   { fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' },
  requestDetails:{ fontSize: '12px', color: 'var(--text-faint)', marginBottom: '3px' },
  requestPhone:  { fontSize: '12px', color: 'var(--text-muted)', marginBottom: '3px' },
  requestMessage:{ fontSize: '12px', color: 'var(--text-faint)', fontStyle: 'italic', background: 'var(--bg-muted)', padding: '5px 10px', borderRadius: '6px', marginTop: '4px' },
  requestMeta:   { fontSize: '11px', color: 'var(--text-faint)', marginTop: '6px' },
  requestRight:  { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '10px', flexShrink: 0 },
  statusBadge:   { fontSize: '11px', fontWeight: '700', padding: '4px 12px', borderRadius: '20px', textTransform: 'capitalize' },
  actionBtns:    { display: 'flex', gap: '8px' },
  approveBtn:    { background: 'var(--accent)', color: 'var(--accent-fg)', border: 'none', borderRadius: '8px', padding: '7px 14px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' },
  rejectBtn:     { background: 'var(--bg-card)', color: '#cc0000', border: '1px solid #ffd0d0', borderRadius: '8px', padding: '7px 14px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' },
}