// src/pages/SeekerChat.jsx
import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { api } from '../utils/api'
import PaymentModal from '../components/PaymentModal'
import ReportModal from '../pages/ReportModal'

const QUICK_REPLIES_OWNER    = ['Is the room still available?', 'Can I visit tomorrow?', 'Is rent negotiable?', 'What amenities are included?']
const QUICK_REPLIES_ROOMMATE = ['Hi! Would you like to connect?', 'Where are you looking?', 'What is your budget range?', 'When are you planning to move?']

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

// ── Profile Panel (slides in from the right) ──────────────────────────────────
function ProfilePanel({ userId, name, type, conv, onClose }) {
  const [profile,  setProfile]  = useState(null)
  const [listings, setListings] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)

  useEffect(() => {
    if (!userId) { setLoading(false); return }
    setLoading(true); setProfile(null); setListings([]); setError(null)
    ;(async () => {
      try {
        if (type === 'owner') {
          const data = await api.getOwnerProfile(userId)
          setProfile(data)
          try {
            if (typeof api.getOwnerListings === 'function') {
              const ld = await api.getOwnerListings(userId)
              setListings(ld?.listings || [])
            }
          } catch { /* listings optional */ }
        } else {
          if (typeof api.getSeekerProfile === 'function') {
            const data = await api.getSeekerProfile(userId)
            setProfile(data)
          } else {
            setProfile({ name, occupation: conv?.other_user_occupation || '' })
          }
        }
      } catch (e) { setError(e.message); setProfile(null) }
      finally { setLoading(false) }
    })()
  }, [userId, type])

  return (
    <div style={pp.panel}>
      {/* Header */}
      <div style={pp.header}>
        <div style={{ ...pp.avatar, background: type === 'roommate' ? '#1a7a4a' : '#111' }}>
          {name?.charAt(0)?.toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={pp.name}>
            {profile?.name || name}
            {type === 'owner' && profile?.is_verified && (
              <span style={pp.verified}>✓ Verified</span>
            )}
          </div>
          <div style={pp.role}>{type === 'owner' ? 'Landlord' : 'Room Seeker'}</div>
          {type === 'owner' && conv?.listing_title && (
            <div style={pp.loc}>📍 {conv.listing_title}</div>
          )}
        </div>
        <button style={pp.closeBtn} onClick={onClose}>✕</button>
      </div>

      {loading && <div style={pp.hint}>Loading profile…</div>}
      {!loading && error && <div style={pp.hint}>Could not load profile details.</div>}
      {!loading && !profile && !error && <div style={pp.hint}>No profile data available.</div>}

      {/* Owner profile body */}
      {!loading && profile && type === 'owner' && (
        <div style={pp.body}>
          {(profile.phone || profile.email) && (
            <div style={pp.section}>
              <div style={pp.sectionLabel}>CONTACT INFORMATION</div>
              {profile.phone && (
                <div style={pp.row}>
                  <span style={pp.icon}>📞</span>
                  <span>{profile.phone}</span>
                </div>
              )}
              {profile.email && (
                <div style={pp.row}>
                  <span style={pp.icon}>✉️</span>
                  <span style={{ fontSize: 13 }}>{profile.email}</span>
                </div>
              )}
              <div style={pp.row}>
                <span style={pp.icon}>📅</span>
                <span style={{ fontSize: 13 }}>Member since Jan 2023</span>
              </div>
            </div>
          )}
          {listings.length > 0 && (
            <div style={pp.section}>
              <div style={pp.sectionLabel}>ACTIVE LISTINGS ({listings.length})</div>
              {listings.map(l => (
                <div key={l.id} style={pp.listingCard}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{l.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        {l.room_type} · {l.location}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>
                        ₹{Number(l.price || 0).toLocaleString()}/mo
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 600, marginTop: 2, color: l.is_available ? '#1a7a4a' : '#888' }}>
                        {l.is_available ? '✓ Available' : 'Occupied'}
                      </div>
                    </div>
                  </div>
                  {l.amenities && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                      {String(l.amenities).split(',').slice(0, 3).map(a => (
                        <span key={a} style={pp.tag}>{a.trim()}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {profile.bio && (
            <div style={pp.section}>
              <div style={pp.sectionLabel}>ABOUT</div>
              <div style={{ fontSize: 13, lineHeight: 1.7 }}>{profile.bio}</div>
            </div>
          )}
        </div>
      )}

      {/* Roommate profile body */}
      {!loading && profile && type === 'roommate' && (
        <div style={pp.body}>
          <div style={pp.section}>
            {profile.occupation && (
              <div style={pp.row}>
                <span style={pp.icon}>💼</span>
                <span style={{ fontSize: 13 }}>{profile.occupation}</span>
              </div>
            )}
            {profile.preferred_location && (
              <div style={pp.row}>
                <span style={pp.icon}>📍</span>
                <span style={{ fontSize: 13 }}>Looking in {profile.preferred_location}</span>
              </div>
            )}
            {(profile.budget_min || profile.budget_max) && (
              <div style={pp.row}>
                <span style={pp.icon}>💰</span>
                <span style={{ fontSize: 13 }}>
                  ₹{profile.budget_min?.toLocaleString() || '?'} – ₹{profile.budget_max?.toLocaleString() || '?'}/mo
                </span>
              </div>
            )}
          </div>
          {(profile.food_preference || profile.smoking || profile.sleep_schedule || profile.cleanliness_level || profile.personality_type || profile.drinking || profile.noise_tolerance || profile.guest_preference) && (
            <div style={pp.section}>
              <div style={pp.sectionLabel}>LIFESTYLE</div>
              {profile.personality_type && <div style={pp.row}><span style={pp.icon}>🧠</span><span style={{ fontSize: 13 }}>Personality: {profile.personality_type}</span></div>}
              {profile.sleep_schedule && <div style={pp.row}><span style={pp.icon}>🌙</span><span style={{ fontSize: 13 }}>Sleep: {profile.sleep_schedule}</span></div>}
              {profile.cleanliness_level && <div style={pp.row}><span style={pp.icon}>✨</span><span style={{ fontSize: 13 }}>Cleanliness: {profile.cleanliness_level}</span></div>}
              {profile.food_preference && <div style={pp.row}><span style={pp.icon}>🍽</span><span style={{ fontSize: 13 }}>Food: {profile.food_preference}</span></div>}
              {profile.smoking        && <div style={pp.row}><span style={pp.icon}>🚬</span><span style={{ fontSize: 13 }}>Smoking: {profile.smoking}</span></div>}
              {profile.drinking       && <div style={pp.row}><span style={pp.icon}>🍺</span><span style={{ fontSize: 13 }}>Drinking: {profile.drinking}</span></div>}
              {profile.noise_tolerance && <div style={pp.row}><span style={pp.icon}>🔉</span><span style={{ fontSize: 13 }}>Noise: {profile.noise_tolerance}</span></div>}
              {profile.guest_preference && <div style={pp.row}><span style={pp.icon}>👥</span><span style={{ fontSize: 13 }}>Guests: {profile.guest_preference}</span></div>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Unlock Payment Gate ───────────────────────────────────────────────────────
function UnlockGate({ conv, onUnlocked }) {
  const [showPayment, setShowPayment] = useState(false)

  async function handleUnlockSuccess(paymentId, method) {
    try {
      // Record the unlock in the database so it persists
      await api.recordContactUnlock(conv.listing_id, paymentId || 'mock')
      // Also record in payments table for admin dashboard
      await api.recordPayment({ feature: 'Contact & Chat', amount: 29, method: method || 'mock' })
    } catch (e) {
      console.error('Failed to record unlock:', e)
    }
    setShowPayment(false)
    onUnlocked()
  }

  return (
    <div style={gate.wrap}>
      <div style={{ fontSize: 48, marginBottom: 14 }}>🔒</div>
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 10, letterSpacing: '-0.5px' }}>
        Contact Locked
      </div>
      <div style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.7, maxWidth: 340, marginBottom: 24, textAlign: 'center' }}>
        Unlock contact to chat with <strong>{conv.other_user_name}</strong> about <em>{conv.listing_title}</em>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24, alignItems: 'flex-start', fontSize: 14 }}>
        <div>✅ Direct chat with owner</div>
        <div>📞 View phone number</div>
        <div>♾️ Unlimited messages</div>
      </div>
      <button style={gate.btn} onClick={() => setShowPayment(true)}>
        🔓 Unlock Contact — ₹29
      </button>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>One-time · Includes chat access</div>
      {showPayment && (
        <PaymentModal
          feature="Contact & Chat"
          price={29}
          onSuccess={handleUnlockSuccess}
          onClose={() => setShowPayment(false)}
        />
      )}
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

// ── Date Separator ────────────────────────────────────────────────────────────
function DateSep({ label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0 10px' }}>
      <div style={{ flex: 1, height: 1, background: 'var(--border-default)' }} />
      <span style={{
        fontSize: 11, color: 'var(--text-muted)', padding: '2px 12px',
        background: 'var(--bg-muted)', borderRadius: 20, border: '1px solid var(--border-default)'
      }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: 'var(--border-default)' }} />
    </div>
  )
}

// ── Conversation Row ──────────────────────────────────────────────────────────
function ConvRow({ conv, isActive, isOwner, onClick }) {
  return (
    <div
      style={{
        ...s.convRow,
        ...(isActive ? s.convActive : {}),
      }}
      onClick={onClick}
    >
      <div style={{
        ...s.ava,
        background: isOwner ? '#111' : '#1a7a4a',
      }}>
        {conv.other_user_name?.charAt(0)?.toUpperCase()}
      </div>
      <div style={s.convInfo}>
        <div style={s.convTop}>
          <span style={s.convName}>{conv.other_user_name}</span>
          <span style={s.convTime}>{fmtTime(conv.last_time)}</span>
        </div>
        <div style={s.convSub}>
          {isOwner ? 'Landlord' : (conv.other_user_occupation || 'Roommate')}
        </div>
        <div style={s.convPrev}>
          {isOwner && !conv.is_unlocked
            ? <span style={{ color: '#e67e22' }}>🔒 Unlock to chat</span>
            : conv.last_message}
        </div>
      </div>
      {conv.unread_count > 0 && (
        <div style={s.unreadBadge}>{conv.unread_count}</div>
      )}
    </div>
  )
}

// ── Main SeekerChat Component ─────────────────────────────────────────────────
export default function SeekerChat() {
  const location       = useLocation()
  const [searchParams] = useSearchParams()
  const currentUser    = JSON.parse(sessionStorage.getItem('currentUser') || '{}')

  const [ownerConvs,    setOwnerConvs]    = useState([])
  const [roommateConvs, setRoommateConvs] = useState([])
  const [loadingConvs,  setLoadingConvs]  = useState(true)
  const [activeType,    setActiveType]    = useState(null)
  const [activeConv,    setActiveConv]    = useState(null)
  const [messages,      setMessages]      = useState([])
  const [loadingMsgs,   setLoadingMsgs]   = useState(false)
  const [input,         setInput]         = useState('')
  const [sending,       setSending]       = useState(false)
  const [blockedWarn,   setBlockedWarn]   = useState(false)
  const [search,        setSearch]        = useState('')
  const [showProfile,   setShowProfile]   = useState(false)
  const [reportTarget,  setReportTarget]  = useState(null) // { category, targetId, targetName }

  const bottomRef     = useRef(null)
  const pollRef       = useRef(null)
  const pendingNavRef = useRef(null)

  // Load all conversations
  const loadConversations = useCallback(async () => {
    try {
      const data = await api.getConversations()
      setOwnerConvs(data.owner || [])
      setRoommateConvs(data.roommate || [])
    } catch (e) { console.error(e) }
    finally { setLoadingConvs(false) }
  }, [])

  useEffect(() => { loadConversations() }, [loadConversations])

  // Handle ?id=&user= navigation from AI Matcher
  useEffect(() => {
    const qId = searchParams.get('id'), qUser = searchParams.get('user')
    if (qId && qUser) {
      const s = { other_user_id: Number(qId), other_user_name: qUser, other_user_occupation: '', last_message: '', unread_count: 0 }
      setActiveType('roommate'); setActiveConv(s); loadMessages('roommate', s)
    }
  }, [searchParams]) // eslint-disable-line

  // Handle navigation state (from listing detail page)
  useEffect(() => {
    if (!location.state) return
    const { openListingId, openOwnerId, ownerName, listingTitle, isUnlocked } = location.state
    if (openListingId) {
      pendingNavRef.current = { openListingId, openOwnerId, ownerName, listingTitle, isUnlocked }
      resolveNavState(ownerConvs)
    }
  }, [location.state]) // eslint-disable-line

  useEffect(() => {
    if (!loadingConvs && pendingNavRef.current) resolveNavState(ownerConvs)
  }, [loadingConvs, ownerConvs]) // eslint-disable-line

  async function resolveNavState(currentConvs) {
    const nav = pendingNavRef.current; if (!nav) return
    let { openListingId, openOwnerId, ownerName, listingTitle, isUnlocked } = nav
    if (!openOwnerId) {
      try {
        const d = await api.getListing(openListingId, true) // notrack: data-only fetch, not a real view
        openOwnerId  = d.owner_id
        ownerName    = ownerName    || d.owner
        listingTitle = listingTitle || d.title
        pendingNavRef.current = { ...nav, openOwnerId, ownerName, listingTitle }
      } catch { return }
    }
    if (!openOwnerId) return
    const existing = currentConvs.find(
      c => c.listing_id === openListingId && c.other_user_id === openOwnerId
    )
    const conv = existing || {
      listing_id: openListingId,
      listing_title: listingTitle || 'Listing',
      other_user_id: openOwnerId,
      other_user_name: ownerName || 'Owner',
      is_unlocked: isUnlocked ? 1 : 0,
      last_message: '',
      unread_count: 0,
    }
    pendingNavRef.current = null
    openOwnerConv(conv)
  }

  // Load messages for active conversation
  const loadMessages = useCallback(async (type, conv) => {
    if (!conv) return
    setLoadingMsgs(true)
    try {
      const msgs = type === 'owner'
        ? await api.getOwnerMessages(conv.listing_id, conv.other_user_id)
        : await api.getRoommateMessages(conv.other_user_id)
      setMessages(msgs || [])
    } catch { setMessages([]) }
    finally { setLoadingMsgs(false) }
  }, [])

  // Auto-scroll to bottom on new messages
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // Poll for new messages every 8s
  useEffect(() => {
    if (!activeConv || !activeType) return
    clearInterval(pollRef.current)
    pollRef.current = setInterval(() => loadMessages(activeType, activeConv), 8000)
    return () => clearInterval(pollRef.current)
  }, [activeConv, activeType, loadMessages])

  function openOwnerConv(conv) {
    setActiveConv(conv)
    setActiveType('owner')
    setInput('')
    setShowProfile(false)
    if (conv.is_unlocked) {
      loadMessages('owner', conv)
      if (!conv.phone && conv.listing_id) {
        api.getContactPhone(conv.listing_id)
          .then(({ phone }) => setActiveConv(prev => prev ? { ...prev, phone } : prev))
          .catch(() => {})
      }
    }
    setOwnerConvs(prev => prev.map(c =>
      c.listing_id === conv.listing_id && c.other_user_id === conv.other_user_id
        ? { ...c, unread_count: 0 } : c
    ))
    // Re-verify unlock status in case it changed
    if (!conv.is_unlocked && conv.listing_id) {
      api.getContactStatus(conv.listing_id).then(({ unlocked }) => {
        if (unlocked) {
          const u = { ...conv, is_unlocked: 1 }
          setActiveConv(u)
          loadMessages('owner', u)
          api.getContactPhone(conv.listing_id)
            .then(({ phone }) => setActiveConv(prev => prev ? { ...prev, phone } : prev))
            .catch(() => {})
        }
      }).catch(() => {})
    }
  }

  function openRoommateConv(conv) {
    setActiveConv(conv)
    setActiveType('roommate')
    setInput('')
    setShowProfile(false)
    loadMessages('roommate', conv)
    setRoommateConvs(prev => prev.map(c =>
      c.other_user_id === conv.other_user_id ? { ...c, unread_count: 0 } : c
    ))
  }

  function handleUnlocked() {
    const u = { ...activeConv, is_unlocked: 1 }
    setActiveConv(u)
    setOwnerConvs(prev => prev.map(c =>
      c.listing_id === u.listing_id && c.other_user_id === u.other_user_id ? u : c
    ))
    loadMessages('owner', u)
    loadConversations()
    if (u.listing_id) {
      api.getContactPhone(u.listing_id)
        .then(({ phone }) => setActiveConv(prev => prev ? { ...prev, phone } : prev))
        .catch(() => {})
    }
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
      if (activeType === 'owner') {
        await api.sendOwnerMessage({ receiver_id: activeConv.other_user_id, listing_id: activeConv.listing_id, content: text })
      } else {
        await api.sendRoommateMessage({ receiver_id: activeConv.other_user_id, content: text })
      }
      setInput('')
      await loadMessages(activeType, activeConv)
      loadConversations()
    } catch (e) {
      if (e.message?.includes('CONTACT_LOCKED')) setActiveConv(prev => ({ ...prev, is_unlocked: 0 }))
      else alert('Failed to send: ' + e.message)
    } finally {
      setSending(false)
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  // Derived state
  const totalUnread   = [...ownerConvs, ...roommateConvs].reduce((a, c) => a + (c.unread_count || 0), 0)
  const filteredOwner = ownerConvs.filter(c =>
    c.other_user_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.listing_title?.toLowerCase().includes(search.toLowerCase())
  )
  const filteredRoom = roommateConvs.filter(c =>
    c.other_user_name?.toLowerCase().includes(search.toLowerCase())
  )
  // Synthetic conv for nav (not yet in list)
  const synth = activeType === 'owner' && activeConv &&
    !ownerConvs.find(c => c.listing_id === activeConv.listing_id && c.other_user_id === activeConv.other_user_id)
    ? activeConv : null
  const displayOwner = synth ? [synth, ...filteredOwner] : filteredOwner

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

  const quickReplies = activeType === 'roommate' ? QUICK_REPLIES_ROOMMATE : QUICK_REPLIES_OWNER

  return (
    <div style={s.page}>

      {/* ── TOP BAR ─────────────────────────────────────────── */}
      <div style={s.topbar}>
        <div>
          <h2 style={s.title}>
            Messages {totalUnread > 0 && <span style={s.badge}>{totalUnread}</span>}
          </h2>
          <div style={s.sub}>Chat with owners and matched roommates</div>
        </div>
        {activeConv && (
          <div style={activeType === 'roommate' ? s.tagFree : s.tagPaid}>
            {activeType === 'roommate' ? '🤝 Free Chat' : '🏡 Seeker Chat'}
          </div>
        )}
      </div>

      {/* ── BODY: SIDEBAR + CHAT ─────────────────────────────── */}
      <div style={s.body}>

        {/* LEFT SIDEBAR */}
        <div style={s.sidebar}>
          <div style={s.sidebarInner}>
            <input
              style={s.searchBox}
              placeholder="Search conversations..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Room Owners */}
          <div style={s.sectionHead}>🏠 ROOM OWNERS</div>
          {loadingConvs ? (
            <div style={s.hint}>Loading…</div>
          ) : displayOwner.length === 0 ? (
            <div style={s.hint}>No owner conversations yet.<br />Browse listings to start chatting!</div>
          ) : (
            displayOwner.map(conv => (
              <ConvRow
                key={`o-${conv.listing_id}-${conv.other_user_id}`}
                conv={conv}
                isOwner={true}
                isActive={activeType === 'owner' && activeConv?.listing_id === conv.listing_id && activeConv?.other_user_id === conv.other_user_id}
                onClick={() => openOwnerConv(conv)}
              />
            ))
          )}

          {/* Roommate Matches */}
          <div style={{ ...s.sectionHead, marginTop: 6 }}>🤝 ROOMMATE MATCHES</div>
          {loadingConvs ? null : filteredRoom.length === 0 ? (
            <div style={s.hint}>No roommate chats yet.<br />Check AI Matcher to find matches!</div>
          ) : (
            filteredRoom.map(conv => (
              <ConvRow
                key={`r-${conv.other_user_id}`}
                conv={conv}
                isOwner={false}
                isActive={activeType === 'roommate' && activeConv?.other_user_id === conv.other_user_id}
                onClick={() => openRoommateConv(conv)}
              />
            ))
          )}
        </div>

        {/* RIGHT: CHAT PANEL */}
        <div style={s.chatCol}>
          {!activeConv ? (
            /* Empty state */
            <div style={s.emptyState}>
              <div style={{ fontSize: 52, opacity: 0.18, marginBottom: 18 }}>💬</div>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>
                Select a conversation to start chatting
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 2, textAlign: 'center' }}>
                🏠 Owner chats require contact unlock (₹29 one-time)<br />
                🤝 Roommate chats are completely free
              </div>
            </div>
          ) : (
            <>
              {/* Chat Header */}
              <div style={s.chatHeader}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ ...s.headerAva, background: activeType === 'roommate' ? '#1a7a4a' : '#111' }}>
                    {activeConv.other_user_name?.charAt(0)?.toUpperCase()}
                  </div>
                  <div>
                    <div style={s.headerName}>
                      {activeConv.other_user_name}
                      <span
                        style={s.viewProfile}
                        onClick={() => setShowProfile(v => !v)}
                      >
                        · View Profile ✎
                      </span>
                    </div>
                    <div style={s.headerSub}>
                      {activeType === 'owner'
                        ? `Landlord · ${activeConv.listing_title}`
                        : (activeConv.other_user_occupation || 'Student')}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {activeType === 'owner' && activeConv.is_unlocked && activeConv.phone && (
                    <span style={{ fontSize: 13, fontWeight: 600 }}>📞 {activeConv.phone}</span>
                  )}
                  <button
                    style={s.reportBtn}
                    title="Report this user"
                    onClick={() => setReportTarget({
                      category: activeType === 'owner' ? 'owner' : 'roommate',
                      targetId: activeConv.other_user_id,
                      targetName: activeConv.other_user_name,
                    })}
                  >
                    🚩 Report
                  </button>
                  {activeType === 'owner' && activeConv.is_unlocked
                    ? <span style={s.statusOnline}><span style={s.dot} />Online</span>
                    : activeType === 'owner'
                    ? <span style={s.statusLocked}>🔒 Contact Locked</span>
                    : <span style={s.statusFree}>✅ Free Chat</span>
                  }
                </div>
              </div>

              {/* Context Pill (owner chats only) */}
              {activeType === 'owner' && (
                <div style={s.contextBar}>
                  <span style={s.contextPill}>
                    📍 Inquiry about: {activeConv.listing_title}
                  </span>
                </div>
              )}

              {/* Messages or Unlock Gate */}
              {activeType === 'owner' && !activeConv.is_unlocked ? (
                <UnlockGate conv={activeConv} onUnlocked={handleUnlocked} />
              ) : (
                <>
                  {/* Message List */}
                  <div style={s.messages}>
                    {loadingMsgs && (
                      <div style={s.centerHint}>Loading messages…</div>
                    )}
                    {!loadingMsgs && messages.length === 0 && (
                      <div style={s.centerHint}>No messages yet. Say hello! 👋</div>
                    )}
                    {!loadingMsgs && messageRows.map(row =>
                      row.type === 'date'
                        ? <DateSep key={row.key} label={row.label} />
                        : <Bubble key={row.key} msg={row.msg} isMine={row.msg.sender_id === currentUser.id} />
                    )}
                    <div ref={bottomRef} />
                  </div>

                  {/* Quick Replies */}
                  <div style={s.quickReplies}>
                    {quickReplies.map(q => (
                      <button key={q} style={s.chip} onClick={() => setInput(q)}>{q}</button>
                    ))}
                  </div>

                  {/* Blocked Warning */}
                  {blockedWarn && (
                    <div style={s.blockedWarn}>⚠️ Sharing personal contact info is not allowed here.</div>
                  )}

                  {/* Input Bar */}
                  <div style={s.inputBar}>
                    <input
                      style={s.inputField}
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={handleKey}
                      placeholder={`Message ${activeConv.other_user_name}…`}
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
            </>
          )}
        </div>
      </div>

      {/* ── PROFILE PANEL OVERLAY ──────────────────────────────── */}
      {showProfile && activeConv && (
        <>
          <div
            onClick={() => setShowProfile(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 299,
              background: 'rgba(0,0,0,0.15)',
            }}
          />
          <div style={s.profileOverlay}>
            <ProfilePanel
              userId={activeConv.other_user_id}
              name={activeConv.other_user_name}
              type={activeType}
              conv={activeConv}
              onClose={() => setShowProfile(false)}
            />
          </div>
        </>
      )}

      {/* Report Modal */}
      {reportTarget && (
        <ReportModal
          category={reportTarget.category}
          targetId={reportTarget.targetId}
          targetName={reportTarget.targetName}
          onClose={() => setReportTarget(null)}
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
  title:   { fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.5px', margin: 0, display: 'flex', alignItems: 'center', gap: 10 },
  sub:     { fontSize: 13, color: 'var(--text-muted)', marginTop: 3 },
  badge:   { background: '#111', color: '#fff', borderRadius: 20, padding: '2px 9px', fontSize: 12, fontWeight: 700 },
  tagFree: { background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', borderRadius: 20, padding: '6px 16px', fontSize: 13, fontWeight: 600 },
  tagPaid: { background: 'var(--bg-muted)', color: 'var(--text-primary)', border: '1px solid var(--border-default)', borderRadius: 20, padding: '6px 16px', fontSize: 13, fontWeight: 600 },

  body:    { display: 'flex', flex: 1, overflow: 'hidden' },

  sidebar:     {
    width: 300, minWidth: 260,
    borderRight: '1px solid var(--border-default)',
    display: 'flex', flexDirection: 'column',
    overflowY: 'auto', flexShrink: 0,
    background: 'var(--bg-card)',
  },
  sidebarInner:{ padding: '14px 14px 6px' },
  searchBox:   {
    width: '100%', padding: '9px 14px', borderRadius: 10,
    border: '1px solid var(--border-strong)',
    background: 'var(--bg-muted)', color: 'var(--text-primary)',
    fontSize: 13, outline: 'none', boxSizing: 'border-box',
  },
  sectionHead: {
    padding: '10px 16px 5px',
    fontSize: 10, fontWeight: 700, letterSpacing: 1.2,
    color: 'var(--text-muted)', textTransform: 'uppercase',
  },
  hint:        { padding: '4px 16px 12px', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.8 },

  convRow:    {
    display: 'flex', alignItems: 'flex-start', gap: 10,
    padding: '11px 14px', cursor: 'pointer',
    position: 'relative',
    borderBottom: '1px solid var(--border-default)',
    transition: 'background 0.12s',
  },
  convActive: { background: 'var(--bg-muted)', borderLeft: '3px solid #111' },
  ava:        {
    width: 40, height: 40, borderRadius: '50%',
    color: '#fff', display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontSize: 15, fontWeight: 700, flexShrink: 0,
  },
  convInfo:   { flex: 1, minWidth: 0 },
  convTop:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  convName:   { fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 155 },
  convTime:   { fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 },
  convSub:    { fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 },
  convPrev:   { fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  unreadBadge:{ position: 'absolute', top: 12, right: 12, background: '#111', color: '#fff', borderRadius: 10, fontSize: 10, padding: '2px 7px', fontWeight: 700, minWidth: 18, textAlign: 'center' },

  chatCol:    { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, background: 'var(--bg-page)' },
  emptyState: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 48 },

  chatHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '14px 24px',
    borderBottom: '1px solid var(--border-default)',
    background: 'var(--bg-card)', flexShrink: 0,
  },
  headerAva:   { width: 44, height: 44, borderRadius: '50%', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, flexShrink: 0 },
  headerName:  { fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  viewProfile: { fontSize: 12, color: 'var(--text-muted)', fontWeight: 400, cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', userSelect: 'none' },
  reportBtn:   { background: 'none', border: '1px solid #ffd0d0', borderRadius: 8, padding: '5px 11px', fontSize: 12, color: '#cc0000', cursor: 'pointer', fontWeight: 600 },
  headerSub:   { fontSize: 12, color: 'var(--text-muted)', marginTop: 3 },

  statusOnline: { background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', borderRadius: 20, padding: '4px 14px', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 },
  statusLocked: { background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', borderRadius: 20, padding: '4px 14px', fontSize: 12, fontWeight: 600 },
  statusFree:   { background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', borderRadius: 20, padding: '4px 14px', fontSize: 12, fontWeight: 600 },
  dot:          { width: 7, height: 7, borderRadius: '50%', background: '#166534', display: 'inline-block' },

  contextBar:  { display: 'flex', justifyContent: 'center', padding: '7px 0', borderBottom: '1px solid var(--border-default)', background: 'var(--bg-muted)', flexShrink: 0 },
  contextPill: { fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 20, padding: '3px 16px' },

  messages:    { flex: 1, overflowY: 'auto', padding: '16px 24px 8px' },
  centerHint:  { textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: '48px 0' },

  quickReplies:{ display: 'flex', gap: 8, padding: '10px 18px 12px', flexWrap: 'wrap', borderTop: '1px solid var(--border-default)', background: 'var(--bg-card)', flexShrink: 0 },
  chip:        { background: 'var(--bg-muted)', border: '1px solid var(--border-strong)', borderRadius: 20, padding: '6px 14px', fontSize: 12, cursor: 'pointer', color: 'var(--text-primary)', whiteSpace: 'nowrap', fontWeight: 500 },

  blockedWarn: { margin: '0 18px 6px', padding: '8px 14px', background: '#fffbeb', borderRadius: 8, fontSize: 12, color: '#92400e', border: '1px solid #fde68a' },

  inputBar:    { display: 'flex', gap: 10, padding: '12px 18px 16px', borderTop: '1px solid var(--border-default)', background: 'var(--bg-card)', flexShrink: 0, alignItems: 'center' },
  inputField:  { flex: 1, padding: '11px 16px', borderRadius: 24, border: '1.5px solid var(--border-strong)', background: 'var(--bg-muted)', color: 'var(--text-primary)', fontSize: 14, outline: 'none' },
  sendBtn:     { padding: '11px 22px', background: '#111', color: '#fff', border: 'none', borderRadius: 24, fontWeight: 700, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap' },

  profileOverlay: { position: 'fixed', top: 0, right: 0, bottom: 0, width: 380, zIndex: 300, boxShadow: '-4px 0 32px rgba(0,0,0,0.12)', background: 'var(--bg-card)', animation: 'slideIn 0.22s ease' },
}

const gate = {
  wrap: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 60px', textAlign: 'center' },
  btn:  { background: '#111', color: '#fff', border: 'none', borderRadius: 10, padding: '13px 36px', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 10 },
}

const pp = {
  panel:        { width: '100%', height: '100%', background: 'var(--bg-card)', display: 'flex', flexDirection: 'column', overflowY: 'auto' },
  header:       { display: 'flex', alignItems: 'center', gap: 12, padding: '20px', borderBottom: '1px solid var(--border-default)', flexShrink: 0 },
  avatar:       { width: 52, height: 52, borderRadius: '50%', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, flexShrink: 0 },
  name:         { fontWeight: 800, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', letterSpacing: '-0.3px' },
  role:         { fontSize: 12, color: 'var(--text-muted)', marginTop: 2 },
  loc:          { fontSize: 11, color: 'var(--text-muted)', marginTop: 2 },
  closeBtn:     { marginLeft: 'auto', background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-muted)', flexShrink: 0, padding: '4px 8px', borderRadius: 6 },
  body:         { padding: '18px 20px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 },
  hint:         { padding: '24px 20px', fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' },
  section:      { display: 'flex', flexDirection: 'column', gap: 8 },
  sectionLabel: { fontSize: 10, fontWeight: 700, letterSpacing: 1.2, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 2 },
  row:          { display: 'flex', alignItems: 'center', gap: 10 },
  icon:         { fontSize: 15, flexShrink: 0, width: 22 },
  verified:     { background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 },
  listingCard:  { border: '1px solid var(--border-default)', borderRadius: 10, padding: '12px 14px', background: 'var(--bg-muted)' },
  tag:          { background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 20, padding: '2px 10px', fontSize: 11, color: 'var(--text-muted)' },
}