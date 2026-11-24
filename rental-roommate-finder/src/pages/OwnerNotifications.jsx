import { useTheme } from '../context/ThemeContext'
import { useState, useEffect, useCallback } from 'react'
import { getCurrentUser } from '../utils/storage'
import { api } from '../utils/api'

const TYPE_CONFIG = {
  visit:           { icon: '📅', bg: '#f0fdf4', border: '#bbf7d0', label: 'Visit' },
  message:         { icon: '💬', bg: 'var(--bg-secondary)', border: 'var(--input-border)', label: 'Message' },
  review:          { icon: '⭐', bg: '#fffbeb', border: '#fde68a', label: 'Review' },
  performance:     { icon: '📊', bg: 'var(--bg-secondary)', border: 'var(--input-border)', label: 'Performance' },
  inquiry:         { icon: '🔍', bg: '#f0f4ff', border: '#c7d2fe', label: 'Inquiry' },
  warning:         { icon: '🚨', bg: '#fff1f2', border: '#fecdd3', label: 'Warning' },
  system:          { icon: '🔔', bg: 'var(--bg-secondary)', border: 'var(--input-border)', label: 'System' },
  report_resolved: { icon: '✅', bg: '#f0fdf4', border: '#bbf7d0', label: 'Report' },
  report:          { icon: '✅', bg: '#f0fdf4', border: '#bbf7d0', label: 'Report' },
}

export default function OwnerNotifications() {
  const { isDark } = useTheme()
  const currentUser = getCurrentUser()
  const [filter, setFilter] = useState('All')
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchNotifications = useCallback(async () => {
    if (!currentUser?.id) return
    try {
      const data = await api.getOwnerNotifications()
      const notifs = (data?.notifications || []).map(n => ({
        id:    n.id,
        type:  n.type,
        title: n.title,
        text:  n.message || n.text || '',
        time:  n.time,
        read:  n.read || n.is_read || false,
        meta:  n.meta,
      }))
      setNotifications(notifs)
    } catch (err) {
      console.error('[OwnerNotifications] fetch error:', err.message)
    } finally {
      setLoading(false)
    }
  }, [currentUser?.id])

  useEffect(() => {
    fetchNotifications()
    const handler = () => fetchNotifications()
    window.addEventListener('reviewNotifAdded', handler)
    return () => window.removeEventListener('reviewNotifAdded', handler)
  }, [fetchNotifications])

  // Auto-mark all as read when the page is opened
  useEffect(() => {
    async function autoMarkAllRead() {
      try { await api.markOwnerAllRead() } catch (_) {}
      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
      window.dispatchEvent(new Event('ownerNotifsRead'))
    }
    autoMarkAllRead()
  }, []) // runs once on mount

  const unread = notifications.filter(n => !n.read).length

  async function markAllRead() {
    try { await api.markOwnerAllRead() } catch (_) {}
    setNotifications(notifications.map(n => ({ ...n, read: true })))
    window.dispatchEvent(new Event('ownerNotifsRead'))
  }
  async function markRead(id) {
    try { await api.markOwnerNotificationRead(id) } catch (_) {}
    setNotifications(notifications.map(n => n.id === id ? { ...n, read: true } : n))
    window.dispatchEvent(new Event('ownerNotifsRead'))
  }
  function deleteNotif(id) { setNotifications(notifications.filter(n => n.id !== id)) }

  const filters = ['All', 'Unread', 'Visit', 'Message', 'Review', 'Performance', 'Warning', 'Report']
  const filtered = notifications.filter(n => {
    if (filter === 'All')    return true
    if (filter === 'Unread') return !n.read
    if (filter === 'Report') return n.type === 'report' || n.type === 'report_resolved'
    return n.type === filter.toLowerCase()
  })

  return (
    <div style={s.page}>
      <div style={s.topbar}>
        <div>
          <h2 style={s.title}>
            Notifications
            {unread > 0 && <span style={s.badge}>{unread}</span>}
          </h2>
          <p style={s.sub}>Your listing activity and seeker updates</p>
        </div>
        <div style={s.topbarRight}>
          <div style={s.ownerTag}>🏠 Owner Notifications</div>
          {unread > 0 && <button style={s.markBtn} onClick={markAllRead}>Mark all read</button>}
        </div>
      </div>

      <div style={s.content}>
        <div style={s.filterRow}>
          {filters.map(f => (
            <button key={f} style={{ ...s.chip, ...(filter === f ? s.chipOn : {}) }} onClick={() => setFilter(f)}>{f}</button>
          ))}
        </div>

        {loading && (
          <div style={s.empty}>
            <div style={s.emptyText}>Loading notifications…</div>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div style={s.empty}>
            <div style={{ fontSize: '40px', marginBottom: '12px', opacity: 0.2 }}>🔔</div>
            <div style={s.emptyText}>No notifications here</div>
          </div>
        )}

        <div style={s.list}>
          {filtered.map(n => {
            const config = TYPE_CONFIG[n.type] || TYPE_CONFIG.system
            return (
              <div key={n.id} style={{ ...s.notifCard, ...(n.read ? {} : s.notifUnread) }} onClick={() => markRead(n.id)}>
                <div style={{ ...s.iconWrap, background: config.bg, border: `1px solid ${config.border}` }}>
                  <span style={{ fontSize: '18px' }}>{config.icon}</span>
                </div>
                <div style={s.notifBody}>
                  <div style={s.notifTop}>
                    <span style={s.notifTitle}>{n.title}</span>
                    {!n.read && <span style={s.unreadDot} />}
                    <span style={{ ...s.typeTag, background: config.bg, color: 'var(--text-secondary)', border: `1px solid ${config.border}` }}>{config.label}</span>
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
  page:        { minHeight: '100vh', background: 'var(--bg-primary)', fontFamily: "'Segoe UI', sans-serif" },
  topbar:      { background: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)', padding: '20px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title:       { fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.5px', display: 'flex', alignItems: 'center', gap: '10px' },
  badge:       { background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)', fontSize: '12px', fontWeight: '700', padding: '2px 8px', borderRadius: '20px' },
  sub:         { fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' },
  topbarRight: { display: 'flex', alignItems: 'center', gap: '12px' },
  ownerTag:    { background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', fontSize: '12px', fontWeight: '600', padding: '6px 14px', borderRadius: '20px' },
  markBtn:     { background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1.5px solid var(--input-border)', borderRadius: '10px', padding: '8px 16px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' },
  content:     { padding: '24px 32px', maxWidth: '720px' },
  filterRow:   { display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' },
  chip:        { padding: '6px 14px', border: '1.5px solid var(--input-border)', borderRadius: '30px', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer', background: 'var(--bg-card)', fontWeight: '500' },
  chipOn:      { background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)', borderColor: 'var(--btn-primary-bg)' },
  empty:       { textAlign: 'center', padding: '60px 20px' },
  emptyText:   { fontSize: '14px', color: 'var(--text-placeholder)' },
  list:        { display: 'flex', flexDirection: 'column', gap: '10px' },
  notifCard:   { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '16px 20px', display: 'flex', alignItems: 'flex-start', gap: '14px', cursor: 'pointer', transition: 'all 0.15s' },
  notifUnread: { borderColor: 'var(--input-border)', boxShadow: '0 1px 8px rgba(0,0,0,0.04)' },
  iconWrap:    { width: '44px', height: '44px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  notifBody:   { flex: 1 },
  notifTop:    { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' },
  notifTitle:  { fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' },
  unreadDot:   { width: '7px', height: '7px', borderRadius: '50%', background: 'var(--text-primary)', display: 'inline-block', flexShrink: 0 },
  typeTag:     { fontSize: '10px', fontWeight: '600', padding: '2px 8px', borderRadius: '4px' },
  notifText:   { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5', marginBottom: '6px' },
  notifTime:   { fontSize: '11px', color: 'var(--text-placeholder)' },
  deleteBtn:   { background: 'none', border: 'none', color: '#ccc', fontSize: '14px', cursor: 'pointer', padding: '4px', flexShrink: 0 },
}