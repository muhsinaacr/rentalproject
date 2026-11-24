import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../utils/api'

// ── normalizeBookmark ─────────────────────────────────────────────────────────
// Handles BOTH response shapes:
//   • New backend (routes/bookmarks.js updated) → already formatted with .price .type etc.
//   • Old backend (routes/bookmarks.js original) → raw DB row with .rent .room_type etc.
// This makes the page work immediately, regardless of whether the backend is updated yet.
function normalizeBookmark(b) {
  let tags = b.tags
  if (!Array.isArray(tags)) {
    try { tags = (b.amenities || '').split(',').map(a => a.trim()).filter(Boolean) }
    catch { tags = [] }
  }

  let photos = b.photos
  if (typeof photos === 'string') {
    try { photos = JSON.parse(photos) } catch { photos = [] }
  }
  if (!Array.isArray(photos)) photos = []

  return {
    id:            b.id,
    title:         b.title        || '',
    location:      b.location     || '',
    locationLabel: b.locationLabel || b.location || '',
    price:         b.price        != null ? Number(b.price) : Number(b.rent) || 0,
    deposit:       b.deposit      != null ? Number(b.deposit) : 0,
    maintenance:   b.maintenance  != null ? Number(b.maintenance) : 0,
    type:          b.type         || b.room_type   || '',
    furnished:     b.furnished    || b.furnishing  || '',
    tags,
    verified:      b.verified !== undefined
                     ? b.verified
                     : (b.status === 'verified' || b.status === 'active'),
    owner_id:      b.owner_id,
    owner:         b.owner        || b.owner_name  || '',
    description:   b.description  || '',
    photos,
    note:          b.note         || '',
    // Room details — used by the compare table
    availableFrom: b.availableFrom || b.available_from || null,
    floor:         b.floor        != null ? b.floor        : null,
    totalFloors:   b.totalFloors  != null ? b.totalFloors  : (b.total_floors != null ? b.total_floors : null),
    facing:        b.facing       || b.direction   || '',
    bathrooms:     b.bathrooms    || b.bathroom    || '',
    kitchen:       b.kitchen      || '',
    latitude:      b.latitude     || null,
    longitude:     b.longitude    || null,
    isBoosted:     b.isBoosted    || false,
  }
}

export default function Bookmarks() {
  const navigate = useNavigate()
  const [bookmarks, setBookmarks] = useState([])
  const [loadingBM, setLoadingBM] = useState(true)
  const [compareMode, setCompareMode] = useState(false)
  const [selected, setSelected]   = useState([])
  const [editNote, setEditNote]   = useState(null)
  const [noteText, setNoteText]   = useState('')

  useEffect(() => {
    api.getBookmarks()
      .then(data => setBookmarks((Array.isArray(data) ? data : []).map(normalizeBookmark)))
      .catch(() => setBookmarks([]))
      .finally(() => setLoadingBM(false))
  }, [])

  async function removeBookmark(id) {
    try {
      await api.removeBookmark(id)
      setBookmarks(prev => prev.filter(b => b.id !== id))
      setSelected(prev => prev.filter(s => s !== id))
    } catch (err) { console.error('Remove bookmark failed:', err.message) }
  }

  function toggleCompare(id) {
    if (selected.includes(id)) setSelected(selected.filter(s => s !== id))
    else if (selected.length < 3) setSelected([...selected, id])
  }

  async function saveNote(id) {
    try {
      if (api.updateBookmarkNote) await api.updateBookmarkNote(id, noteText)
    } catch (err) { console.error('Note save failed:', err.message) }
    setBookmarks(prev => prev.map(b => b.id === id ? { ...b, note: noteText } : b))
    setEditNote(null)
  }

  if (loadingBM) {
    return (
      <div style={{ ...s.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px', opacity: 0.3 }}>🔖</div>
          <div style={{ fontSize: '14px' }}>Loading bookmarks...</div>
        </div>
      </div>
    )
  }

  const compareItems = bookmarks.filter(b => selected.includes(b.id))

  return (
    <div style={s.page}>
      <div style={s.topbar}>
        <div>
          <h2 style={s.title}>My Bookmarks</h2>
          <p style={s.sub}>{bookmarks.length} saved listings</p>
        </div>
        <div style={s.topbarActions}>
          <button style={{ ...s.btn, ...(compareMode ? s.btnActive : {}) }} onClick={() => { setCompareMode(!compareMode); setSelected([]) }}>
            {compareMode ? '✕ Exit Compare' : '⇄ Compare Listings'}
          </button>
          <button style={s.btnPrimary} onClick={() => navigate('/browse')}>+ Add More</button>
        </div>
      </div>

      <div style={s.content}>
        {compareMode && (
          <div style={s.compareBar}>
            <span style={s.compareHint}>Select up to 3 listings to compare side by side</span>
            {selected.length >= 2 && (
              <button style={s.compareBtn} onClick={() => setCompareMode(false)}>Compare {selected.length} listings →</button>
            )}
          </div>
        )}

        {compareMode && selected.length >= 2 && (
          <div style={s.compareTable}>
            <h3 style={s.sectionTitle}>Comparison</h3>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${compareItems.length}, 1fr)`, gap: '16px' }}>
              {compareItems.map(b => (
                <div key={b.id} style={s.compareCard}>
                  {/* Header */}
                  <div style={s.comparePrice}>₹{(b.price || 0).toLocaleString()}<span style={s.perMonth}>/mo</span></div>
                  <div style={s.compareTitle}>{b.title}</div>
                  <div style={s.compareLoc}>📍 {b.locationLabel || b.location}</div>

                  {/* Core details */}
                  <div style={s.compareSectionLabel}>Details</div>
                  <div style={s.compareRow}><span style={s.compareKey}>Type</span><span style={s.compareVal}>{b.type || '—'}</span></div>
                  <div style={s.compareRow}><span style={s.compareKey}>Furnished</span><span style={s.compareVal}>{b.furnished || '—'}</span></div>
                  <div style={s.compareRow}><span style={s.compareKey}>Verified</span><span style={{ ...s.compareVal, color: b.verified ? '#10b981' : '#f59e0b' }}>{b.verified ? '✓ Yes' : '⚠ Review'}</span></div>

                  {/* Pricing */}
                  <div style={s.compareSectionLabel}>Pricing</div>
                  <div style={s.compareRow}><span style={s.compareKey}>Monthly Rent</span><span style={s.compareVal}>₹{(b.price || 0).toLocaleString()}</span></div>
                  <div style={s.compareRow}><span style={s.compareKey}>Security Deposit</span><span style={s.compareVal}>{b.deposit > 0 ? `₹${Number(b.deposit).toLocaleString()}` : '—'}</span></div>
                  <div style={s.compareRow}><span style={s.compareKey}>Maintenance</span><span style={s.compareVal}>{b.maintenance > 0 ? `₹${Number(b.maintenance).toLocaleString()}/mo` : '—'}</span></div>

                  {/* Room details */}
                  <div style={s.compareSectionLabel}>Room Info</div>
                  <div style={s.compareRow}><span style={s.compareKey}>Available From</span><span style={s.compareVal}>{b.availableFrom || '—'}</span></div>
                  <div style={s.compareRow}><span style={s.compareKey}>Floor</span><span style={s.compareVal}>{b.floor ? `${b.floor}${b.totalFloors ? ' of ' + b.totalFloors : ''}` : '—'}</span></div>
                  <div style={s.compareRow}><span style={s.compareKey}>Facing</span><span style={s.compareVal}>{b.facing || '—'}</span></div>
                  <div style={s.compareRow}><span style={s.compareKey}>Bathroom</span><span style={s.compareVal}>{b.bathrooms || '—'}</span></div>
                  <div style={s.compareRow}><span style={s.compareKey}>Kitchen</span><span style={s.compareVal}>{b.kitchen || '—'}</span></div>

                  {/* Amenities */}
                  {(b.tags || []).length > 0 && (
                    <>
                      <div style={s.compareSectionLabel}>Amenities</div>
                      <div style={s.compareTags}>
                        {[b.type, b.furnished, ...(b.tags || [])].filter(Boolean).map(t => (
                          <span key={t} style={s.compareTag}>{t}</span>
                        ))}
                      </div>
                    </>
                  )}

                  {/* Description */}
                  {b.description && (
                    <>
                      <div style={s.compareSectionLabel}>About</div>
                      <p style={s.compareDesc}>{b.description}</p>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {bookmarks.length === 0 ? (
          <div style={s.empty}>
            <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.15 }}>🔖</div>
            <div style={s.emptyTitle}>No bookmarks yet</div>
            <div style={s.emptySub}>Browse listings and save your favourites here</div>
            <button style={s.btnPrimary} onClick={() => navigate('/browse')}>Browse Listings →</button>
          </div>
        ) : (
          <div style={s.grid}>
            {bookmarks.map(b => {
              const imgUrl = b.photos.length > 0 ? (b.photos[0].url || b.photos[0]) : null
              return (
                <div key={b.id} style={{ ...s.card, ...(selected.includes(b.id) ? s.cardSelected : {}) }}>
                  {compareMode && (
                    <div style={s.checkboxWrap} onClick={() => toggleCompare(b.id)}>
                      <div style={{ ...s.checkbox, ...(selected.includes(b.id) ? s.checkboxOn : {}) }}>
                        {selected.includes(b.id) && '✓'}
                      </div>
                    </div>
                  )}
                  <div style={{ ...s.cardImg, background: imgUrl ? 'transparent' : 'var(--bg-subtle)', overflow: 'hidden' }}>
                    {imgUrl
                      ? <img src={imgUrl} alt={b.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ fontSize: '32px', opacity: 0.15 }}>🏠</span>
                    }
                    <div style={s.badges}>
                      <span style={b.verified ? s.badgeGreen : s.badgeYellow}>{b.verified ? 'AI Verified' : 'Review'}</span>
                    </div>
                  </div>
                  <div style={s.cardBody}>
                    <div style={s.cardTop}>
                      <span style={s.price}>₹{(b.price || 0).toLocaleString()}<span style={s.perMonth}>/mo</span></span>
                      <button style={s.removeBtn} onClick={() => removeBookmark(b.id)}>✕</button>
                    </div>
                    <div style={s.cardTitle}>{b.title}</div>
                    <div style={s.cardLoc}>📍 {b.locationLabel || b.location}</div>
                    <div style={s.tags}>
                      {b.type      && <span style={s.tag}>{b.type}</span>}
                      {b.furnished && <span style={s.tag}>{b.furnished}</span>}
                      {b.tags.slice(0, 2).map(t => <span key={t} style={s.tag}>{t}</span>)}
                    </div>

                    {editNote === b.id ? (
                      <div style={s.noteEdit}>
                        <input style={s.noteInput} value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Add a note..." autoFocus />
                        <div style={s.noteActions}>
                          <button style={s.noteSave} onClick={() => saveNote(b.id)}>Save</button>
                          <button style={s.noteCancel} onClick={() => setEditNote(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div style={s.noteRow} onClick={() => { setEditNote(b.id); setNoteText(b.note || '') }}>
                        <span style={s.noteText}>{b.note || '+ Add a note...'}</span>
                      </div>
                    )}

                    <div style={s.cardActions}>
                      <button style={s.viewBtn} onClick={() => navigate(`/listing/${b.id}`)}>View Details</button>
                      <button style={s.chatBtn} onClick={() => navigate('/seeker-chat', {
                        state: { openListingId: b.id, openOwnerId: b.owner_id, ownerName: b.owner, listingTitle: b.title }
                      })}>Message Owner</button>
                    </div>
                  </div>
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
  page: { minHeight: '100vh', background: 'var(--bg-page)', fontFamily: "'Segoe UI', sans-serif" },
  topbar: { background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '20px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.5px' },
  sub: { fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' },
  topbarActions: { display: 'flex', gap: '10px' },
  btn: { padding: '9px 18px', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1.5px solid var(--border)', borderRadius: '10px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' },
  btnActive: { background: '#111', color: 'white', borderColor: '#111' },
  btnPrimary: { padding: '9px 18px', background: '#111', color: 'white', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' },
  content: { padding: '28px 32px' },
  compareBar: { background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 18px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  compareHint: { fontSize: '13px', color: 'var(--text-secondary)' },
  compareBtn: { background: '#111', color: 'white', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' },
  compareTable: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px', marginBottom: '24px' },
  sectionTitle: { fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '14px' },
  compareCard: { background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px' },
  comparePrice: { fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '4px' },
  perMonth: { fontSize: '12px', fontWeight: '400', color: 'var(--text-muted)' },
  compareTitle: { fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' },
  compareLoc: { fontSize: '11px', color: 'var(--text-muted)', marginBottom: '12px' },
  compareRow: { display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' },
  compareKey: { fontSize: '12px', color: 'var(--text-muted)' },
  compareVal: { fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'right', maxWidth: '55%' },
  compareSectionLabel: { fontSize: '10px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '14px', marginBottom: '4px', paddingBottom: '4px', borderBottom: '2px solid var(--border)' },
  compareTags: { display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' },
  compareTag: { fontSize: '10px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '4px', padding: '2px 6px', color: 'var(--text-secondary)' },
  compareDesc: { fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.6', margin: '6px 0 0 0' },
  empty: { textAlign: 'center', padding: '80px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' },
  emptyTitle: { fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' },
  emptySub: { fontSize: '14px', color: 'var(--text-muted)', marginBottom: '16px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' },
  card: { background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: '14px', overflow: 'hidden', position: 'relative', transition: 'all 0.15s' },
  cardSelected: { borderColor: '#111', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' },
  checkboxWrap: { position: 'absolute', top: '10px', left: '10px', zIndex: 2, cursor: 'pointer' },
  checkbox: { width: '22px', height: '22px', borderRadius: '6px', border: '2px solid var(--border)', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)' },
  checkboxOn: { background: '#111', borderColor: '#111', color: 'white' },
  cardImg: { height: '120px', background: 'var(--bg-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  badges: { position: 'absolute', top: '8px', left: '8px' },
  badgeGreen: { background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', fontSize: '10px', fontWeight: '700', padding: '2px 7px', borderRadius: '4px' },
  badgeYellow: { background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', fontSize: '10px', fontWeight: '700', padding: '2px 7px', borderRadius: '4px' },
  cardBody: { padding: '14px' },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' },
  price: { fontSize: '16px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.5px' },
  removeBtn: { background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '14px', cursor: 'pointer', padding: '2px 6px' },
  cardTitle: { fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '3px' },
  cardLoc: { fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' },
  tags: { display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '10px' },
  tag: { fontSize: '11px', color: 'var(--text-muted)', background: 'var(--bg-subtle)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border)' },
  noteRow: { background: 'var(--bg-subtle)', border: '1px dashed var(--border)', borderRadius: '6px', padding: '7px 10px', marginBottom: '10px', cursor: 'pointer' },
  noteText: { fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' },
  noteEdit: { marginBottom: '10px' },
  noteInput: { width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1.5px solid var(--input-border)', fontSize: '12px', outline: 'none', boxSizing: 'border-box', marginBottom: '6px', background: 'var(--input-bg)', color: 'var(--input-text)' },
  noteActions: { display: 'flex', gap: '6px' },
  noteSave: { padding: '5px 12px', background: '#111', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: '700', cursor: 'pointer' },
  noteCancel: { padding: '5px 12px', background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' },
  cardActions: { display: 'flex', gap: '8px' },
  viewBtn: { flex: 1, padding: '8px', background: '#111', color: 'white', border: 'none', borderRadius: '8px', fontSize: '11px', fontWeight: '700', cursor: 'pointer' },
  chatBtn: { flex: 1, padding: '8px', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' },
}