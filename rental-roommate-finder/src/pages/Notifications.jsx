import { useState } from 'react'

const INITIAL = [
  { id: 1, type: 'match', title: 'New AI Match Found!', text: 'A new listing in Kochi matches 94% of your preferences.', time: '2 hours ago', read: false },
  { id: 2, type: 'message', title: 'New Message', text: 'Rahul Menon sent you a message about MG Road listing.', time: '5 hours ago', read: false },
  { id: 3, type: 'fraud', title: 'Fraud Alert', text: 'A listing you saved has been flagged as suspicious by our AI.', time: '1 day ago', read: false },
  { id: 4, type: 'listing', title: 'New Listing in Your Area', text: 'A new single room is available in Ernakulam within your budget.', time: '1 day ago', read: true },
  { id: 5, type: 'review', title: 'New Review Received', text: 'You received a 5-star review from Arjun P S.', time: '2 days ago', read: true },
  { id: 6, type: 'agreement', title: 'Agreement Ready', text: 'Your rental agreement for MG Road listing has been generated.', time: '3 days ago', read: true },
  { id: 7, type: 'match', title: 'Roommate Match Update', text: 'Your compatibility score with Alan Willy is now 91%.', time: '4 days ago', read: true },
]

// Note: icon bg/border colors are kept as literal values intentionally
// because they are semantic status colors (not theme colors) that need
// to remain consistent across light and dark mode for meaning/recognition.
const TYPE_CONFIG = {
  match:     { icon: '🤖', bg: '#f5f5ff', border: '#e0e0ff' },
  message:   { icon: '💬', bg: 'var(--bg-muted)', border: 'var(--border-strong)' },
  fraud:     { icon: '⚠️', bg: '#fffbeb', border: '#fde68a' },
  listing:   { icon: '🏠', bg: 'var(--bg-muted)', border: 'var(--border-strong)' },
  review:    { icon: '⭐', bg: 'var(--bg-muted)', border: 'var(--border-strong)' },
  agreement: { icon: '📄', bg: 'var(--success-bg)', border: 'var(--success-border)' },
}

export default function Notifications() {
  const [notifications, setNotifications] = useState(INITIAL)
  const [filter, setFilter] = useState('All')
  const unreadCount = notifications.filter(n => !n.read).length

  function markAllRead() {
    setNotifications(notifications.map(n => ({ ...n, read: true })))
  }

  function markRead(id) {
    setNotifications(notifications.map(n => n.id === id ? { ...n, read: true } : n))
  }

  function deleteNotif(id) {
    setNotifications(notifications.filter(n => n.id !== id))
  }

  const filters = ['All', 'Unread', 'Match', 'Message', 'Fraud', 'Listing']
  const filtered = notifications.filter(n => {
    if (filter === 'All') return true
    if (filter === 'Unread') return !n.read
    return n.type === filter.toLowerCase()
  })

  return (
    <div style={s.page}>
      <div style={s.topbar}>
        <div>
          <h2 style={s.title}>
            Notifications {unreadCount > 0 && <span style={s.badge}>{unreadCount}</span>}
          </h2>
          <p style={s.sub}>Stay updated with your latest activity</p>
        </div>
        {unreadCount > 0 && (
          <button style={s.markBtn} onClick={markAllRead}>Mark all as read</button>
        )}
      </div>

      <div style={s.content}>
        <div style={s.filterRow}>
          {filters.map(f => (
            <button key={f} style={{ ...s.chip, ...(filter === f ? s.chipOn : {}) }} onClick={() => setFilter(f)}>{f}</button>
          ))}
        </div>

        {filtered.length === 0 && (
          <div style={s.empty}>
            <div style={{ fontSize: '40px', marginBottom: '12px', opacity: 0.2 }}>🔔</div>
            <div style={s.emptyText}>No notifications here</div>
          </div>
        )}

        <div style={s.list}>
          {filtered.map(n => {
            const config = TYPE_CONFIG[n.type] || TYPE_CONFIG.message
            return (
              <div key={n.id} style={{ ...s.notifCard, ...(n.read ? {} : s.notifUnread) }} onClick={() => markRead(n.id)}>
                <div style={{ ...s.iconWrap, background: config.bg, border: `1px solid ${config.border}` }}>
                  <span style={{ fontSize: '18px' }}>{config.icon}</span>
                </div>
                <div style={s.notifBody}>
                  <div style={s.notifTitle}>
                    {n.title}
                    {!n.read && <span style={s.unreadDot} />}
                  </div>
                  <div style={s.notifText}>{n.text}</div>
                  <div style={s.notifTime}>{n.time}</div>
                </div>
                <button style={s.deleteBtn} onClick={e => { e.stopPropagation(); deleteNotif(n.id) }}>✕</button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

const s = {
  page: { minHeight: '100vh', background: 'var(--bg-page)', fontFamily: "'Segoe UI', sans-serif" },
  topbar: { background: 'var(--bg-topbar)', borderBottom: '1px solid var(--border-default)', padding: '20px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.5px', display: 'flex', alignItems: 'center', gap: '10px' },
  badge: { background: 'var(--accent)', color: 'var(--accent-fg)', fontSize: '12px', fontWeight: '700', padding: '2px 8px', borderRadius: '20px' },
  sub: { fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' },
  markBtn: { background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1.5px solid var(--border-strong)', borderRadius: '10px', padding: '9px 18px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' },
  content: { padding: '28px 32px', maxWidth: '720px' },
  filterRow: { display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' },
  chip: { padding: '6px 16px', border: '1.5px solid var(--border-strong)', borderRadius: '30px', fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer', background: 'var(--bg-card)', fontWeight: '500' },
  chipOn: { background: 'var(--accent)', color: 'var(--accent-fg)', borderColor: 'var(--accent)' },
  empty: { textAlign: 'center', padding: '60px 20px' },
  emptyText: { fontSize: '14px', color: 'var(--text-faint)' },
  list: { display: 'flex', flexDirection: 'column', gap: '10px' },
  notifCard: { background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: '14px', padding: '16px 20px', display: 'flex', alignItems: 'flex-start', gap: '14px', cursor: 'pointer', transition: 'all 0.15s' },
  notifUnread: { borderColor: 'var(--border-strong)', boxShadow: '0 1px 8px rgba(0,0,0,0.06)' },
  iconWrap: { width: '44px', height: '44px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  notifBody: { flex: 1 },
  notifTitle: { fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' },
  unreadDot: { width: '7px', height: '7px', borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' },
  notifText: { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5', marginBottom: '6px' },
  notifTime: { fontSize: '11px', color: 'var(--text-faint)' },
  deleteBtn: { background: 'none', border: 'none', color: 'var(--text-faint)', fontSize: '14px', cursor: 'pointer', padding: '4px', flexShrink: 0 },
}
