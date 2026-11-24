import { useState, useEffect } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import PaymentModal from '../components/PaymentModal'
import { useBookmarks } from '../hooks/useBookmarks'
import ReportModal from './ReportModal'
import BookVisitModal from '../components/BookVisitModal'
import NegotiationScore from '../components/NegotiationScore'
import { api } from '../utils/api'
import { getCurrentUser } from '../utils/storage'

// ── Helpers ──────────────────────────────────────────────────────────────────
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

// ── REMOVED: hardcoded LISTINGS array ────────────────────────────────────────
// ListingDetail now fetches the real listing from the backend using the URL id.
// The match score is passed via navigation state from BrowseListings.
// ─────────────────────────────────────────────────────────────────────────────

function getMatchInfo(score) {
  if (score >= 90) return { color: '#166534', bg: '#f0fdf4', border: '#bbf7d0', label: 'Excellent Match' }
  if (score >= 75) return { color: '#1e40af', bg: '#eff6ff', border: '#bfdbfe', label: 'Great Match' }
  if (score >= 60) return { color: '#92400e', bg: '#fffbeb', border: '#fde68a', label: 'Good Match' }
  return               { color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb', label: 'Low Match' }
}

export default function ListingDetail() {
  const navigate          = useNavigate()
  const { id }            = useParams()
  const locationState     = useLocation()   // to read matchScore passed from BrowseListings

  // matchScore passed via navigate('/listing/:id', { state: { matchScore } })
  const passedMatchScore  = locationState.state?.matchScore ?? null

  const [listing, setListing]           = useState(null)
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState(null)
  // contactUnlocked: driven ONLY by backend /api/contacts/status — never by boost or localStorage
  const [contactUnlocked, setContactUnlocked] = useState(false)
  // ownerPhone: fetched from backend ONLY after server confirms unlock — never from listing payload
  const [ownerPhone, setOwnerPhone]     = useState(null)
  // saved state is now derived from the API-driven bookmark hook — never localStorage
  const { isBookmarked: isBM, toggleBookmark: apiToggleBookmark } = useBookmarks()
  const saved = listing ? isBM(listing.id) : false
  const [toast, setToast]               = useState(null)
  const [showPayment, setShowPayment]   = useState(false)
  const [showReport, setShowReport]     = useState(false)
  const [showBooking, setShowBooking]   = useState(false)
  const [activePhotoIdx, setActivePhotoIdx] = useState(0)
  const [lightboxOpen, setLightboxOpen]     = useState(false)
  const [showReview, setShowReview]         = useState(false)
  const [reviewForm, setReviewForm]         = useState({ rating: 5, text: '' })
  const [reviewHover, setReviewHover]       = useState(0)
  const [reviews, setReviews]               = useState([])
  const [deleteConfirm, setDeleteConfirm]   = useState(null) // reviewId pending delete confirmation
  const currentUser                         = getCurrentUser()

  // ── Review handlers (component-level to avoid stale-closure IIFE bugs) ──────
  const myReview  = reviews.find(r => r.user_id === currentUser?.id)
  const isEditing = !!reviewForm.editingId
  // avgRating is always recomputed from current reviews (never stale after submit/edit/delete)
  const avgRating = reviews.length > 0
    ? (reviews.reduce((sum, r) => sum + Number(r.rating), 0) / reviews.length).toFixed(1)
    : null

  async function handleReviewSubmit(e) {
    e.preventDefault()
    if (!reviewForm.text.trim()) return
    try {
      const submitted = await api.submitReview({
        listing_id: Number(id),
        rating:     reviewForm.rating,
        text:       reviewForm.text.trim(),
      })
      // Ensure user_id is set so edit/delete buttons appear immediately
      const withUserId = { ...submitted, user_id: submitted.user_id ?? currentUser?.id }
      setReviews(prev => [withUserId, ...prev])
      setReviewForm({ rating: 5, text: '' })
      // Keep panel open so user can see their new review
      showToast('⭐ Review submitted!')
    } catch (err) {
      showToast('⚠️ ' + (err.message || 'Could not submit review'))
    }
  }

  function handleReviewEdit(reviewId) {
    const target = reviews.find(r => r.id === reviewId)
    if (!target) return
    setReviewForm({ rating: target.rating, text: target.text, editingId: reviewId })
    setShowReview(true)
  }

  async function handleReviewUpdate(e) {
    e.preventDefault()
    if (!reviewForm.text.trim()) return
    try {
      const updated = await api.updateReview(reviewForm.editingId, {
        rating: reviewForm.rating,
        text:   reviewForm.text.trim(),
      })
      setReviews(prev => prev.map(r => r.id === updated.id ? updated : r))
      setReviewForm({ rating: 5, text: '' })
      // Keep panel open so user can see updated review
      showToast('✏️ Review updated!')
    } catch (err) {
      showToast('⚠️ ' + (err.message || 'Could not update review'))
    }
  }

  async function handleReviewDelete(reviewId) {
    setDeleteConfirm(reviewId)
  }

  async function confirmDeleteReview() {
    const reviewId = deleteConfirm
    setDeleteConfirm(null)
    try {
      await api.deleteReview(reviewId)
      setReviews(prev => prev.filter(r => r.id !== reviewId))
      showToast('Review deleted')
    } catch (err) {
      showToast('⚠️ ' + err.message)
    }
  }

  // Fetch listing + server-side contact status on mount
  useEffect(() => {
    async function fetchListing() {
      setLoading(true)
      setError(null)
      try {
        const data = await api.getListing(id)
        setListing(data)

        // SECURITY: Check contact unlock status from DB, not localStorage.
        // Boost status is completely irrelevant here.
        // We only check: does this user have a contact_unlocks record for this listing_id?
        try {
          const { unlocked } = await api.getContactStatus(data.id)
          setContactUnlocked(unlocked)
          if (unlocked) {
            // Only fetch phone if server confirms access
            const { phone } = await api.getContactPhone(data.id)
            setOwnerPhone(phone)
          }
        } catch {
          // Not authenticated or other error — contact stays locked
          setContactUnlocked(false)
        }

        // Fetch reviews + owner replies (non-blocking)
        try {
          const fetchedReviews = await api.getListingReviews(data.id)
          const enriched = await Promise.all(
            fetchedReviews.map(async r => {
              try {
                const reply = await api.getReviewReply(r.id)
                return { ...r, owner_reply: reply || null }
              } catch {
                return { ...r, owner_reply: null }
              }
            })
          )
          setReviews(enriched)
        } catch { /* reviews optional — don't block listing load */ }

      } catch (err) {
        setError(err.message || 'Listing not found')
      } finally {
        setLoading(false)
      }
    }
    fetchListing()
  }, [id])

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  async function handleSave() {
    if (!listing) return
    try {
      const nowSaved = await apiToggleBookmark(listing)
      showToast(nowSaved ? '🔖 Saved to Bookmarks' : '✕ Removed from Bookmarks')
    } catch {
      showToast('⚠️ Please log in to save listings')
    }
  }

  function handleContactUnlock() { setShowPayment(true) }

  function handleChat() {
    if (!contactUnlocked) { handleContactUnlock(); return }
    navigate('/seeker-chat', {
      state: {
        openListingId: listing?.id,
        openOwnerId:   listing?.owner_id,
        ownerName:     listing?.owner,
        listingTitle:  listing?.title,
        isUnlocked:    true,
      }
    })
  }

  // ── Loading state ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ ...s.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px', opacity: 0.3 }}>🏠</div>
          <div style={{ fontSize: '14px' }}>Loading listing...</div>
        </div>
      </div>
    )
  }

  // ── Error state ─────────────────────────────────────────────────────────────
  if (error || !listing) {
    return (
      <div style={{ ...s.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px', opacity: 0.3 }}>⚠️</div>
          <div style={{ fontSize: '14px', marginBottom: '12px' }}>{error || 'Listing not found'}</div>
          <button style={s.backBtn} onClick={() => navigate('/browse')}>← Back to Browse</button>
        </div>
      </div>
    )
  }

  // ── Derived values ──────────────────────────────────────────────────────────
  // Use passedMatchScore if available (from BrowseListings navigation state)
  // otherwise 0 (don't guess)
  const matchScore = passedMatchScore ?? 0
  const mi         = getMatchInfo(matchScore)

  const matchDetails = [
    { label: 'Budget',    icon: '💰', match: listing.price <= 15000, desc: `₹${listing.price.toLocaleString()}/month`, score: listing.price <= 15000 ? 25 : 10 },
    { label: 'Location',  icon: '📍', match: true, desc: listing.locationLabel || listing.location || '—', score: 20 },
    { label: 'Room Type', icon: '🏠', match: true, desc: `${listing.type} room`, score: 15 },
    { label: 'Furnishing',icon: '🛋️', match: listing.furnished === 'Fully Furnished', desc: listing.furnished, score: listing.furnished === 'Fully Furnished' ? 10 : 5 },
    { label: 'Verified',  icon: '✅', match: listing.verified, desc: listing.verified ? 'AI verified listing — trustworthy' : 'Not yet verified', score: listing.verified ? 5 : 0 },
  ]

  const allPhotos  = listing.photos && listing.photos.length > 0 ? listing.photos : []
  const mainImgUrl = allPhotos.length > 0 ? allPhotos[activePhotoIdx]?.url : null
  const thumbImgs  = allPhotos

  return (
    <div style={s.page}>
      {toast && <div style={s.toast}>{toast}</div>}

      {/* Top Bar */}
      <div style={s.topbar}>
        <button style={s.backBtn} onClick={() => navigate('/browse')}>← Back to Listings</button>
        <div style={s.topbarActions}>
          <button style={s.actionBtn} onClick={() => setShowReport(true)}>⚑ Report</button>
          <button style={{ ...s.actionBtn, ...(saved ? s.actionBtnSaved : {}) }} onClick={handleSave}>
            {saved ? '❤️ Saved' : '🤍 Save'}
          </button>
          <button style={s.actionBtn} onClick={() => {
            const url = window.location.href
            if (navigator.share) {
              navigator.share({ title: listing?.title, text: 'Check out this listing on RentMate!', url })
            } else {
              navigator.clipboard.writeText(url).then(() => showToast('🔗 Link copied to clipboard!'))
            }
          }}>Share</button>
          <button style={{ ...s.actionBtn, ...(showReview ? s.actionBtnActive : {}) }} onClick={() => setShowReview(v => !v)}>
            ⭐ Review
          </button>
          <button
            style={{ ...s.actionBtnGreen, ...(!contactUnlocked ? s.actionBtnLocked : {}) }}
            onClick={() => {
              if (!contactUnlocked) { setShowPayment(true); return }
              setShowBooking(true)
            }}
            title={!contactUnlocked ? 'Unlock contact first to book a visit' : 'Book a visit'}
          >
            {contactUnlocked ? '📅 Book Visit' : '🔒 Book Visit'}
          </button>
          <button style={s.actionBtnDark} onClick={() => navigate('/negotiation')}>🤝 Negotiation Tips</button>
        </div>
      </div>

      {/* ── Inline Review Panel ─────────────────────────────────────── */}
      {showReview && (
          <div style={s.reviewPanel}>
            <div style={s.reviewPanelInner}>
              {/* Show form only if user hasn't reviewed yet, or is currently editing */}
              {(!myReview || isEditing) && (
                <div style={s.reviewFormCard}>
                  <div style={s.reviewFormTitle}>{isEditing ? '✏️ Edit Your Review' : '⭐ Write a Review for this Listing'}</div>
                  <form onSubmit={isEditing ? handleReviewUpdate : handleReviewSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                      <div style={s.reviewLabel}>Your Rating</div>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        {[1,2,3,4,5].map(i => (
                          <span key={i}
                            style={{ fontSize: '26px', cursor: 'pointer', color: i <= (reviewHover || reviewForm.rating) ? '#f59e0b' : '#e5e7eb', transition: 'color 0.1s' }}
                            onMouseEnter={() => setReviewHover(i)}
                            onMouseLeave={() => setReviewHover(0)}
                            onClick={() => setReviewForm(f => ({ ...f, rating: i }))}>★</span>
                        ))}
                        <span style={{ fontSize: '13px', color: 'var(--text-muted)', marginLeft: '6px' }}>
                          {['','Terrible','Poor','Okay','Good','Excellent'][reviewHover || reviewForm.rating]}
                        </span>
                      </div>
                    </div>
                    <div>
                      <div style={s.reviewLabel}>Your Experience</div>
                      <textarea
                        style={s.reviewTextarea}
                        placeholder="How was your experience with this listing? Be honest and helpful to others."
                        value={reviewForm.text}
                        onChange={e => setReviewForm(f => ({ ...f, text: e.target.value }))}
                        rows={3}
                        required
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <button type="submit" style={s.reviewSubmitBtn}>{isEditing ? 'Update Review →' : 'Submit Review →'}</button>
                      {isEditing && (
                        <button type="button" style={{ ...s.reviewSubmitBtn, background: '#e5e7eb', color: '#374151' }}
                          onClick={() => setReviewForm({ rating: 5, text: '' })}>
                          Cancel
                        </button>
                      )}
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Posting as <strong>{currentUser?.name || 'You'}</strong></span>
                    </div>
                  </form>
                </div>
              )}

              {reviews.length > 0 && (
                <div style={s.reviewListWrap}>
                  <div style={s.reviewListHeader}>
                    <span style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '14px' }}>
                      {reviews.length} Review{reviews.length > 1 ? 's' : ''}
                    </span>
                    {avgRating && (
                      <span style={{ fontSize: '13px', color: '#f59e0b', fontWeight: '600' }}>
                        ★ {avgRating} ({reviews.length} review{reviews.length > 1 ? 's' : ''})
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {reviews.map(r => (
                      <div key={r.id} style={s.reviewItem}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={s.reviewAvatar}>{(r.reviewer_name || r.name || '?').charAt(0)}</div>
                            <div>
                              <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>{r.reviewer_name || r.name || 'Anonymous'}</div>
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{r.created_at ? timeAgo(r.created_at) : (r.date || '')}</div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                            <div style={{ color: '#f59e0b', fontSize: '14px' }}>
                              {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}
                            </div>
                            {currentUser && r.user_id === currentUser.id && (
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                  onClick={() => handleReviewEdit(r.id)}
                                  style={{ background: 'none', border: 'none', color: '#6366f1', fontSize: '11px', cursor: 'pointer', padding: 0, fontWeight: '600' }}>
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleReviewDelete(r.id)}
                                  style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '11px', cursor: 'pointer', padding: 0, fontWeight: '600' }}>
                                  Delete
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.6' }}>{r.text}</p>
                        {r.owner_reply && (
                          <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #f0f0f0', paddingLeft: '12px', borderLeft: '3px solid #e5e7eb' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                              <span style={{ fontSize: '11px', fontWeight: '700', color: '#fff', background: '#111', borderRadius: '6px', padding: '2px 8px' }}>Owner Reply</span>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{timeAgo(r.owner_reply.created_at)}</span>
                            </div>
                            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.6' }}>{r.owner_reply.text}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {reviews.length === 0 && (
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', padding: '4px 0' }}>
                  No reviews yet — be the first to share your experience!
                </div>
              )}
            </div>
          </div>
      )}

      <div style={s.content}>
        {/* Left */}
        <div style={s.left}>
          {/* Main Image — click to open fullscreen lightbox */}
          <div style={{ ...s.mainImg, cursor: mainImgUrl ? 'zoom-in' : 'default' }}
               onClick={() => mainImgUrl && setLightboxOpen(true)}>
            {mainImgUrl
              ? <img src={mainImgUrl} alt={listing.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontSize: '64px', opacity: 0.1 }}>🏠</span>
            }
            {listing.verified
              ? <div style={s.verifiedBadge}>✓ AI Verified</div>
              : <div style={s.reviewBadge}>⚠ Review Listing</div>
            }
            {allPhotos.length > 1 && (
              <div style={s.photoCount}>📷 {activePhotoIdx + 1} / {allPhotos.length}</div>
            )}
          </div>

          {/* Thumbnail strip — click any to make it the main image */}
          {thumbImgs.length > 0 && (
            <div style={s.imgGrid}>
              {thumbImgs.map((p, i) => (
                <div key={i}
                     style={{ ...s.thumbImg, cursor: 'pointer',
                              outline: i === activePhotoIdx ? '2.5px solid #111' : 'none',
                              outlineOffset: '2px', opacity: i === activePhotoIdx ? 1 : 0.75 }}
                     onClick={() => setActivePhotoIdx(i)}>
                  <img src={p.url} alt={`Photo ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              ))}
            </div>
          )}

          <div style={s.detailCard}>
            {/* Header */}
            <div style={s.detailHeader}>
              <div>
                <h1 style={s.detailTitle}>{listing.title}</h1>
                <div style={s.detailLoc}>📍 {listing.locationLabel || listing.location}</div>
              </div>
              {matchScore > 0 && (
                <div style={{ ...s.matchBadgeLarge, background: mi.bg, color: mi.color, border: `1.5px solid ${mi.border}` }}>
                  {matchScore}% Match
                </div>
              )}
            </div>

            <div style={s.priceRow}>
              <div style={s.price}>₹{listing.price.toLocaleString()}<span style={s.perMonth}>/month</span></div>
              {listing.deposit > 0 && (
                <div style={s.deposit}>+ ₹{Number(listing.deposit).toLocaleString()} deposit</div>
              )}
            </div>

            <div style={s.tagsRow}>
              {[listing.type, listing.furnished, ...(listing.tags || [])].filter(Boolean).map(t => (
                <span key={t} style={s.tag}>{t}</span>
              ))}
            </div>

            <NegotiationScore listing={listing} />

            <div style={s.divider} />
            <h3 style={s.sectionTitle}>About this room</h3>

            <div style={s.divider} />

            <h3 style={s.sectionTitle}>About this room</h3>
            <p style={s.description}>{listing.description || 'No description provided.'}</p>

            <div style={s.divider} />

            <h3 style={s.sectionTitle}>Room Details</h3>
            <div style={s.detailGrid}>
              {[
                ['Available From', listing.availableFrom || '—'],
                ['Floor',          listing.floor ? `${listing.floor}${listing.totalFloors ? ' of ' + listing.totalFloors : ''}` : '—'],
                ['Facing',         listing.facing    || '—'],
                ['Bathroom',       listing.bathrooms || '—'],
                ['Kitchen',        listing.kitchen   || '—'],
                ['Maintenance',    listing.maintenance > 0 ? `₹${Number(listing.maintenance).toLocaleString()}/month` : '—'],
              ].map(([key, val]) => (
                <div key={key} style={s.detailItem}>
                  <div style={s.detailKey}>{key}</div>
                  <div style={s.detailVal}>{val}</div>
                </div>
              ))}
            </div>

            <div style={s.divider} />

            {/* AI Match Breakdown */}
            {matchScore > 0 && (
              <>
                <h3 style={s.sectionTitle}>🤖 AI Match Analysis</h3>
                <div style={{ ...s.matchSection, background: mi.bg, border: `1px solid ${mi.border}` }}>
                  <div style={s.matchTop}>
                    <div>
                      <div style={{ ...s.matchScore, color: mi.color }}>{matchScore}%</div>
                      <div style={s.matchLabel}>{mi.label}</div>
                    </div>
                    <div style={s.matchBarVertical}>
                      <div style={s.matchBarTrack}>
                        <div style={{ ...s.matchBarFill, height: `${matchScore}%`, background: mi.color }} />
                      </div>
                    </div>
                  </div>
                  <div style={s.matchGrid}>
                    {matchDetails.map((d, i) => (
                      <div key={i} style={{ ...s.matchItem, background: d.match ? 'rgba(16,185,129,0.06)' : 'rgba(0,0,0,0.03)', borderColor: d.match ? 'rgba(16,185,129,0.2)' : 'var(--border)' }}>
                        <div style={s.matchItemTop}>
                          <span style={{ fontSize: '16px' }}>{d.icon}</span>
                          <span style={s.matchItemLabel}>{d.label}</span>
                          <span style={{ ...s.matchItemCheck, color: d.match ? '#10b981' : '#d1d5db' }}>
                            {d.match ? '✓' : '○'}
                          </span>
                        </div>
                        <div style={s.matchItemDesc}>{d.desc}</div>
                        <div style={s.matchItemScore}>+{d.score} pts</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={s.divider} />
              </>
            )}

            {/* Fraud Detection */}
            <h3 style={s.sectionTitle}>Fraud Detection</h3>
            <div style={listing.verified ? s.fraudSafe : s.fraudWarn}>
              <div style={s.fraudIcon}>{listing.verified ? '✓' : '⚠'}</div>
              <div>
                <div style={s.fraudTitle}>
                  {listing.verified ? 'This listing passed AI verification' : 'This listing needs review'}
                </div>
                <div style={s.fraudText}>
                  {listing.verified
                    ? 'Price is fair, description is original, owner is responsive.'
                    : 'Some aspects could not be fully verified. Proceed with caution.'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right */}
        <div style={s.right}>
          {/* Owner Card */}
          <div style={s.ownerCard}>
            <h3 style={s.ownerTitle}>Listed by</h3>
            <div style={s.ownerInfo}>
              <div style={s.ownerAvatar}>{(listing.owner || '?').charAt(0).toUpperCase()}</div>
              <div>
                <div style={s.ownerName}>
                  {listing.owner || 'Owner'}
                  {listing.ownerVerified && (
                    <span style={{ marginLeft: '6px', fontSize: '12px', color: '#16a34a', fontWeight: '700' }} title='Verified Owner'>✅ Verified</span>
                  )}
                </div>
                <div style={s.ownerRole}>
                  {listing.ownerOccupation || 'Room Owner'}
                  {listing.ownerCity ? ` · ${listing.ownerCity}` : ''}
                </div>
                {listing.ownerBio && (
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px', lineHeight: '1.5' }}>{listing.ownerBio}</div>
                )}
              </div>
            </div>

            {contactUnlocked ? (
              <>
                <div style={s.ownerPhone}>📞 {ownerPhone || 'Contact unlocked'}</div>
                <button style={s.messageBtn} onClick={() => navigate('/seeker-chat', {
                  state: {
                    openListingId: listing?.id,
                    openOwnerId:   listing?.owner_id,
                    ownerName:     listing?.owner,
                    listingTitle:  listing?.title,
                    isUnlocked:    true,
                  }
                })}>💬 Message Owner</button>
                <button style={s.bookVisitBtn} onClick={() => setShowBooking(true)}>📅 Book a Visit</button>
              </>
            ) : (
              <div style={s.lockBox}>
                <div style={s.lockBoxTop}>
                  <span style={{ fontSize: '22px' }}>🔒</span>
                  <div>
                    <div style={s.lockTitle}>Contact Locked</div>
                    <div style={s.lockSub}>Unlock to view phone & chat</div>
                  </div>
                </div>
                <div style={s.blurPhone}>📞 98••••••••</div>
                <button style={s.unlockBtn} onClick={handleContactUnlock}>
                  🔓 Unlock Contact — ₹29
                </button>
                <p style={s.unlockNote}>One-time · Includes chat access</p>
              </div>
            )}
          </div>

          {/* Quick Info */}
          <div style={s.infoCard}>
            {[
              ['Monthly Rent',     `₹${listing.price.toLocaleString()}`],
              ['Security Deposit', listing.deposit > 0 ? `₹${Number(listing.deposit).toLocaleString()}` : '—'],
              ['Maintenance',      listing.maintenance > 0 ? `₹${Number(listing.maintenance).toLocaleString()}/month` : '—'],
              ['Available From',   listing.availableFrom || '—'],
            ].map(([k, v]) => (
              <div key={k} style={s.infoRow}>
                <span style={s.infoKey}>{k}</span>
                <span style={s.infoVal}>{v}</span>
              </div>
            ))}
          </div>

          <button style={s.fullDetailsBtn} onClick={() => navigate('/browse')}>← Back to Browse</button>
        </div>
      </div>

      {showPayment && (
        <PaymentModal
          feature="Contact & Chat"
          price={29}
          onSuccess={async (paymentId, method, feature) => {
            // Record unlock in DB — ties access to (user_id, listing_id)
            await api.recordContactUnlock(listing.id, paymentId || 'mock')
            // Also record in payments table for admin dashboard
            try { await api.recordPayment({ feature: 'Contact & Chat', amount: 29, method: method || 'mock' }) } catch {}
            // Fetch phone from server only after unlock is confirmed
            try {
              const { phone } = await api.getContactPhone(listing.id)
              setOwnerPhone(phone)
            } catch { /* phone fetch failed — contact still unlocked */ }
            setContactUnlocked(true)
            showToast('🔓 Contact unlocked!')
          }}
          onClose={() => setShowPayment(false)}
        />
      )}

      {showReport && (
        <ReportModal
          type="listing"
          targetName={listing.title}
          onClose={() => setShowReport(false)}
        />
      )}

      {showBooking && (
        <BookVisitModal listing={listing} onClose={() => setShowBooking(false)} />
      )}

      {/* ── Fullscreen Lightbox ──────────────────────────────────────────── */}
      {lightboxOpen && allPhotos.length > 0 && (
        <div style={s.lightboxOverlay} onClick={() => setLightboxOpen(false)}>
          <div style={s.lightboxInner} onClick={e => e.stopPropagation()}>
            {/* Close */}
            <button style={s.lightboxClose} onClick={() => setLightboxOpen(false)}>✕</button>

            {/* Prev arrow */}
            {allPhotos.length > 1 && (
              <button style={{ ...s.lightboxArrow, left: '12px' }}
                      onClick={() => setActivePhotoIdx(i => (i - 1 + allPhotos.length) % allPhotos.length)}>
                ‹
              </button>
            )}

            {/* Main fullscreen image */}
            <img
              src={allPhotos[activePhotoIdx]?.url}
              alt={`Photo ${activePhotoIdx + 1}`}
              style={s.lightboxImg}
            />

            {/* Next arrow */}
            {allPhotos.length > 1 && (
              <button style={{ ...s.lightboxArrow, right: '12px' }}
                      onClick={() => setActivePhotoIdx(i => (i + 1) % allPhotos.length)}>
                ›
              </button>
            )}

            {/* Dot indicators */}
            {allPhotos.length > 1 && (
              <div style={s.lightboxDots}>
                {allPhotos.map((_, i) => (
                  <div key={i}
                       style={{ ...s.lightboxDot, ...(i === activePhotoIdx ? s.lightboxDotActive : {}) }}
                       onClick={() => setActivePhotoIdx(i)} />
                ))}
              </div>
            )}

            {/* Counter */}
            <div style={s.lightboxCounter}>{activePhotoIdx + 1} / {allPhotos.length}</div>
          </div>
        </div>
      )}
      {/* ── Delete Confirmation Modal ─────────────────────────────────── */}
      {deleteConfirm && (
        <div style={s.modalOverlay} onClick={() => setDeleteConfirm(null)}>
          <div style={s.modalBox} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: '28px', marginBottom: '10px' }}>🗑️</div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px' }}>Delete Review?</div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>This action cannot be undone.</div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button style={s.modalCancelBtn} onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button style={s.modalDeleteBtn} onClick={confirmDeleteReview}>Yes, Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const s = {
  page: { minHeight: '100vh', background: 'var(--bg-page)', fontFamily: "'Segoe UI', sans-serif", position: 'relative' },
  toast: { position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', background: '#111', color: 'white', padding: '12px 24px', borderRadius: '30px', fontSize: '13px', fontWeight: '600', zIndex: 9999, whiteSpace: 'nowrap', boxShadow: '0 4px 20px rgba(0,0,0,0.2)' },
  topbar: { background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '12px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  backBtn: { background: 'none', border: '1.5px solid var(--border)', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: '500' },
  topbarActions: { display: 'flex', gap: '8px', alignItems: 'center' },
  actionBtn: { padding: '8px 14px', background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '12px', fontWeight: '500', cursor: 'pointer', color: 'var(--text-secondary)' },
  actionBtnSaved: { background: '#fff0f0', borderColor: '#ffd0d0', color: '#cc0000' },
  actionBtnActive: { background: '#fffbeb', borderColor: '#fde68a', color: '#92400e' },
  actionBtnGreen: { padding: '8px 14px', background: '#f0fdf4', color: '#166534', border: '1.5px solid #bbf7d0', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' },
  actionBtnLocked: { background: '#f3f4f6', color: '#9ca3af', border: '1.5px solid #e5e7eb', cursor: 'pointer' },
  actionBtnDark: { padding: '8px 14px', background: '#111', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' },
  content: { display: 'flex', gap: '0', maxWidth: '1200px', margin: '0 auto', padding: '24px 24px 48px' },
  left: { flex: 1, minWidth: 0 },
  mainImg: { height: '320px', background: 'var(--bg-subtle)', borderRadius: '16px', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' },
  imgGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '20px' },
  thumbImg: { height: '90px', background: 'var(--bg-subtle)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  verifiedBadge: { position: 'absolute', top: '12px', left: '12px', background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', fontSize: '12px', fontWeight: '700', padding: '4px 12px', borderRadius: '6px' },
  reviewBadge: { position: 'absolute', top: '12px', left: '12px', background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', fontSize: '12px', fontWeight: '700', padding: '4px 12px', borderRadius: '6px' },
  detailCard: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '24px' },
  detailHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px', gap: '12px' },
  detailTitle: { fontSize: '22px', fontWeight: '800', color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.5px' },
  detailLoc: { fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' },
  matchBadgeLarge: { padding: '8px 16px', borderRadius: '30px', fontSize: '14px', fontWeight: '800', whiteSpace: 'nowrap', flexShrink: 0 },
  priceRow: { display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '12px' },
  price: { fontSize: '28px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-1px' },
  perMonth: { fontSize: '14px', fontWeight: '400', color: 'var(--text-muted)' },
  deposit: { fontSize: '13px', color: 'var(--text-muted)' },
  tagsRow: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' },
  tag: { fontSize: '12px', color: 'var(--text-muted)', background: 'var(--bg-subtle)', padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--border)' },
  divider: { height: '1px', background: 'var(--border)', margin: '20px 0' },
  sectionTitle: { fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)', margin: '0 0 12px' },
  description: { fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.7', margin: 0 },
  detailGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' },
  detailItem: { background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 14px' },
  detailKey: { fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' },
  detailVal: { fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' },
  matchSection: { borderRadius: '14px', padding: '18px' },
  matchTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' },
  matchScore: { fontSize: '40px', fontWeight: '900', letterSpacing: '-2px', lineHeight: 1 },
  matchLabel: { fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' },
  matchBarVertical: { display: 'flex', alignItems: 'center' },
  matchBarTrack: { width: '8px', height: '80px', background: 'rgba(0,0,0,0.08)', borderRadius: '4px', display: 'flex', alignItems: 'flex-end', overflow: 'hidden' },
  matchBarFill: { width: '100%', borderRadius: '4px', transition: 'height 0.6s' },
  matchGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' },
  matchItem: { borderRadius: '10px', padding: '12px', border: '1px solid', display: 'flex', flexDirection: 'column', gap: '6px' },
  matchItemTop: { display: 'flex', alignItems: 'center', gap: '8px' },
  matchItemLabel: { flex: 1, fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' },
  matchItemCheck: { fontSize: '14px', fontWeight: '700' },
  matchItemDesc: { fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.4' },
  matchItemScore: { fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)' },
  fraudSafe: { display: 'flex', gap: '12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '16px', alignItems: 'flex-start' },
  fraudWarn: { display: 'flex', gap: '12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', padding: '16px', alignItems: 'flex-start' },
  fraudIcon: { fontSize: '20px', fontWeight: '800', flexShrink: 0 },
  fraudTitle: { fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' },
  fraudText: { fontSize: '13px', color: 'var(--text-muted)' },
  right: { width: '280px', flexShrink: 0, marginLeft: '24px', display: 'flex', flexDirection: 'column', gap: '16px' },
  ownerCard: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px' },
  ownerTitle: { fontSize: '13px', fontWeight: '700', color: 'var(--text-muted)', margin: '0 0 14px', textTransform: 'uppercase', letterSpacing: '0.05em' },
  ownerInfo: { display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px' },
  ownerAvatar: { width: '44px', height: '44px', borderRadius: '50%', background: '#111', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: '700', flexShrink: 0 },
  ownerName: { fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)' },
  ownerRole: { fontSize: '12px', color: 'var(--text-muted)' },
  ownerPhone: { fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', padding: '10px 0', borderTop: '1px solid var(--border)', marginBottom: '12px' },
  messageBtn: { width: '100%', padding: '11px', background: '#111', color: 'white', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', marginBottom: '8px' },
  callBtn: { width: '100%', padding: '11px', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1.5px solid var(--border)', borderRadius: '10px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', marginBottom: '8px' },
  bookVisitBtn: { width: '100%', padding: '11px', background: '#f0fdf4', color: '#166534', border: '1.5px solid #bbf7d0', borderRadius: '10px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' },
  lockBox: { borderTop: '1px solid var(--border)', paddingTop: '16px' },
  lockBoxTop: { display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '12px' },
  lockTitle: { fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' },
  lockSub: { fontSize: '12px', color: 'var(--text-muted)' },
  blurPhone: { fontSize: '14px', color: 'var(--text-muted)', padding: '8px 12px', background: 'var(--bg-subtle)', borderRadius: '8px', marginBottom: '12px', filter: 'blur(3px)', userSelect: 'none' },
  unlockBtn: { width: '100%', padding: '12px', background: '#111', color: 'white', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', marginBottom: '6px' },
  unlockNote: { fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', margin: 0 },
  infoCard: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' },
  infoRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  infoKey: { fontSize: '13px', color: 'var(--text-muted)' },
  infoVal: { fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' },
  photoCount: { position: 'absolute', bottom: '10px', right: '12px', background: 'rgba(0,0,0,0.55)', color: 'white', fontSize: '11px', fontWeight: '600', padding: '3px 9px', borderRadius: '20px', backdropFilter: 'blur(4px)' },
  lightboxOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  lightboxInner: { position: 'relative', maxWidth: '90vw', maxHeight: '90vh', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  lightboxImg: { maxWidth: '88vw', maxHeight: '85vh', objectFit: 'contain', borderRadius: '8px', display: 'block' },
  lightboxClose: { position: 'fixed', top: '18px', right: '22px', background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', fontSize: '20px', fontWeight: '700', width: '38px', height: '38px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' },
  lightboxArrow: { position: 'fixed', top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', fontSize: '36px', fontWeight: '300', width: '48px', height: '64px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)', lineHeight: 1 },
  lightboxDots: { position: 'fixed', bottom: '28px', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '8px' },
  lightboxDot: { width: '8px', height: '8px', borderRadius: '50%', background: 'rgba(255,255,255,0.35)', cursor: 'pointer', transition: 'background 0.2s' },
  lightboxDotActive: { background: 'white', transform: 'scale(1.2)' },
  lightboxCounter: { position: 'fixed', bottom: '28px', right: '24px', color: 'rgba(255,255,255,0.6)', fontSize: '12px', fontWeight: '600' },
  fullDetailsBtn: { background: 'none', border: '1.5px solid var(--border)', borderRadius: '10px', padding: '12px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', color: 'var(--text-secondary)', textAlign: 'center' },
  reviewPanel: { background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)', padding: '16px 32px' },
  reviewPanelInner: { maxWidth: '1200px', margin: '0 auto', display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' },
  reviewFormCard: { flex: '1', minWidth: '320px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px' },
  reviewFormTitle: { fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '14px' },
  reviewLabel: { fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' },
  reviewTextarea: { width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1.5px solid var(--border)', fontSize: '13px', outline: 'none', boxSizing: 'border-box', resize: 'vertical', color: 'var(--text-primary)', background: 'var(--bg-page)', fontFamily: 'inherit' },
  reviewSubmitBtn: { background: '#111', color: 'white', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' },
  reviewListWrap: { flex: '1', minWidth: '280px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px', maxHeight: '260px', overflowY: 'auto' },
  reviewListHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', paddingBottom: '10px', borderBottom: '1px solid var(--border)' },
  reviewItem: { background: 'var(--bg-subtle)', borderRadius: '10px', padding: '12px', border: '1px solid var(--border)' },
  reviewAvatar: { width: '30px', height: '30px', borderRadius: '50%', background: '#111', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '700', flexShrink: 0 },
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)' },
  modalBox: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '18px', padding: '32px 28px', textAlign: 'center', minWidth: '280px', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' },
  modalCancelBtn: { padding: '10px 22px', background: 'var(--bg-subtle)', border: '1.5px solid var(--border)', borderRadius: '10px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', color: 'var(--text-secondary)' },
  modalDeleteBtn: { padding: '10px 22px', background: '#ef4444', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', color: 'white' },
}