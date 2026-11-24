import { useTheme } from '../context/ThemeContext'
import { useState, useEffect, useCallback } from 'react'
import { api } from '../utils/api'
import { getCurrentUser } from '../utils/storage'
import { useNavigate } from 'react-router-dom'

// ─── Owner replies are now persisted via the API (review_replies table) ──────

// ─── Owner review notification helpers ───────────────────────────────────────
const OWNER_REVIEW_NOTIFS_KEY = 'rentmate_owner_review_notifs'
const OWNER_REVIEW_SEEN_KEY   = 'rentmate_owner_review_seen'

export function getOwnerReviewNotifs(ownerId) {
  try {
    const all = JSON.parse(localStorage.getItem(OWNER_REVIEW_NOTIFS_KEY) || '{}')
    return all[ownerId] || []
  } catch { return [] }
}

export function addOwnerReviewNotif(ownerId, notif) {
  try {
    const all = JSON.parse(localStorage.getItem(OWNER_REVIEW_NOTIFS_KEY) || '{}')
    const list = all[ownerId] || []
    if (list.some(n => n.reviewId === notif.reviewId)) return
    all[ownerId] = [notif, ...list]
    localStorage.setItem(OWNER_REVIEW_NOTIFS_KEY, JSON.stringify(all))
  } catch {}
}

export function getOwnerUnseenReviewCount(ownerId) {
  try {
    const notifs  = getOwnerReviewNotifs(ownerId)
    const seen    = JSON.parse(localStorage.getItem(OWNER_REVIEW_SEEN_KEY) || '{}')
    const seenIds = seen[ownerId] || []
    return notifs.filter(n => !seenIds.includes(n.reviewId)).length
  } catch { return 0 }
}

function markOwnerReviewsSeen(ownerId) {
  try {
    const notifs = getOwnerReviewNotifs(ownerId)
    const seen   = JSON.parse(localStorage.getItem(OWNER_REVIEW_SEEN_KEY) || '{}')
    seen[ownerId] = notifs.map(n => n.reviewId)
    localStorage.setItem(OWNER_REVIEW_SEEN_KEY, JSON.stringify(seen))
  } catch {}
}

// ─── Seeker reply notification helpers ───────────────────────────────────────
const SEEKER_REPLY_NOTIFS_KEY  = 'rentmate_seeker_reply_notifs'

export function getSeekerReplyNotifs(seekerId) {
  try {
    const all = JSON.parse(localStorage.getItem(SEEKER_REPLY_NOTIFS_KEY) || '{}')
    return all[seekerId] || []
  } catch { return [] }
}

export function addSeekerReplyNotif(seekerId, notif) {
  try {
    const all  = JSON.parse(localStorage.getItem(SEEKER_REPLY_NOTIFS_KEY) || '{}')
    const list = all[seekerId] || []
    if (list.some(n => n.reviewId === notif.reviewId)) return
    all[seekerId] = [notif, ...list]
    localStorage.setItem(SEEKER_REPLY_NOTIFS_KEY, JSON.stringify(all))
  } catch {}
}

export function getUnseenSeekerReplyCount(seekerId) {
  try {
    const notifs  = getSeekerReplyNotifs(seekerId)
    const key     = `rentmate_seeker_reply_seen_${seekerId}`
    const seenIds = JSON.parse(localStorage.getItem(key) || '[]')
    return notifs.filter(n => !seenIds.includes(n.reviewId)).length
  } catch { return 0 }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(dateStr) {
  const diff  = Date.now() - new Date(dateStr).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  const weeks = Math.floor(days / 7)
  if (mins  < 2)  return 'Just now'
  if (mins  < 60) return `${mins} min ago`
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`
  if (days  < 7)  return `${days} day${days > 1 ? 's' : ''} ago`
  return `${weeks} week${weeks > 1 ? 's' : ''} ago`
}

function Stars({ rating, size = 16 }) {
  return (
    <div style={{ display: 'flex', gap: '2px' }}>
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} style={{ fontSize: `${size}px`, color: i <= rating ? 'var(--text-primary)' : 'var(--input-border)' }}>★</span>
      ))}
    </div>
  )
}

// ─── Owner Reply Box (API-backed) ─────────────────────────────────────────────
function OwnerReplySection({ review, isOwner, showToast }) {
  const reviewId    = review.id
  const currentUser = getCurrentUser()
  const [reply,      setReply]      = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [editing,    setEditing]    = useState(false)
  const [replyText,  setReplyText]  = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Load reply from backend on mount
  useEffect(() => {
    api.getReviewReply(reviewId)
      .then(data => setReply(data || null))
      .catch(() => setReply(null))
      .finally(() => setLoading(false))
  }, [reviewId])

  async function handleReplySubmit() {
    if (!replyText.trim()) return
    setSubmitting(true)
    try {
      const saved = await api.replyToReview(reviewId, { text: replyText.trim() })
      setReply(saved)
      setEditing(false)
      setReplyText('')
      showToast('Reply posted!')
      if (review.user_id) {
        addSeekerReplyNotif(review.user_id, {
          reviewId,
          listingTitle: review.listing_title || 'a listing',
          ownerName:    currentUser?.name || 'The owner',
          replyText:    replyText.trim(),
          created_at:   new Date().toISOString(),
        })
        window.dispatchEvent(new Event('replyNotifAdded'))
      }
    } catch {
      showToast('Could not save reply')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDeleteReply() {
    if (!window.confirm('Delete your reply?')) return
    try {
      await api.deleteReviewReply(reviewId)
      setReply(null)
      showToast('Reply deleted')
    } catch {
      showToast('Could not delete reply')
    }
  }

  if (loading) return null

  if (reply && !editing) {
    return (
      <div style={s.replyBox}>
        <div style={s.replyHeader}>
          <span style={s.replyBadge}>Owner Reply</span>
          <span style={s.replyDate}>{timeAgo(reply.created_at)}</span>
          {isOwner && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
              <button onClick={() => { setReplyText(reply.text); setEditing(true) }} style={s.replyActionBtn}>Edit</button>
              <button onClick={handleDeleteReply} style={{ ...s.replyActionBtn, color: '#ef4444' }}>Delete</button>
            </div>
          )}
        </div>
        <p style={s.replyText}>{reply.text}</p>
      </div>
    )
  }

  if (isOwner) {
    return (
      <div style={s.replyBox}>
        {!editing ? (
          <button onClick={() => setEditing(true)} style={s.replyWriteBtn}>
            ↩ Reply to this review
          </button>
        ) : (
          <>
            <textarea
              style={s.replyTextarea}
              placeholder="Write your reply..."
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              rows={3}
              autoFocus
            />
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button onClick={handleReplySubmit} disabled={submitting} style={{ ...s.replySubmitBtn, opacity: submitting ? 0.6 : 1 }}>
                {submitting ? 'Posting…' : 'Post Reply'}
              </button>
              <button onClick={() => { setEditing(false); setReplyText('') }} style={s.replyCancelBtn}>Cancel</button>
            </div>
          </>
        )}
      </div>
    )
  }

  return null
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Reviews() {
  const { isDark } = useTheme()
  const navigate    = useNavigate()
  const currentUser = getCurrentUser()
  const isOwner     = currentUser?.role === 'owner'

  const [reviews,      setReviews]      = useState([])
  const [myListingIds, setMyListingIds] = useState(null) // null = not yet fetched
  const [listings,     setListings]     = useState([])   // all listings for seeker dropdown
  const [stats,        setStats]        = useState({ total: 0, avg_rating: 0, histogram: {5:0,4:0,3:0,2:0,1:0} })
  const [loading,      setLoading]      = useState(true)
  const [showForm,     setShowForm]     = useState(false)
  const [submitting,   setSubmitting]   = useState(false)
  const [error,        setError]        = useState(null)
  const [toast,        setToast]        = useState(null)
  const [form,         setForm]         = useState({ listing_id: '', rating: 5, text: '' })
  const [hover,        setHover]        = useState(0)

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 2800)
  }

  // Fetch owner's own listing IDs so we can filter reviews
  useEffect(() => {
    if (!isOwner) { setMyListingIds(null); return }
    api.getMyListings()
      .then(data => {
        const ids = (Array.isArray(data) ? data : (data.listings || [])).map(l => l.id)
        setMyListingIds(ids)
      })
      .catch(() => setMyListingIds([]))
  }, [isOwner])

  // Fetch all listings for seeker's review form dropdown
  useEffect(() => {
    if (isOwner) return
    api.getListings()
      .then(data => setListings(Array.isArray(data) ? data : (data.listings || [])))
      .catch(() => {})
  }, [isOwner])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [rows, s] = await Promise.all([api.getReviews(), api.getReviewStats()])
      setReviews(rows)
      setStats(s)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // When owner opens Reviews page, mark all review notifications as read (clears badge)
  useEffect(() => {
    if (isOwner && currentUser?.id) {
      api.markOwnerReviewsSeen()
        .catch(() => {})
        .finally(() => {
          // Tell Navbar to refresh the badge count immediately
          window.dispatchEvent(new Event('reviewsSeen'))
        })
    }
  }, [isOwner, currentUser?.id])

  // Filter reviews for owner: only show reviews on their listings
  const visibleReviews = isOwner && myListingIds !== null
    ? reviews.filter(r => myListingIds.includes(r.listing_id))
    : reviews

  // Recompute stats for the owner's filtered reviews
  const displayStats = isOwner && myListingIds !== null ? (() => {
    const total = visibleReviews.length
    const sum   = visibleReviews.reduce((a, r) => a + r.rating, 0)
    const avg   = total ? parseFloat((sum / total).toFixed(1)) : 0
    const histogram = {5:0,4:0,3:0,2:0,1:0}
    visibleReviews.forEach(r => { histogram[r.rating] = (histogram[r.rating] || 0) + 1 })
    return { total, avg_rating: avg, histogram }
  })() : stats

  function handleChange(e) { setForm({ ...form, [e.target.name]: e.target.value }) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!currentUser) { navigate('/login'); return }
    if (!form.listing_id || !form.text.trim()) return
    setSubmitting(true)
    try {
      const newReview = await api.submitReview({
        listing_id: Number(form.listing_id),
        rating:     Number(form.rating),
        text:       form.text.trim(),
      })

      setReviews(prev => [newReview, ...prev])
      setShowForm(false)
      setForm({ listing_id: '', rating: 5, text: '' })
      showToast('Review submitted!')

      // Notify the owner of this listing
      const targetListing = listings.find(l => l.id === Number(form.listing_id))
      const ownerId = targetListing?.owner_id || newReview?.owner_id
      if (ownerId) {
        addOwnerReviewNotif(ownerId, {
          reviewId:     newReview.id,
          listingTitle: targetListing?.title || `Listing #${form.listing_id}`,
          reviewerName: currentUser.name,
          rating:       Number(form.rating),
          text:         form.text.trim(),
          created_at:   new Date().toISOString(),
        })
        window.dispatchEvent(new Event('reviewNotifAdded'))
      }
    } catch (e) {
      showToast((e.message || 'Could not submit review'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(reviewId) {
    if (!window.confirm('Delete your review?')) return
    try {
      await api.deleteReview(reviewId)
      setReviews(prev => prev.filter(r => r.id !== reviewId))
      showToast('Review deleted')
      load()
    } catch (e) {
      showToast(e.message)
    }
  }

  const isLoadingOwnerListings = isOwner && myListingIds === null

  return (
    <div style={s.page}>
      {toast && <div style={s.toast}>{toast}</div>}

      <div style={s.topbar}>
        <div>
          <h2 style={s.title}>{isOwner ? 'My Listing Reviews' : 'Reviews & Ratings'}</h2>
          <p style={s.sub}>{isOwner ? 'Reviews left by seekers on your listings' : 'See what others are saying'}</p>
        </div>
        {!isOwner && (
          <button style={s.addBtn} onClick={() => {
            if (!currentUser) { navigate('/login'); return }
            setShowForm(v => !v)
          }}>
            {showForm ? '✕ Cancel' : '+ Write Review'}
          </button>
        )}
      </div>

      <div style={s.content}>
        <div style={s.summaryRow}>
          <div style={s.summaryCard}>
            <div style={s.avgScore}>{displayStats.avg_rating || '—'}</div>
            <Stars rating={Math.round(displayStats.avg_rating)} size={20} />
            <div style={s.avgLabel}>{displayStats.total} review{displayStats.total !== 1 ? 's' : ''}</div>
          </div>
          <div style={s.ratingBars}>
            {[5, 4, 3, 2, 1].map(star => {
              const count = displayStats.histogram[star] || 0
              const pct   = displayStats.total ? Math.round((count / displayStats.total) * 100) : 0
              return (
                <div key={star} style={s.ratingBarRow}>
                  <span style={s.starLabel}>{star} ★</span>
                  <div style={s.barTrack}><div style={{ ...s.barFill, width: `${pct}%` }} /></div>
                  <span style={s.barCount}>{count}</span>
                </div>
              )
            })}
          </div>
        </div>

        {!isOwner && showForm && (
          <div style={s.formCard}>
            <h3 style={s.cardTitle}>Write a Review</h3>
            <form onSubmit={handleSubmit}>
              <div style={s.field}>
                <label style={s.label}>Select Listing</label>
                {listings.length > 0 ? (
                  <select
                    style={s.input}
                    name="listing_id"
                    value={form.listing_id}
                    onChange={handleChange}
                    required
                  >
                    <option value="">— Choose a listing —</option>
                    {listings.map(l => (
                      <option key={l.id} value={l.id}>{l.title} (#{l.id})</option>
                    ))}
                  </select>
                ) : (
                  <>
                    <input
                      style={s.input}
                      name="listing_id"
                      type="number"
                      placeholder="Enter the Listing ID (number at end of listing URL)"
                      value={form.listing_id}
                      onChange={handleChange}
                      required
                    />
                    <div style={{ fontSize: '11px', color: 'var(--text-placeholder)', marginTop: '4px' }}>
                      Tip: Open a listing page — the number at the end of the URL is its ID (e.g. /listing/3 → ID is 3)
                    </div>
                  </>
                )}
              </div>
              <div style={s.field}>
                <label style={s.label}>Rating</label>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  {[1, 2, 3, 4, 5].map(i => (
                    <span
                      key={i}
                      style={{ fontSize: '28px', cursor: 'pointer', color: i <= (hover || form.rating) ? 'var(--text-primary)' : 'var(--input-border)' }}
                      onMouseEnter={() => setHover(i)}
                      onMouseLeave={() => setHover(0)}
                      onClick={() => setForm({ ...form, rating: i })}
                    >★</span>
                  ))}
                  <span style={{ fontSize: '13px', color: 'var(--text-muted)', marginLeft: '6px' }}>
                    {['','Terrible','Poor','Okay','Good','Excellent'][hover || form.rating]}
                  </span>
                </div>
              </div>
              <div style={s.field}>
                <label style={s.label}>Your Review</label>
                <textarea
                  style={s.textarea}
                  name="text"
                  placeholder="Share your experience..."
                  value={form.text}
                  onChange={handleChange}
                  rows={4}
                  required
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button style={{ ...s.submitBtn, opacity: submitting ? 0.6 : 1 }} type="submit" disabled={submitting}>
                  {submitting ? 'Submitting…' : 'Submit Review →'}
                </button>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Posting as <strong>{currentUser?.name}</strong>
                </span>
              </div>
            </form>
          </div>
        )}

        <h3 style={s.sectionTitle}>{isOwner ? 'Reviews on Your Listings' : 'All Reviews'}</h3>

        {(loading || isLoadingOwnerListings) && (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-placeholder)', fontSize: '14px' }}>Loading reviews…</div>
        )}
        {error && <div style={{ textAlign: 'center', padding: '40px', color: '#ef4444', fontSize: '14px' }}>⚠️ {error}</div>}
        {!loading && !isLoadingOwnerListings && !error && visibleReviews.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-placeholder)', fontSize: '14px' }}>
            {isOwner
              ? "No reviews on your listings yet. Once seekers review your listings they'll appear here."
              : 'No reviews yet — be the first to share your experience!'}
          </div>
        )}

        <div style={s.reviewsList}>
          {visibleReviews.map(r => (
            <div key={r.id} style={s.reviewCard}>
              <div style={s.reviewTop}>
                <div style={s.reviewAvatar}>{r.reviewer_name?.charAt(0) || '?'}</div>
                <div style={s.reviewInfo}>
                  <div style={s.reviewName}>{r.reviewer_name}</div>
                  <div style={s.reviewMeta}>
                    {r.reviewer_role === 'owner' ? 'Room Owner' : 'Room Seeker'}
                    {r.listing_title ? ` · ${r.listing_title}` : ''}
                  </div>
                </div>
                <div style={s.reviewRight}>
                  <Stars rating={r.rating} />
                  <div style={s.reviewDate}>{timeAgo(r.created_at)}</div>
                  {currentUser && r.user_id === currentUser.id && (
                    <button onClick={() => handleDelete(r.id)} style={s.deleteBtn}>Delete</button>
                  )}
                </div>
              </div>
              <p style={s.reviewText}>{r.text}</p>

              <OwnerReplySection
                review={r}
                isOwner={isOwner}
                showToast={showToast}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const s = {
  page:         { minHeight: '100vh', background: 'var(--bg-primary)', fontFamily: "'Segoe UI', sans-serif", position: 'relative' },
  toast:        { position: 'fixed', top: '20px', right: '24px', background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)', borderRadius: '10px', padding: '12px 20px', fontSize: '13px', fontWeight: '600', zIndex: 9999, boxShadow: '0 4px 20px rgba(0,0,0,0.15)' },
  topbar:       { background: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)', padding: '20px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title:        { fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.5px' },
  sub:          { fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' },
  addBtn:       { background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)', border: 'none', borderRadius: '10px', padding: '10px 20px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' },
  content:      { padding: '28px 32px' },
  summaryRow:   { display: 'flex', gap: '24px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '24px', marginBottom: '24px', alignItems: 'center' },
  summaryCard:  { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', minWidth: '120px', paddingRight: '24px', borderRight: '1px solid var(--border-color)' },
  avgScore:     { fontSize: '52px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-2px', lineHeight: 1 },
  avgLabel:     { fontSize: '13px', color: 'var(--text-muted)' },
  ratingBars:   { flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' },
  ratingBarRow: { display: 'flex', alignItems: 'center', gap: '10px' },
  starLabel:    { fontSize: '12px', color: 'var(--text-muted)', width: '28px', flexShrink: 0 },
  barTrack:     { flex: 1, height: '6px', background: 'var(--bg-secondary)', borderRadius: '3px', overflow: 'hidden' },
  barFill:      { height: '6px', background: 'var(--btn-primary-bg)', borderRadius: '3px', transition: 'width 0.4s' },
  barCount:     { fontSize: '12px', color: 'var(--text-placeholder)', width: '16px', textAlign: 'right' },
  formCard:     { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '24px', marginBottom: '24px' },
  cardTitle:    { fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '20px' },
  field:        { marginBottom: '16px' },
  label:        { display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '7px' },
  input:        { width: '100%', padding: '11px 14px', borderRadius: '10px', border: '1.5px solid var(--input-border)', fontSize: '14px', outline: 'none', boxSizing: 'border-box', color: 'var(--text-primary)', background: 'var(--bg-card)' },
  textarea:     { width: '100%', padding: '11px 14px', borderRadius: '10px', border: '1.5px solid var(--input-border)', fontSize: '14px', outline: 'none', boxSizing: 'border-box', resize: 'vertical', color: 'var(--text-primary)' },
  submitBtn:    { background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)', border: 'none', borderRadius: '10px', padding: '12px 24px', fontSize: '14px', fontWeight: '700', cursor: 'pointer' },
  sectionTitle: { fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '14px' },
  reviewsList:  { display: 'flex', flexDirection: 'column', gap: '12px' },
  reviewCard:   { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '20px' },
  reviewTop:    { display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' },
  reviewAvatar: { width: '40px', height: '40px', borderRadius: '50%', background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: '700', flexShrink: 0 },
  reviewInfo:   { flex: 1 },
  reviewName:   { fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '2px' },
  reviewMeta:   { fontSize: '12px', color: 'var(--text-muted)' },
  reviewRight:  { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' },
  reviewDate:   { fontSize: '11px', color: '#ccc' },
  reviewText:   { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.7' },
  deleteBtn:    { background: 'none', border: 'none', color: '#ef4444', fontSize: '11px', cursor: 'pointer', marginTop: '2px', padding: 0 },
  replyBox:       { marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border-color)', paddingLeft: '16px', borderLeft: '3px solid var(--input-border)' },
  replyHeader:    { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' },
  replyBadge:     { fontSize: '11px', fontWeight: '700', color: 'var(--btn-primary-text)', background: 'var(--btn-primary-bg)', borderRadius: '6px', padding: '2px 8px', letterSpacing: '0.3px' },
  replyDate:      { fontSize: '11px', color: '#ccc' },
  replyText:      { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6', margin: 0 },
  replyActionBtn: { background: 'none', border: 'none', fontSize: '11px', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, fontWeight: '600' },
  replyWriteBtn:  { background: 'none', border: '1.5px solid var(--input-border)', borderRadius: '8px', padding: '7px 14px', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', cursor: 'pointer' },
  replyTextarea:  { width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1.5px solid var(--input-border)', fontSize: '13px', outline: 'none', boxSizing: 'border-box', resize: 'vertical', color: 'var(--text-primary)', fontFamily: 'inherit' },
  replySubmitBtn: { background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)', border: 'none', borderRadius: '8px', padding: '8px 18px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' },
  replyCancelBtn: { background: 'none', border: '1.5px solid var(--input-border)', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', color: 'var(--text-muted)', cursor: 'pointer' },
}