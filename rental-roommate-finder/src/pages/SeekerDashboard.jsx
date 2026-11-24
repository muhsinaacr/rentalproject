import { useNavigate } from 'react-router-dom'
import { useEffect, useState, useCallback } from 'react'

const API = 'http://localhost:5000/api'

function getToken() {
  return sessionStorage.getItem('token') || ''
}

function getGreeting() {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 12) return 'Good morning'
  if (hour >= 12 && hour < 17) return 'Good afternoon'
  if (hour >= 17 && hour < 21) return 'Good evening'
  return 'Good night'
}

export default function SeekerDashboard() {
  const navigate    = useNavigate()
  const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}')

  const [stats,    setStats]    = useState(null)
  const [activity, setActivity] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch(`${API}/dashboard/seeker`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const data = await res.json()
      setStats(data.stats)
      setActivity(data.recentActivity || [])
      setError(null)
    } catch (err) {
      console.error('[SeekerDashboard] fetch error:', err)
      setError('Could not load dashboard data. Please refresh.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDashboard()
    const timer = setInterval(fetchDashboard, 60_000)
    return () => clearInterval(timer)
  }, [fetchDashboard])

  const statCards = stats
    ? [
        { label: 'LISTINGS VIEWED', value: stats.listingsViewed, change: `+${stats.todayViewed} today`,      show: stats.todayViewed > 0 },
        { label: 'AI MATCHES',      value: stats.aiMatches,      change: `${stats.newMatches} new`,           show: stats.newMatches > 0 },
        { label: 'SAVED LISTINGS',  value: stats.savedListings,  change: `${stats.recentSaved} added`,        show: stats.recentSaved > 0 },
        { label: 'MESSAGES',        value: stats.messages,       change: `${stats.unreadMessages} unread`,    show: stats.unreadMessages > 0 },
      ]
    : [
        { label: 'LISTINGS VIEWED', value: '\u2013', change: '', show: false },
        { label: 'AI MATCHES',      value: '\u2013', change: '', show: false },
        { label: 'SAVED LISTINGS',  value: '\u2013', change: '', show: false },
        { label: 'MESSAGES',        value: '\u2013', change: '', show: false },
      ]

  const actions = [
    { label: 'Browse Listings',     desc: 'Find rooms near you',    path: '/browse' },
    { label: 'AI Matcher',          desc: 'Get compatible matches', path: '/ai-matcher' },
    { label: 'Bookmarks',           desc: 'Saved listings',         path: '/bookmarks' },
    { label: 'Chat',                desc: 'Talk to owners',         path: '/seeker-chat' },
    { label: 'My Visits',           desc: 'Scheduled visits',       path: '/my-visits' },
    { label: 'Negotiation Advisor', desc: 'AI rent tips',           path: '/negotiation' },
    { label: 'Notifications',       desc: 'Latest updates',         path: '/seeker-notifications' },
    { label: 'Export Report',       desc: 'Download PDF',           path: '/export' },
  ]

  return (
    <div style={s.page}>
      <div style={s.topbar}>
        <div>
          <h2 style={s.title}>Dashboard</h2>
          <p style={s.sub}>{getGreeting()}, {currentUser.name} 👋</p>
        </div>
        <button style={s.editBtn} onClick={() => navigate('/profile-setup')}>
          ✏️ Edit Profile
        </button>
      </div>

      <div style={s.content}>
        <div style={s.statsGrid}>
          {statCards.map((st, i) => (
            <div key={i} style={s.statCard}>
              <div style={s.statLabel}>{st.label}</div>
              <div style={s.statValue}>
                {loading ? <span style={s.skeleton} /> : st.value}
              </div>
              {st.show && st.change && (
                <div style={s.statChange}>↑ {st.change}</div>
              )}
            </div>
          ))}
        </div>

        <h3 style={s.sectionTitle}>Quick Actions</h3>
        <div style={s.actionsGrid}>
          {actions.map((a, i) => (
            <div key={i} style={s.actionCard} onClick={() => navigate(a.path)}>
              <div style={s.actionDot} />
              <div style={s.actionLabel}>{a.label}</div>
              <div style={s.actionDesc}>{a.desc}</div>
            </div>
          ))}
        </div>

        <h3 style={s.sectionTitle}>Recent Activity</h3>
        <div style={s.activityCard}>
          {loading ? (
            [1, 2, 3, 4].map(i => (
              <div key={i} style={s.activityItem}>
                <div style={{ ...s.activityDot, background: 'var(--border-default)' }} />
                <div style={{ ...s.activityText, height: '13px', background: 'var(--border-default)', borderRadius: '4px', width: '60%' }} />
                <div style={s.activityTime} />
              </div>
            ))
          ) : error ? (
            <div style={s.activityItem}>
              <div style={{ ...s.activityDot, background: '#ef4444' }} />
              <div style={s.activityText}>{error}</div>
              <button style={s.retryBtn} onClick={fetchDashboard}>Retry</button>
            </div>
          ) : activity.length === 0 ? (
            <div style={s.activityItem}>
              <div style={{ ...s.activityDot, background: 'var(--text-faint)' }} />
              <div style={s.activityText}>No recent activity yet. Start browsing listings!</div>
              <div style={s.activityTime} />
            </div>
          ) : (
            activity.map((a) => (
              <div key={a.id} style={s.activityItem}>
                <div style={{ ...s.activityDot, background: a.color || 'var(--text-primary)' }} />
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

const s = {
  page:        { minHeight: '100vh', background: 'var(--bg-page)', fontFamily: "'Segoe UI', sans-serif" },
  topbar:      { background: 'var(--bg-topbar)', borderBottom: '1px solid var(--border-default)', padding: '20px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title:       { fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.5px' },
  sub:         { fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' },
  editBtn:     { background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1.5px solid var(--border-strong)', borderRadius: '10px', padding: '9px 18px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' },
  content:     { padding: '28px 32px' },
  statsGrid:   { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '32px' },
  statCard:    { background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: '14px', padding: '20px' },
  statLabel:   { fontSize: '12px', color: 'var(--text-faint)', fontWeight: '500', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' },
  statValue:   { fontSize: '28px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-1px', minHeight: '34px' },
  statChange:  { fontSize: '12px', color: 'var(--stat-change)', marginTop: '6px', fontWeight: '500' },
  skeleton:    { display: 'inline-block', width: '48px', height: '28px', background: 'var(--border-default)', borderRadius: '6px' },
  sectionTitle:{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '14px' },
  actionsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '32px' },
  actionCard:  { background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: '14px', padding: '18px', cursor: 'pointer', transition: 'border-color 0.15s' },
  actionDot:   { width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent)', marginBottom: '12px' },
  actionLabel: { fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' },
  actionDesc:  { fontSize: '12px', color: 'var(--text-faint)' },
  activityCard:{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: '14px', overflow: 'hidden' },
  activityItem:{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 20px', borderBottom: '1px solid var(--border-default)' },
  activityDot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },
  activityText:{ flex: 1, fontSize: '13px', color: 'var(--text-secondary)' },
  activityTime:{ fontSize: '12px', color: 'var(--text-faint)', whiteSpace: 'nowrap' },
  retryBtn:    { fontSize: '12px', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600' },
}