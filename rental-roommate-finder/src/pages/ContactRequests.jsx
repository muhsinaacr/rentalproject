import { useState, useEffect, useCallback } from 'react'
import { api } from '../utils/api'

const BASE_URL = 'http://localhost:5000/api'

function getToken() {
  return sessionStorage.getItem('token')
}

async function rawRequest(method, path, body) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
    },
  }
  if (body) options.body = JSON.stringify(body)
  const res  = await fetch(BASE_URL + path, options)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins  = Math.floor(diff / 60000)
  const hrs   = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (hrs  < 24) return `${hrs}h ago`
  return `${days}d ago`
}

function Avatar({ name, size = 44 }) {
  const colors = ['#3b82f6','#8b5cf6','#ec4899','#f59e0b','#10b981','#ef4444']
  const color  = colors[(name?.charCodeAt(0) || 0) % colors.length]
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: color, color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.4, fontWeight: '700', letterSpacing: '-0.5px',
    }}>
      {name?.charAt(0).toUpperCase() || '?'}
    </div>
  )
}

function StatusBadge({ status }) {
  const conf = {
    pending:  { bg: '#fef9c3', color: '#713f12', border: '#fde047', icon: '⏳', label: 'Pending' },
    accepted: { bg: '#dcfce7', color: '#166534', border: '#86efac', icon: '✅', label: 'Accepted' },
    rejected: { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5', icon: '❌', label: 'Declined' },
  }
  const c = conf[status] || conf.pending
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '3px 10px', borderRadius: '20px', fontSize: '11px',
      fontWeight: '700', border: `1px solid ${c.border}`,
      background: c.bg, color: c.color,
    }}>
      {c.icon} {c.label}
    </span>
  )
}

// ── Sent Requests Tab ─────────────────────────────────────────────────────────
function SentRequests() {
  const [requests,  setRequests]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [numbers,   setNumbers]   = useState({}) // userId → number
  const [numLoad,   setNumLoad]   = useState({}) // userId → bool

  const loadSent = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await rawRequest('GET', '/whatsapp-requests/sent')
      setRequests(data.requests || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadSent() }, [loadSent])

  async function fetchNumber(targetUserId) {
    setNumLoad(p => ({ ...p, [targetUserId]: true }))
    try {
      const data = await rawRequest('GET', `/whatsapp-requests/number/${targetUserId}`)
      if (data.number) setNumbers(p => ({ ...p, [targetUserId]: data.number }))
    } catch {
      setNumbers(p => ({ ...p, [targetUserId]: 'N/A' }))
    } finally {
      setNumLoad(p => ({ ...p, [targetUserId]: false }))
    }
  }

  if (loading) return <EmptyState icon="⏳" title="Loading sent requests…" sub="" />
  if (error)   return <EmptyState icon="⚠️" title="Could not load requests" sub={error} />
  if (requests.length === 0)
    return <EmptyState icon="📤" title="No sent requests yet" sub="Use the AI Matcher to request someone's WhatsApp number." />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {requests.map(r => (
        <div key={r.id} style={styles.card}>
          <div style={styles.cardHeader}>
            <Avatar name={r.target_name} />
            <div style={{ flex: 1 }}>
              <div style={styles.name}>{r.target_name}</div>
              <div style={styles.sub}>{r.occupation || 'Seeker'}{r.preferred_location ? ` · ${r.preferred_location}` : ''}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
              <StatusBadge status={r.status} />
              <div style={styles.time}>{timeAgo(r.created_at)}</div>
            </div>
          </div>

          {r.message && (
            <div style={styles.messageBubble}>
              <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>Your message:</span>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{r.message}</p>
            </div>
          )}

          {r.status === 'accepted' && (
            <div style={{ marginTop: '12px' }}>
              {numbers[r.target_user_id] ? (
                <a
                  href={`https://wa.me/91${String(numbers[r.target_user_id]).replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={styles.waLink}>
                  💬 Chat on WhatsApp · {numbers[r.target_user_id]}
                </a>
              ) : (
                <button
                  style={styles.revealBtn}
                  onClick={() => fetchNumber(r.target_user_id)}
                  disabled={numLoad[r.target_user_id]}>
                  {numLoad[r.target_user_id] ? '⏳ Loading…' : '📱 Reveal WhatsApp Number'}
                </button>
              )}
            </div>
          )}

          {r.status === 'rejected' && (
            <div style={{ ...styles.statusNote, background: '#fff1f2', color: '#9f1239', border: '1px solid #fecdd3' }}>
              This person declined your request. You cannot view their number.
            </div>
          )}

          {r.status === 'pending' && (
            <div style={{ ...styles.statusNote, background: '#fef9c3', color: '#713f12', border: '1px solid #fde047' }}>
              ⏳ Awaiting response — we'll notify you when they respond.
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Incoming Requests Tab ─────────────────────────────────────────────────────
function IncomingRequests({ onCountChange }) {
  const [requests,  setRequests]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [responding, setResponding] = useState({}) // requestId → bool
  const [filter,    setFilter]    = useState('pending')

  const loadIncoming = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await rawRequest('GET', '/whatsapp-requests/all-incoming')
      const all  = data.requests || []
      setRequests(all)
      const pending = all.filter(r => r.status === 'pending').length
      onCountChange(pending)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [onCountChange])

  useEffect(() => { loadIncoming() }, [loadIncoming])

  async function respond(requestId, action) {
    setResponding(p => ({ ...p, [requestId]: true }))
    try {
      await rawRequest('POST', `/whatsapp-requests/respond/${requestId}`, { action })
      // Optimistic update
      setRequests(prev =>
        prev.map(r => r.id === requestId ? { ...r, status: action } : r)
      )
      const newPending = requests.filter(r => r.id !== requestId && r.status === 'pending').length
      onCountChange(newPending)
    } catch (e) {
      alert('Failed to respond: ' + e.message)
    } finally {
      setResponding(p => ({ ...p, [requestId]: false }))
    }
  }

  const filtered = requests.filter(r => filter === 'all' ? true : r.status === filter)

  if (loading) return <EmptyState icon="⏳" title="Loading incoming requests…" sub="" />
  if (error)   return <EmptyState icon="⚠️" title="Could not load requests" sub={error} />

  return (
    <div>
      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {[['pending','⏳ Pending'], ['accepted','✅ Accepted'], ['rejected','❌ Declined'], ['all','📋 All']].map(([val, lbl]) => (
          <button key={val} onClick={() => setFilter(val)} style={{
            padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: '600', cursor: 'pointer',
            border: filter === val ? '1.5px solid var(--accent)' : '1.5px solid var(--border-strong)',
            background: filter === val ? 'var(--accent)' : 'var(--card-bg)',
            color: filter === val ? 'var(--accent-fg)' : 'var(--text-secondary)',
          }}>
            {lbl}
            <span style={{ marginLeft: '6px', opacity: 0.7 }}>
              ({requests.filter(r => val === 'all' ? true : r.status === val).length})
            </span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={filter === 'pending' ? '📭' : '📋'}
          title={filter === 'pending' ? 'No pending requests' : 'No requests here'}
          sub={filter === 'pending' ? "You're all caught up! No one is waiting for a response." : ''}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {filtered.map(r => (
            <div key={r.id} style={{
              ...styles.card,
              border: r.status === 'pending'
                ? '1.5px solid var(--border-accent)'
                : '1.5px solid var(--card-border)',
            }}>
              <div style={styles.cardHeader}>
                <Avatar name={r.requester_name} />
                <div style={{ flex: 1 }}>
                  <div style={styles.name}>{r.requester_name}</div>
                  <div style={styles.sub}>
                    {r.occupation || 'Seeker'}
                    {r.preferred_location ? ` · ${r.preferred_location}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                  <StatusBadge status={r.status} />
                  <div style={styles.time}>{timeAgo(r.created_at)}</div>
                </div>
              </div>

              {r.message && (
                <div style={styles.messageBubble}>
                  <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>Their message:</span>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{r.message}</p>
                </div>
              )}

              {r.status === 'pending' && (
                <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
                  <button
                    style={styles.acceptBtn}
                    disabled={responding[r.id]}
                    onClick={() => respond(r.id, 'accepted')}>
                    {responding[r.id] ? '⏳' : '✅'} Accept
                  </button>
                  <button
                    style={styles.rejectBtn}
                    disabled={responding[r.id]}
                    onClick={() => respond(r.id, 'rejected')}>
                    {responding[r.id] ? '⏳' : '❌'} Decline
                  </button>
                </div>
              )}

              {r.status === 'accepted' && (
                <div style={{ ...styles.statusNote, background: '#dcfce7', color: '#166534', border: '1px solid #86efac', marginTop: '12px' }}>
                  ✅ You accepted this request. {r.requester_name} can now see your WhatsApp number.
                </div>
              )}

              {r.status === 'rejected' && (
                <div style={{ ...styles.statusNote, background: '#fef2f2', color: '#991b1b', border: '1px solid #fca5a5', marginTop: '12px' }}>
                  You declined this request. {r.requester_name} cannot see your number.
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function EmptyState({ icon, title, sub }) {
  return (
    <div style={{
      textAlign: 'center', padding: '60px 24px',
      background: 'var(--empty-bg)', border: '1px solid var(--border-default)',
      borderRadius: '16px',
    }}>
      <div style={{ fontSize: '40px', marginBottom: '14px', opacity: 0.2 }}>{icon}</div>
      <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px' }}>{title}</div>
      {sub && <div style={{ fontSize: '13px', color: 'var(--text-faint)' }}>{sub}</div>}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ContactRequests() {
  const [tab,          setTab]          = useState('incoming')  // 'incoming' | 'sent'
  const [pendingCount, setPendingCount] = useState(0)

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg-page)',
      fontFamily: "'Segoe UI', sans-serif",
    }}>
      {/* Top bar */}
      <div style={{
        background: 'var(--topbar-bg)',
        borderBottom: '1px solid var(--border-default)',
        padding: '20px 32px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
          <h2 style={{ fontSize: '22px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.5px', margin: 0 }}>
            Contact Requests
          </h2>
          {pendingCount > 0 && (
            <span style={{
              background: '#ef4444', color: '#fff',
              fontSize: '11px', fontWeight: '800',
              padding: '2px 8px', borderRadius: '20px',
              animation: 'pulse 2s infinite',
            }}>
              {pendingCount} pending
            </span>
          )}
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-faint)', margin: 0 }}>
          Manage WhatsApp contact requests — accept or decline to control who sees your number
        </p>
      </div>

      {/* Privacy banner */}
      <div style={{
        margin: '24px 32px 0',
        background: 'linear-gradient(135deg, #eff6ff, #f0fdf4)',
        border: '1px solid #bfdbfe',
        borderRadius: '12px', padding: '14px 20px',
        display: 'flex', alignItems: 'center', gap: '12px',
      }}>
        <span style={{ fontSize: '20px' }}>🔒</span>
        <div>
          <div style={{ fontSize: '13px', fontWeight: '700', color: '#1e40af' }}>Privacy Protected</div>
          <div style={{ fontSize: '12px', color: '#3b82f6', marginTop: '2px' }}>
            Your WhatsApp number is never shared without your explicit approval.
            Only users you Accept can see it.
          </div>
        </div>
      </div>

      {/* Tab switch */}
      <div style={{ margin: '24px 32px 0', display: 'flex', borderBottom: '2px solid var(--border-default)' }}>
        {[
          ['incoming', `📥 Incoming Requests${pendingCount > 0 ? ` (${pendingCount})` : ''}`],
          ['sent',     '📤 Sent Requests'],
        ].map(([val, lbl]) => (
          <button key={val} onClick={() => setTab(val)} style={{
            padding: '10px 20px', fontSize: '13px', fontWeight: '700',
            cursor: 'pointer', border: 'none', borderBottom: tab === val ? '3px solid var(--accent)' : '3px solid transparent',
            background: 'none', color: tab === val ? 'var(--text-primary)' : 'var(--text-faint)',
            marginBottom: '-2px', transition: 'color 0.15s',
          }}>
            {lbl}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: '24px 32px 40px' }}>
        {tab === 'incoming'
          ? <IncomingRequests onCountChange={setPendingCount} />
          : <SentRequests />
        }
      </div>
    </div>
  )
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const styles = {
  card: {
    background: 'var(--card-bg)',
    border: '1.5px solid var(--card-border)',
    borderRadius: '16px', padding: '18px',
    transition: 'border-color 0.15s',
  },
  cardHeader: {
    display: 'flex', alignItems: 'center', gap: '12px',
  },
  name: { fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '2px' },
  sub:  { fontSize: '12px', color: 'var(--text-faint)' },
  time: { fontSize: '11px', color: 'var(--text-faint)' },
  messageBubble: {
    marginTop: '12px', background: 'var(--bg-muted)',
    border: '1px solid var(--border-default)',
    borderRadius: '8px', padding: '10px 12px',
  },
  acceptBtn: {
    flex: 1, padding: '10px', borderRadius: '8px', fontSize: '13px',
    fontWeight: '700', cursor: 'pointer', border: 'none',
    background: '#111', color: '#fff',
  },
  rejectBtn: {
    flex: 1, padding: '10px', borderRadius: '8px', fontSize: '13px',
    fontWeight: '700', cursor: 'pointer', border: '1.5px solid #e5e7eb',
    background: 'transparent', color: 'var(--text-secondary)',
  },
  revealBtn: {
    width: '100%', padding: '10px', borderRadius: '8px', fontSize: '13px',
    fontWeight: '700', cursor: 'pointer', border: 'none',
    background: '#25d366', color: '#fff',
  },
  waLink: {
    display: 'block', textAlign: 'center',
    padding: '10px', borderRadius: '8px', fontSize: '13px',
    fontWeight: '700', textDecoration: 'none',
    background: '#25d366', color: '#fff',
  },
  statusNote: {
    borderRadius: '8px', padding: '10px 12px', fontSize: '12px', fontWeight: '500',
  },
}