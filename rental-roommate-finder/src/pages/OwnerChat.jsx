// src/pages/OwnerChat.jsx
import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../utils/api'
import ReportModal from './ReportModal'

const QUICK_REPLIES = [
  'Yes, room is still available!',
  'Please visit tomorrow at 10am',
  'Rent is negotiable for long stay',
  'I will send you the details',
]

const BLOCKED_PATTERNS = [
  /\b\d{10}\b/,
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
  /https?:\/\/|www\./i,
  /whatsapp|call me|contact me|my number|phone number/i,
]
function containsContact(text) { return BLOCKED_PATTERNS.some(p => p.test(text)) }

function fmtTime(ts) {
  if (!ts) return ''
  const d = new Date(ts), now = new Date()
  const diff = Math.floor((now - d) / 86400000)
  if (diff === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (diff === 1) return 'Yesterday'
  if (diff < 7)  return `${diff}d ago`
  return d.toLocaleDateString()
}

function fmtDateLabel(ts) {
  if (!ts) return null
  const d = new Date(ts), now = new Date()
  const diff = Math.floor((now - d) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })
}

// ── Date Separator ────────────────────────────────────────────────────────────
function DateSep({ label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0 10px' }}>
      <div style={{ flex: 1, height: 1, background: 'var(--border-default)' }} />
      <span style={{
        fontSize: 11, color: 'var(--text-muted)', padding: '2px 12px',
        background: 'var(--bg-muted)', borderRadius: 20, border: '1px solid var(--border-default)',
      }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: 'var(--border-default)' }} />
    </div>
  )
}

// ── Message Bubble ────────────────────────────────────────────────────────────
function Bubble({ msg, isMine }) {
  return (
    <div style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
      <div style={{
        maxWidth: '68%', padding: '10px 14px', borderRadius: 16, wordBreak: 'break-word',
        ...(isMine
          ? { background: '#111', color: '#fff', borderBottomRightRadius: 4 }
          : { background: 'var(--bg-muted)', color: 'var(--text-primary)', border: '1px solid var(--border-default)', borderBottomLeftRadius: 4 })
      }}>
        <div style={{ fontSize: 14, lineHeight: 1.5 }}>{msg.content}</div>
        <div style={{ fontSize: 10, marginTop: 4, opacity: 0.6, textAlign: isMine ? 'right' : 'left' }}>
          {fmtTime(msg.created_at)}{isMine && (msg.is_read ? ' ✓✓' : ' ✓')}
        </div>
      </div>
    </div>
  )
}

// ── Conversation Row ──────────────────────────────────────────────────────────
function ConvRow({ conv, isActive, onClick }) {
  return (
    <div
      style={{ ...s.convRow, ...(isActive ? s.convActive : {}) }}
      onClick={onClick}
    >
      <div style={s.ava}>{conv.other_user_name?.charAt(0)?.toUpperCase()}</div>
      <div style={s.convInfo}>
        <div style={s.convTop}>
          <span style={s.convName}>{conv.other_user_name}</span>
          <span style={s.convTime}>{fmtTime(conv.last_time)}</span>
        </div>
        <div style={s.convRole}>{conv.other_user_role || 'Seeker'}</div>
        <div style={s.convListing}>📍 {conv.listing_title}</div>
        <div style={s.convPreview}>{conv.last_message}</div>
      </div>
      {conv.unread_count > 0 && (
        <div style={s.unreadBadge}>{conv.unread_count}</div>
      )}
    </div>
  )
}

// ── Main OwnerChat Component ──────────────────────────────────────────────────
export default function OwnerChat() {
  const navigate    = useNavigate()
  const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}')

  const [conversations, setConversations] = useState([])
  const [loading,       setLoading]       = useState(true)
  const [activeConv,    setActiveConv]    = useState(null)
  const [messages,      setMessages]      = useState([])
  const [loadingMsgs,   setLoadingMsgs]   = useState(false)
  const [input,         setInput]         = useState('')
  const [sending,       setSending]       = useState(false)
  const [blockedWarn,   setBlockedWarn]   = useState(false)
  const [search,        setSearch]        = useState('')
  const [reportModal,   setReportModal]   = useState(false)

  const bottomRef = useRef(null)
  const pollRef   = useRef(null)

  // Load all seeker conversations
  const loadConversations = useCallback(async () => {
    try {
      const data = await api.getConversations()
      // Owner chat only shows seekers who contacted the owner (owner side of owner convos)
      setConversations(data.owner || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadConversations() }, [loadConversations])

  // Load messages for selected conversation
  const loadMessages = useCallback(async (conv) => {
    setLoadingMsgs(true)
    try {
      const msgs = await api.getOwnerMessages(conv.listing_id, conv.other_user_id)
      setMessages(msgs || [])
    } catch { setMessages([]) }
    finally { setLoadingMsgs(false) }
  }, [])

  // Auto-scroll to bottom
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // Poll for new messages every 8s
  useEffect(() => {
    if (!activeConv) return
    clearInterval(pollRef.current)
    pollRef.current = setInterval(() => loadMessages(activeConv), 8000)
    return () => clearInterval(pollRef.current)
  }, [activeConv, loadMessages])

  function openConv(conv) {
    setActiveConv(conv)
    setInput('')
    loadMessages(conv)
    setConversations(prev => prev.map(c =>
      c.listing_id === conv.listing_id && c.other_user_id === conv.other_user_id
        ? { ...c, unread_count: 0 } : c
    ))
  }

  async function sendMessage() {
    const text = input.trim()
    if (!text || sending || !activeConv) return
    if (containsContact(text)) {
      setBlockedWarn(true)
      setTimeout(() => setBlockedWarn(false), 3500)
      return
    }
    setSending(true)
    try {
      await api.sendOwnerMessage({
        receiver_id: activeConv.other_user_id,
        listing_id:  activeConv.listing_id,
        content:     text,
      })
      setInput('')
      await loadMessages(activeConv)
      loadConversations()
    } catch (e) {
      alert('Send failed: ' + e.message)
    } finally {
      setSending(false)
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  // Derived state
  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0)
  const filtered    = conversations.filter(c =>
    c.other_user_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.listing_title?.toLowerCase().includes(search.toLowerCase())
  )

  // Build message rows with date separators
  const messageRows = []; let lastLabel = null
  for (const msg of messages) {
    const label = fmtDateLabel(msg.created_at)
    if (label && label !== lastLabel) {
      messageRows.push({ type: 'date', label, key: `d-${msg.id}` })
      lastLabel = label
    }
    messageRows.push({ type: 'msg', msg, key: msg.id })
  }

  return (
    <div style={s.page}>

      {/* ── TOP BAR ─────────────────────────────────────────── */}
      <div style={s.topbar}>
        <div>
          <h2 style={s.title}>
            Chat with Seekers
            {totalUnread > 0 && <span style={s.badge}>{totalUnread}</span>}
          </h2>
          <div style={s.sub}>Seekers who have unlocked and contacted you</div>
        </div>
        <div style={s.ownerTag}>🏠 Owner Chat</div>
      </div>

      {/* ── BODY: SIDEBAR + CHAT ─────────────────────────────── */}
      <div style={s.body}>

        {/* LEFT: SEEKER LIST */}
        <div style={s.sidebar}>
          <div style={s.sidebarTop}>
            <div style={s.sidebarTitle}>Interested Seekers</div>
            <div style={s.sidebarCount}>
              {conversations.length} conversation{conversations.length !== 1 ? 's' : ''}
            </div>
          </div>

          <div style={s.sidebarSearch}>
            <input
              style={s.searchBox}
              placeholder="Search seekers..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {loading && <div style={s.hint}>Loading…</div>}

          {!loading && filtered.length === 0 && (
            <div style={s.hint}>
              No seekers have contacted you yet.<br />
            </div>
          )}

          {filtered.map(conv => (
            <ConvRow
              key={`${conv.listing_id}-${conv.other_user_id}`}
              conv={conv}
              isActive={
                activeConv?.listing_id === conv.listing_id &&
                activeConv?.other_user_id === conv.other_user_id
              }
              onClick={() => openConv(conv)}
            />
          ))}
        </div>

        {/* RIGHT: CHAT PANEL */}
        <div style={s.chatCol}>
          {!activeConv ? (
            /* Empty state */
            <div style={s.emptyState}>
              <div style={{ fontSize: 52, opacity: 0.18, marginBottom: 18 }}>📨</div>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>
                Select a seeker to view the conversation
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.9 }}>
                All seekers here have paid to unlock your contact.<br />
                Reply freely — no limits on owner replies.
              </div>
            </div>
          ) : (
            <>
              {/* Chat Header */}
              <div style={s.chatHeader}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={s.headerAva}>
                    {activeConv.other_user_name?.charAt(0)?.toUpperCase()}
                  </div>
                  <div>
                    <div style={s.headerName}>{activeConv.other_user_name}</div>
                    <div style={s.headerSub}>
                      {activeConv.other_user_role || 'Seeker'} · Interested in {activeConv.listing_title}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    style={{ ...s.actionBtn, color: '#dc2626', borderColor: '#fca5a5' }}
                    onClick={() => setReportModal(true)}
                  >
                    🚩 Report Seeker
                  </button>
                  <button
                    style={s.actionBtn}
                    onClick={() => navigate('/owner-visits')}
                  >
                    📅 Visit Requests
                  </button>
                  <button
                    style={s.actionBtnPrimary}
                    onClick={() => navigate('/agreement', {
                      state: { seekerId: activeConv.other_user_id, listingId: activeConv.listing_id }
                    })}
                  >
                    📄 Agreement
                  </button>
                </div>
              </div>

              {/* Context Pill */}
              <div style={s.contextBar}>
                <span style={s.contextPill}>
                  📍 Conversation about: {activeConv.listing_title}
                </span>
              </div>

              {/* Messages */}
              <div style={s.messages}>
                {loadingMsgs && (
                  <div style={s.centerHint}>Loading messages…</div>
                )}
                {!loadingMsgs && messages.length === 0 && (
                  <div style={s.centerHint}>No messages yet. Reply to this seeker! 👋</div>
                )}
                {!loadingMsgs && messageRows.map(row =>
                  row.type === 'date'
                    ? <DateSep key={row.key} label={row.label} />
                    : <Bubble key={row.key} msg={row.msg} isMine={row.msg.sender_id === currentUser.id} />
                )}
                <div ref={bottomRef} />
              </div>

              {/* Reply note */}
              <div style={s.replyNote}>
                ✅ Owner replies are unlimited — no payment required
              </div>

              {/* Quick Replies */}
              <div style={s.quickReplies}>
                {QUICK_REPLIES.map(q => (
                  <button key={q} style={s.chip} onClick={() => setInput(q)}>{q}</button>
                ))}
              </div>

              {/* Blocked Warning */}
              {blockedWarn && (
                <div style={s.blockedWarn}>
                  ⚠️ Phone numbers, emails, and external links are blocked inside chat.
                </div>
              )}

              {/* Input Bar */}
              <div style={s.inputBar}>
                <input
                  style={s.inputField}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder={`Reply to ${activeConv.other_user_name}…`}
                />
                <button
                  style={{ ...s.sendBtn, opacity: sending || !input.trim() ? 0.45 : 1 }}
                  onClick={sendMessage}
                  disabled={sending || !input.trim()}
                >
                  {sending ? '…' : 'Send →'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Report Seeker Modal */}
      {reportModal && activeConv && (
        <ReportModal
          category="seeker"
          targetId={activeConv.other_user_id}
          targetName={activeConv.other_user_name}
          onClose={() => setReportModal(false)}
        />
      )}
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = {
  page:    {
    display: 'flex', flexDirection: 'column',
    height: '100vh', overflow: 'hidden',
    background: 'var(--bg-page)', color: 'var(--text-primary)',
    fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
  },

  topbar:  {
    background: 'var(--bg-card)',
    borderBottom: '1px solid var(--border-default)',
    padding: '20px 32px',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    flexShrink: 0,
  },
  title:    { fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.5px', margin: 0, display: 'flex', alignItems: 'center', gap: 10 },
  sub:      { fontSize: 13, color: 'var(--text-muted)', marginTop: 3 },
  badge:    { background: '#111', color: '#fff', borderRadius: 20, padding: '2px 9px', fontSize: 12, fontWeight: 700 },
  ownerTag: { background: 'var(--bg-muted)', color: 'var(--text-primary)', border: '1px solid var(--border-default)', borderRadius: 20, padding: '6px 16px', fontSize: 13, fontWeight: 600 },

  body:     { display: 'flex', flex: 1, overflow: 'hidden' },

  sidebar:      {
    width: 300, minWidth: 260,
    borderRight: '1px solid var(--border-default)',
    display: 'flex', flexDirection: 'column',
    overflowY: 'auto', flexShrink: 0,
    background: 'var(--bg-card)',
  },
  sidebarTop:   { padding: '14px 16px 8px', borderBottom: '1px solid var(--border-default)' },
  sidebarTitle: { fontWeight: 700, fontSize: 14 },
  sidebarCount: { fontSize: 12, color: 'var(--text-muted)', marginTop: 2 },
  sidebarSearch:{ padding: '12px 14px 6px' },
  searchBox:    {
    width: '100%', padding: '9px 14px', borderRadius: 10,
    border: '1px solid var(--border-strong)',
    background: 'var(--bg-muted)', color: 'var(--text-primary)',
    fontSize: 13, outline: 'none', boxSizing: 'border-box',
  },
  hint:         { padding: '10px 16px 14px', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.8 },

  convRow:    {
    display: 'flex', alignItems: 'flex-start', gap: 10,
    padding: '11px 14px', cursor: 'pointer',
    position: 'relative',
    borderBottom: '1px solid var(--border-default)',
    transition: 'background 0.12s',
  },
  convActive:  { background: 'var(--bg-muted)', borderLeft: '3px solid #111' },
  ava:         {
    width: 40, height: 40, borderRadius: '50%',
    background: '#111', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 15, fontWeight: 700, flexShrink: 0,
  },
  convInfo:    { flex: 1, minWidth: 0 },
  convTop:     { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 1 },
  convName:    { fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 155 },
  convTime:    { fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 },
  convRole:    { fontSize: 11, color: 'var(--text-muted)', marginTop: 1 },
  convListing: { fontSize: 11, color: 'var(--text-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  convPreview: { fontSize: 12, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  unreadBadge: { position: 'absolute', top: 12, right: 12, background: '#111', color: '#fff', borderRadius: 10, fontSize: 10, padding: '2px 7px', fontWeight: 700, minWidth: 18, textAlign: 'center' },

  chatCol:    { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, background: 'var(--bg-page)' },
  emptyState: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 48 },

  chatHeader:       { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 24px', borderBottom: '1px solid var(--border-default)', background: 'var(--bg-card)', flexShrink: 0 },
  headerAva:        { width: 44, height: 44, borderRadius: '50%', background: '#111', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, flexShrink: 0 },
  headerName:       { fontWeight: 700, fontSize: 15 },
  headerSub:        { fontSize: 12, color: 'var(--text-muted)', marginTop: 3 },
  actionBtn:        { padding: '7px 14px', borderRadius: 8, border: '1.5px solid var(--border-strong)', background: 'transparent', color: 'var(--text-primary)', fontSize: 12, cursor: 'pointer', fontWeight: 500 },
  actionBtnPrimary: { padding: '7px 14px', borderRadius: 8, border: 'none', background: '#111', color: '#fff', fontSize: 12, cursor: 'pointer', fontWeight: 600 },

  contextBar:  { display: 'flex', justifyContent: 'center', padding: '7px 0', borderBottom: '1px solid var(--border-default)', background: 'var(--bg-muted)', flexShrink: 0 },
  contextPill: { fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 20, padding: '3px 16px' },

  messages:    { flex: 1, overflowY: 'auto', padding: '16px 24px 8px' },
  centerHint:  { textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: '48px 0' },

  replyNote:   { padding: '5px 16px', fontSize: 11, color: '#166534', textAlign: 'center', background: '#f0fdf4', borderTop: '1px solid #bbf7d0', flexShrink: 0 },
  quickReplies:{ display: 'flex', gap: 8, padding: '10px 18px 12px', flexWrap: 'wrap', borderTop: '1px solid var(--border-default)', background: 'var(--bg-card)', flexShrink: 0 },
  chip:        { background: 'var(--bg-muted)', border: '1px solid var(--border-strong)', borderRadius: 20, padding: '6px 14px', fontSize: 12, cursor: 'pointer', color: 'var(--text-primary)', whiteSpace: 'nowrap', fontWeight: 500 },
  blockedWarn: { margin: '0 18px 6px', padding: '8px 14px', background: '#fffbeb', borderRadius: 8, fontSize: 12, color: '#92400e', border: '1px solid #fde68a' },

  inputBar:    { display: 'flex', gap: 10, padding: '12px 18px 16px', borderTop: '1px solid var(--border-default)', background: 'var(--bg-card)', flexShrink: 0, alignItems: 'center' },
  inputField:  { flex: 1, padding: '11px 16px', borderRadius: 24, border: '1.5px solid var(--border-strong)', background: 'var(--bg-muted)', color: 'var(--text-primary)', fontSize: 14, outline: 'none' },
  sendBtn:     { padding: '11px 22px', background: '#111', color: '#fff', border: 'none', borderRadius: 24, fontWeight: 700, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap' },
}