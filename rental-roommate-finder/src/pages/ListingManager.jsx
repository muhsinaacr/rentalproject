// src/pages/ListingManager.jsx
// Fixes applied:
//   1. NAV FIX — reads location.state.openForm to auto-open form when coming from dashboard
//   2. DARK MODE — all inline styles now use CSS variables (var(--...))
//   3. DATE FIX — toLocaleDateString removed; date sent as plain YYYY-MM-DD
//   4. AMENITIES FIX — amenities collected, joined, sent, and rendered on card
//   5. DESCRIPTION FIX — description rendered on listing card
//   6. APARTMENT FIX — 'Apartment' added as room type with highest price range
//   ⚠️  UI design & layout are UNCHANGED
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { api } from '../utils/api'
import PaymentModal from '../components/PaymentModal'
import PremiumPaymentModal from '../components/PremiumPaymentModal'
import LocationSearch from '../components/LocationSearch'

const FREE_LISTING_LIMIT = 3

const COMMON_AMENITIES = ['AC', 'WiFi', 'Parking', 'Gym', 'Lift', 'Power Backup', 'Security', 'Laundry', 'CCTV', 'Water 24/7']

// ✅ APARTMENT FIX: Added 'Apartment' to room types list
const ROOM_TYPES = ['Single', 'Shared', 'Studio', 'Apartment']

// ─── Normalize backend listing → frontend shape ───────────────────────────────
function normalizeListing(l) {
  let photos = []
  if (l.photos) {
    try {
      const parsed = typeof l.photos === 'string' ? JSON.parse(l.photos) : l.photos
      if (Array.isArray(parsed)) {
        photos = parsed.map(p =>
          typeof p === 'string'
            ? { name: p, url: `http://localhost:5000/uploads/${p}` }
            : p
        )
      }
    } catch {
      photos = []
    }
  }

  // FIX: MySQL2 returns DATE columns as JS Date objects, not strings.
  // Convert to YYYY-MM-DD string here so formatDate and the date <input> both work.
  function toDateStr(val) {
    if (!val) return ''
    if (val instanceof Date) {
      const yyyy = val.getUTCFullYear()
      const mm   = String(val.getUTCMonth() + 1).padStart(2, '0')
      const dd   = String(val.getUTCDate()).padStart(2, '0')
      return `${yyyy}-${mm}-${dd}`
    }
    // Already a string — strip ISO timezone if present
    return String(val).split('T')[0]
  }

  return {
    ...l,
    price:           l.rent          ?? l.price           ?? '',
    type:            l.room_type     ?? l.type             ?? 'Single',
    furnished:       l.furnishing    ?? l.furnished        ?? 'Fully Furnished',
    preferredTenant: l.gender_pref   ?? l.preferredTenant  ?? 'any',
    availableFrom:   toDateStr(l.available_from ?? l.availableFrom),  // FIX: always YYYY-MM-DD
    deposit:         l.deposit       ?? '',
    floor:           l.floor         ?? '',
    totalFloors:     l.total_floors  ?? l.totalFloors      ?? '',
    facing:          l.facing        ?? 'East',
    bathroom:        l.bathroom      ?? 'Attached',
    kitchen:         l.kitchen       ?? 'Shared',
    maintenance:     l.maintenance   ?? '',
    description:     l.description   ?? '',
    amenities:       l.amenities     ?? '',
    views:           l.views         ?? 0,
    inquiries:       l.inquiries     ?? 0,
    status:          l.status        ?? 'pending',
    photos,
  }
}

// ✅ APARTMENT FIX: Added Apartment base price (highest at 15000)
function getPriceRange(location, type, amenities, furnished) {
  const basePrice = {
    'Single':    6000,
    'Shared':    4000,
    'Studio':    9000,
    'Apartment': 15000,   // ← highest tier
  }[type] || 6000
  const locMul    = location.toLowerCase().includes('ernakulam') || location.toLowerCase().includes('kochi')
    ? 1.3 : location.toLowerCase().includes('trivandrum') ? 1.2 : 1.0
  const amenCount = amenities ? amenities.split(',').filter(Boolean).length : 0
  const amenMul     = 1 + amenCount * 0.04
  const furnishMul  = furnished === 'Fully Furnished' ? 1.2 : furnished === 'Semi Furnished' ? 1.1 : 1.0
  const base        = Math.round(basePrice * locMul * amenMul * furnishMul)
  return { min: Math.round(base * 0.85 / 500) * 500, max: Math.round(base * 1.2 / 500) * 500 }
}

const EMPTY_FORM = {
  title: '',
  location: '',
  price: '',
  deposit: '',
  type: 'Single',
  furnished: 'Fully Furnished',
  description: '',
  amenities: [],
  otherAmenities: '',
  preferredTenant: 'any',
  photos: [],
  availableFrom: '',
  floor: '',
  totalFloors: '',
  facing: 'East',
  bathroom: 'Attached',
  kitchen: 'Shared',
  maintenance: '',
}

export default function ListingManager() {
  const location = useLocation()

  const [showForm, setShowForm]       = useState(false)
  const [editingId, setEditingId]     = useState(null)
  const [listings, setListings]       = useState([])
  const [form, setForm]               = useState(EMPTY_FORM)
  const [photoFiles, setPhotoFiles]   = useState([])

  // ── Subscription state ───────────────────────────────────────────────────
  const [isPremium, setIsPremium]                 = useState(false)
  const [remainingListings, setRemainingListings] = useState(FREE_LISTING_LIMIT)
  const [premiumEndDate, setPremiumEndDate]       = useState(null)
  const [subLoading, setSubLoading]              = useState(true)

  // ── Payment modal state ──────────────────────────────────────────────────
  const [showPayment, setShowPayment]           = useState(false)
  const [paymentFeature, setPaymentFeature]     = useState('')
  const [paymentPrice, setPaymentPrice]         = useState(0)
  const [onPaySuccess, setOnPaySuccess]         = useState(null)
  const [showPremiumModal, setShowPremiumModal] = useState(false)

  // Boost
  // boostedIds + boostExpiry: loaded from backend on mount — NEVER from localStorage
  // Boost = visibility only. Boost does NOT affect contact access.
  const [boostedIds, setBoostedIds]     = useState([])
  const [boostExpiry, setBoostExpiry]   = useState({})  // { listingId: ISOString }
  const [boostTooltip, setBoostTooltip] = useState(null)

  // Track which listing cards have their full amenity list expanded
  const [expandedAmenities, setExpandedAmenities] = useState([])

  // ── Disable/Activate confirmation state ──────────────────────────────────
  const [confirmDisable, setConfirmDisable]   = useState(null)  // listing id awaiting confirm
  const [togglingId, setTogglingId]           = useState(null)  // currently toggling

  // ── Form validation errors ─────────────────────────────────────────────
  const [formErrors, setFormErrors] = useState({})

  // ── AI generation state ────────────────────────────────────────────────
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiError, setAiError]           = useState('')

  // ── Fetch listings + subscription info ───────────────────────────────────
  async function loadListings() {
    try {
      // Fetch listings + authoritative subscription status in parallel
      const [data, subStatus, boostData] = await Promise.all([
        api.getMyListings(),
        api.getSubscriptionStatus().catch(() => null),
        // Load boosted listing IDs from backend — source of truth for boost state
        // Boost = visibility only. This data never affects contact access.
        api.getBoostedListings().catch(() => ({ boostedIds: [] })),
      ])

      if (data && Array.isArray(data.listings)) {
        setListings(data.listings.map(normalizeListing))
      } else if (Array.isArray(data)) {
        setListings(data.map(normalizeListing))
      }

      // Sync boosted IDs + expiry dates from backend — purely for badge + card highlight
      if (boostData?.boostedIds) {
        setBoostedIds(boostData.boostedIds)
        setBoostExpiry(boostData.boostExpiry || {})
      }

      // subscriptions/status is the authoritative source — prefer it
      if (subStatus) {
        setIsPremium(subStatus.isPremium)
        setRemainingListings(subStatus.remainingListings)
        setPremiumEndDate(subStatus.endDate || null)
      } else if (data && !Array.isArray(data)) {
        // fallback to getMyListings data
        setIsPremium(data.isPremium)
        setRemainingListings(data.remainingListings)
        setPremiumEndDate(data.premiumEndDate || null)
      }
    } catch {
      // silent
    } finally {
      setSubLoading(false)
    }
  }

  useEffect(() => { loadListings() }, [])

  // ✅ NAV FIX: Auto-open the add form when navigated from Owner Dashboard
  useEffect(() => {
    if (!subLoading && location.state?.openForm) {
      const atLimitNow = !isPremium && (remainingListings !== null && remainingListings <= 0)
      if (atLimitNow) {
        setShowPremiumModal(true)
      } else {
        setEditingId(null)
        setForm(EMPTY_FORM)
        setPhotoFiles([])
        setShowForm(true)
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
      window.history.replaceState({}, document.title)
    }
  }, [subLoading]) // eslint-disable-line react-hooks/exhaustive-deps

  const atLimit = !isPremium && (remainingListings !== null && remainingListings <= 0)

  // ── Handlers ─────────────────────────────────────────────────────────────
  function handleChange(e) { setForm({ ...form, [e.target.name]: e.target.value }) }

  function toggleAmenity(a) {
    setForm(f => ({
      ...f,
      amenities: f.amenities.includes(a) ? f.amenities.filter(x => x !== a) : [...f.amenities, a]
    }))
  }

  function handlePhotoUpload(e) {
    const files = Array.from(e.target.files)
    setPhotoFiles(prev => [...prev, ...files])
    files.forEach(file => {
      const reader = new FileReader()
      reader.onload = ev => {
        setForm(f => ({ ...f, photos: [...f.photos, { name: file.name, url: ev.target.result }] }))
      }
      reader.readAsDataURL(file)
    })
  }

  function removePhoto(idx) {
    setForm(f => ({ ...f, photos: f.photos.filter((_, i) => i !== idx) }))
    setPhotoFiles(prev => prev.filter((_, i) => i !== idx))
  }

  function openPayment(feature, price, onSuccess) {
    setPaymentFeature(feature)
    setPaymentPrice(price)
    setOnPaySuccess(() => onSuccess)
    setShowPayment(true)
  }

  function handleAddClick() {
    if (atLimit) {
      setShowPremiumModal(true)
    } else {
      setEditingId(null)
      setForm(EMPTY_FORM)
      setPhotoFiles([])
      setShowForm(prev => !prev)
    }
  }

  function handleEditClick(listing) {
    const amenitiesArray = listing.amenities
      ? listing.amenities.split(',').map(a => a.trim()).filter(a => COMMON_AMENITIES.includes(a))
      : []
    const otherAmenitiesStr = listing.amenities
      ? listing.amenities.split(',').map(a => a.trim()).filter(a => !COMMON_AMENITIES.includes(a) && a).join(', ')
      : ''

    setForm({
      title:           listing.title           || '',
      location:        listing.location        || '',
      price:           listing.price           || '',
      deposit:         listing.deposit         || '',
      type:            listing.type            || 'Single',
      furnished:       listing.furnished       || 'Fully Furnished',
      description:     listing.description     || '',
      amenities:       amenitiesArray,
      otherAmenities:  otherAmenitiesStr,
      preferredTenant: listing.preferredTenant || 'any',
      photos:          listing.photos          || [],
      availableFrom:   listing.availableFrom ? String(listing.availableFrom).slice(0, 10) : '',
      floor:           listing.floor           || '',
      totalFloors:     listing.totalFloors     || '',
      facing:          listing.facing          || 'East',
      bathroom:        listing.bathroom        || 'Attached',
      kitchen:         listing.kitchen         || 'Shared',
      maintenance:     listing.maintenance     || '',
    })
    setPhotoFiles([])
    setEditingId(listing.id)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelForm() {
    setShowForm(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
    setPhotoFiles([])
    setFormErrors({})
    setAiError('')
  }

  async function generateWithAI() {
    if (form.photos.length === 0) {
      setAiError('Please upload at least one photo first so AI can analyse it.')
      return
    }
    setAiGenerating(true)
    setAiError('')
    try {
      const token = sessionStorage.getItem('token')

      // Build multipart form — send actual photo files (new uploads) or fetch existing URLs
      const formData = new FormData()

      // Attach up to 3 photos as blobs
      const photosToSend = form.photos.slice(0, 3)
      const photoFilesToSend = photoFiles.slice(0, 3)

      for (let i = 0; i < photosToSend.length; i++) {
        const p = photosToSend[i]
        if (photoFilesToSend[i]) {
          // New upload — file object already available
          formData.append('photos', photoFilesToSend[i])
        } else {
          // Existing listing photo — fetch from backend URL and convert to blob
          const resp = await fetch(p.url)
          const blob = await resp.blob()
          const ext  = blob.type.includes('png') ? 'png' : 'jpg'
          formData.append('photos', blob, `photo_${i}.${ext}`)
        }
      }

      // Optional context fields
      if (form.type)      formData.append('type',      form.type)
      if (form.furnished) formData.append('furnished', form.furnished)
      if (form.location)  formData.append('location',  form.location)
      if (form.amenities.length > 0) formData.append('amenities', form.amenities.join(', '))

      const res = await fetch('http://localhost:5000/api/gemini/generate-from-photos', {
        method:  'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body:    formData,
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'AI generation failed')

      // Validate lengths before applying to form
      const generatedTitle = (data.title || '').trim()
      const generatedDesc  = (data.description || '').trim()

      if (generatedTitle.length < 50) {
        throw new Error(`AI generated a title that is too short (${generatedTitle.length}/50 chars). Please try again.`)
      }
      if (generatedDesc.length < 150) {
        throw new Error(`AI generated a description that is too short (${generatedDesc.length}/150 chars). Please try again.`)
      }

      setForm(f => ({
        ...f,
        title:       generatedTitle || f.title,
        description: generatedDesc  || f.description,
      }))
    } catch (err) {
      setAiError('AI generation failed: ' + err.message)
      console.error('AI gen error:', err)
    } finally {
      setAiGenerating(false)
    }
  }

  function validateForm() {
    const errors = {}
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const maxDate = new Date(today); maxDate.setMonth(maxDate.getMonth() + 1)

    // 1. At least 1 photo
    if (form.photos.length === 0) {
      errors.photos = 'Please upload at least 1 photo of the room.'
    }

    // 2. Location mandatory
    if (!form.location || form.location.trim().length === 0) {
      errors.location = 'Please enter a location for the listing.'
    }

    // 3. Title min 50 chars
    if (!form.title || form.title.trim().length < 50) {
      errors.title = `Title must be at least 50 characters. (${form.title.trim().length}/50)`
    }

    // 3. Rent > 500
    const rent = Number(form.price)
    if (!form.price || rent <= 500) {
      errors.price = 'Monthly rent must be above ₹500.'
    }

    // 4. Security deposit: between 1× and 3× rent
    if (form.deposit) {
      const deposit = Number(form.deposit)
      if (deposit < rent) {
        errors.deposit = `Security deposit must be at least 1 month's rent (₹${rent.toLocaleString()}).`
      } else if (deposit > rent * 3) {
        errors.deposit = `Security deposit cannot exceed 3 months' rent (₹${(rent * 3).toLocaleString()}).`
      }
    } else {
      errors.deposit = 'Security deposit is required (min 1 month, max 3 months rent).'
    }

    // 5. Maintenance ≤ 5% of rent
    if (form.maintenance) {
      const maint = Number(form.maintenance)
      if (maint > rent * 0.05) {
        errors.maintenance = `Maintenance cannot exceed 5% of rent (max ₹${Math.floor(rent * 0.05).toLocaleString()}/month).`
      }
    }

    // 6. Available From: today or within next 1 month
    if (form.availableFrom) {
      const selected = new Date(form.availableFrom); selected.setHours(0, 0, 0, 0)
      if (selected < today) {
        errors.availableFrom = 'Available date cannot be in the past.'
      } else if (selected > maxDate) {
        errors.availableFrom = 'Available date must be within the next 1 month.'
      }
    } else {
      errors.availableFrom = 'Please select an availability date.'
    }

    // 7. Floor Number mandatory
    if (form.floor === '' || form.floor === null || form.floor === undefined) {
      errors.floor = 'Floor number is required.'
    }

    // 8. Total Floors mandatory
    if (!form.totalFloors || Number(form.totalFloors) < 1) {
      errors.totalFloors = 'Total floors in building is required.'
    }

    // 9. Description min 150 chars
    if (!form.description || form.description.trim().length < 150) {
      errors.description = `Description must be at least 150 characters. (${form.description.trim().length}/150)`
    }

    return errors
  }

  async function handleSubmit(e) {
    e.preventDefault()

    const errors = validateForm()
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      // Scroll to first error
      setTimeout(() => {
        const firstErr = document.querySelector('[data-form-error]')
        if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 50)
      return
    }
    setFormErrors({})

    const allAmenities = [
      ...form.amenities,
      ...(form.otherAmenities ? form.otherAmenities.split(',').map(a => a.trim()).filter(Boolean) : [])
    ].join(', ')

    try {
      const formData = new FormData()
      formData.append('title',       form.title)
      formData.append('description', form.description)
      formData.append('location',    form.location)
      formData.append('price',   form.price)
      formData.append('rent',    form.price)
      formData.append('deposit', form.deposit || '')
      formData.append('type',      form.type)
      formData.append('room_type', form.type)
      formData.append('furnished', form.furnished)
      formData.append('furnishing', form.furnished)
      const cleanDate = form.availableFrom ? String(form.availableFrom).slice(0, 10) : ''
      formData.append('available_from', cleanDate)
      formData.append('availableFrom',  cleanDate)
      formData.append('amenities', allAmenities)
      formData.append('gender_pref',     form.preferredTenant)
      formData.append('preferredTenant', form.preferredTenant)
      formData.append('floor',        form.floor        || '')
      formData.append('total_floors', form.totalFloors  || '')
      formData.append('totalFloors',  form.totalFloors  || '')
      formData.append('facing',       form.facing       || '')
      formData.append('bathroom',     form.bathroom     || '')
      formData.append('kitchen',      form.kitchen      || '')
      formData.append('maintenance',  form.maintenance  || '')
      photoFiles.forEach(file => formData.append('photos', file))

      const token = sessionStorage.getItem('token')
      const url    = editingId != null
        ? `http://localhost:5000/api/listings/${editingId}`
        : `http://localhost:5000/api/listings`
      const method = editingId != null ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      })

      if (!res.ok) {
        const err = await res.json()
        if (err.code === 'LISTING_LIMIT_REACHED') {
          setShowPremiumModal(true)
          return
        }
        throw new Error(err.error)
      }

      await loadListings()
      cancelForm()
    } catch (err) {
      alert('Error saving listing: ' + err.message)
    }
  }

  async function deleteListing(id) {
    try {
      await api.deleteListing(id)
      await loadListings()
      if (editingId === id) cancelForm()
    } catch (err) {
      alert('Error deleting listing: ' + err.message)
    }
  }

  function boostListing(id) {
    openPayment('⭐ Top Pick — 28 Days', 49, async (paymentId, method) => {
      try {
        // Backend records the boost AND the payment in one call
        const result = await api.boostListing(id, paymentId || 'mock', method || 'mock')
        if (result?.boostedUntil) {
          setBoostExpiry(prev => ({ ...prev, [id]: new Date(result.boostedUntil).toISOString() }))
        }
      } catch (err) {
        console.warn('Boost backend call failed (non-critical for UI):', err.message)
      }
      setBoostedIds(prev => [...prev, id])
    })
  }

  // Toggle is_active with ownership validation
  async function handleToggleActive(listing) {
    const goingInactive = listing.isActive !== false  // currently active → disabling
    if (goingInactive) {
      // Show confirmation popup before disabling
      setConfirmDisable(listing.id)
      return
    }
    // Re-activating — no confirmation needed
    await doToggle(listing.id, true)
  }

  async function doToggle(id, newActive) {
    setTogglingId(id)
    try {
      await api.toggleListingStatus(id, newActive)
      setListings(prev => prev.map(l => l.id === id ? { ...l, isActive: newActive } : l))
    } catch (err) {
      alert('Failed to update listing status: ' + err.message)
    } finally {
      setTogglingId(null)
      setConfirmDisable(null)
    }
  }

  function getBoostState(listing) {
    const expiry = boostExpiry[listing.id]
    if ((boostedIds.includes(listing.id) || listing.isBoosted) && expiry) {
      const daysLeft = Math.ceil((new Date(expiry) - new Date()) / (1000 * 60 * 60 * 24))
      if (daysLeft <= 0) return 'expired'   // show Renew button
    }
    if (boostedIds.includes(listing.id) || listing.isBoosted) return 'boosted'
    if (listing.status !== 'verified') return 'locked'
    return 'available'
  }

  function planLabel() {
    if (subLoading) return 'Loading plan...'
    if (isPremium) {
      const end = premiumEndDate ? ` · expires ${formatDate(premiumEndDate)}` : ''
      return `Premium — Unlimited${end}`
    }
    const rem = remainingListings ?? (FREE_LISTING_LIMIT - listings.length)
    return `Free plan — ${rem} remaining`
  }

  // ✅ APARTMENT FIX: badge color for Apartment type
  function getTypeBadgeStyle(type) {
    if (type === 'Apartment') return s.apartmentBadge
    return s.tag
  }

  return (
    <div style={s.page}>
      {/* Top Bar */}
      <div style={s.topbar}>
        <div>
          <h2 style={s.title}>My Listings</h2>
          <p style={s.sub}>
            {listings.length} listing{listings.length !== 1 ? 's' : ''} · {planLabel()}
          </p>
        </div>
        <div style={s.topbarActions}>
          {!isPremium && !subLoading && (
            <button style={s.upgradeBtn} onClick={() => setShowPremiumModal(true)}>
              ⭐ Upgrade — ₹129
            </button>
          )}
          <button style={{ ...s.addBtn, ...(atLimit ? s.addBtnLocked : {}) }} onClick={handleAddClick}>
            {atLimit ? '🔒 Limit Reached' : (showForm && !editingId) ? '✕ Cancel' : '+ Add Listing'}
          </button>
        </div>
      </div>

      {/* Limit Warning */}
      {atLimit && (
        <div style={s.limitBanner}>
          <span>⚠️ You've reached the free plan limit of {FREE_LISTING_LIMIT} listings.</span>
          <button style={s.limitUpgradeBtn} onClick={() => setShowPremiumModal(true)}>
            Upgrade to Premium →
          </button>
        </div>
      )}

      <div style={s.content}>

        {/* ─── ADD / EDIT FORM ─── */}
        {showForm && !atLimit && (
          <div style={s.formCard}>
            <div style={s.formHeader}>
              <h3 style={s.cardTitle}>{editingId ? '✏️ Edit Listing' : '➕ Add New Listing'}</h3>
              {editingId && (
                <div style={s.editingBadge}>
                  Editing: <strong>{listings.find(l => l.id === editingId)?.title || 'Listing'}</strong>
                </div>
              )}
            </div>
            <form onSubmit={handleSubmit}>

              {/* Photo Upload */}
              <div style={s.sectionDivider}>📸 Photos</div>
              <div style={s.field}>
                <label style={s.photoUploadArea}>
                  <input type="file" multiple accept="image/*" style={{ display: 'none' }} onChange={handlePhotoUpload} />
                  <div style={{ ...s.photoUploadInner, ...(formErrors.photos ? { borderColor: '#ef4444' } : {}) }}>
                    <span style={{ fontSize: '28px' }}>📷</span>
                    <div style={s.photoUploadText}>Click to upload photos</div>
                    <div style={s.photoUploadSub}>JPG, PNG · Multiple allowed · <strong>At least 1 required</strong></div>
                  </div>
                </label>
                {formErrors.photos && <div data-form-error style={s.fieldError}>{formErrors.photos}</div>}
                {form.photos.length > 0 && (
                  <div style={s.photoGrid}>
                    {form.photos.map((p, i) => (
                      <div key={i} style={s.photoThumb}>
                        <img src={p.url} alt={p.name} style={s.photoImg} />
                        <button type="button" style={s.photoRemove} onClick={() => removePhoto(i)}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* AI Generate Button — appears once photos are uploaded */}
              {form.photos.length > 0 && (
                <div style={aiGenBox.wrapper}>
                  <div style={aiGenBox.header}>
                    <span style={{ fontSize: '18px' }}>✨</span>
                    <div>
                      <div style={aiGenBox.title}>AI Listing Assistant</div>
                      <div style={aiGenBox.sub}>Let AI write your title &amp; description based on your photos</div>
                    </div>
                    <button
                      type="button"
                      style={{ ...aiGenBox.btn, ...(aiGenerating ? aiGenBox.btnDisabled : {}) }}
                      onClick={generateWithAI}
                      disabled={aiGenerating}
                    >
                      {aiGenerating ? '⏳ Analysing...' : '✨ Generate with AI'}
                    </button>
                  </div>
                  {aiError && <div style={aiGenBox.error}>⚠️ {aiError}</div>}
                  {aiGenerating && (
                    <div style={aiGenBox.progress}>
                      <div style={aiGenBox.progressBar} />
                    </div>
                  )}
                </div>
              )}

              {/* Basic Info */}
              <div style={s.sectionDivider}>🏠 Basic Info</div>
              <div style={s.grid2}>
                <div style={{ ...s.field, gridColumn: '1 / -1' }}>
                  <label style={s.label}>Listing Title <span style={{ color: 'var(--text-placeholder)', fontWeight: 400 }}>(min 50 characters)</span></label>
                  <input style={{ ...s.input, ...(formErrors.title ? { borderColor: '#ef4444' } : {}) }} type="text" name="title" placeholder="e.g. Furnished room near metro" value={form.title} onChange={handleChange} />
                  {formErrors.title
                    ? <div data-form-error style={s.fieldError}>{formErrors.title}</div>
                    : <span style={s.fieldHint}>{form.title.trim().length}/50 characters</span>
                  }
                </div>
                <div style={s.field}>
                  <label style={s.label}>Location <span style={{ color: '#ef4444' }}>*</span></label>
                  {/* ✅ LocationSearch preserved exactly as-is */}
                  <div style={formErrors.location ? { outline: '1.5px solid #ef4444', borderRadius: '8px' } : {}}>
                    <LocationSearch
                      value={form.location}
                      onChange={(val) => setForm(f => ({ ...f, location: val }))}
                      placeholder="e.g. Kakkanad, Kochi"
                    />
                  </div>
                  {formErrors.location && <div data-form-error style={s.fieldError}>{formErrors.location}</div>}
                </div>
                <div style={s.field}>
                  <label style={s.label}>Room Type</label>
                  {/* ✅ APARTMENT FIX: uses ROOM_TYPES array which now includes Apartment */}
                  <select style={s.input} name="type" value={form.type} onChange={handleChange}>
                    {ROOM_TYPES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div style={s.field}>
                  <label style={s.label}>Furnishing</label>
                  <select style={s.input} name="furnished" value={form.furnished} onChange={handleChange}>
                    {['Fully Furnished', 'Semi Furnished', 'Unfurnished'].map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div style={s.field}>
                  <label style={s.label}>Preferred Tenant</label>
                  <select style={s.input} name="preferredTenant" value={form.preferredTenant} onChange={handleChange}>
                    {[['any', 'Anyone'], ['male', 'Male Only'], ['female', 'Female Only'], ['student', 'Students Only'], ['professional', 'Professionals Only']].map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* ✅ APARTMENT FIX: show tip when Apartment is selected */}
              {form.type === 'Apartment' && (
                <div style={s.apartmentTip}>
                  🏢 <strong>Apartment</strong> listing — AI market rate starts from ₹15,000/month. Make sure to include number of bedrooms in your title and description for better visibility.
                </div>
              )}

              {/* Pricing */}
              <div style={s.sectionDivider}>💰 Pricing</div>
              <div style={s.grid2}>
                <div style={s.field}>
                  <label style={s.label}>Monthly Rent (₹)</label>
                  <div style={s.inputPrefix}>
                    <span style={s.prefixSymbol}>₹</span>
                    <input style={{ ...s.input, ...s.inputWithPrefix, ...(formErrors.price ? { borderColor: '#ef4444' } : {}) }} type="number" name="price" placeholder={form.type === 'Apartment' ? 'e.g. 18000' : 'e.g. 7500'} value={form.price} onChange={handleChange} />
                  </div>
                  {formErrors.price && <div data-form-error style={s.fieldError}>{formErrors.price}</div>}
                </div>
                <div style={s.field}>
                  <label style={s.label}>Security Deposit (₹)</label>
                  <div style={s.inputPrefix}>
                    <span style={s.prefixSymbol}>₹</span>
                    <input style={{ ...s.input, ...s.inputWithPrefix, ...(formErrors.deposit ? { borderColor: '#ef4444' } : {}) }} type="number" name="deposit" placeholder={form.type === 'Apartment' ? 'e.g. 50000' : 'e.g. 15000'} value={form.deposit} onChange={handleChange} />
                  </div>
                  {formErrors.deposit
                    ? <div data-form-error style={s.fieldError}>{formErrors.deposit}</div>
                    : <span style={s.fieldHint}>Min 1 month rent · Max 3 months rent</span>
                  }
                </div>
              </div>

              {/* AI Price Recommendation */}
              {form.location && form.type && form.price && (() => {
                const { min, max } = getPriceRange(form.location, form.type, form.amenities.join(','), form.furnished)
                const userPrice = Number(form.price)
                const isGood   = userPrice >= min && userPrice <= max
                const isTooLow = userPrice < min
                return (
                  <div style={aiBox.wrapper}>
                    <div style={aiBox.header}>
                      <span style={{ fontSize: '16px' }}>🤖</span>
                      <span style={aiBox.label}>AI Price Recommendation</span>
                    </div>
                    <div style={aiBox.range}>Market rate: <strong>₹{min.toLocaleString()} – ₹{max.toLocaleString()}</strong>/month</div>
                    <div style={{ ...aiBox.verdict, color: isGood ? '#166534' : isTooLow ? '#92400e' : '#cc0000', background: isGood ? 'var(--tag-green-bg)' : isTooLow ? 'var(--tag-yellow-bg)' : 'var(--tag-red-bg)', border: `1px solid ${isGood ? 'var(--tag-green-border)' : isTooLow ? 'var(--tag-yellow-border)' : 'var(--tag-red-border)'}` }}>
                      {isGood ? '✅ Your price is in the recommended range!' : isTooLow ? '⚠️ Your price might be too low — you could charge more' : '⚠️ Your price is above market rate — may reduce inquiries'}
                    </div>
                  </div>
                )
              })()}

              {/* Room Details */}
              <div style={s.sectionDivider}>🛏️ Room Details</div>
              <div style={s.grid3}>
                <div style={s.field}>
                  <label style={s.label}>Available From</label>
                  <input
                    style={{ ...s.input, ...(formErrors.availableFrom ? { borderColor: '#ef4444' } : {}) }}
                    type="date" name="availableFrom" value={form.availableFrom} onChange={handleChange}
                    min={new Date().toISOString().split('T')[0]}
                    max={(() => { const d = new Date(); d.setMonth(d.getMonth() + 1); return d.toISOString().split('T')[0] })()}
                  />
                  {formErrors.availableFrom
                    ? <div data-form-error style={s.fieldError}>{formErrors.availableFrom}</div>
                    : <span style={s.fieldHint}>Today to within 1 month</span>
                  }
                </div>
                <div style={s.field}>
                  <label style={s.label}>Floor Number <span style={{ color: '#ef4444' }}>*</span></label>
                  <input style={{ ...s.input, ...(formErrors.floor ? { borderColor: '#ef4444' } : {}) }} type="number" name="floor" placeholder="e.g. 2" value={form.floor} onChange={handleChange} min="0" />
                  {formErrors.floor && <div data-form-error style={s.fieldError}>{formErrors.floor}</div>}
                </div>
                <div style={s.field}>
                  <label style={s.label}>Total Floors in Building <span style={{ color: '#ef4444' }}>*</span></label>
                  <input style={{ ...s.input, ...(formErrors.totalFloors ? { borderColor: '#ef4444' } : {}) }} type="number" name="totalFloors" placeholder="e.g. 4" value={form.totalFloors} onChange={handleChange} min="1" />
                  {formErrors.totalFloors && <div data-form-error style={s.fieldError}>{formErrors.totalFloors}</div>}
                </div>
                <div style={s.field}>
                  <label style={s.label}>Facing Direction</label>
                  <select style={s.input} name="facing" value={form.facing} onChange={handleChange}>
                    {['East', 'West', 'North', 'South', 'North-East', 'North-West', 'South-East', 'South-West'].map(d => (
                      <option key={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div style={s.field}>
                  <label style={s.label}>Bathroom</label>
                  <select style={s.input} name="bathroom" value={form.bathroom} onChange={handleChange}>
                    {['Attached', 'Shared', 'Common'].map(b => <option key={b}>{b}</option>)}
                  </select>
                </div>
                <div style={s.field}>
                  <label style={s.label}>Kitchen</label>
                  <select style={s.input} name="kitchen" value={form.kitchen} onChange={handleChange}>
                    {['Shared', 'Private', 'Not Available'].map(k => <option key={k}>{k}</option>)}
                  </select>
                </div>
                <div style={{ ...s.field, gridColumn: '1 / -1' }}>
                  <label style={s.label}>Maintenance Charges (₹/month)</label>
                  <div style={s.inputPrefix}>
                    <span style={s.prefixSymbol}>₹</span>
                    <input style={{ ...s.input, ...s.inputWithPrefix, ...(formErrors.maintenance ? { borderColor: '#ef4444' } : {}) }} type="number" name="maintenance" placeholder="e.g. 300" value={form.maintenance} onChange={handleChange} min="0" />
                  </div>
                  {formErrors.maintenance
                    ? <div data-form-error style={s.fieldError}>{formErrors.maintenance}</div>
                    : <span style={s.fieldHint}>Leave blank if maintenance is included in rent · Max 5% of rent</span>
                  }
                </div>
              </div>

              {/* Amenities */}
              <div style={s.sectionDivider}>✅ Amenities</div>
              <div style={s.field}>
                <label style={s.label}>Common Amenities</label>
                <div style={s.amenityGrid}>
                  {COMMON_AMENITIES.map(a => (
                    <div
                      key={a}
                      style={{ ...s.amenityChip, ...(form.amenities.includes(a) ? s.amenityChipOn : {}) }}
                      onClick={() => toggleAmenity(a)}
                    >
                      {form.amenities.includes(a) ? '✓ ' : ''}{a}
                    </div>
                  ))}
                </div>
              </div>
              <div style={s.field}>
                <label style={s.label}>Other Amenities (optional)</label>
                <input style={s.input} type="text" name="otherAmenities" placeholder="e.g. Rooftop access, Swimming pool..." value={form.otherAmenities} onChange={handleChange} />
              </div>

              {/* Description */}
              <div style={s.sectionDivider}>📝 Description</div>
              <div style={s.field}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '7px' }}>
                  <label style={{ ...s.label, marginBottom: 0 }}>Description</label>
                  {form.photos.length > 0 && (
                    <button
                      type="button"
                      style={aiGenBox.inlineBtn}
                      onClick={generateWithAI}
                      disabled={aiGenerating}
                    >
                      {aiGenerating ? '⏳...' : '✨ AI Fill'}
                    </button>
                  )}
                </div>
                <textarea style={{ ...s.textarea, ...(formErrors.description ? { borderColor: '#ef4444' } : {}) }} name="description" placeholder="Describe your room in detail — surroundings, nearby landmarks, rules, etc." value={form.description} onChange={handleChange} rows={4} />
                {formErrors.description
                  ? <div data-form-error style={s.fieldError}>{formErrors.description}</div>
                  : <span style={s.fieldHint}>{form.description.trim().length}/150 minimum characters</span>
                }
              </div>

              {/* Form Actions */}
              <div style={s.formActions}>
                <button style={s.cancelFormBtn} type="button" onClick={cancelForm}>Cancel</button>
                <button style={s.submitBtn} type="submit">
                  {editingId ? '💾 Save Changes' : 'Publish Listing →'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Empty State */}
        {listings.length === 0 && !showForm && (
          <div style={s.empty}>
            <div style={s.emptyIcon}>🏠</div>
            <div style={s.emptyTitle}>No listings yet</div>
            <div style={s.emptySub}>Click "Add Listing" to post your first room</div>
          </div>
        )}

        {/* Listings Grid */}
        <div style={s.listingsGrid}>
          {listings.map(l => {
            const boostState = getBoostState(l)
            const isCurrentlyEditing = editingId === l.id
            const floorLabel = l.floor && l.totalFloors
              ? `${l.floor}${getOrdinal(Number(l.floor))} Floor of ${l.totalFloors}`
              : l.floor ? `Floor ${l.floor}` : '—'
            const amenityList = l.amenities
              ? l.amenities.split(',').map(a => a.trim()).filter(Boolean)
              : []

            return (
              <div key={l.id} style={{ ...s.listingCard, ...((boostedIds.includes(l.id) || l.isBoosted) ? s.listingBoosted : {}), ...(isCurrentlyEditing ? s.listingEditing : {}), ...(l.isActive === false ? s.listingInactive : {}) }}>

                {/* Image */}
                <div style={s.listingImg}>
                  {(boostedIds.includes(l.id) || l.isBoosted) && (
                    <div style={s.boostBadge}>⭐ Top Pick</div>
                  )}
                  {(boostedIds.includes(l.id) || l.isBoosted) && boostExpiry[l.id] && (() => {
                    const expDate  = new Date(boostExpiry[l.id])
                    const now      = new Date()
                    const daysLeft = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24))
                    const expired  = daysLeft <= 0
                    const urgent   = daysLeft <= 5 && !expired
                    return (
                      <div style={{ ...s.boostExpiry, color: expired ? '#ef4444' : urgent ? '#d97706' : '#16a34a' }}>
                        {expired
                          ? '⚠ Boost expired'
                          : urgent
                            ? `⏰ Expires in ${daysLeft}d`
                            : `✓ Active · ${daysLeft}d left`}
                      </div>
                    )
                  })()}
                  {/* ✅ APARTMENT FIX: show 🏢 badge on apartment listings */}
                  {l.type === 'Apartment' && !boostedIds.includes(l.id) && !l.isBoosted && (
                    <div style={s.apartmentImgBadge}>🏢 Apartment</div>
                  )}
                  {isCurrentlyEditing && <div style={s.editingOverlay}>✏️ Editing</div>}
                  {l.isActive === false && (
                    <div style={s.inactiveOverlay}>
                      <span style={s.inactiveOverlayIcon}>⏸️</span>
                      <span style={s.inactiveOverlayText}>Not Visible to Seekers</span>
                    </div>
                  )}
                  {l.photos && l.photos.length > 0
                    ? <img src={l.photos[0].url} alt={l.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: '32px', opacity: 0.15 }}>{l.type === 'Apartment' ? '🏢' : '🏠'}</span>
                  }
                </div>

                <div style={s.listingBody}>
                  {/* Price + Status */}
                  <div style={s.listingTop}>
                    <div>
                      <div style={s.listingPrice}>
                        ₹{Number(l.price).toLocaleString()}<span style={s.perMonth}>/mo</span>
                      </div>
                      {l.deposit && (
                        <div style={s.depositTag}>+ ₹{Number(l.deposit).toLocaleString()} deposit</div>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                      <span style={l.status === 'verified' ? s.verifiedBadge : l.status === 'flagged' ? s.flaggedBadge : s.pendingBadge}>
                        {l.status === 'verified' ? '🟢 Verified' : l.status === 'flagged' ? '🔴 Flagged' : '🟡 Pending'}
                      </span>
                      <span style={l.isActive === false ? s.inactiveBadge : s.activeBadge}>
                        {l.isActive === false ? '⚪ Inactive' : '🟢 Active'}
                      </span>
                    </div>
                  </div>

                  <div style={s.listingTitle}>{l.title}</div>
                  <div style={s.listingLocation}>📍 {l.location}</div>

                  <div style={s.listingMeta}>
                    {/* ✅ APARTMENT FIX: Apartment gets a distinct purple badge */}
                    <span style={getTypeBadgeStyle(l.type)}>{l.type}</span>
                    <span style={s.tag}>{l.furnished}</span>
                  </div>

                  {/* Room Details Mini Grid */}
                  {(l.availableFrom || l.floor || l.facing || l.bathroom || l.kitchen || l.maintenance) && (
                    <div style={s.roomDetailsMini}>
                      {l.availableFrom && (
                        <div style={s.miniDetail}>
                          <span style={s.miniLabel}>AVAILABLE</span>
                          <span style={s.miniValue}>{formatDate(l.availableFrom)}</span>
                        </div>
                      )}
                      {l.floor && (
                        <div style={s.miniDetail}>
                          <span style={s.miniLabel}>FLOOR</span>
                          <span style={s.miniValue}>{floorLabel}</span>
                        </div>
                      )}
                      {l.facing && (
                        <div style={s.miniDetail}>
                          <span style={s.miniLabel}>FACING</span>
                          <span style={s.miniValue}>{l.facing}</span>
                        </div>
                      )}
                      {l.bathroom && (
                        <div style={s.miniDetail}>
                          <span style={s.miniLabel}>BATHROOM</span>
                          <span style={s.miniValue}>{l.bathroom}</span>
                        </div>
                      )}
                      {l.kitchen && (
                        <div style={s.miniDetail}>
                          <span style={s.miniLabel}>KITCHEN</span>
                          <span style={s.miniValue}>{l.kitchen}</span>
                        </div>
                      )}
                      {l.maintenance && (
                        <div style={s.miniDetail}>
                          <span style={s.miniLabel}>MAINTENANCE</span>
                          <span style={s.miniValue}>₹{Number(l.maintenance).toLocaleString()}/mo</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Amenities list on card */}
                  {amenityList.length > 0 && (
                    <div style={s.amenitiesOnCard}>
                      {amenityList
                        .slice(0, expandedAmenities.includes(l.id) ? amenityList.length : 5)
                        .map(a => (
                          <span key={a} style={s.amenityTagCard}>{a}</span>
                        ))
                      }
                      {amenityList.length > 5 && (
                        <span
                          style={{ ...s.amenityTagMore, cursor: 'pointer' }}
                          onClick={() => setExpandedAmenities(prev =>
                            prev.includes(l.id)
                              ? prev.filter(x => x !== l.id)
                              : [...prev, l.id]
                          )}
                        >
                          {expandedAmenities.includes(l.id)
                            ? 'Show less ▲'
                            : `+${amenityList.length - 5} more ▼`}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Description on card */}
                  {l.description && (
                    <div style={s.descriptionOnCard}>
                      {l.description.length > 90
                        ? l.description.slice(0, 90) + '…'
                        : l.description}
                    </div>
                  )}

                  <div style={s.listingStats}>
                    <span style={s.statItem}>👁️ {l.views} views</span>
                    <span style={s.statItem}>💬 {l.inquiries} inquiries</span>
                  </div>

                  {/* Boost locked msg */}
                  {boostState === 'locked' && (
                    <div style={s.boostLockedMsg}>
                      🔒 Boost available after admin verification
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div style={s.listingActions}>
                    <button
                      style={{ ...s.editBtn, ...(isCurrentlyEditing ? s.editBtnActive : {}) }}
                      onClick={() => isCurrentlyEditing ? cancelForm() : handleEditClick(l)}
                    >
                      {isCurrentlyEditing ? '✕ Cancel' : '✏️ Edit'}
                    </button>

                    {(boostState !== 'boosted') && (
                      <div style={{ position: 'relative' }}>
                        <button
                          style={{ ...s.boostBtn,
                            ...(boostState === 'locked'  ? s.boostBtnLocked  : {}),
                            ...(boostState === 'expired' ? s.boostBtnExpired : {}),
                          }}
                          onClick={() => {
                            if (boostState === 'locked') {
                              setBoostTooltip(boostTooltip === l.id ? null : l.id)
                            } else {
                              boostListing(l.id)
                            }
                          }}
                        >
                          {boostState === 'locked'  ? '🔒 Boost' :
                           boostState === 'expired' ? '🔄 Renew Top Pick — ₹49' :
                           '⭐ Top Pick — ₹49'}
                        </button>
                        {boostTooltip === l.id && boostState === 'locked' && (
                          <div style={s.boostTooltip}>
                            ⚠️ You can boost this listing only after admin verification
                            <button style={s.tooltipClose} onClick={() => setBoostTooltip(null)}>✕</button>
                          </div>
                        )}
                      </div>
                    )}

                    <button
                      style={l.isActive === false ? s.activateBtn : s.disableBtn}
                      disabled={togglingId === l.id}
                      onClick={() => handleToggleActive(l)}
                    >
                      {togglingId === l.id
                        ? '⏳...'
                        : l.isActive === false ? '▶️ Activate' : '⏸️ Disable'}
                    </button>
                    <button style={s.deleteBtn} onClick={() => deleteListing(l.id)}>Delete</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Disable Confirmation Modal */}
      {confirmDisable !== null && (
        <div style={s.modalOverlay}>
          <div style={s.confirmModal}>
            <div style={s.confirmIcon}>⏸️</div>
            <h3 style={s.confirmTitle}>Disable This Listing?</h3>
            <p style={s.confirmDesc}>
              This listing will be <strong>hidden from all seekers</strong> immediately.
              You can re-enable it anytime — no data will be lost.
            </p>
            <div style={s.confirmActions}>
              <button style={s.confirmCancelBtn} onClick={() => setConfirmDisable(null)}>Cancel</button>
              <button
                style={s.confirmDisableBtn}
                disabled={togglingId !== null}
                onClick={() => doToggle(confirmDisable, false)}
              >
                {togglingId ? '⏳ Disabling...' : 'Yes, Disable It'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Boost / other payments */}
      {showPayment && (
        <PaymentModal
          feature={paymentFeature}
          price={paymentPrice}
          onSuccess={onPaySuccess}
          onClose={() => setShowPayment(false)}
        />
      )}

      {/* Premium subscription modal */}
      {showPremiumModal && (
        <PremiumPaymentModal
          onClose={() => setShowPremiumModal(false)}
          onSuccess={async () => {
            setShowPremiumModal(false)
            await loadListings()
          }}
        />
      )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getOrdinal(n) {
  if (n === 1) return 'st'
  if (n === 2) return 'nd'
  if (n === 3) return 'rd'
  return 'th'
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  // Handles all formats MySQL2 can return (with dateStrings:true or false):
  //   JS Date object  → use UTC methods
  //   '2026-05-09 14:23:00'  (dateStrings:true, DATETIME with space)
  //   '2026-05-09T14:23:00Z' (ISO with T)
  //   '2026-05-09'           (DATE only)
  let clean
  if (dateStr instanceof Date) {
    const yyyy = dateStr.getUTCFullYear()
    const mm   = String(dateStr.getUTCMonth() + 1).padStart(2, '0')
    const dd   = String(dateStr.getUTCDate()).padStart(2, '0')
    clean = `${yyyy}-${mm}-${dd}`
  } else {
    // Normalise: replace space-separator with T so split works for both
    clean = String(dateStr).replace(' ', 'T').split('T')[0].trim()
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return '—'
  const d = new Date(clean + 'T00:00:00')
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ─── AI Generate Box styles ───────────────────────────────────────────────────
const aiGenBox = {
  wrapper: {
    background: 'linear-gradient(135deg, var(--ai-box-bg) 0%, rgba(99,102,241,0.06) 100%)',
    border: '1.5px solid var(--ai-box-border)',
    borderRadius: '14px',
    padding: '16px 18px',
    marginBottom: '20px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  title: {
    fontSize: '13px',
    fontWeight: '700',
    color: 'var(--accent-purple)',
    marginBottom: '2px',
  },
  sub: {
    fontSize: '11px',
    color: 'var(--text-muted)',
  },
  btn: {
    marginLeft: 'auto',
    background: 'var(--accent-purple)',
    color: 'white',
    border: 'none',
    borderRadius: '10px',
    padding: '10px 18px',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    boxShadow: '0 2px 8px rgba(99,102,241,0.3)',
    transition: 'opacity 0.2s',
  },
  btnDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  error: {
    marginTop: '10px',
    fontSize: '12px',
    color: '#ef4444',
    fontWeight: '500',
  },
  progress: {
    marginTop: '10px',
    height: '3px',
    borderRadius: '99px',
    background: 'var(--border-color)',
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    width: '60%',
    background: 'var(--accent-purple)',
    borderRadius: '99px',
    animation: 'aiSlide 1.4s ease-in-out infinite',
  },
  inlineBtn: {
    background: 'var(--ai-box-bg)',
    color: 'var(--accent-purple)',
    border: '1px solid var(--ai-box-border)',
    borderRadius: '7px',
    padding: '4px 10px',
    fontSize: '11px',
    fontWeight: '700',
    cursor: 'pointer',
  },
}

// Inject keyframe animation for progress bar
if (typeof document !== 'undefined' && !document.getElementById('ai-gen-style')) {
  const style = document.createElement('style')
  style.id = 'ai-gen-style'
  style.textContent = `@keyframes aiSlide { 0%{transform:translateX(-100%)} 100%{transform:translateX(250%)} }`
  document.head.appendChild(style)
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const aiBox = {
  wrapper: { background: 'var(--ai-box-bg)', border: '1.5px solid var(--ai-box-border)', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px' },
  header: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' },
  label: { fontSize: '12px', fontWeight: '700', color: 'var(--accent-purple)' },
  range: { fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' },
  verdict: { fontSize: '12px', fontWeight: '600', padding: '8px 12px', borderRadius: '8px' },
}

const s = {
  page: { minHeight: '100vh', background: 'var(--bg-primary)', fontFamily: "'Segoe UI', sans-serif" },

  topbar: { background: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)', padding: '20px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.5px', margin: 0 },
  sub: { fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px', marginBottom: 0 },
  topbarActions: { display: 'flex', gap: '10px' },
  upgradeBtn: { background: 'var(--tag-yellow-bg)', color: 'var(--tag-yellow-text)', border: '1px solid var(--tag-yellow-border)', borderRadius: '10px', padding: '9px 18px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' },
  addBtn: { background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)', border: 'none', borderRadius: '10px', padding: '10px 20px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' },
  addBtnLocked: { background: '#888', cursor: 'not-allowed' },

  limitBanner: { background: 'var(--tag-yellow-bg)', border: '1px solid var(--tag-yellow-border)', padding: '12px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', color: 'var(--tag-yellow-text)' },
  limitUpgradeBtn: { background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)', border: 'none', borderRadius: '8px', padding: '7px 16px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' },

  content: { padding: '28px 32px' },

  formCard: { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '28px', marginBottom: '24px' },
  formHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
  cardTitle: { fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 },
  editingBadge: { fontSize: '12px', color: 'var(--accent-purple)', background: 'var(--ai-box-bg)', border: '1px solid var(--ai-box-border)', padding: '4px 12px', borderRadius: '20px' },

  sectionDivider: { fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px 14px', marginBottom: '16px', marginTop: '8px' },

  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' },
  grid3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' },

  field: { marginBottom: '16px' },
  label: { display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '7px' },
  fieldHint: { fontSize: '11px', color: 'var(--text-placeholder)', marginTop: '4px', display: 'block' },

  inputPrefix: { display: 'flex', alignItems: 'center', border: '1.5px solid var(--input-border)', borderRadius: '10px', overflow: 'hidden', background: 'var(--input-bg)' },
  prefixSymbol: { padding: '11px 12px', background: 'var(--bg-secondary)', fontSize: '14px', color: 'var(--text-secondary)', borderRight: '1px solid var(--border-color)', fontWeight: '600' },
  inputWithPrefix: { border: 'none', borderRadius: '0', flex: 1 },

  input: { width: '100%', padding: '11px 14px', borderRadius: '10px', border: '1.5px solid var(--input-border)', fontSize: '14px', outline: 'none', boxSizing: 'border-box', color: 'var(--text-primary)', background: 'var(--input-bg)' },
  textarea: { width: '100%', padding: '11px 14px', borderRadius: '10px', border: '1.5px solid var(--input-border)', fontSize: '14px', outline: 'none', boxSizing: 'border-box', resize: 'vertical', color: 'var(--text-primary)', background: 'var(--input-bg)' },

  formActions: { display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' },
  cancelFormBtn: { background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1.5px solid var(--border-color)', borderRadius: '10px', padding: '11px 22px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' },
  submitBtn: { background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)', border: 'none', borderRadius: '10px', padding: '12px 24px', fontSize: '14px', fontWeight: '700', cursor: 'pointer' },

  fieldError: { marginTop: '5px', fontSize: '12px', color: '#ef4444', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '4px' },

  // ✅ APARTMENT FIX: tip box shown when Apartment is selected
  apartmentTip: { background: 'var(--ai-box-bg)', border: '1.5px solid var(--ai-box-border)', borderRadius: '10px', padding: '10px 14px', marginBottom: '16px', fontSize: '12px', color: 'var(--accent-purple)', lineHeight: '1.5' },

  empty: { textAlign: 'center', padding: '80px 20px' },
  emptyIcon: { fontSize: '48px', marginBottom: '16px', opacity: 0.2 },
  emptyTitle: { fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' },
  emptySub: { fontSize: '14px', color: 'var(--text-placeholder)' },

  listingsGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' },
  listingCard: { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px', overflow: 'hidden' },
  listingBoosted: { border: '2px solid #f59e0b', boxShadow: '0 4px 16px rgba(245,158,11,0.15)' },
  listingEditing: { border: '2px solid var(--accent-purple)', boxShadow: '0 4px 16px rgba(83,74,183,0.12)' },
  listingImg: { height: '140px', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' },

  boostBadge:      { position: 'absolute', top: '8px', left: '8px', background: 'linear-gradient(90deg,#f59e0b,#d97706)', color: 'white', fontSize: '11px', fontWeight: '700', padding: '3px 8px', borderRadius: '4px', boxShadow: '0 1px 4px rgba(245,158,11,0.4)' },
  boostExpiry:     { fontSize: '10px', fontWeight: '600', marginTop: '4px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(0,0,0,0.04)', display: 'inline-block' },
  // ✅ APARTMENT FIX: purple badge shown on apartment listing image
  apartmentImgBadge: { position: 'absolute', top: '8px', left: '8px', background: 'var(--accent-purple)', color: 'white', fontSize: '11px', fontWeight: '700', padding: '3px 8px', borderRadius: '4px' },
  editingOverlay: { position: 'absolute', top: '8px', right: '8px', background: 'var(--accent-purple)', color: 'white', fontSize: '11px', fontWeight: '700', padding: '3px 8px', borderRadius: '4px' },

  listingBody: { padding: '16px' },
  listingTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' },
  listingPrice: { fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.5px' },
  perMonth: { fontSize: '12px', fontWeight: '400', color: 'var(--text-placeholder)' },
  depositTag: { fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' },

  verifiedBadge: { fontSize: '11px', fontWeight: '600', padding: '3px 8px', borderRadius: '4px', background: 'var(--tag-green-bg)', color: 'var(--tag-green-text)', border: '1px solid var(--tag-green-border)', whiteSpace: 'nowrap' },
  flaggedBadge:  { fontSize: '11px', fontWeight: '600', padding: '3px 8px', borderRadius: '4px', background: 'var(--tag-red-bg)', color: 'var(--tag-red-text)', border: '1px solid var(--tag-red-border)', whiteSpace: 'nowrap' },
  pendingBadge:  { fontSize: '11px', fontWeight: '600', padding: '3px 8px', borderRadius: '4px', background: 'var(--tag-yellow-bg)', color: 'var(--tag-yellow-text)', border: '1px solid var(--tag-yellow-border)', whiteSpace: 'nowrap' },

  listingTitle:    { fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' },
  listingLocation: { fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' },
  listingMeta:     { display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' },
  tag: { fontSize: '11px', color: 'var(--text-muted)', background: 'var(--bg-secondary)', padding: '2px 7px', borderRadius: '4px', border: '1px solid var(--border-color)' },
  // ✅ APARTMENT FIX: distinct purple badge for Apartment type on card
  apartmentBadge: { fontSize: '11px', color: 'var(--accent-purple)', background: 'var(--ai-box-bg)', padding: '2px 7px', borderRadius: '4px', border: '1px solid var(--ai-box-border)', fontWeight: '600' },

  roomDetailsMini: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px', marginBottom: '10px' },
  miniDetail: { display: 'flex', flexDirection: 'column', gap: '1px' },
  miniLabel:  { fontSize: '9px', color: 'var(--text-placeholder)', fontWeight: '700', letterSpacing: '0.5px' },
  miniValue:  { fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600' },

  amenitiesOnCard: { display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' },
  amenityTagCard:  { fontSize: '10px', color: 'var(--tag-green-text)', background: 'var(--tag-green-bg)', border: '1px solid var(--tag-green-border)', padding: '2px 7px', borderRadius: '10px', fontWeight: '500' },
  amenityTagMore:  { fontSize: '10px', color: 'var(--text-muted)', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', padding: '2px 7px', borderRadius: '10px' },

  descriptionOnCard: { fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.5', marginBottom: '8px', fontStyle: 'italic' },

  listingStats:  { display: 'flex', gap: '14px', marginBottom: '10px' },
  statItem:      { fontSize: '12px', color: 'var(--text-placeholder)' },

  boostLockedMsg: { fontSize: '11px', color: 'var(--tag-yellow-text)', background: 'var(--tag-yellow-bg)', border: '1px solid var(--tag-yellow-border)', borderRadius: '6px', padding: '6px 10px', marginBottom: '10px' },

  listingActions: { display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' },
  editBtn:        { flex: 1, padding: '8px', background: 'var(--ai-box-bg)', color: 'var(--accent-purple)', border: '1px solid var(--ai-box-border)', borderRadius: '8px', fontSize: '11px', fontWeight: '700', cursor: 'pointer' },
  editBtnActive:  { background: 'var(--accent-purple)', color: 'white', borderColor: 'var(--accent-purple)' },
  boostBtn:       { flex: 1, padding: '8px', background: 'var(--tag-yellow-bg)', color: 'var(--tag-yellow-text)', border: '1px solid var(--tag-yellow-border)', borderRadius: '8px', fontSize: '11px', fontWeight: '700', cursor: 'pointer' },
  boostBtnLocked:  { background: 'var(--bg-secondary)', color: 'var(--text-placeholder)', border: '1px solid var(--border-color)', cursor: 'not-allowed' },
  boostBtnExpired: { background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', fontWeight: '800' },
  deleteBtn:      { padding: '8px 14px', background: 'var(--bg-card)', color: 'var(--tag-red-text)', border: '1px solid var(--tag-red-border)', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' },

  boostTooltip: { position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)', background: '#1f2937', color: 'white', fontSize: '11px', padding: '8px 10px', borderRadius: '8px', width: '180px', textAlign: 'center', zIndex: 100, lineHeight: '1.5', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' },
  tooltipClose:  { display: 'block', marginTop: '6px', background: 'none', border: 'none', color: '#9ca3af', fontSize: '11px', cursor: 'pointer', width: '100%', textAlign: 'center' },

  // ── is_active / toggle styles ──────────────────────────────────────────
  listingInactive: { opacity: 0.62, filter: 'grayscale(35%)' },

  activeBadge:  { fontSize: '10px', fontWeight: '700', padding: '2px 7px', borderRadius: '4px', background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0', whiteSpace: 'nowrap' },
  inactiveBadge:{ fontSize: '10px', fontWeight: '700', padding: '2px 7px', borderRadius: '4px', background: '#f3f4f6', color: '#6b7280', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' },

  inactiveOverlay: { position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.52)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', backdropFilter: 'blur(1px)' },
  inactiveOverlayIcon: { fontSize: '22px' },
  inactiveOverlayText: { fontSize: '11px', fontWeight: '700', color: 'white', letterSpacing: '0.3px', textAlign: 'center', padding: '0 8px' },

  activateBtn: { flex: 1, padding: '8px', background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0', borderRadius: '8px', fontSize: '11px', fontWeight: '700', cursor: 'pointer' },
  disableBtn:  { flex: 1, padding: '8px', background: 'var(--bg-secondary)', color: 'var(--text-muted)', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' },

  // ── Disable confirmation modal ──────────────────────────────────────────
  modalOverlay:   { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' },
  confirmModal:   { background: 'var(--bg-card)', borderRadius: '16px', padding: '32px 28px', maxWidth: '400px', width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' },
  confirmIcon:    { fontSize: '40px', marginBottom: '12px' },
  confirmTitle:   { fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '10px', letterSpacing: '-0.3px' },
  confirmDesc:    { fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.6', marginBottom: '24px' },
  confirmActions: { display: 'flex', gap: '10px' },
  confirmCancelBtn:  { flex: 1, padding: '12px', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1.5px solid var(--border-color)', borderRadius: '10px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' },
  confirmDisableBtn: { flex: 1, padding: '12px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', cursor: 'pointer' },

  photoUploadArea:  { display: 'block', cursor: 'pointer' },
  photoUploadInner: { border: '2px dashed var(--border-color)', borderRadius: '12px', padding: '24px', textAlign: 'center', background: 'var(--bg-secondary)' },
  photoUploadText:  { fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginTop: '8px', marginBottom: '4px' },
  photoUploadSub:   { fontSize: '12px', color: 'var(--text-placeholder)' },
  photoGrid:        { display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '12px' },
  photoThumb:       { position: 'relative', width: '80px', height: '80px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-color)' },
  photoImg:         { width: '100%', height: '100%', objectFit: 'cover' },
  photoRemove:      { position: 'absolute', top: '4px', right: '4px', background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)', border: 'none', borderRadius: '50%', width: '18px', height: '18px', fontSize: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },

  amenityGrid:   { display: 'flex', flexWrap: 'wrap', gap: '8px' },
  amenityChip:   { padding: '7px 14px', border: '1.5px solid var(--border-color)', borderRadius: '20px', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: '500', userSelect: 'none', background: 'var(--bg-card)' },
  amenityChipOn: { background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)', borderColor: 'var(--btn-primary-bg)' },
}