import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import LocationSearch from '../components/LocationSearch'

// ── Validation helpers ────────────────────────────────────────────────────────
const noNumbers   = v => /\d/.test(v)
const emailRegex  = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const phoneRegex  = /^\d{10}$/
const MIN_BUDGET  = 500
const MIN_ABOUT   = 150
const MIN_AGE     = 18

// Gibberish / random-typing detector: checks avg word length and variety
function looksLikeGibberish(v) {
  if (!v || v.trim().length < 2) return false
  const words = v.trim().split(/\s+/)
  // If it's a single run of chars with no spaces and > 8 chars, flag it
  if (words.length === 1 && v.trim().length > 8 && !/[a-zA-Z]{2,}/.test(v)) return true
  // Check for keyboard smash: many consecutive consonants
  const consonantRun = /[bcdfghjklmnpqrstvwxyz]{5,}/i
  return words.some(w => consonantRun.test(w))
}

function validateOccupation(v) {
  if (!v || !v.trim()) return 'Occupation is required.'
  if (v.trim().length < 3) return 'Please enter a valid occupation (e.g. Student, Engineer).'
  if (looksLikeGibberish(v)) return 'Please enter a real occupation (e.g. Student, Nurse, Engineer).'
  if (/^[^a-zA-Z]+$/.test(v.trim())) return 'Occupation must contain letters.'
  return ''
}

// ── Seeker validators ─────────────────────────────────────────────────────────
function validateSeekerStep1(d) {
  const e = {}
  if (!d.name.trim())           e.name       = 'Full name is required.'
  else if (noNumbers(d.name))   e.name       = 'Name must not contain numbers.'
  else if (d.name.trim().length < 2) e.name  = 'Name must be at least 2 characters.'

  if (!d.age)                   e.age        = 'Age is required.'
  else if (parseInt(d.age) < MIN_AGE) e.age  = 'You must be 18 or older to register.'
  else if (parseInt(d.age) > 100)     e.age  = 'Please enter a valid age.'

  const occErr = validateOccupation(d.occupation)
  if (occErr) e.occupation = occErr

  if (!d.budget_min)            e.budget_min = 'Minimum budget is required.'
  else if (Number(d.budget_min) < MIN_BUDGET) e.budget_min = `Minimum budget must be at least ₹${MIN_BUDGET}.`

  if (!d.budget_max)            e.budget_max = 'Maximum budget is required.'
  else if (Number(d.budget_max) < MIN_BUDGET) e.budget_max = `Maximum budget must be at least ₹${MIN_BUDGET}.`
  else if (Number(d.budget_max) <= Number(d.budget_min)) e.budget_max = 'Maximum budget must be greater than minimum.'

  if (d.move_in_date) {
    const today = new Date(); today.setHours(0,0,0,0)
    const maxDate = new Date(today); maxDate.setMonth(maxDate.getMonth() + 1)
    const picked = new Date(d.move_in_date)
    if (picked < today)    e.move_in_date = 'Move-in date cannot be in the past.'
    else if (picked > maxDate) e.move_in_date = 'Move-in date must be within the next 1 month.'
  }

  if (!d.location || !d.location.trim()) e.location = 'Please select a preferred location from the map.'

  if (d.phone && !phoneRegex.test(d.phone.replace(/\s/g,''))) e.phone = 'Phone number must be exactly 10 digits.'
  if (d.contactEmail && !emailRegex.test(d.contactEmail))     e.contactEmail = 'Enter a valid email address.'

  if (!d.about || d.about.trim().length < MIN_ABOUT)
    e.about = `About section must be at least ${MIN_ABOUT} characters (currently ${d.about ? d.about.trim().length : 0}).`

  return e
}

// ── Owner validators ──────────────────────────────────────────────────────────
function validateOwnerStep1(d) {
  const e = {}
  if (!d.name.trim())           e.name       = 'Full name is required.'
  else if (noNumbers(d.name))   e.name       = 'Name must not contain numbers.'
  else if (d.name.trim().length < 2) e.name  = 'Name must be at least 2 characters.'

  if (!d.age)                   e.age        = 'Age is required.'
  else if (parseInt(d.age) < MIN_AGE) e.age  = 'You must be 18 or older to register.'
  else if (parseInt(d.age) > 100)     e.age  = 'Please enter a valid age.'

  const occErr = validateOccupation(d.occupation)
  if (occErr) e.occupation = occErr

  if (!d.phone || !phoneRegex.test(d.phone.replace(/\s/g,''))) e.phone = 'Phone number must be exactly 10 digits.'

  if (!d.city || d.city.trim().length < 2) e.city = 'City is required.'

  if (!d.about || d.about.trim().length < MIN_ABOUT)
    e.about = `About section must be at least ${MIN_ABOUT} characters (currently ${d.about ? d.about.trim().length : 0}).`

  return e
}

// ── Owner verification validators ─────────────────────────────────────────────
function validateVerification(d) {
  const e = {}
  if (!d.idType || !d.idType.trim())   e.idType   = 'Please select a Government ID type.'
  if (!d.idNumber || !d.idNumber.trim()) e.idNumber = 'ID number is required.'
  else if (d.idNumber.trim().length < 4) e.idNumber = 'Please enter a valid ID number.'
  if (!d.idUploaded)                   e.idFile   = 'Please upload your ID document.'
  return e
}


function Field({ err, children, style }) {
  return (
    <div style={{ marginBottom: '16px', ...style }}>
      {children}
      {err && <span style={fErr}>⚠ {err}</span>}
    </div>
  )
}
const fErr = { display: 'block', fontSize: '12px', color: '#ef4444', marginTop: '5px', fontWeight: '500' }

// ── Main ProfileSetup page ────────────────────────────────────────────────────
export default function ProfileSetup() {
  const navigate     = useNavigate()
  const currentUser  = JSON.parse(sessionStorage.getItem('currentUser') || '{}')
  const isOwner      = currentUser.role === 'owner'
  const existingProfile = currentUser.profile || {}
  const [step, setStep]   = useState(1)
  const [errors, setErrors]   = useState({})
  const [touched, setTouched] = useState({})

  const [seekerData, setSeekerData] = useState({
    name:          currentUser.name              || '',
    age:           existingProfile.age           || '',
    occupation:    existingProfile.occupation    || '',
    budget_min:    existingProfile.budget_min    || existingProfile.budget || '',
    budget_max:    existingProfile.budget_max    || existingProfile.budget || '',
    move_in_date:  existingProfile.move_in_date  || '',
    location:      existingProfile.preferred_location || existingProfile.location || '',
    latitude:      existingProfile.latitude      || null,
    longitude:     existingProfile.longitude     || null,
    phone:         existingProfile.phone         || '',
    whatsapp:      existingProfile.whatsapp      || '',
    contactEmail:  existingProfile.contact_email || existingProfile.contactEmail || '',
    personality:   existingProfile.personality_type  || existingProfile.personality || 'ambivert',
    sleepSchedule: existingProfile.sleep_schedule    || existingProfile.sleepSchedule || 'flexible',
    food:          existingProfile.food_preference   || existingProfile.food || 'any',
    cleanliness:   existingProfile.cleanliness_level || existingProfile.cleanliness || 'moderate',
    smoking:       existingProfile.smoking       || 'no',
    drinking:      existingProfile.drinking      || 'no',
    pets:          existingProfile.pets          || 'no',
    gender:        existingProfile.gender_preference || existingProfile.gender || 'any',
    guests:        existingProfile.guest_preference  || existingProfile.guests || 'occasionally',
    noise:         existingProfile.noise_tolerance   || existingProfile.noise || 'moderate',
    about:         existingProfile.about         || '',
  })

  const [ownerData, setOwnerData] = useState({
    name:         currentUser.name           || '',
    age:          existingProfile.age        || '',
    occupation:   existingProfile.occupation || '',
    phone:        existingProfile.phone      || '',
    city:         existingProfile.city       || '',
    about:        existingProfile.about      || '',
    idType:       existingProfile.idType     || '',
    idNumber:     existingProfile.idNumber   || '',
    idUploaded:   existingProfile.idUploaded || false,
    idFileName:   existingProfile.idFileName || '',
    idPreviewUrl: null,
  })
  const [verifyChecked, setVerifyChecked] = useState(false)
  const [verifyErrors, setVerifyErrors]   = useState({})
  const [showPreview, setShowPreview]     = useState(false)

  function handleSeekerChange(e) {
    const next = { ...seekerData, [e.target.name]: e.target.value }
    setSeekerData(next)
    if (touched[e.target.name]) {
      const errs = validateSeekerStep1(next)
      setErrors(prev => ({ ...prev, [e.target.name]: errs[e.target.name] || '' }))
    }
  }
  function handleOwnerChange(e) {
    const next = { ...ownerData, [e.target.name]: e.target.value }
    setOwnerData(next)
    if (touched[e.target.name]) {
      const errs = validateOwnerStep1(next)
      setErrors(prev => ({ ...prev, [e.target.name]: errs[e.target.name] || '' }))
    }
  }
  function pickSeeker(name, value) { setSeekerData({ ...seekerData, [name]: value }) }

  function handleBlurSeeker(name) {
    setTouched(prev => ({ ...prev, [name]: true }))
    const errs = validateSeekerStep1(seekerData)
    setErrors(prev => ({ ...prev, [name]: errs[name] || '' }))
  }
  function handleBlurOwner(name) {
    setTouched(prev => ({ ...prev, [name]: true }))
    const errs = validateOwnerStep1(ownerData)
    setErrors(prev => ({ ...prev, [name]: errs[name] || '' }))
  }

  // ── Load profile from DB on mount ──────────────────────────────────────────
  useEffect(() => {
    async function loadProfile() {
      try {
        const { api } = await import('../utils/api')
        const data = await api.getProfile()
        const p = data.profile || {}
        if (!isOwner && Object.keys(p).length > 0) {
          setSeekerData(prev => ({
            ...prev,
            name:          data.name           || prev.name,
            age:           p.age           != null ? String(p.age) : prev.age,
            occupation:    p.occupation    || prev.occupation,
            budget_min:    p.budget_min    != null ? String(p.budget_min) : prev.budget_min,
            budget_max:    p.budget_max    != null ? String(p.budget_max) : prev.budget_max,
            move_in_date:  p.move_in_date  ? p.move_in_date.slice(0, 10) : prev.move_in_date,
            location:      p.preferred_location || prev.location,
            latitude:      p.latitude  ? parseFloat(p.latitude)  : prev.latitude,
            longitude:     p.longitude ? parseFloat(p.longitude) : prev.longitude,
            phone:         p.phone         || prev.phone,
            whatsapp:      p.whatsapp      || prev.whatsapp,
            contactEmail:  p.contact_email || prev.contactEmail,
            personality:   p.personality_type  || prev.personality,
            sleepSchedule: p.sleep_schedule    || prev.sleepSchedule,
            food:          p.food_preference   || prev.food,
            cleanliness:   p.cleanliness_level || prev.cleanliness,
            smoking:       p.smoking  || prev.smoking,
            drinking:      p.drinking || prev.drinking,
            pets:          p.pets     || prev.pets,
            gender:        p.gender_preference  || prev.gender,
            guests:        p.guest_preference   || prev.guests,
            noise:         p.noise_tolerance    || prev.noise,
            about:         p.about    || prev.about,
          }))
        }
        if (isOwner && Object.keys(p).length > 0) {
          setOwnerData(prev => ({
            ...prev,
            name:       data.name        || prev.name,
            age:        p.age        != null ? String(p.age) : prev.age,
            occupation: p.occupation || prev.occupation,
            phone:      p.phone      || prev.phone,
            city:       p.city       || prev.city,
            about:      p.bio        || prev.about,
            idType:     p.id_type    || prev.idType,
            idNumber:   p.id_number  || prev.idNumber,
            idUploaded: !!p.id_document_url || prev.idUploaded,
            isVerified: !!p.is_verified,
          }))
        }
      } catch { /* no profile yet */ }
    }
    loadProfile()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Step 1 → Step 2 navigation with validation ────────────────────────────
  function handleSeekerNext() {
    const errs = validateSeekerStep1(seekerData)
    const allTouched = Object.fromEntries(Object.keys(errs).map(k => [k, true]))
    setTouched(prev => ({ ...prev, ...allTouched }))
    setErrors(errs)
    if (Object.values(errs).some(Boolean)) return
    setStep(2)
  }
  function handleOwnerNext() {
    const errs = validateOwnerStep1(ownerData)
    const allTouched = Object.fromEntries(Object.keys(errs).map(k => [k, true]))
    setTouched(prev => ({ ...prev, ...allTouched }))
    setErrors(errs)
    if (Object.values(errs).some(Boolean)) return
    setStep(2)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    // If owner opted into verification, validate those fields first
    if (isOwner && verifyChecked) {
      const vErrs = validateVerification(ownerData)
      if (Object.values(vErrs).some(Boolean)) {
        setVerifyErrors(vErrs)
        return
      }
    }
    const { api } = await import('../utils/api')
    try {
      if (isOwner) {
        const payload = {
          name:       ownerData.name,
          age:        ownerData.age,
          occupation: ownerData.occupation,
          phone:      ownerData.phone,
          city:       ownerData.city,
          bio:        ownerData.about,
          id_type:    ownerData.idType   || undefined,
          id_number:  ownerData.idNumber || undefined,
        }
        if (ownerData.idFile) payload.id_document = ownerData.idFile
        const result = await api.saveOwnerProfile(payload)
        const updatedUser = {
          ...currentUser,
          name: result.name || ownerData.name || currentUser.name,
          profile: { ...ownerData, ...(result.profile || {}), is_verified: result.is_verified || false },
          profileComplete: true,
        }
        sessionStorage.setItem('currentUser', JSON.stringify(updatedUser))
        navigate('/owner-dashboard')
        return
      } else {
        await api.saveSeekerProfile({
          name:              seekerData.name,
          age:               seekerData.age,
          occupation:        seekerData.occupation,
          budget_min:        seekerData.budget_min,
          budget_max:        seekerData.budget_max,
          move_in_date:      seekerData.move_in_date || null,
          preferred_location: seekerData.location,
          latitude:           seekerData.latitude,
          longitude:          seekerData.longitude,
          phone:             seekerData.phone,
          whatsapp:          seekerData.whatsapp,
          contact_email:     seekerData.contactEmail,
          personality_type:  seekerData.personality,
          sleep_schedule:    seekerData.sleepSchedule,
          food_preference:   seekerData.food,
          cleanliness_level: seekerData.cleanliness,
          smoking:           seekerData.smoking,
          drinking:          seekerData.drinking,
          pets:              seekerData.pets,
          guest_preference:  seekerData.guests,
          noise_tolerance:   seekerData.noise,
          gender_preference: seekerData.gender,
          about:             seekerData.about,
        })
      }
      const updatedUser = { ...currentUser, name: seekerData.name || currentUser.name, profile: seekerData, profileComplete: true }
      sessionStorage.setItem('currentUser', JSON.stringify(updatedUser))
      navigate('/seeker-dashboard')
    } catch (err) {
      console.error('Profile save error:', err)
      const updatedUser = { ...currentUser, name: seekerData.name || currentUser.name, profile: seekerData, profileComplete: true }
      sessionStorage.setItem('currentUser', JSON.stringify(updatedUser))
      navigate('/seeker-dashboard')
    }
  }

  const Opt = ({ name, value, label, emoji }) => {
    const current = seekerData[name]
    return (
      <div onClick={() => pickSeeker(name, value)}
        style={{ ...s.opt, ...(current === value ? s.optOn : {}) }}>
        <span>{emoji}</span><span>{label}</span>
      </div>
    )
  }

  // Input style helper — green border if valid, red if error
  const inp = (name, base = {}) => ({
    ...s.input, ...base,
    ...(touched[name] && errors[name]  ? { borderColor: '#ef4444', background: '#fff8f8' }
      : touched[name] && !errors[name] ? { borderColor: '#10b981', background: '#f0fdf4' }
      : {}),
  })

  const totalSteps = 2
  const progress = Math.round((step / totalSteps) * 100)

  return (
    <div style={s.page}>
      <div style={s.topbar}>
        <div style={s.logo}>
          <div style={s.logoBox}>R</div>
          <span style={s.logoName}>RentMate</span>
          <span style={s.logoAI}> AI</span>
        </div>
        <button style={s.backBtn} onClick={() => navigate(isOwner ? '/owner-dashboard' : '/seeker-dashboard')}>← Back</button>
      </div>

      <div style={s.hero}>
        <div style={s.roleTag}>{isOwner ? '🏠 Room Owner' : '🙋 Room Seeker'}</div>
        <h2 style={s.heroTitle}>{existingProfile.age ? 'Edit Your Profile' : 'Complete Your Profile'}</h2>
        <p style={s.heroSub}>Help our AI find your perfect match, {currentUser.name}!</p>
        <div style={s.progressWrap}>
          <div style={s.progressBar}><div style={{ ...s.progressFill, width: `${progress}%` }} /></div>
          <span style={s.stepLabel}>Step {step} of {totalSteps}</span>
        </div>
      </div>

      <div style={s.body}>
        <form onSubmit={handleSubmit} noValidate>

          {/* ════════════════ SEEKER STEP 1 ════════════════ */}
          {!isOwner && step === 1 && (
            <div style={s.card}>
              <h3 style={s.cardTitle}>📋 Basic Information</h3>
              <div style={s.grid2}>

                {/* Full Name — full width */}
                <Field err={errors.name} style={{ gridColumn: '1 / -1' }}>
                  <label style={s.label}>Full Name <span style={s.req}>*</span></label>
                  <input style={inp('name')} type="text" name="name"
                    placeholder="Your full name (letters only)"
                    value={seekerData.name} onChange={handleSeekerChange}
                    onBlur={() => handleBlurSeeker('name')} />
                </Field>

                {/* Age */}
                <Field err={errors.age}>
                  <label style={s.label}>Age <span style={s.req}>*</span></label>
                  <input style={inp('age')} type="number" name="age"
                    placeholder="Must be 18 or above"
                    min="18" max="100"
                    value={seekerData.age} onChange={handleSeekerChange}
                    onBlur={() => handleBlurSeeker('age')} />
                </Field>

                {/* Occupation */}
                <Field err={errors.occupation}>
                  <label style={s.label}>Occupation <span style={s.req}>*</span></label>
                  <input style={inp('occupation')} type="text" name="occupation"
                    placeholder="e.g. Student, Software Engineer…"
                    value={seekerData.occupation} onChange={handleSeekerChange}
                    onBlur={() => handleBlurSeeker('occupation')} />
                </Field>

                {/* Budget min */}
                <Field err={errors.budget_min}>
                  <label style={s.label}>Minimum Budget (₹/month) <span style={s.req}>*</span></label>
                  <input style={inp('budget_min')} type="number" name="budget_min"
                    placeholder="e.g. 5000 (min ₹500)"
                    min="500"
                    value={seekerData.budget_min} onChange={handleSeekerChange}
                    onBlur={() => handleBlurSeeker('budget_min')} />
                </Field>

                {/* Budget max */}
                <Field err={errors.budget_max}>
                  <label style={s.label}>Maximum Budget (₹/month) <span style={s.req}>*</span></label>
                  <input style={inp('budget_max')} type="number" name="budget_max"
                    placeholder="e.g. 15000 (must exceed min)"
                    min="500"
                    value={seekerData.budget_max} onChange={handleSeekerChange}
                    onBlur={() => handleBlurSeeker('budget_max')} />
                </Field>

                {/* Move-in date */}
                <Field err={errors.move_in_date}>
                  <label style={s.label}>Preferred Move-in Date</label>
                  <input style={inp('move_in_date')} type="date" name="move_in_date"
                    min={new Date().toISOString().slice(0, 10)}
                    max={(() => { const d = new Date(); d.setMonth(d.getMonth() + 1); return d.toISOString().slice(0, 10) })()}
                    value={seekerData.move_in_date} onChange={handleSeekerChange}
                    onBlur={() => handleBlurSeeker('move_in_date')} />
                  <span style={s.hint}>Must be today or within the next 1 month — leave blank if flexible</span>
                </Field>

              </div>

              {/* Location with Leaflet map */}
              <Field err={errors.location} style={{ marginTop: '4px' }}>
                <label style={s.label}>Preferred Location <span style={s.req}>*</span></label>
                <LocationSearch
                  value={seekerData.location}
                  onChange={(val) => {
                    setSeekerData(prev => ({ ...prev, location: val, latitude: null, longitude: null }))
                    setTouched(prev => ({ ...prev, location: true }))
                    setErrors(prev => ({
                      ...prev,
                      location: val.trim() ? '' : 'Please select a preferred location from the map.',
                    }))
                  }}
                  placeholder="Search area in Kerala…"
                />
                <span style={s.hint}>Type to search and pick from the map</span>
              </Field>

              {/* Contact Info */}
              <div style={s.sectionDivider}>
                <span style={s.sectionLabel}>📞 Contact Information</span>
              </div>
              <div style={s.privacyNote}>
                🔒 Your WhatsApp number and contact email are <strong>private</strong> — only shared after a match request is accepted.
              </div>
              <div style={s.grid2}>

                <Field err={errors.phone}>
                  <label style={s.label}>Phone Number</label>
                  <input style={inp('phone')} type="tel" name="phone"
                    placeholder="10-digit number (e.g. 9876543210)"
                    maxLength={10}
                    value={seekerData.phone} onChange={handleSeekerChange}
                    onBlur={() => handleBlurSeeker('phone')} />
                </Field>

                <Field err={errors.whatsapp}>
                  <label style={s.label}>WhatsApp Number <span style={s.privateBadge}>🔒 Private</span></label>
                  <div style={{ position: 'relative' }}>
                    <span style={s.waIcon}>💬</span>
                    <input style={{ ...inp('whatsapp'), paddingLeft: '34px' }}
                      type="tel" name="whatsapp"
                      placeholder="Same as phone or different"
                      maxLength={10}
                      value={seekerData.whatsapp} onChange={handleSeekerChange}
                      onBlur={() => handleBlurSeeker('whatsapp')} />
                  </div>
                  <span style={s.hint}>Only revealed after contact request is accepted</span>
                </Field>

                <Field err={errors.contactEmail} style={{ gridColumn: '1 / -1' }}>
                  <label style={s.label}>Contact Email <span style={s.privateBadge}>🔒 Private</span></label>
                  <input style={inp('contactEmail')} type="email" name="contactEmail"
                    placeholder="Visible only after matching"
                    value={seekerData.contactEmail} onChange={handleSeekerChange}
                    onBlur={() => handleBlurSeeker('contactEmail')} />
                  <span style={s.hint}>Only revealed to accepted roommate matches</span>
                </Field>

              </div>

              {/* About you */}
              <Field err={errors.about}>
                <label style={s.label}>
                  About You <span style={s.req}>*</span>
                  <span style={{ ...s.charCount, color: (seekerData.about || '').length >= MIN_ABOUT ? '#10b981' : '#aaa' }}>
                    {(seekerData.about || '').length} / {MIN_ABOUT}+ chars
                  </span>
                </label>
                <textarea style={{ ...inp('about'), ...s.textarea }}
                  name="about"
                  placeholder={`Tell potential roommates about yourself — at least ${MIN_ABOUT} characters…`}
                  value={seekerData.about} onChange={handleSeekerChange}
                  onBlur={() => handleBlurSeeker('about')}
                  rows={4} />
              </Field>

              <button type="button" style={s.btn} onClick={handleSeekerNext}>Next → Lifestyle Preferences</button>
            </div>
          )}

          {/* ════════════════ SEEKER STEP 2 ════════════════ */}
          {!isOwner && step === 2 && (
            <div style={s.card}>
              <h3 style={s.cardTitle}>🌿 Lifestyle Preferences</h3>
              {[
                { label: '🧠 Personality Type', name: 'personality',
                  opts: [['introvert','🤫','Introvert'],['extrovert','🎉','Extrovert'],['ambivert','😊','Ambivert']] },
                { label: '🌙 Sleep Schedule', name: 'sleepSchedule',
                  opts: [['early','🌅','Early Bird'],['night owl','🦉','Night Owl'],['flexible','😴','Flexible Schedule']] },
                { label: '🍽️ Food Preference', name: 'food',
                  opts: [['veg','🥗','Vegetarian'],['non-veg','🍗','Non-Vegetarian'],['any','🍱','Any Food']] },
                { label: '✨ Cleanliness Level', name: 'cleanliness',
                  opts: [['very clean','🧹','Very Clean'],['moderate','🙂','Moderate'],['relaxed','😌','Relaxed']] },
                { label: '🚬 Smoking', name: 'smoking',
                  opts: [['no','🚭','Non-Smoker'],['yes','🚬','Smoker'],['okay','🤷','Okay with It']] },
                { label: '🍺 Drinking', name: 'drinking',
                  opts: [['no','🚫','Non-Drinker'],['yes','🍺','Drinker'],['okay','🤷','Okay with It']] },
                { label: '🐾 Pets', name: 'pets',
                  opts: [['no','🚫','No Pets'],['yes','🐶','Have Pets'],['okay','❤️','Okay with Pets']] },
                { label: '👥 Friends / Guests', name: 'guests',
                  opts: [['not allowed','🚫','Not Allowed'],['occasionally','👥','Occasionally'],['frequently','🎉','Frequently']] },
                { label: '🔊 Noise Tolerance', name: 'noise',
                  opts: [['quiet','🔇','Quiet Only'],['moderate','🔉','Moderate Noise'],['loud','🔊','Loud is OK']] },
                { label: '👤 Preferred Roommate Gender', name: 'gender',
                  opts: [['male','👨','Male Only'],['female','👩','Female Only'],['any','🤝','Any Gender']] },
              ].map(({ label, name, opts }) => (
                <div key={name} style={{ marginBottom: '16px' }}>
                  <label style={s.label}>{label}</label>
                  <div style={s.optRow}>
                    {opts.map(([v, e, l]) => <Opt key={v} name={name} value={v} label={l} emoji={e} />)}
                  </div>
                </div>
              ))}
              <div style={s.btnRow}>
                <button type="button" style={s.btnOutline} onClick={() => setStep(1)}>← Back</button>
                <button type="submit" style={s.btn}>Save & Continue →</button>
              </div>
            </div>
          )}

          {/* ════════════════ OWNER STEP 1 ════════════════ */}
          {isOwner && step === 1 && (
            <div style={s.card}>
              <h3 style={s.cardTitle}>👤 Personal Details</h3>

              <Field err={errors.name}>
                <label style={s.label}>Full Name <span style={s.req}>*</span></label>
                <input style={inp('name')} type="text" name="name"
                  placeholder="Your full name (letters only)"
                  value={ownerData.name || ''} onChange={handleOwnerChange}
                  onBlur={() => handleBlurOwner('name')} />
              </Field>

              <div style={s.grid2}>
                <Field err={errors.age}>
                  <label style={s.label}>Age <span style={s.req}>*</span></label>
                  <input style={inp('age')} type="number" name="age"
                    placeholder="Must be 18 or above"
                    min="18" max="100"
                    value={ownerData.age || ''} onChange={handleOwnerChange}
                    onBlur={() => handleBlurOwner('age')} />
                </Field>

                <Field err={errors.occupation}>
                  <label style={s.label}>Occupation <span style={s.req}>*</span></label>
                  <input style={inp('occupation')} type="text" name="occupation"
                    placeholder="e.g. Business Owner, Landlord…"
                    value={ownerData.occupation || ''} onChange={handleOwnerChange}
                    onBlur={() => handleBlurOwner('occupation')} />
                </Field>

                <Field err={errors.phone}>
                  <label style={s.label}>Phone Number <span style={s.req}>*</span></label>
                  <input style={inp('phone')} type="tel" name="phone"
                    placeholder="10-digit number (e.g. 9876543210)"
                    maxLength={10}
                    value={ownerData.phone || ''} onChange={handleOwnerChange}
                    onBlur={() => handleBlurOwner('phone')} />
                </Field>

                <Field err={errors.city}>
                  <label style={s.label}>City <span style={s.req}>*</span></label>
                  <input style={inp('city')} type="text" name="city"
                    placeholder="e.g. Kochi, Kerala"
                    value={ownerData.city || ''} onChange={handleOwnerChange}
                    onBlur={() => handleBlurOwner('city')} />
                </Field>
              </div>

              <Field err={errors.about}>
                <label style={s.label}>
                  About You (as a landlord) <span style={s.req}>*</span>
                  <span style={{ ...s.charCount, color: (ownerData.about || '').length >= MIN_ABOUT ? '#10b981' : '#aaa' }}>
                    {(ownerData.about || '').length} / {MIN_ABOUT}+ chars
                  </span>
                </label>
                <textarea style={{ ...inp('about'), ...s.textarea }}
                  name="about"
                  placeholder={`Tell potential tenants about yourself — at least ${MIN_ABOUT} characters…`}
                  value={ownerData.about || ''} onChange={handleOwnerChange}
                  onBlur={() => handleBlurOwner('about')}
                  rows={4} />
              </Field>

              <button type="button" style={s.btn} onClick={handleOwnerNext}>Next → Verification (Optional)</button>
            </div>
          )}

          {/* ════════════════ OWNER STEP 2 ════════════════ */}
          {isOwner && step === 2 && (
            <div style={s.card}>
              <h3 style={s.cardTitle}>✅ Owner Verification (Optional)</h3>
              <p style={s.verifyDesc}>Verified owners get a badge that builds trust with seekers and increases inquiries.</p>

              {/* ── Opt-in toggle ── */}
              <div style={s.verifyToggleRow} onClick={() => { setVerifyChecked(v => !v); setVerifyErrors({}) }}>
                <div style={{ ...s.checkbox, ...(verifyChecked ? s.checkboxOn : {}) }}>
                  {verifyChecked && <span style={s.checkmark}>✓</span>}
                </div>
                <div>
                  <div style={s.toggleLabel}>I want to get verified as an owner</div>
                  <div style={s.toggleSub}>Checking this requires you to submit valid government ID proof</div>
                </div>
              </div>

              {verifyChecked && (
                <>
                  <div style={s.verifyBadgePreview}>
                    <span style={s.verifyIcon}>✅</span>
                    <div>
                      <div style={s.verifyBadgeTitle}>Verified Owner</div>
                      <div style={s.verifyBadgeSub}>This badge will appear on your profile and listings</div>
                    </div>
                  </div>

                  {/* Gov ID Type — required when opted in */}
                  <div style={{ marginBottom: '16px' }}>
                    <label style={s.label}>Government ID Type <span style={s.req}>*</span></label>
                    <select
                      style={{ ...s.input, ...(verifyErrors.idType ? { borderColor: '#ef4444', background: '#fff8f8' } : ownerData.idType ? { borderColor: '#10b981', background: '#f0fdf4' } : {}) }}
                      name="idType"
                      value={ownerData.idType || ''}
                      onChange={e => { handleOwnerChange(e); setVerifyErrors(prev => ({ ...prev, idType: '' })) }}
                    >
                      <option value="">Select ID type…</option>
                      {['Aadhaar Card', 'PAN Card', 'Voter ID', 'Passport', 'Driving License'].map(t => <option key={t}>{t}</option>)}
                    </select>
                    {verifyErrors.idType && <span style={fErr}>⚠ {verifyErrors.idType}</span>}
                  </div>

                  {/* ID Number — required when opted in */}
                  <div style={{ marginBottom: '16px' }}>
                    <label style={s.label}>ID Number <span style={s.req}>*</span></label>
                    <input
                      style={{ ...s.input, ...(verifyErrors.idNumber ? { borderColor: '#ef4444', background: '#fff8f8' } : ownerData.idNumber ? { borderColor: '#10b981', background: '#f0fdf4' } : {}) }}
                      type="text"
                      name="idNumber"
                      placeholder="Enter your ID number"
                      value={ownerData.idNumber || ''}
                      onChange={e => { handleOwnerChange(e); setVerifyErrors(prev => ({ ...prev, idNumber: '' })) }}
                    />
                    {verifyErrors.idNumber && <span style={fErr}>⚠ {verifyErrors.idNumber}</span>}
                  </div>

                  {/* ID Document — required when opted in */}
                  <div style={{ ...s.uploadBox, ...(verifyErrors.idFile ? { borderColor: '#ef4444' } : ownerData.idUploaded ? { borderColor: '#10b981', background: '#f0fdf4' } : {}) }}>
                    <div style={s.uploadIcon}>📎</div>
                    <div style={s.uploadTitle}>Upload ID Document <span style={s.req}>*</span></div>
                    <div style={s.uploadSub}>JPG, PNG or PDF · Max 5MB</div>
                    <label style={s.uploadBtn}>
                      {ownerData.idUploaded ? 'Replace File' : 'Choose File'}
                      <input type="file" accept=".jpg,.jpeg,.png,.pdf" style={{ display: 'none' }} onChange={e => {
                        const file = e.target.files[0]
                        if (file) {
                          if (ownerData.idPreviewUrl) URL.revokeObjectURL(ownerData.idPreviewUrl)
                          const previewUrl = URL.createObjectURL(file)
                          setOwnerData(prev => ({ ...prev, idUploaded: true, idFileName: file.name, idFile: file, idPreviewUrl: previewUrl }))
                          setVerifyErrors(prev => ({ ...prev, idFile: '' }))
                        }
                      }} />
                    </label>
                    {ownerData.idUploaded && (
                      <div style={s.uploadedRow}>
                        <span style={s.uploadedFile}>✓ {ownerData.idFileName}</span>
                        <button
                          type="button"
                          style={s.viewBtn}
                          onClick={() => ownerData.idPreviewUrl && setShowPreview(true)}
                        >
                          👁 View
                        </button>
                      </div>
                    )}
                    {verifyErrors.idFile && <span style={{ ...fErr, display: 'block', marginTop: '8px' }}>⚠ {verifyErrors.idFile}</span>}
                  </div>

                  <div style={s.verifyNote}>
                    Uploading ID marks your account as "Verified Owner". All documents are kept secure and private.
                  </div>
                </>
              )}

              <div style={s.btnRow}>
                <button type="button" style={s.btnOutline} onClick={() => setStep(1)}>← Back</button>
                <button type="submit" style={s.btn}>
                  {verifyChecked ? 'Save & Get Verified →' : 'Skip & Go to Dashboard →'}
                </button>
              </div>
            </div>
          )}

        </form>
      </div>

      {/* ── ID Document Preview Modal ── */}
      {showPreview && ownerData.idPreviewUrl && (
        <div style={s.modalOverlay} onClick={() => setShowPreview(false)}>
          <div style={s.modalBox} onClick={e => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <span style={s.modalTitle}>📄 {ownerData.idFileName}</span>
              <button style={s.modalClose} onClick={() => setShowPreview(false)}>✕</button>
            </div>
            {ownerData.idFileName?.toLowerCase().endsWith('.pdf') ? (
              <iframe
                src={ownerData.idPreviewUrl}
                style={s.modalIframe}
                title="ID Document Preview"
              />
            ) : (
              <div style={s.modalImgWrap}>
                <img src={ownerData.idPreviewUrl} alt="ID Document" style={s.modalImg} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const s = {
  page:     { minHeight: '100vh', background: '#fafafa', fontFamily: "'Segoe UI', sans-serif" },
  topbar:   { background: '#fff', borderBottom: '1px solid #f0f0f0', padding: '0 32px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  logo:     { display: 'flex', alignItems: 'center', gap: '10px' },
  logoBox:  { width: '30px', height: '30px', background: '#111', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '14px', fontWeight: '800' },
  logoName: { fontSize: '16px', fontWeight: '800', color: '#111', letterSpacing: '-0.5px' },
  logoAI:   { fontSize: '16px', fontWeight: '300', color: '#888' },
  backBtn:  { background: 'none', border: '1.5px solid #e5e7eb', borderRadius: '8px', padding: '7px 16px', fontSize: '13px', color: '#555', cursor: 'pointer', fontWeight: '500' },
  hero:     { background: '#0a0a0a', padding: '36px 32px 28px', textAlign: 'center' },
  roleTag:  { display: 'inline-block', background: '#222', border: '1px solid #333', color: '#aaa', fontSize: '12px', fontWeight: '600', padding: '4px 14px', borderRadius: '20px', marginBottom: '14px' },
  heroTitle:{ fontSize: '26px', fontWeight: '800', color: 'white', marginBottom: '6px', letterSpacing: '-0.5px' },
  heroSub:  { fontSize: '14px', color: '#888', marginBottom: '20px' },
  progressWrap: { display: 'flex', alignItems: 'center', gap: '14px', justifyContent: 'center' },
  progressBar:  { width: '280px', height: '3px', background: '#333', borderRadius: '2px' },
  progressFill: { height: '3px', background: 'white', borderRadius: '2px', transition: 'width 0.3s' },
  stepLabel:    { fontSize: '12px', color: '#666' },
  body:         { maxWidth: '680px', margin: '0 auto', padding: '28px 20px' },
  card:         { background: 'white', borderRadius: '16px', padding: '28px', border: '1px solid #f0f0f0' },
  cardTitle:    { fontSize: '16px', fontWeight: '700', color: '#111', marginBottom: '20px', letterSpacing: '-0.3px' },
  grid2:        { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' },
  label:        { display: 'block', fontSize: '13px', fontWeight: '600', color: '#111', marginBottom: '7px' },
  req:          { color: '#ef4444', marginLeft: '2px' },
  charCount:    { fontSize: '11px', fontWeight: '500', marginLeft: '8px' },
  input:        { width: '100%', padding: '11px 14px', borderRadius: '10px', border: '1.5px solid #e5e7eb', fontSize: '14px', outline: 'none', boxSizing: 'border-box', color: '#111', background: 'white', transition: 'border-color 0.2s' },
  textarea:     { width: '100%', padding: '11px 14px', borderRadius: '10px', border: '1.5px solid #e5e7eb', fontSize: '14px', outline: 'none', boxSizing: 'border-box', resize: 'vertical', color: '#111', background: 'white' },
  optRow:       { display: 'flex', gap: '10px', flexWrap: 'wrap' },
  opt:          { display: 'flex', alignItems: 'center', gap: '7px', padding: '9px 16px', borderRadius: '10px', border: '1.5px solid #e5e7eb', background: 'white', cursor: 'pointer', fontSize: '13px', fontWeight: '500', color: '#555' },
  optOn:        { border: '1.5px solid #111', background: '#f5f5f5', color: '#111', fontWeight: '700' },
  btn:          { flex: 1, width: '100%', padding: '13px', background: '#111', color: 'white', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', marginTop: '8px' },
  btnOutline:   { flex: 1, padding: '13px', background: 'white', color: '#111', border: '1.5px solid #e5e7eb', borderRadius: '10px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' },
  btnRow:       { display: 'flex', gap: '12px', marginTop: '8px' },
  hint:         { display: 'block', fontSize: '11px', color: '#aaa', marginTop: '5px' },
  sectionDivider: { display: 'flex', alignItems: 'center', gap: '12px', margin: '8px 0 10px', borderTop: '1px solid #f0f0f0', paddingTop: '16px' },
  sectionLabel:   { fontSize: '13px', fontWeight: '700', color: '#555', whiteSpace: 'nowrap' },
  waIcon:       { position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px', pointerEvents: 'none' },
  privateBadge: { fontSize: '11px', fontWeight: '500', color: '#6b7280', background: '#f3f4f6', padding: '2px 8px', borderRadius: '20px', marginLeft: '6px' },
  privacyNote:  { background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '10px 14px', fontSize: '12px', color: '#166534', marginBottom: '16px', lineHeight: '1.6' },
  verifyDesc:         { fontSize: '13px', color: '#555', marginBottom: '16px', lineHeight: '1.6' },
  verifyBadgePreview: { background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' },
  verifyIcon:         { fontSize: '28px' },
  verifyBadgeTitle:   { fontSize: '14px', fontWeight: '700', color: '#166534', marginBottom: '3px' },
  verifyBadgeSub:     { fontSize: '12px', color: '#888' },
  uploadBox:          { background: '#fafafa', border: '2px dashed #e5e7eb', borderRadius: '12px', padding: '24px', textAlign: 'center', marginBottom: '14px' },
  uploadIcon:         { fontSize: '28px', marginBottom: '8px' },
  uploadTitle:        { fontSize: '14px', fontWeight: '600', color: '#111', marginBottom: '4px' },
  uploadSub:          { fontSize: '12px', color: '#aaa', marginBottom: '12px' },
  uploadBtn:          { display: 'inline-block', padding: '8px 20px', background: '#111', color: 'white', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' },
  uploadedFile:       { fontSize: '12px', color: '#10b981', fontWeight: '600' },
  uploadedRow:        { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginTop: '8px' },
  viewBtn:            { padding: '4px 14px', background: 'white', border: '1.5px solid #10b981', borderRadius: '6px', color: '#10b981', fontSize: '12px', fontWeight: '600', cursor: 'pointer' },
  verifyNote:         { fontSize: '12px', color: '#aaa', lineHeight: '1.6', marginBottom: '8px' },
  verifyToggleRow:    { display: 'flex', alignItems: 'flex-start', gap: '12px', background: '#f9fafb', border: '1.5px solid #e5e7eb', borderRadius: '12px', padding: '14px 16px', marginBottom: '20px', cursor: 'pointer', userSelect: 'none' },
  checkbox:           { width: '20px', height: '20px', minWidth: '20px', border: '2px solid #d1d5db', borderRadius: '5px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '1px', transition: 'all 0.2s' },
  checkboxOn:         { background: '#111', borderColor: '#111' },
  checkmark:          { color: 'white', fontSize: '12px', fontWeight: '900', lineHeight: 1 },
  toggleLabel:        { fontSize: '13px', fontWeight: '700', color: '#111', marginBottom: '2px' },
  toggleSub:          { fontSize: '12px', color: '#888' },
  modalOverlay:       { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' },
  modalBox:           { background: 'white', borderRadius: '16px', width: '100%', maxWidth: '620px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.4)' },
  modalHeader:        { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #f0f0f0' },
  modalTitle:         { fontSize: '13px', fontWeight: '700', color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80%' },
  modalClose:         { background: '#f3f4f6', border: 'none', borderRadius: '8px', width: '30px', height: '30px', fontSize: '14px', cursor: 'pointer', color: '#555', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  modalImgWrap:       { overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', background: '#f9fafb', flex: 1 },
  modalImg:           { maxWidth: '100%', maxHeight: '65vh', objectFit: 'contain', borderRadius: '8px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' },
  modalIframe:        { width: '100%', height: '65vh', border: 'none' },
}