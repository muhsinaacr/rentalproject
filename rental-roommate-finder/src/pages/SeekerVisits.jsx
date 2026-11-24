import { useState, useEffect, useCallback } from 'react'
import { api } from '../utils/api'

const STATUS_CONFIG = {
  pending:   { label: '⏳ Pending',   bg: '#fffbeb', color: '#92400e', border: '#fde68a' },
  approved:  { label: '✓ Approved',  bg: '#f0fdf4', color: '#166534', border: '#bbf7d0' },
  rejected:  { label: '✕ Rejected',  bg: '#fff0f0', color: '#cc0000', border: '#ffd0d0' },
  cancelled: { label: '— Cancelled', bg: '#f5f5f5', color: '#888',    border: '#ddd'    },
  expired:   { label: '⌛ Expired',   bg: '#f0f0ff', color: '#4338ca', border: '#c7d2fe' },
}

function effectiveStatus(v) {
  if (v.status === 'rejected' || v.status === 'cancelled') return v.status
  if (v.visit_date && new Date(v.visit_date) < new Date(new Date().toDateString())) return 'expired'
  return v.status
}

export default function SeekerVisits() {
  const [visits, setVisits]         = useState([])
  const [filter, setFilter]         = useState('all')
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [cancelling, setCancelling] = useState(null)

  const loadVisits = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api.getMyVisits()
      setVisits(Array.isArray(data) ? data : [])
    } catch (err) {
      setError('Failed to load visits: ' + err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadVisits() }, [loadVisits])

  async function handleCancel(visitId) {
    if (!window.confirm('Cancel this visit request?')) return
    setCancelling(visitId)
    try {
      await api.cancelVisit(visitId)
      setVisits(prev => prev.map(v => v.id === visitId ? { ...v, status: 'cancelled' } : v))
    } catch (err) {
      alert('Failed to cancel: ' + err.message)
    } finally {
      setCancelling(null)
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
          <h2 style={s.title}>My Visit Bookings</h2>
          <p style={s.sub}>Track all your scheduled room visits</p>
        </div>
        <div style={s.hint}>
          <span style={s.hintIcon}>💡</span>
          <span style={s.hintText}>To book a visit, go to Browse Listings and click "Book Visit" on any listing</span>
        </div>
      </div>

      <div style={s.content}>
        <div style={s.statsRow}>
          {[
            { label: 'Total Visits', value: counts.all,     color: '#5e6666' },
            { label: 'Pending',      value: counts.pending,  color: '#92400e' },
            { label: 'Approved',     value: counts.approved, color: '#166534' },
            { label: 'Rejected',     value: counts.rejected, color: '#cc0000' },
          ].map((st, i) => (
            <div key={i} style={s.statCard}>
              <div style={s.statLabel}>{st.label}</div>
              <div style={{ ...s.statValue, color: st.color }}>{st.value}</div>
            </div>
          ))}
        </div>

        <div style={s.filterRow}>
          {['all', 'pending', 'approved', 'rejected', 'cancelled', 'expired'].map(f => (
            <button
              key={f}
              style={{ ...s.filterBtn, ...(filter === f ? s.filterBtnOn : {}) }}
              onClick={() => setFilter(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
              <span style={{ ...s.filterCount, ...(filter === f ? s.filterCountOn : {}) }}>
                {counts[f] ?? 0}
              </span>
            </button>
          ))}
          <button style={s.refreshBtn} onClick={loadVisits} title="Refresh">↻</button>
        </div>

        {loading && <div style={s.loading}>Loading visits…</div>}
        {error && !loading && <div style={s.errorBox}>{error}</div>}

        {!loading && !error && filtered.length === 0 && (
          <div style={s.empty}>
            <div style={s.emptyIcon}>📅</div>
            <div style={s.emptyTitle}>{filter === 'all' ? 'No visits booked yet' : `No ${filter} visits`}</div>
            <div style={s.emptySub}>
              {filter === 'all' ? 'Browse listings and click "Book Visit" to schedule a room visit' : `You have no ${filter} visit requests`}
            </div>
            {filter === 'all' && <a href="/browse" style={s.browseLink}>Browse Listings →</a>}
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div style={s.visitsList}>
            {filtered.map(v => {
              const effStatus = effectiveStatus(v)
              const sc = STATUS_CONFIG[effStatus] || STATUS_CONFIG.pending
              return (
                <div key={v.id} style={s.visitCard}>
                  <div style={s.visitLeft}>
                    <div style={s.visitIconWrap}><span style={s.visitIconText}>📅</span></div>
                    <div style={s.visitInfo}>
                      <div style={s.visitTitle}>{v.listing_title}</div>
                      <div style={s.visitLocation}>📍 {v.listing_location}</div>
                      <div style={s.visitMeta}>
                        <span style={s.metaItem}>👤 {v.owner_name}</span>
                        <span style={s.metaDot}>·</span>
                        <span style={s.metaItem}>📅 {formatDate(v.visit_date)}</span>
                        <span style={s.metaDot}>·</span>
                        <span style={s.metaItem}>⏰ {v.visit_time}</span>
                      </div>
                      {v.message && <div style={s.visitMessage}>"{v.message}"</div>}
                    </div>
                  </div>
                  <div style={s.visitRight}>
                    <div style={{ ...s.statusBadge, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>
                      {sc.label}
                    </div>
                    <div style={s.bookedAt}>Booked {formatDate(v.created_at)}</div>
                    {effStatus === 'pending' && (
                      <button
                        style={s.cancelBtn}
                        disabled={cancelling === v.id}
                        onClick={() => handleCancel(v.id)}
                      >
                        {cancelling === v.id ? 'Cancelling…' : 'Cancel'}
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
  topbar:        { background: 'var(--bg-topbar)', borderBottom: '1px solid var(--border-default)', padding: '20px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' },
  title:         { fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.5px' },
  sub:           { fontSize: '13px', color: 'var(--text-faint)', marginTop: '2px' },
  hint:          { display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--warning-bg)', border: '1px solid var(--warning-border)', borderRadius: '10px', padding: '10px 14px', maxWidth: '360px' },
  hintIcon:      { fontSize: '16px', flexShrink: 0 },
  hintText:      { fontSize: '12px', color: 'var(--warning-text)', lineHeight: '1.5' },
  content:       { padding: '24px 32px' },
  statsRow:      { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '24px' },
  statCard:      { background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: '14px', padding: '18px 20px' },
  statLabel:     { fontSize: '12px', color: 'var(--text-faint)', fontWeight: '500', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' },
  statValue:     { fontSize: '28px', fontWeight: '800', letterSpacing: '-1px' },
  filterRow:     { display: 'flex', gap: '8px', marginBottom: '20px', alignItems: 'center', flexWrap: 'wrap' },
  filterBtn:     { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 18px', background: 'var(--bg-card)', border: '1.5px solid var(--border-strong)', borderRadius: '30px', fontSize: '13px', fontWeight: '500', color: 'var(--text-muted)', cursor: 'pointer' },
  filterBtnOn:   { background: 'var(--accent)', color: 'var(--accent-fg)', borderColor: 'var(--accent)' },
  filterCount:   { background: 'var(--bg-muted)', color: 'var(--text-muted)', fontSize: '11px', fontWeight: '700', padding: '1px 7px', borderRadius: '20px' },
  filterCountOn: { background: 'rgba(255,255,255,0.2)', color: 'var(--accent-fg)' },
  refreshBtn:    { marginLeft: 'auto', background: 'var(--bg-card)', border: '1.5px solid var(--border-strong)', borderRadius: '8px', padding: '8px 12px', fontSize: '16px', cursor: 'pointer', color: 'var(--text-muted)' },
  loading:       { textAlign: 'center', padding: '60px 20px', color: 'var(--text-faint)', fontSize: '14px' },
  errorBox:      { background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger-text)', padding: '12px 16px', borderRadius: '10px', fontSize: '13px', marginBottom: '16px' },
  empty:         { textAlign: 'center', padding: '80px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' },
  emptyIcon:     { fontSize: '52px', marginBottom: '8px', opacity: 0.2 },
  emptyTitle:    { fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)' },
  emptySub:      { fontSize: '14px', color: 'var(--text-faint)', maxWidth: '340px', lineHeight: '1.6' },
  browseLink:    { marginTop: '12px', background: 'var(--accent)', color: 'var(--accent-fg)', textDecoration: 'none', padding: '11px 24px', borderRadius: '10px', fontSize: '14px', fontWeight: '700' },
  visitsList:    { display: 'flex', flexDirection: 'column', gap: '12px' },
  visitCard:     { background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: '14px', padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' },
  visitLeft:     { display: 'flex', alignItems: 'flex-start', gap: '14px', flex: 1 },
  visitIconWrap: { width: '44px', height: '44px', borderRadius: '12px', background: 'var(--bg-muted)', border: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  visitIconText: { fontSize: '20px' },
  visitInfo:     { flex: 1 },
  visitTitle:    { fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '3px' },
  visitLocation: { fontSize: '13px', color: 'var(--text-faint)', marginBottom: '8px' },
  visitMeta:     { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' },
  metaItem:      { fontSize: '12px', color: 'var(--text-muted)' },
  metaDot:       { fontSize: '12px', color: 'var(--border-strong)' },
  visitMessage:  { fontSize: '12px', color: 'var(--text-faint)', fontStyle: 'italic', background: 'var(--bg-muted)', padding: '6px 10px', borderRadius: '6px', marginTop: '4px' },
  visitRight:    { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px', flexShrink: 0 },
  statusBadge:   { fontSize: '12px', fontWeight: '700', padding: '6px 14px', borderRadius: '20px', whiteSpace: 'nowrap' },
  bookedAt:      { fontSize: '11px', color: 'var(--text-faint)' },
  cancelBtn:     { background: 'white', color: '#cc0000', border: '1px solid #ffd0d0', borderRadius: '8px', padding: '6px 14px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' },
}