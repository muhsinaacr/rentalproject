import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../utils/api'
import { getCurrentUser } from '../utils/storage'
import { getSeekerReplyNotifs } from './Reviews'

// Semantic status colours — fixed so they stay meaningful in both themes
const TYPE_CONFIG = {
  match:   { icon: '🤖', bg: '#f5f5ff', border: '#e0e0ff', label: 'AI Match' },
  message: { icon: '💬', bg: '#f5f5f5', border: '#e5e7eb', label: 'Message' },
  fraud:   { icon: '⚠️', bg: '#fffbeb', border: '#fde68a', label: 'Fraud Alert' },
  listing: { icon: '🏠', bg: '#f5f5f5', border: '#e5e7eb', label: 'New Listing' },
  visit:   { icon: '📅', bg: '#f0fdf4', border: '#bbf7d0', label: 'Visit Update' },
  reply:   { icon: '↩️', bg: '#fef3c7', border: '#fde68a', label: 'Owner Reply' },
  warning: { icon: '🚨', bg: '#fff1f2', border: '#fecdd3', label: 'Warning' },
  system:  { icon: '🔔', bg: '#f5f5f5', border: '#e5e7eb', label: 'System' },
}

const POLL_INTERVAL = 30_000 // 30 seconds for near-real-time updates

export default function SeekerNotifications() {
  const currentUser                       = getCurrentUser()
  const [notifications, setNotifications] = useState([])
  const [filter, setFilter]               = useState('All')
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState(null)
  const [markingAll, setMarkingAll]       = useState(false)
  const pollRef                           = useRef(null)

  // ── Fetch notifications from backend ──────────────────────────────────────
  const fetchNotifications = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const data = await api.getNotifications()
      const list = Array.isArray(data) ? data : (data.notifications || [])

      // Merge owner reply notifications from localStorage
      const replyNotifs = currentUser?.id
        ? getSeekerReplyNotifs(currentUser.id).map(n => ({
            id:         `reply-${n.reviewId}`,
            type:       'reply',
            title:      'Owner Replied to Your Review!',
            text:       `${n.ownerName} replied to your review on "${n.listingTitle}": "${n.replyText.slice(0, 80)}${n.replyText.length > 80 ? '…' : ''}"`,
            time:       n.created_at,
            created_at: n.created_at,
            read:       false,
          }))
        : []

      // Merge: add reply notifs that aren't already in the backend list
      const backendIds = new Set(list.map(n => String(n.id)))
      const newReplies = replyNotifs.filter(n => !backendIds.has(String(n.id)))
      const merged     = [...newReplies, ...list]
      setNotifications(merged)
    } catch (err) {
      if (!silent) setError(err.message || 'Failed to load notifications')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [currentUser?.id])

  // ── Initial load + polling ─────────────────────────────────────────────────
  useEffect(() => {
    fetchNotifications()
    pollRef.current = setInterval(() => fetchNotifications(true), POLL_INTERVAL)
    return () => clearInterval(pollRef.current)
  }, [fetchNotifications])

  // Mark all notifications as read when page opens — clears the navbar badge
  useEffect(() => {
    if (!currentUser?.id) return
    // Mark reply notifs as seen in localStorage
    const key     = `rentmate_seeker_reply_seen_${currentUser.id}`
    const notifs  = getSeekerReplyNotifs(currentUser.id)
    const seenIds = notifs.map(n => n.reviewId)
    localStorage.setItem(key, JSON.stringify(seenIds))
    window.dispatchEvent(new Event('reviewsSeen'))
    // Mark all backend notifications as read, then reset the Navbar badge
    api.markAllRead()
      .catch(() => {})
      .finally(() => {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })))
        window.dispatchEvent(new Event('seekerNotifsRead'))
      })
  }, [currentUser?.id])

  // Listen for new reply notifications dispatched from Reviews page
  useEffect(() => {
    const handler = () => fetchNotifications(true)
    window.addEventListener('replyNotifAdded', handler)
    return () => window.removeEventListener('replyNotifAdded', handler)
  }, [fetchNotifications])
  async function markRead(id) {
    // Optimistic update
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
    try {
      await api.markNotificationRead(id)
    } catch {
      // Silently revert on failure — refetch will restore real state
      fetchNotifications(true)
    }
  }

  // ── Mark all as read ───────────────────────────────────────────────────────
  async function markAllRead() {
    setMarkingAll(true)
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    try {
      await api.markAllRead()
    } catch {
      fetchNotifications(true)
    } finally {
      setMarkingAll(false)
    }
  }

  // ── Delete / dismiss one notification ─────────────────────────────────────
  async function deleteNotif(id) {
    // Optimistic remove
    setNotifications(prev => prev.filter(n => n.id !== id))
    try {
      await api.deleteNotification(id)
    } catch {
      fetchNotifications(true)
    }
  }

  // ── Derived state ──────────────────────────────────────────────────────────
  const unread = notifications.filter(n => !n.read).length

  const filters = ['All', 'Unread', 'Match', 'Message', 'Visit', 'Reply', 'Fraud', 'Listing', 'Warning']
  const filtered = notifications.filter(n => {
    if (filter === 'All')    return true
    if (filter === 'Unread') return !n.read
    return n.type === filter.toLowerCase()
  })

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={s.page}>
      <div style={s.topbar}>
        <div>
          <h2 style={s.title}>
            Notifications
            {unread > 0 && <span style={s.badge}>{unread}</span>}
          </h2>
          <p style={s.sub}>Your room search updates and alerts</p>
        </div>
        <div style={s.topbarRight}>
          <div style={s.seekerTag}>🙋 Seeker Notifications</div>
          {unread > 0 && (
            <button style={s.markBtn} onClick={markAllRead} disabled={markingAll}>
              {markingAll ? 'Marking…' : 'Mark all read'}
            </button>
          )}
        </div>
      </div>

      <div style={s.content}>
        {/* Filter chips */}
        <div style={s.filterRow}>
          {filters.map(f => (
            <button
              key={f}
              style={{ ...s.chip, ...(filter === f ? s.chipOn : {}) }}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Loading state */}
        {loading && (
          <div style={s.empty}>
            <div style={{ fontSize: '30px', marginBottom: '12px', opacity: 0.3 }}>⏳</div>
            <div style={s.emptyText}>Loading notifications…</div>
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div style={{ ...s.empty, color: 'var(--text-secondary)' }}>
            <div style={{ fontSize: '30px', marginBottom: '8px' }}>⚠️</div>
            <div style={s.emptyText}>{error}</div>
            <button style={{ ...s.markBtn, marginTop: '12px' }} onClick={() => fetchNotifications()}>
              Retry
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && filtered.length === 0 && (
          <div style={s.empty}>
            <div style={{ fontSize: '40px', marginBottom: '12px', opacity: 0.2 }}>🔔</div>
            <div style={s.emptyText}>No notifications here</div>
          </div>
        )}

        {/* Notification list */}
        {!loading && !error && (
          <div style={s.list}>
            {filtered.map(n => {
              const config = TYPE_CONFIG[n.type] || TYPE_CONFIG.system
              return (
                <div
                  key={n.id}
                  style={{ ...s.notifCard, ...(n.read ? {} : s.notifUnread) }}
                  onClick={() => !n.read && markRead(n.id)}
                >
                  <div style={{ ...s.iconWrap, background: config.bg, border: `1px solid ${config.border}` }}>
                    <span style={{ fontSize: '18px' }}>{config.icon}</span>
                  </div>
                  <div style={s.notifBody}>
                    <div style={s.notifTop}>
                      <span style={s.notifTitle}>{n.title}</span>
                      {!n.read && <span style={s.unreadDot} />}
                      <span style={{ ...s.typeTag, background: config.bg, color: '#374151', border: `1px solid ${config.border}` }}>
                        {config.label}
                      </span>
                    </div>
                    <div style={s.notifText}>{n.text}</div>
                    <div style={s.notifTime}>{n.time}</div>
                  </div>
                  <button
                    style={s.deleteBtn}
                    onClick={e => { e.stopPropagation(); deleteNotif(n.id) }}
                    title="Dismiss"
                  >
                    ✕
                  </button>
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
  page:        { minHeight: '100vh', background: 'var(--bg-page)', fontFamily: "'Segoe UI', sans-serif" },
  topbar:      { background: 'var(--bg-topbar)', borderBottom: '1px solid var(--border-default)', padding: '20px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title:       { fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.5px', display: 'flex', alignItems: 'center', gap: '10px' },
  badge:       { background: 'var(--accent)', color: 'var(--accent-fg)', fontSize: '12px', fontWeight: '700', padding: '2px 8px', borderRadius: '20px' },
  sub:         { fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' },
  topbarRight: { display: 'flex', alignItems: 'center', gap: '12px' },
  seekerTag:   { background: 'var(--filter-bg)', color: 'var(--filter-text)', border: '1px solid var(--filter-border)', fontSize: '12px', fontWeight: '600', padding: '6px 14px', borderRadius: '20px' },
  markBtn:     { background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1.5px solid var(--border-strong)', borderRadius: '10px', padding: '8px 16px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' },
  content:     { padding: '24px 32px', maxWidth: '720px' },
  filterRow:   { display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' },
  chip:        { padding: '6px 14px', border: '1.5px solid var(--border-strong)', borderRadius: '30px', fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer', background: 'var(--bg-card)', fontWeight: '500' },
  chipOn:      { background: 'var(--accent)', color: 'var(--accent-fg)', borderColor: 'var(--accent)' },
  empty:       { textAlign: 'center', padding: '60px 20px' },
  emptyText:   { fontSize: '14px', color: 'var(--text-faint)' },
  list:        { display: 'flex', flexDirection: 'column', gap: '10px' },
  notifCard:   { background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: '14px', padding: '16px 20px', display: 'flex', alignItems: 'flex-start', gap: '14px', cursor: 'pointer', transition: 'all 0.15s' },
  notifUnread: { borderColor: 'var(--border-strong)', boxShadow: '0 1px 8px rgba(0,0,0,0.06)' },
  iconWrap:    { width: '44px', height: '44px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  notifBody:   { flex: 1 },
  notifTop:    { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' },
  notifTitle:  { fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' },
  unreadDot:   { width: '7px', height: '7px', borderRadius: '50%', background: 'var(--accent)', display: 'inline-block', flexShrink: 0 },
  typeTag:     { fontSize: '10px', fontWeight: '600', padding: '2px 8px', borderRadius: '4px' },
  notifText:   { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5', marginBottom: '6px' },
  notifTime:   { fontSize: '11px', color: 'var(--text-faint)' },
  deleteBtn:   { background: 'none', border: 'none', color: 'var(--text-faint)', fontSize: '14px', cursor: 'pointer', padding: '4px', flexShrink: 0 },
}