/**
 * BrowseListings.jsx — RentMate AI (Seeker Module)
 *
 * Location search now uses the shared <LocationAutocomplete /> component,
 * identical to the one in AiMatcher.
 *
 * Key changes vs old version:
 *  • Top search bar: plain text → LocationAutocomplete (topbar variant)
 *  • Filter panel "📍 Location" field: plain input → LocationAutocomplete (filter variant)
 *  • Location state now stores { text, lat, lng } — never plain text only
 *  • Backend filtering uses lat/lng + radius when coords are known
 *  • calculateMatchScore uses geo distance (haversine) instead of string match
 */

import { useState, useMemo, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBookmarks } from '../hooks/useBookmarks'
import BookVisitModal from '../components/BookVisitModal'
import PaymentModal from '../components/PaymentModal'
import LocationAutocomplete from '../components/LocationAutocomplete'
import { api } from '../utils/api'
import ReportModal from '../pages/ReportModal'

const COMMON_AMENITIES = ['WiFi', 'AC', 'Parking', 'Gym', 'Near Metro', 'Near IT Park', 'Balcony', 'Laundry']
const DEFAULT_RADIUS_KM = 15

// ── Haversine (frontend fallback for match scoring) ───────────────────────────
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function formatDistance(km) {
  if (km < 1)  return `${Math.round(km * 1000)} m away`
  if (km < 10) return `${km.toFixed(1)} km away`
  return `${Math.round(km)} km away`
}

// ── AI match scoring ──────────────────────────────────────────────────────────
function calculateMatchScore(prefs, listing) {
  let score = 0

  // Location (25 pts) — geo-aware
  if (prefs.locationCoords && listing.latitude && listing.longitude) {
    const km = haversineKm(
      prefs.locationCoords.lat, prefs.locationCoords.lng,
      listing.latitude, listing.longitude
    )
    if      (km <= 5)  score += 25
    else if (km <= 10) score += 20
    else if (km <= 20) score += 12
    else if (km <= 40) score += 5
  } else if (!prefs.locationText) {
    score += 10
  } else {
    const ll = (listing.location || '').toLowerCase()
    const pl = prefs.locationText.toLowerCase()
    if (ll.includes(pl)) score += 25
  }

  // Budget (25 pts)
  const min = Number(prefs.budgetMin) || 0
  const max = Number(prefs.budgetMax) || 999999
  if (listing.price >= min && listing.price <= max) score += 25
  else if (listing.price <= max) score += 10

  // Room type (15 pts)
  if (prefs.type && prefs.type === listing.type) score += 15
  else if (!prefs.type) score += 8

  // Furnishing (10 pts)
  if (prefs.furnished && prefs.furnished === listing.furnished) score += 10
  else if (!prefs.furnished) score += 5

  // Amenities (20 pts)
  const listingTags       = listing.tags || []
  const selectedAmenities = prefs.amenities || []
  if (selectedAmenities.length > 0) {
    const matches = selectedAmenities.filter(a =>
      listingTags.some(t => t.toLowerCase().includes(a.toLowerCase()))
    ).length
    score += Math.round((matches / selectedAmenities.length) * 20)
  } else {
    score += 10
  }

  // Verified bonus (5 pts)
  if (listing.verified) score += 5

  return Math.min(score, 100)
}

function getMatchInfo(score) {
  if (score >= 90) return { label: 'Best Match',  color: '#166534', bg: '#f0fdf4', border: '#bbf7d0' }
  if (score >= 75) return { label: 'Great Match', color: '#1e40af', bg: '#eff6ff', border: '#bfdbfe' }
  if (score >= 60) return { label: 'Good Match',  color: '#92400e', bg: '#fffbeb', border: '#fde68a' }
  return                  { label: 'Low Match',   color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb' }
}

// ─────────────────────────────────────────────────────────────────────────────
export default function BrowseListings() {
  const navigate = useNavigate()

  const [listings, setListings]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [fetchError, setFetchError] = useState(null)

  // Topbar location state
  const [searchText, setSearchText]         = useState('')
  const [searchCoords, setSearchCoords]     = useState(null)

  // Prefs panel location + other filters
  const [prefs, setPrefs] = useState({
    locationText: '', locationCoords: null, locationLabel: '',
    budgetMin: 0, budgetMax: 50000,
    type: '', furnished: '', amenities: [],
  })

  const [typeFilter, setTypeFilter]   = useState('All')
  const [selectedId, setSelectedId]   = useState(null)
  const [showPrefs, setShowPrefs]     = useState(true)
  const [customAmenityInput, setCustomAmenityInput] = useState('')
  const [showCustomInput, setShowCustomInput]       = useState(false)
  const [radiusKm, setRadiusKm]       = useState(DEFAULT_RADIUS_KM)
  // ── API-driven bookmark state (replaces localStorage) ─────────────────────
  const { bookmarkedIds, toggleBookmark: apiToggleBookmark } = useBookmarks()
  // savedIds kept as array so all existing `.includes(l.id)` checks in JSX work unchanged
  const savedIds = [...bookmarkedIds]
  const [toast, setToast]             = useState(null)
  const [bookingListing, setBookingListing] = useState(null)
  // Track which listing IDs this seeker has unlocked contact for
  const [unlockedIds, setUnlockedIds]       = useState(new Set())
  const [showPaymentFor, setShowPaymentFor] = useState(null) // listing object
  const [activeGeoFilter, setActiveGeoFilter] = useState(null)
  const [reportTarget, setReportTarget] = useState(null) // { targetId, targetName }

  // ── Fetch listings ─────────────────────────────────────────────────────────
  const fetchListings = useCallback(async (geoFilter = null) => {
    setLoading(true)
    setFetchError(null)
    try {
      const filters = {}
      if (geoFilter) {
        filters.lat    = geoFilter.lat
        filters.lng    = geoFilter.lng
        filters.radius = geoFilter.radius || DEFAULT_RADIUS_KM
      }
      const data = await api.getListings(filters)
      setListings(Array.isArray(data) ? data : [])
    } catch (err) {
      setFetchError(err.message || 'Failed to load listings')
      setListings([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchListings(null) }, [fetchListings])

  // ── Load already-unlocked listing IDs from backend on mount ───────────────
  useEffect(() => {
    api.getUnlockedListingIds()
      .then(data => {
        if (data?.ids?.length) setUnlockedIds(new Set(data.ids))
      })
      .catch(() => {}) // silently ignore — worst case buttons stay locked
  }, [])

  // ── Shared: apply a geo filter ─────────────────────────────────────────────
  function applyGeo(place, radius) {
    const r = radius || radiusKm
    const geo = { lat: place.lat, lng: place.lng, label: place.short, radius: r }
    setActiveGeoFilter(geo)
    setSearchText(place.short)
    setSearchCoords({ lat: place.lat, lng: place.lng })
    setPrefs(p => ({ ...p, locationText: place.short, locationCoords: { lat: place.lat, lng: place.lng }, locationLabel: place.short }))
    fetchListings(geo)
  }

  function clearGeo() {
    setActiveGeoFilter(null)
    setSearchText('')
    setSearchCoords(null)
    setPrefs(p => ({ ...p, locationText: '', locationCoords: null, locationLabel: '' }))
    fetchListings(null)
  }

  // ── Topbar handlers ────────────────────────────────────────────────────────
  function handleTopbarChange(text, coords) {
    setSearchText(text)
    setSearchCoords(coords)
    if (!text) clearGeo()
  }
  function handleTopbarSelect(place) { applyGeo(place, radiusKm) }
  function handleTopbarClear()       { clearGeo() }
  function handleTopbarSearch()      { if (searchCoords) applyGeo({ short: searchText, ...searchCoords }, radiusKm) }

  // ── Filter panel handlers ──────────────────────────────────────────────────
  function handleFilterLocationChange(text, coords) {
    setPrefs(p => ({ ...p, locationText: text, locationCoords: coords, locationLabel: coords ? text : '' }))
    if (!text) clearGeo()
  }
  function handleFilterSelect(place) { applyGeo(place, radiusKm) }
  function handleFilterLocationClear() { clearGeo() }

  // ── Other helpers ──────────────────────────────────────────────────────────
  function toggleAmenity(a) {
    setPrefs(p => ({
      ...p,
      amenities: p.amenities.includes(a) ? p.amenities.filter(x => x !== a) : [...p.amenities, a],
    }))
  }
  function addCustomAmenity() {
    const val = customAmenityInput.trim()
    if (!val) return
    if (!prefs.amenities.includes(val)) setPrefs(p => ({ ...p, amenities: [...p.amenities, val] }))
    setCustomAmenityInput('')
    setShowCustomInput(false)
  }
  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 2500) }
  async function handleSave(e, listing) {
    e.stopPropagation()
    try {
      const nowSaved = await apiToggleBookmark(listing)
      showToast(nowSaved ? '🔖 Saved to Bookmarks' : '✕ Removed from Bookmarks')
    } catch {
      showToast('⚠️ Please log in to save listings')
    }
  }

  // ── Local scoring ──────────────────────────────────────────────────────────
  const scoredListings = useMemo(() => {
    return listings
      .map(l => ({ ...l, matchScore: calculateMatchScore(prefs, l) }))
      .filter(l => {
        const matchType   = typeFilter === 'All' || l.type === typeFilter
        const matchBudget = l.price >= prefs.budgetMin && l.price <= prefs.budgetMax
        return matchType && matchBudget
      })
      .sort((a, b) => {
        if (a.isBoosted !== b.isBoosted) return a.isBoosted ? -1 : 1
        return b.matchScore - a.matchScore
      })
  }, [listings, prefs, typeFilter])

  useEffect(() => {
    if (scoredListings.length > 0)
      setSelectedId(prev => scoredListings.find(l => l.id === prev) ? prev : scoredListings[0].id)
  }, [scoredListings])

  const selected    = scoredListings.find(l => l.id === selectedId) || scoredListings[0]
  const typeFilters = ['All', 'Single', 'Shared', 'Studio', 'Apartment']

  function getCardStyle(id, isBoosted) {
    const sel = id === selectedId
    if (isBoosted) return {
      borderRadius: '14px', overflow: 'hidden', cursor: 'pointer', marginBottom: '10px',
      background: 'var(--bg-card)',
      border: sel ? '2px solid #f59e0b' : '2px solid #fbbf24',
      boxShadow: sel ? '0 0 0 3px rgba(245,158,11,0.18),0 4px 18px rgba(245,158,11,0.15)' : '0 0 0 2px rgba(245,158,11,0.12)',
      transition: 'border 0.15s,box-shadow 0.15s',
    }
    return {
      borderRadius: '14px', overflow: 'hidden', cursor: 'pointer', marginBottom: '10px',
      background: 'var(--bg-card)',
      border: sel ? '1.5px solid #111' : '1.5px solid var(--border)',
      boxShadow: sel ? '0 4px 16px rgba(0,0,0,0.08)' : 'none',
      transition: 'border 0.15s,box-shadow 0.15s',
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={s.page}>
      {toast && <div style={s.toast}>{toast}</div>}

      {/* Topbar */}
      <div style={s.topbar}>
        <LocationAutocomplete
          value={searchText}
          onChange={handleTopbarChange}
          onSelect={handleTopbarSelect}
          onClear={handleTopbarClear}
          onSearch={handleTopbarSearch}
          placeholder="Search by city, area, or locality..."
          showSearchBtn={true}
          variant="topbar"
        />
        <button style={s.prefsToggle} onClick={() => setShowPrefs(!showPrefs)}>
          {showPrefs ? '✕ Hide Filters' : '⚙ Set Preferences'}
        </button>
      </div>

      {/* Active geo filter banner */}
      {activeGeoFilter && (
        <div style={s.geoBanner}>
          <span style={{ fontSize: '14px' }}>📍</span>
          <span style={s.geoLabel}>
            Listings within <strong>{activeGeoFilter.radius} km</strong> of{' '}
            <strong>{activeGeoFilter.label}</strong>{' '}
            <span style={{ color: 'var(--text-muted,#888)', fontWeight: 400 }}>· {scoredListings.length} found</span>
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={s.geoRadiusLabel}>Radius:</label>
            <select style={s.radiusSelect} value={radiusKm}
              onChange={e => {
                const r = Number(e.target.value)
                setRadiusKm(r)
                if (activeGeoFilter) {
                  const geo = { ...activeGeoFilter, radius: r }
                  setActiveGeoFilter(geo)
                  fetchListings(geo)
                }
              }}>
              {[5, 10, 15, 20, 30, 50].map(r => <option key={r} value={r}>{r} km</option>)}
            </select>
            <button style={s.clearGeoBtn} onClick={clearGeo}>✕ Clear</button>
          </div>
        </div>
      )}

      {/* Preferences Panel */}
      {showPrefs && (
        <div style={s.prefsPanel}>
          <div style={s.prefsSectionTitle}>
            🤖 AI Smart Matching — Set your preferences for personalized results
          </div>
          <div style={s.filtersRow}>

            {/* Location — now uses LocationAutocomplete (filter variant) */}
            <div style={{ ...s.prefField, flex: 1.5, minWidth: '180px' }}>
              <label style={s.prefLabel}>📍 Location</label>
              <LocationAutocomplete
                value={prefs.locationText}
                onChange={handleFilterLocationChange}
                onSelect={handleFilterSelect}
                onClear={handleFilterLocationClear}
                placeholder="e.g. Ernakulam, Aluva..."
                variant="filter"
              />
            </div>

            <div style={s.prefField}>
              <label style={s.prefLabel}>🏠 Room Type</label>
              <select style={s.prefInput} value={prefs.type}
                onChange={e => setPrefs({ ...prefs, type: e.target.value })}>
                <option value="">Any</option>
                {['Single', 'Shared', 'Studio', 'Apartment'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>

            <div style={s.prefField}>
              <label style={s.prefLabel}>🛋️ Furnishing</label>
              <select style={s.prefInput} value={prefs.furnished}
                onChange={e => setPrefs({ ...prefs, furnished: e.target.value })}>
                <option value="">Any</option>
                {['Fully Furnished', 'Semi Furnished', 'Unfurnished'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>

            <div style={s.budgetField}>
              <div style={s.budgetLabelRow}>
                <label style={s.prefLabel}>💰 Budget Range</label>
                <span style={s.sliderValue}>₹{prefs.budgetMin.toLocaleString()} – ₹{prefs.budgetMax.toLocaleString()}</span>
              </div>
              <div style={s.compactSliderWrap}>
                <span style={s.sliderEdgeLabel}>₹0</span>
                <div style={s.slidersStack}>
                  <input type="range" min={0} max={50000} step={500} value={prefs.budgetMin} style={s.slider}
                    onChange={e => { const v = Number(e.target.value); if (v < prefs.budgetMax) setPrefs({ ...prefs, budgetMin: v }) }} />
                  <input type="range" min={0} max={50000} step={500} value={prefs.budgetMax} style={s.slider}
                    onChange={e => { const v = Number(e.target.value); if (v > prefs.budgetMin) setPrefs({ ...prefs, budgetMax: v }) }} />
                </div>
                <span style={s.sliderEdgeLabel}>₹50k</span>
              </div>
            </div>
          </div>

          <div style={s.amenitiesRow}>
            <label style={s.prefLabel}>✅ Amenities</label>
            <div style={s.amenityChips}>
              {COMMON_AMENITIES.map(a => (
                <div key={a} style={{ ...s.amenityChip, ...(prefs.amenities.includes(a) ? s.amenityChipOn : {}) }}
                  onClick={() => toggleAmenity(a)}>
                  {prefs.amenities.includes(a) ? '✓ ' : ''}{a}
                </div>
              ))}
              {prefs.amenities.filter(a => !COMMON_AMENITIES.includes(a)).map(a => (
                <div key={a} style={{ ...s.amenityChip, ...s.amenityChipOn }}>
                  ✓ {a}<span style={s.removeCustom} onClick={() => toggleAmenity(a)}>✕</span>
                </div>
              ))}
              {showCustomInput ? (
                <div style={s.customInputWrap}>
                  <input style={s.customInput} placeholder="Type amenity..."
                    value={customAmenityInput} onChange={e => setCustomAmenityInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addCustomAmenity()} autoFocus />
                  <button style={s.customAddBtn} onClick={addCustomAmenity}>Add</button>
                  <button style={s.customCancelBtn} onClick={() => { setShowCustomInput(false); setCustomAmenityInput('') }}>✕</button>
                </div>
              ) : (
                <div style={s.addOtherChip} onClick={() => setShowCustomInput(true)}>+ Add Other</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Type Filter Bar */}
      <div style={s.filterBar}>
        {typeFilters.map(f => (
          <button key={f} style={{ ...s.chip, ...(typeFilter === f ? s.chipOn : {}) }}
            onClick={() => setTypeFilter(f)}>{f}</button>
        ))}
        <span style={s.resultInfo}>
          {scoredListings.length} rooms ·{' '}
          {activeGeoFilter ? `within ${activeGeoFilter.radius} km` : 'Sorted by AI match'}
        </span>
      </div>

      {/* Body */}
      <div style={s.body}>
        {/* Left: Cards */}
        <div style={s.left}>
          <div style={s.cards}>
            {loading && (
              <div style={s.noResults}>
                <div style={{ fontSize: '28px', marginBottom: '12px', opacity: 0.4 }}>⏳</div>
                <div style={s.noResultsText}>Loading listings...</div>
              </div>
            )}
            {!loading && fetchError && (
              <div style={s.noResults}>
                <div style={{ fontSize: '28px', marginBottom: '12px', opacity: 0.4 }}>⚠️</div>
                <div style={s.noResultsText}>Could not load listings</div>
                <div style={s.noResultsSub}>{fetchError}</div>
              </div>
            )}
            {!loading && !fetchError && scoredListings.length === 0 && (
              <div style={s.noResults}>
                <div style={{ fontSize: '40px', marginBottom: '12px', opacity: 0.2 }}>🏠</div>
                <div style={s.noResultsText}>
                  {activeGeoFilter ? 'No listings in this area' : 'No rooms match your filters'}
                </div>
                <div style={s.noResultsSub}>
                  {activeGeoFilter ? 'Try increasing the radius or a different location' : 'Try adjusting your budget or location'}
                </div>
                {activeGeoFilter && (
                  <button style={{ marginTop: '12px', padding: '8px 18px', background: '#111', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
                    onClick={() => {
                      const geo = { ...activeGeoFilter, radius: 50 }
                      setActiveGeoFilter(geo); setRadiusKm(50); fetchListings(geo)
                    }}>
                    Expand to 50 km
                  </button>
                )}
              </div>
            )}

            {!loading && !fetchError && scoredListings.map(l => {
              const mi    = getMatchInfo(l.matchScore)
              const saved = savedIds.includes(l.id)
              const imgUrl = l.photos && l.photos.length > 0 ? l.photos[0].url : null
              let distLabel = l.distance_label || null
              if (!distLabel && activeGeoFilter && l.latitude && l.longitude) {
                distLabel = formatDistance(haversineKm(activeGeoFilter.lat, activeGeoFilter.lng, l.latitude, l.longitude))
              }
              return (
                <div key={l.id} style={getCardStyle(l.id, l.isBoosted)} onClick={() => setSelectedId(l.id)}>
                  <div style={{ ...s.cardImg, background: imgUrl ? 'transparent' : (l.verified ? 'var(--bg-subtle)' : '#fffbeb') }}>
                    {imgUrl ? <img src={imgUrl} alt={l.title} style={s.cardImgPhoto} /> : <span style={s.imgIcon}>🏠</span>}
                    <div style={s.cardBadges}>
                      <span style={l.verified ? s.badgeGreen : s.badgeYellow}>{l.verified ? 'AI Verified' : 'Review'}</span>
                      {l.isBoosted && <span style={s.badgeBoosted}>⭐ Top Pick</span>}
                    </div>
                    <div style={{ ...s.matchBadge, background: mi.bg, color: mi.color, border: `1.5px solid ${mi.border}` }}>{l.matchScore}%</div>
                    <button style={{ ...s.saveCardBtn, color: saved ? '#ef4444' : '#aaa' }} onClick={e => handleSave(e, l)}>{saved ? '❤️' : '🤍'}</button>
                  </div>
                  <div style={s.cardBody}>
                    <div style={s.cardTopRow}>
                      <span style={s.price}>₹{l.price.toLocaleString()}<span style={s.priceUnit}>/mo</span></span>
                      <div style={s.miniBar}><div style={{ ...s.miniBarFill, width: `${l.matchScore}%`, background: mi.color }} /></div>
                    </div>
                    <div style={s.cardTitle}>{l.title}</div>
                    <div style={s.cardLoc}>📍 {l.locationLabel || l.location}</div>
                    {distLabel && <div style={s.distBadge}>🗺 {distLabel}</div>}
                    <div style={s.tags}>
                      <span style={s.tag}>{l.type}</span>
                      {(l.tags || []).slice(0, 2).map(t => <span key={t} style={s.tag}>{t}</span>)}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right: Detail Panel */}
        <div style={s.right}>
          {selected && (() => {
            const mi    = getMatchInfo(selected.matchScore)
            const saved = savedIds.includes(selected.id)
            let detailDistKm = selected.distance_km ?? null
            if (detailDistKm === null && activeGeoFilter && selected.latitude && selected.longitude)
              detailDistKm = haversineKm(activeGeoFilter.lat, activeGeoFilter.lng, selected.latitude, selected.longitude)
            const detailDistLabel = detailDistKm !== null ? formatDistance(detailDistKm) : null

            const matchDetails = [
              { label: 'Budget',    match: selected.price >= prefs.budgetMin && selected.price <= prefs.budgetMax, desc: `₹${selected.price.toLocaleString()} is ${selected.price <= prefs.budgetMax ? 'within' : 'above'} your range` },
              { label: 'Location',  match: activeGeoFilter ? (detailDistKm !== null && detailDistKm <= (activeGeoFilter.radius || DEFAULT_RADIUS_KM)) : (!prefs.locationText || (selected.location || '').toLowerCase().includes(prefs.locationText.toLowerCase())), desc: detailDistLabel ? `${detailDistLabel} · ${selected.locationLabel || selected.location}` : (selected.locationLabel || selected.location) },
              { label: 'Room Type', match: !prefs.type     || prefs.type     === selected.type,      desc: selected.type },
              { label: 'Furnishing',match: !prefs.furnished || prefs.furnished === selected.furnished, desc: selected.furnished },
            ]
            const detailImg = selected.photos && selected.photos.length > 0 ? selected.photos[0].url : null
            return (
              <div style={s.detailPanel}>
                <div style={{ ...s.detailImg, ...(detailImg ? { padding: 0, background: 'transparent' } : {}) }}>
                  {detailImg ? <img src={detailImg} alt={selected.title} style={s.detailImgPhoto} /> : <span style={{ fontSize: '56px', opacity: 0.1 }}>🏠</span>}
                  {selected.verified ? <div style={s.verifiedBadge}>✓ AI Verified</div> : <div style={s.reviewBadge}>⚠ Review Listing</div>}
                  {detailDistLabel && <div style={s.detailDistBadge}>🗺 {detailDistLabel}</div>}
                </div>
                <div style={s.detailBody}>
                  <div style={s.detailActions}>
                    <button style={{ ...s.actionBtn, ...(saved ? s.actionBtnSaved : {}) }} onClick={e => handleSave(e, selected)}>{saved ? '❤️ Saved' : '🤍 Save'}</button>
                    <button style={s.actionBtn} onClick={() => navigate('/negotiation')}>🤝 Negotiation Tips</button>
                    <button style={s.actionBtn} onClick={() => {
                      const url = `${window.location.origin}/listing/${selected.id}`
                      if (navigator.share) {
                        navigator.share({ title: selected.title, text: 'Check out this listing on RentMate!', url })
                      } else {
                        navigator.clipboard.writeText(url).then(() => showToast('🔗 Link copied to clipboard!'))
                      }
                    }}>Share</button>
                    <button
                      style={{ ...s.actionBtn, color: '#cc0000', borderColor: '#ffd0d0' }}
                      onClick={() => setReportTarget({ targetId: selected.id, targetName: selected.title })}
                    >🚩 Report</button>
                  </div>
                  <div style={s.detailPrice}>₹{selected.price.toLocaleString()}<span style={s.priceUnit}>/month</span></div>
                  <div style={s.detailTitle}>{selected.title}</div>
                  <div style={s.detailLoc}>📍 {selected.locationLabel || selected.location}</div>
                  <div style={s.tagsRow}>
                    {[selected.type, selected.furnished, ...(selected.tags || [])].filter(Boolean).map(t => <span key={t} style={s.tag}>{t}</span>)}
                  </div>
                  <p style={s.detailDesc}>{selected.description}</p>
                  <div style={s.detailGrid}>
                    {[
                      ['Available', selected.availableFrom || '—'],
                      ['Floor',     selected.floor ? `${selected.floor}${selected.totalFloors ? ' of ' + selected.totalFloors : ''}` : '—'],
                      ['Facing',    selected.facing    || '—'],
                      ['Bathroom',  selected.bathrooms  || '—'],
                      ['Kitchen',   selected.kitchen    || '—'],
                      ['Deposit',   selected.deposit ? `₹${Number(selected.deposit).toLocaleString()}` : '—'],
                    ].map(([k, v]) => (
                      <div key={k} style={s.detailItem}>
                        <div style={s.detailKey}>{k}</div>
                        <div style={s.detailVal}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ ...s.matchSection, background: mi.bg, border: `1px solid ${mi.border}` }}>
                    <div style={s.matchHeader}>
                      <span style={{ fontSize: '16px' }}>🤖</span>
                      <span style={{ ...s.matchPct, color: mi.color }}>{selected.matchScore}% {mi.label}</span>
                    </div>
                    <div style={s.matchBarFull}><div style={{ ...s.matchBarFill, width: `${selected.matchScore}%`, background: mi.color }} /></div>
                    <div style={s.matchBreakdown}>
                      {matchDetails.map((d, i) => (
                        <div key={i} style={s.matchRow}>
                          <span style={{ ...s.matchDot, background: d.match ? '#10b981' : '#d1d5db' }} />
                          <div style={s.matchRowInfo}>
                            <span style={s.matchRowLabel}>{d.label}</span>
                            <span style={s.matchRowDesc}>{d.desc}</span>
                          </div>
                          <span style={{ ...s.matchCheck, color: d.match ? '#10b981' : '#d1d5db' }}>{d.match ? '✓' : '○'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={s.ownerRow}>
                    <div style={s.ownerAvatar}>{(selected.owner || '?').charAt(0).toUpperCase()}</div>
                    <div style={{ flex: 1 }}>
                      <div style={s.ownerName}>{selected.owner || 'Owner'}</div>
                      <div style={s.ownerRole}>Room Owner</div>
                    </div>
                  </div>
                  <div style={s.ctaRow}>
                    <button style={s.primaryBtn} onClick={() => navigate(`/listing/${selected.id}`, { state: { matchScore: selected.matchScore } })}>View Full Details →</button>
                    <button
                      style={{ ...s.secondaryBtn, ...(!unlockedIds.has(selected.id) ? s.secondaryBtnLocked : {}) }}
                      onClick={() => {
                        if (!unlockedIds.has(selected.id)) { setShowPaymentFor(selected); return }
                        navigate('/seeker-chat', { state: { openListingId: selected.id, openOwnerId: selected.owner_id, ownerName: selected.owner, listingTitle: selected.title, isUnlocked: true } })
                      }}
                      title={!unlockedIds.has(selected.id) ? 'Unlock contact to message this owner' : 'Message owner'}
                    >
                      {unlockedIds.has(selected.id) ? '💬 Message' : '🔒 Message'}
                    </button>
                    <button
                      style={{ ...s.visitBtn, ...(!unlockedIds.has(selected.id) ? s.visitBtnLocked : {}) }}
                      onClick={() => {
                        if (!unlockedIds.has(selected.id)) { setShowPaymentFor(selected); return }
                        setBookingListing(selected)
                      }}
                      title={!unlockedIds.has(selected.id) ? 'Unlock contact first to book a visit' : 'Book a visit'}
                    >
                      {unlockedIds.has(selected.id) ? '📅 Book Visit' : '🔒 Book Visit'}
                    </button>
                  </div>
                </div>
              </div>
            )
          })()}
          {!selected && !loading && (
            <div style={s.emptyRight}>
              <div style={{ fontSize: '40px', opacity: 0.15, marginBottom: '12px' }}>🏠</div>
              <div style={s.emptyRightText}>Select a listing to view details</div>
            </div>
          )}
        </div>
      </div>

      {bookingListing && <BookVisitModal listing={bookingListing} onClose={() => setBookingListing(null)} />}
      {showPaymentFor && (
        <PaymentModal
          feature="Contact & Chat"
          price={29}
          onClose={() => setShowPaymentFor(null)}
          onSuccess={async (paymentId) => {
            try { await api.recordContactUnlock(showPaymentFor.id, paymentId || 'mock') } catch {}
            setUnlockedIds(prev => new Set([...prev, showPaymentFor.id]))
            setShowPaymentFor(null)
          }}
        />
      )}
      {reportTarget && (
        <ReportModal
          category="listing"
          targetId={reportTarget.targetId}
          targetName={reportTarget.targetName}
          onClose={() => setReportTarget(null)}
        />
      )}
    </div>
  )
}

const s = {
  page:           { height: '100vh', overflow: 'hidden', background: 'var(--bg-page)', fontFamily: "'Segoe UI',sans-serif", display: 'flex', flexDirection: 'column', position: 'relative' },
  toast:          { position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', background: '#111', color: 'white', padding: '12px 24px', borderRadius: '30px', fontSize: '13px', fontWeight: '600', zIndex: 9999, whiteSpace: 'nowrap', boxShadow: '0 4px 20px rgba(0,0,0,0.2)' },
  topbar:         { background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '12px 24px', display: 'flex', gap: '12px', alignItems: 'center', flexShrink: 0 },
  prefsToggle:    { background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', color: 'var(--text-secondary)', whiteSpace: 'nowrap' },
  geoBanner:      { background: '#f0f9ff', borderBottom: '1px solid #bae6fd', padding: '8px 24px', display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 },
  geoLabel:       { flex: 1, fontSize: '13px', color: '#0c4a6e' },
  geoRadiusLabel: { fontSize: '12px', color: '#0369a1' },
  radiusSelect:   { padding: '4px 8px', borderRadius: '6px', border: '1px solid #bae6fd', fontSize: '12px', background: 'white', color: '#0c4a6e', cursor: 'pointer', outline: 'none' },
  clearGeoBtn:    { background: 'none', border: '1px solid #bae6fd', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', cursor: 'pointer', color: '#0369a1', fontWeight: '600' },
  prefsPanel:     { background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '12px 24px 14px', flexShrink: 0 },
  prefsSectionTitle: { fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '12px' },
  filtersRow:     { display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '12px' },
  prefField:      { display: 'flex', flexDirection: 'column', gap: '5px', flex: 1, minWidth: '120px' },
  prefLabel:      { fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' },
  prefInput:      { padding: '8px 10px', borderRadius: '8px', border: '1.5px solid var(--input-border)', fontSize: '13px', outline: 'none', color: 'var(--input-text)', background: 'var(--input-bg)', height: '36px', boxSizing: 'border-box' },
  budgetField:    { display: 'flex', flexDirection: 'column', gap: '5px', flex: 2, minWidth: '200px' },
  budgetLabelRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  sliderValue:    { fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)', background: 'var(--bg-subtle)', padding: '2px 10px', borderRadius: '20px', border: '1px solid var(--border)' },
  compactSliderWrap: { display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--input-bg)', border: '1.5px solid var(--input-border)', borderRadius: '8px', padding: '4px 10px', height: '36px', boxSizing: 'border-box' },
  sliderEdgeLabel:{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 },
  slidersStack:   { flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' },
  slider:         { width: '100%', accentColor: '#111', cursor: 'pointer', height: '12px', margin: 0 },
  amenitiesRow:   { display: 'flex', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' },
  amenityChips:   { display: 'flex', gap: '8px', flexWrap: 'wrap', flex: 1 },
  amenityChip:    { padding: '5px 12px', border: '1.5px solid var(--border)', borderRadius: '20px', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: '500', userSelect: 'none', display: 'flex', alignItems: 'center', gap: '4px' },
  amenityChipOn:  { background: '#111', color: 'white', borderColor: '#111' },
  removeCustom:   { fontSize: '10px', cursor: 'pointer', opacity: 0.7, marginLeft: '4px' },
  addOtherChip:   { padding: '5px 12px', border: '1.5px dashed var(--border)', borderRadius: '20px', fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: '500', userSelect: 'none' },
  customInputWrap:{ display: 'flex', gap: '6px', alignItems: 'center' },
  customInput:    { padding: '6px 12px', borderRadius: '8px', border: '1.5px solid #111', fontSize: '12px', outline: 'none', width: '140px', background: 'var(--input-bg)', color: 'var(--input-text)' },
  customAddBtn:   { padding: '6px 12px', background: '#111', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' },
  customCancelBtn:{ padding: '6px 10px', background: 'none', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', color: 'var(--text-secondary)' },
  filterBar:      { background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '10px 24px', display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 },
  chip:           { padding: '6px 16px', border: '1.5px solid var(--border)', borderRadius: '30px', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer', background: 'var(--bg-card)', fontWeight: '500' },
  chipOn:         { background: '#111', color: '#fff', borderColor: '#111' },
  resultInfo:     { marginLeft: 'auto', fontSize: '12px', color: 'var(--text-muted)' },
  body:           { display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 },
  left:           { width: '360px', flexShrink: 0, overflowY: 'auto', borderRight: '1px solid var(--border)', background: 'var(--bg-card)' },
  cards:          { padding: '10px' },
  noResults:      { textAlign: 'center', padding: '60px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  noResultsText:  { fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px' },
  noResultsSub:   { fontSize: '13px', color: 'var(--text-muted)' },
  cardImg:        { height: '110px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' },
  cardImgPhoto:   { width: '100%', height: '100%', objectFit: 'cover' },
  imgIcon:        { fontSize: '28px', opacity: 0.15 },
  cardBadges:     { position: 'absolute', top: '8px', left: '8px', display: 'flex', gap: '4px' },
  badgeGreen:     { background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', fontSize: '10px', fontWeight: '700', padding: '2px 6px', borderRadius: '4px' },
  badgeYellow:    { background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', fontSize: '10px', fontWeight: '700', padding: '2px 6px', borderRadius: '4px' },
  badgeBoosted:   { background: 'linear-gradient(90deg,#f59e0b,#d97706)', color: 'white', fontSize: '10px', fontWeight: '800', padding: '2px 7px', borderRadius: '4px', boxShadow: '0 1px 4px rgba(245,158,11,0.4)' },
  matchBadge:     { position: 'absolute', top: '8px', right: '36px', fontSize: '11px', fontWeight: '700', padding: '3px 8px', borderRadius: '20px' },
  saveCardBtn:    { position: 'absolute', top: '6px', right: '8px', background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer', padding: '2px' },
  cardBody:       { padding: '10px 12px' },
  cardTopRow:     { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' },
  price:          { fontSize: '16px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.5px' },
  priceUnit:      { fontSize: '11px', fontWeight: '400', color: 'var(--text-muted)' },
  miniBar:        { width: '50px', height: '3px', background: 'var(--border)', borderRadius: '2px' },
  miniBarFill:    { height: '3px', borderRadius: '2px' },
  cardTitle:      { fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '2px', lineHeight: '1.3' },
  cardLoc:        { fontSize: '11px', color: 'var(--text-muted)', marginBottom: '3px' },
  distBadge:      { fontSize: '10px', color: '#1e40af', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '4px', padding: '1px 6px', display: 'inline-block', marginBottom: '5px' },
  tags:           { display: 'flex', gap: '4px', flexWrap: 'wrap' },
  tag:            { fontSize: '10px', color: 'var(--text-muted)', background: 'var(--bg-subtle)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border)' },
  right:          { flex: 1, overflowY: 'auto', background: 'var(--bg-page)', display: 'flex', flexDirection: 'column' },
  detailPanel:    { flex: 1 },
  detailImg:      { height: '200px', background: 'var(--bg-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', flexShrink: 0, overflow: 'hidden' },
  detailImgPhoto: { width: '100%', height: '100%', objectFit: 'cover' },
  verifiedBadge:  { position: 'absolute', top: '12px', left: '12px', background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', fontSize: '12px', fontWeight: '700', padding: '4px 12px', borderRadius: '6px' },
  reviewBadge:    { position: 'absolute', top: '12px', left: '12px', background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', fontSize: '12px', fontWeight: '700', padding: '4px 12px', borderRadius: '6px' },
  detailDistBadge:{ position: 'absolute', bottom: '12px', right: '12px', background: 'rgba(255,255,255,0.92)', color: '#1e40af', border: '1px solid #bfdbfe', fontSize: '12px', fontWeight: '600', padding: '4px 12px', borderRadius: '6px' },
  detailBody:     { padding: '18px 22px' },
  detailActions:  { display: 'flex', gap: '8px', marginBottom: '14px' },
  actionBtn:      { padding: '7px 14px', background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '12px', fontWeight: '500', cursor: 'pointer', color: 'var(--text-secondary)' },
  actionBtnSaved: { background: '#fff0f0', borderColor: '#ffd0d0', color: '#cc0000' },
  detailPrice:    { fontSize: '26px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-1px', marginBottom: '4px' },
  detailTitle:    { fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' },
  detailLoc:      { fontSize: '13px', color: 'var(--text-muted)', marginBottom: '10px' },
  tagsRow:        { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' },
  detailDesc:     { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.7', marginBottom: '14px' },
  detailGrid:     { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px', marginBottom: '16px' },
  detailItem:     { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px' },
  detailKey:      { fontSize: '10px', color: 'var(--text-muted)', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.05em' },
  detailVal:      { fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)' },
  matchSection:   { borderRadius: '12px', padding: '14px 16px', marginBottom: '14px' },
  matchHeader:    { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' },
  matchPct:       { fontSize: '18px', fontWeight: '800', letterSpacing: '-0.5px' },
  matchBarFull:   { height: '5px', background: 'rgba(0,0,0,0.08)', borderRadius: '3px', marginBottom: '12px' },
  matchBarFill:   { height: '5px', borderRadius: '3px', transition: 'width 0.4s' },
  matchBreakdown: { display: 'flex', flexDirection: 'column', gap: '8px' },
  matchRow:       { display: 'flex', alignItems: 'center', gap: '10px' },
  matchDot:       { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },
  matchRowInfo:   { flex: 1, display: 'flex', gap: '6px', alignItems: 'center' },
  matchRowLabel:  { fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)', width: '70px', flexShrink: 0 },
  matchRowDesc:   { fontSize: '12px', color: 'var(--text-muted)' },
  matchCheck:     { fontSize: '14px', fontWeight: '700', flexShrink: 0 },
  ownerRow:       { display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px 14px', marginBottom: '12px' },
  ownerAvatar:    { width: '38px', height: '38px', borderRadius: '50%', background: '#111', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: '700', flexShrink: 0 },
  ownerName:      { fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '2px' },
  ownerRole:      { fontSize: '12px', color: 'var(--text-muted)' },
  ctaRow:         { display: 'flex', gap: '10px' },
  primaryBtn:     { flex: 1, padding: '12px', background: '#111', color: 'white', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' },
  secondaryBtn:   { flex: 1, padding: '12px', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1.5px solid var(--border)', borderRadius: '10px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' },
  visitBtn:       { padding: '12px 14px', background: '#f0fdf4', color: '#166534', border: '1.5px solid #bbf7d0', borderRadius: '10px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' },
  visitBtnLocked:     { padding: '12px 14px', background: '#f3f4f6', color: '#9ca3af', border: '1.5px solid #e5e7eb', borderRadius: '10px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' },
  secondaryBtnLocked: { flex: 1, padding: '12px', background: '#f9fafb', color: '#9ca3af', border: '1.5px solid #e5e7eb', borderRadius: '10px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' },
  emptyRight:     { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
  emptyRightText: { fontSize: '14px', color: 'var(--text-muted)' },
}