import { useState, useEffect } from 'react'
import { api } from '../utils/api'
import { useNavigate } from 'react-router-dom'

// ── Fetch owner dashboard stats from the backend ──────────────────────────────
function fetchOwnerDashboard() {
  const token = sessionStorage.getItem('token')
  return fetch('http://localhost:5000/api/dashboard/owner', {
    headers: { Authorization: `Bearer ${token}` },
  }).then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json()
  })
}

// ── Stat icon map ─────────────────────────────────────────────────────────────
function statIcon(label) {
  const map = {
    'My Listings':    '🏠',
    'Active':         '✅',
    'Total Views':    '👁️',
    'Inquiries':      '🔑',
    'Unread Msgs':    '💬',
    'Pending Visits': '📅',
    'Agreements':     '📄',
    'Avg Rating':     '⭐',
  }
  return map[label] || '📊'
}

// ─────────────────────────────────────────────────────────────────────────────
export default function OwnerDashboard() {
  const navigate = useNavigate()
  const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}')
  const profile = currentUser.profile || {}

  const [dashData, setDashData] = useState(null)   // { stats, recentActivity }
  const [listings, setListings] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  useEffect(() => {
    Promise.all([
      fetchOwnerDashboard(),
      api.getMyListings().catch(() => []),
    ])
      .then(([dash, listData]) => {
        setDashData(dash)
        setListings(Array.isArray(listData) ? listData : (listData?.listings || []))
      })
      .catch(err => {
        console.error('[OwnerDashboard] fetch error:', err)
        setError('Could not load dashboard data. Please refresh.')
        // Fall back to just listing count
        api.getMyListings()
          .then(d => setListings(Array.isArray(d) ? d : (d?.listings || [])))
          .catch(() => {})
      })
      .finally(() => setLoading(false))
  }, [])

  // ── Stat card data (from real API) ────────────────────────────────────────
  const st = dashData?.stats || {}

  const mainStats = [
    {
      label:  'My Listings',
      value:  loading ? '…' : (st.totalListings ?? listings.length ?? 0),
      change: st.activeListings != null ? `${st.activeListings} active` : 'Total posted',
    },
    {
      label:  'Total Views',
      value:  loading ? '…' : (st.totalViews ?? '—'),
      change: st.todayViews != null ? `+${st.todayViews} today` : 'Across listings',
    },
    {
      label:  'Inquiries',
      value:  loading ? '…' : (st.inquiries ?? '—'),
      change: st.newInquiries != null ? `${st.newInquiries} new this week` : 'Contact unlocks',
    },
    {
      label:  'Agreements',
      value:  loading ? '…' : (st.agreements ?? '—'),
      change: 'Generated',
    },
  ]

  const extraStats = [
    {
      label: 'Unread Msgs',
      value: loading ? '…' : (st.unreadMessages ?? '—'),
      sub:   st.totalConvos != null ? `${st.totalConvos} conversations` : '',
    },
    {
      label: 'Pending Visits',
      value: loading ? '…' : (st.pendingVisits ?? '—'),
      sub:   st.totalVisits != null ? `${st.totalVisits} total visits` : '',
    },
    {
      label: 'Avg Rating',
      value: loading ? '…' : (st.avgRating != null ? `${st.avgRating}★` : '—'),
      sub:   st.totalReviews != null ? `${st.totalReviews} reviews` : '',
    },
  ]

  const actions = [
    { label: 'Add New Listing', desc: 'Post a room now',   path: '/listing-manager', state: { openForm: true }, highlight: true },
    { label: 'My Listings',     desc: 'Manage your rooms', path: '/listing-manager' },
    { label: 'Chat',            desc: 'Talk to seekers',   path: '/owner-chat' },
    { label: 'Agreement',       desc: 'Create rental doc', path: '/agreement' },
    { label: 'Reviews',         desc: 'See your ratings',  path: '/reviews' },
    { label: 'Notifications',   desc: 'Latest updates',    path: '/owner-notifications' },
  ]

  const activity = dashData?.recentActivity || []

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={s.page}>

      {/* Top bar */}
      <div style={s.topbar}>
        <div>
          <div style={s.roleTag}>🏠 Room Owner</div>
          <h2 style={s.title}>Owner Dashboard</h2>
          <p style={s.sub}>Welcome back, {currentUser.name} 👋</p>
        </div>
        <div style={s.topbarRight}>
          <button style={s.profileBtn} onClick={() => navigate('/profile-setup')}>Edit Profile</button>
        </div>
      </div>

      <div style={s.content}>

        {/* Owner Profile Summary */}
        {(profile.city || profile.occupation || profile.bio || profile.age) && (
          <div style={s.profileSummary}>
            <div style={s.summaryLeft}>
              <div style={s.summaryAvatar}>{currentUser.name?.charAt(0)}</div>
              <div>
                <div style={s.summaryName}>
                  {currentUser.name}
                  {(profile.is_verified || profile.isVerified) && (
                    <span style={{ marginLeft: '8px', fontSize: '12px', color: '#16a34a', fontWeight: '700' }}>✅ Verified Owner</span>
                  )}
                </div>
                {profile.occupation && <div style={s.summaryDetail}>💼 {profile.occupation}</div>}
                {profile.city      && <div style={s.summaryDetail}>📍 {profile.city}</div>}
                {profile.bio       && <div style={{ ...s.summaryDetail, fontStyle: 'italic' }}>{profile.bio}</div>}
              </div>
            </div>
            <div style={s.summaryAmenities}>
              {profile.age   && <span style={s.amenityTag}>🎂 {profile.age} yrs</span>}
              {profile.phone && <span style={s.amenityTag}>📞 {profile.phone}</span>}
            </div>
          </div>
        )}

        {/* Error banner */}
        {error && <div style={s.errorBanner}>⚠️ {error}</div>}

        {/* Main stats — 4 columns */}
        <div style={s.statsGrid}>
          {mainStats.map((st, i) => (
            <div key={i} style={s.statCard}>
              <div style={s.statLabel}>{statIcon(st.label)} {st.label}</div>
              <div style={s.statValue}>{st.value}</div>
              {st.change && <div style={s.statChange}>↑ {st.change}</div>}
            </div>
          ))}
        </div>

        {/* Extra metrics — 3 columns (only when data is loaded) */}
        {!loading && dashData && (
          <div style={s.extrasGrid}>
            {extraStats.map((ex, i) => (
              <div key={i} style={s.extraCard}>
                <div style={s.extraLabel}>{statIcon(ex.label)} {ex.label}</div>
                <div style={s.extraValue}>{ex.value}</div>
                {ex.sub && <div style={s.statSub}>{ex.sub}</div>}
              </div>
            ))}
          </div>
        )}

        {/* Quick Actions */}
        <h3 style={s.sectionTitle}>Quick Actions</h3>
        <div style={s.actionsGrid}>
          {actions.map((a, i) => (
            <div
              key={i}
              style={{ ...s.actionCard, ...(a.highlight ? s.actionHighlight : {}) }}
              onClick={() => navigate(a.path, a.state ? { state: a.state } : {})}
            >
              <div style={{
                ...s.actionDot,
                background: a.highlight ? 'var(--action-highlight-text)' : 'var(--btn-primary-bg)',
              }} />
              <div style={{
                ...s.actionLabel,
                color: a.highlight ? 'var(--action-highlight-text)' : 'var(--text-primary)',
              }}>
                {a.label}
              </div>
              <div style={{
                ...s.actionDesc,
                color: a.highlight ? 'var(--action-highlight-desc)' : 'var(--text-muted)',
              }}>
                {a.desc}
              </div>
            </div>
          ))}
        </div>

        {/* Recent Listings */}
        <h3 style={s.sectionTitle}>My Recent Listings</h3>
        {loading ? (
          <div style={s.loadingBox}>Loading listings…</div>
        ) : listings.length === 0 ? (
          <div style={s.emptyListings}>
            <div style={{ fontSize: '32px', marginBottom: '10px', opacity: 0.2 }}>🏠</div>
            <div style={s.emptyTitle}>No listings yet</div>
            <div style={s.emptySub}>Post your first room to start getting inquiries</div>
            <button style={s.addBtn} onClick={() => navigate('/listing-manager', { state: { openForm: true } })}>
              + Add First Listing
            </button>
          </div>
        ) : (
          <div style={s.listingsRow}>
            {listings.slice(0, 3).map(l => (
              <div key={l.id} style={s.listingCard}>
                {l.photos?.[0]?.url ? (
                  <img src={l.photos[0].url} alt={l.title} style={s.listingImgReal} />
                ) : (
                  <div style={s.listingImg}><span style={{ fontSize: '24px', opacity: 0.15 }}>🏠</span></div>
                )}
                <div style={s.listingBody}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    <div style={s.listingPrice}>
                      ₹{Number(l.price).toLocaleString()}<span style={s.perMonth}>/mo</span>
                    </div>
                    <span style={{
                      ...s.statusBadge,
                      background: l.status === 'verified' ? '#dcfce7' : '#fef9c3',
                      color:      l.status === 'verified' ? '#16a34a' : '#854d0e',
                    }}>
                      {l.status === 'verified' ? 'Active' : l.status === 'pending' ? 'Pending' : l.status}
                    </span>
                  </div>
                  <div style={s.listingTitle}>{l.title}</div>
                  <div style={s.listingLoc}>📍 {l.location}</div>
                  <div style={s.listingStats}>
                    <span>👁️ {l.views || 0} views</span>
                    <span>🔑 {l.inquiries || 0} inquiries</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Recent Activity (real, from backend) */}
        <h3 style={s.sectionTitle}>Recent Activity</h3>
        <div style={s.activityCard}>
          {loading ? (
            <div style={s.activityEmpty}>Loading activity…</div>
          ) : activity.length === 0 ? (
            <div style={s.activityEmpty}>No recent activity yet — your dashboard will populate as seekers interact with your listings.</div>
          ) : (
            activity.map((a, i) => (
              <div
                key={a.id || i}
                style={{
                  ...s.activityItem,
                  background: a.read ? 'transparent' : 'var(--bg-secondary)',
                  borderBottom: i < activity.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                }}
              >
                <div style={{ ...s.activityDot, background: a.color }} />
                <div style={s.activityText}>{a.text}</div>
                <div style={s.activityTime}>{a.time}</div>
              </div>
            ))
          )}
        </div>

      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = {
  page:         { minHeight: '100vh', background: 'var(--bg-primary)', fontFamily: "'Segoe UI', sans-serif" },

  topbar:       { background: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)', padding: '20px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  roleTag:      { display: 'inline-block', background: 'var(--tag-green-bg)', border: '1px solid var(--tag-green-border)', color: 'var(--tag-green-text)', fontSize: '11px', fontWeight: '600', padding: '3px 10px', borderRadius: '20px', marginBottom: '6px' },
  title:        { fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.5px' },
  sub:          { fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' },
  topbarRight:  { display: 'flex', gap: '10px', alignItems: 'center' },
  profileBtn:   { background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1.5px solid var(--border-color)', borderRadius: '10px', padding: '9px 18px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' },
  addBtn:       { background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)', border: 'none', borderRadius: '10px', padding: '10px 20px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' },

  content:      { padding: '24px 32px' },

  errorBanner:  { background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: '10px', padding: '12px 16px', marginBottom: '20px', fontSize: '13px' },
  loadingBox:   { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '40px', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '28px' },

  profileSummary:   { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '18px 20px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  summaryLeft:      { display: 'flex', alignItems: 'center', gap: '14px' },
  summaryAvatar:    { width: '44px', height: '44px', borderRadius: '50%', background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: '700', flexShrink: 0 },
  summaryName:      { fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' },
  summaryDetail:    { fontSize: '12px', color: 'var(--text-muted)', marginBottom: '2px' },
  summaryAmenities: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
  amenityTag:       { fontSize: '11px', color: 'var(--tag-green-text)', background: 'var(--tag-green-bg)', border: '1px solid var(--tag-green-border)', padding: '3px 8px', borderRadius: '4px' },

  statsGrid:    { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '14px' },
  statCard:     { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '20px' },
  statLabel:    { fontSize: '12px', color: 'var(--text-placeholder)', fontWeight: '500', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' },
  statValue:    { fontSize: '28px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-1px' },
  statChange:   { fontSize: '12px', color: '#10b981', marginTop: '6px', fontWeight: '500' },
  statSub:      { fontSize: '11px', color: 'var(--text-placeholder)', marginTop: '2px' },

  extrasGrid:   { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '28px' },
  extraCard:    { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px' },
  extraLabel:   { fontSize: '11px', color: 'var(--text-placeholder)', fontWeight: '600', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' },
  extraValue:   { fontSize: '22px', fontWeight: '800', color: 'var(--text-primary)' },

  sectionTitle: { fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '14px', marginTop: '8px' },

  actionsGrid:     { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '28px' },
  actionCard:      { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '18px', cursor: 'pointer', transition: 'all 0.15s' },
  actionHighlight: { background: 'var(--action-highlight-bg)', border: '1px solid var(--action-highlight-bg)' },
  actionDot:       { width: '8px', height: '8px', borderRadius: '50%', marginBottom: '12px' },
  actionLabel:     { fontSize: '13px', fontWeight: '700', marginBottom: '4px' },
  actionDesc:      { fontSize: '12px' },

  emptyListings: { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '40px', textAlign: 'center', marginBottom: '28px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' },
  emptyTitle:    { fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' },
  emptySub:      { fontSize: '13px', color: 'var(--text-placeholder)', marginBottom: '10px' },

  listingsRow:    { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '28px' },
  listingCard:    { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden' },
  listingImg:     { height: '100px', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  listingImgReal: { width: '100%', height: '100px', objectFit: 'cover' },
  listingBody:    { padding: '12px 14px' },
  listingPrice:   { fontSize: '16px', fontWeight: '800', color: 'var(--text-primary)' },
  perMonth:       { fontSize: '12px', fontWeight: '400', color: 'var(--text-placeholder)' },
  statusBadge:    { fontSize: '10px', fontWeight: '700', padding: '2px 7px', borderRadius: '20px' },
  listingTitle:   { fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '3px' },
  listingLoc:     { fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' },
  listingStats:   { display: 'flex', gap: '12px', fontSize: '11px', color: 'var(--text-placeholder)' },

  activityCard:  { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px', overflow: 'hidden', marginBottom: '20px' },
  activityItem:  { display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 20px', transition: 'background 0.1s' },
  activityDot:   { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },
  activityText:  { flex: 1, fontSize: '13px', color: 'var(--text-secondary)' },
  activityTime:  { fontSize: '12px', color: 'var(--text-placeholder)', whiteSpace: 'nowrap' },
  activityEmpty: { padding: '24px 20px', textAlign: 'center', fontSize: '13px', color: 'var(--text-placeholder)' },
}