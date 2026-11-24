import { useState, useEffect, useRef } from 'react'
import { api } from '../utils/api'
import CompatibilityBreakdown from '../components/CompatibilityBreakdown'

// ─── Distance helpers ─────────────────────────────────────────────────────────
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

// ─── Geocode cache ────────────────────────────────────────────────────────────
const _geocodeCache = {}
async function geocodeLocation(query) {
  if (!query || !query.trim()) return null
  const raw = query.trim()
  const key = raw.toLowerCase()
  if (_geocodeCache[key] !== undefined) return _geocodeCache[key]
  const isVague = raw.length <= 4 || /^[A-Z][a-z]{0,3}$/.test(raw)
  const searchQuery = isVague ? `${raw}, Kerala, India` : raw
  try {
    const url = new URL('https://nominatim.openstreetmap.org/search')
    url.searchParams.set('q', searchQuery)
    url.searchParams.set('format', 'json')
    url.searchParams.set('limit', '1')
    url.searchParams.set('countrycodes', 'in')
    const res  = await fetch(url.toString(), { headers: { 'Accept-Language': 'en' } })
    const data = await res.json()
    if (data[0]) {
      const lat = parseFloat(data[0].lat)
      const lng = parseFloat(data[0].lon)
      if (lat >= 8.0 && lat <= 13.0 && lng >= 74.0 && lng <= 78.0) {
        _geocodeCache[key] = { lat, lng }
        return _geocodeCache[key]
      }
    }
    _geocodeCache[key] = null
    return null
  } catch {
    _geocodeCache[key] = null
    return null
  }
}

// ─── Human-readable label maps ────────────────────────────────────────────────
const LABEL = {
  personality: {
    introvert: 'Introvert', extrovert: 'Extrovert', ambivert: 'Ambivert',
  },
  sleep: {
    early: 'Early Bird', 'night owl': 'Night Owl', flexible: 'Flexible Schedule',
  },
  food: {
    veg: 'Vegetarian', 'non-veg': 'Non-Vegetarian', any: 'Any Food',
  },
  cleanliness: {
    'very clean': 'Very Clean', moderate: 'Moderate', relaxed: 'Relaxed',
  },
  smoking: {
    no: 'Non-Smoker', yes: 'Smoker', okay: 'Smoking OK',
  },
  drinking: {
    no: 'Non-Drinker', yes: 'Drinker', okay: 'Drinking OK',
  },
  pets: {
    no: 'No Pets', yes: 'Has Pets', okay: 'Pets OK',
  },
  noise: {
    quiet: 'Quiet Only', moderate: 'Moderate Noise', loud: 'Loud is OK',
  },
  guests: {
    'not allowed': 'No Guests', occasionally: 'Occasional Guests',
    frequently: 'Frequent Guests', sometimes: 'Sometimes', rarely: 'Rarely', often: 'Often',
  },
  gender: {
    male: 'Male Only', female: 'Female Only', any: 'Any Gender',
  },
}

function label(map, raw) {
  if (!raw) return '—'
  const key = String(raw).toLowerCase().trim()
  return LABEL[map]?.[key] || raw.charAt(0).toUpperCase() + raw.slice(1)
}

function toStr(v) {
  if (v === true  || v === 1 || v === '1') return 'yes'
  if (v === false || v === 0 || v === '0') return 'no'
  return String(v || 'no').toLowerCase()
}

function getDisplayPrefs(p) {
  return {
    personality:    label('personality', p.personality_type),
    sleepSchedule:  label('sleep',       p.sleep_schedule),
    food:           label('food',        p.food_preference || p.food_pref),
    cleanliness:    label('cleanliness', p.cleanliness_level),
    smoking:        label('smoking',     toStr(p.smoking)),
    drinking:       label('drinking',    toStr(p.drinking)),
    pets:           label('pets',        toStr(p.pets)),
    noise:          label('noise',       p.noise_tolerance),
    guests:         label('guests',      p.guest_preference),
    gender:         label('gender',      p.gender_preference || p.gender_pref),
  }
}

// ─── PERSONALITY_OPTIONS (used in "My Preferences" panel) ────────────────────
const PERSONALITY_OPTIONS = [
  { name: 'personality_type',  label: 'Personality',   opts: [['introvert','🤫','Introvert'],    ['extrovert','🎉','Extrovert'],  ['ambivert','😊','Ambivert']] },
  { name: 'sleep_schedule',    label: 'Sleep',          opts: [['early','🌅','Early Bird'],       ['night owl','🦉','Night Owl'],  ['flexible','😴','Flexible']] },
  { name: 'cleanliness_level', label: 'Cleanliness',    opts: [['very clean','🧹','Very Clean'],  ['moderate','🙂','Moderate'],    ['relaxed','😌','Relaxed']] },
  { name: 'food_preference',   label: 'Food',           opts: [['veg','🥗','Vegetarian'],         ['non-veg','🍗','Non-Veg'],      ['any','🍱','Any']] },
  { name: 'smoking',           label: 'Smoking',        opts: [['no','🚭','Non-Smoker'],          ['yes','🚬','Smoker'],           ['okay','🤷','Okay']] },
  { name: 'drinking',          label: 'Drinking',       opts: [['no','🚫','Non-Drinker'],         ['yes','🍺','Drinker'],          ['okay','🤷','Okay']] },
  { name: 'noise_tolerance',   label: 'Noise',          opts: [['quiet','🔇','Quiet'],            ['moderate','🔉','Moderate'],    ['loud','🔊','Loud OK']] },
  { name: 'guest_preference',  label: 'Guests',         opts: [['rarely','🚪','Rarely'],          ['sometimes','👥','Sometimes'],  ['often','🎉','Often']] },
]

// ─── WhatsApp request button component ───────────────────────────────────────
function WhatsAppRequestButton({ targetUserId }) {
  const [status,  setStatus]  = useState('loading') // loading | none | pending | accepted | rejected
  const [number,  setNumber]  = useState(null)
  const [sending, setSending] = useState(false)
  const token = sessionStorage.getItem('token')

  async function fetchStatus() {
    try {
      const res  = await fetch(`http://localhost:5000/api/whatsapp-requests/status/${targetUserId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      setStatus(data.status || 'none')
      if (data.status === 'accepted') fetchNumber()
    } catch {
      setStatus('none')
    }
  }

  async function fetchNumber() {
    try {
      const res  = await fetch(`http://localhost:5000/api/whatsapp-requests/number/${targetUserId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.number) setNumber(data.number)
    } catch { /* ignore */ }
  }

  async function sendRequest() {
    setSending(true)
    try {
      const res = await fetch(`http://localhost:5000/api/whatsapp-requests/request/${targetUserId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'I would like to connect with you as a potential roommate.' }),
      })
      const data = await res.json()
      if (data.success) setStatus('pending')
      else alert(data.error || 'Failed to send request')
    } catch {
      alert('Network error. Please try again.')
    } finally {
      setSending(false)
    }
  }

  useEffect(() => { fetchStatus() }, [targetUserId])

  if (status === 'loading') {
    return <div style={waBtnStyle('#f5f5f5', '#888')}>⏳ Checking status…</div>
  }
  if (status === 'accepted' && number) {
    return (
      <a
        href={`https://wa.me/91${number.replace(/\D/g, '')}`}
        target="_blank"
        rel="noopener noreferrer"
        style={{ ...waBtnStyle('#25d366', 'white'), textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
        💬 Chat on WhatsApp · {number}
      </a>
    )
  }
  if (status === 'accepted') {
    return <div style={waBtnStyle('#dcfce7', '#166534')}>✅ Request Accepted — Number will appear shortly</div>
  }
  if (status === 'pending') {
    return <div style={waBtnStyle('#fef9c3', '#713f12')}>⏳ WhatsApp Request Sent — Awaiting response</div>
  }
  if (status === 'rejected') {
    return <div style={waBtnStyle('#fee2e2', '#991b1b')}>❌ Request Declined</div>
  }
  // status === 'none'
  return (
    <button
      style={{ ...waBtnStyle('#111', 'white'), cursor: sending ? 'not-allowed' : 'pointer', border: 'none' }}
      onClick={sendRequest}
      disabled={sending}>
      🔒 {sending ? 'Sending Request…' : 'Request WhatsApp Number'}
    </button>
  )
}

function waBtnStyle(bg, color) {
  return {
    width: '100%', padding: '9px 12px', borderRadius: '8px',
    background: bg, color, fontSize: '12px', fontWeight: '600',
    textAlign: 'center', marginTop: '8px',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
export default function AiMatcher() {
  const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}')

  const [profiles,         setProfiles]         = useState([])
  const [fetchError,       setFetchError]        = useState(null)
  const [fetchLoading,     setFetchLoading]      = useState(true)
  const [locationInput,    setLocationInput]     = useState('')
  const [locationQuery,    setLocationQuery]     = useState('')
  const [selectedCoords,   setSelectedCoords]    = useState(null)
  const [suggestions,      setSuggestions]       = useState([])
  const [suggestionsLoad,  setSuggestionsLoad]   = useState(false)
  const [showSuggestions,  setShowSuggestions]   = useState(false)
  const debounceTimer = useRef(null)
  const suggestionsRef = useRef(null)

  const [loading,       setLoading]       = useState(false)
  const [result,        setResult]        = useState(null)
  const [activeProfile, setActiveProfile] = useState(null)
  const [showPrefs,     setShowPrefs]     = useState(false)
  const [savingPrefs,   setSavingPrefs]   = useState(false)
  const [prefsSaved,    setPrefsSaved]    = useState(false)

  const [myPrefs, setMyPrefs] = useState({
    personality_type:  'ambivert',
    sleep_schedule:    'flexible',
    cleanliness_level: 'moderate',
    food_preference:   'any',
    smoking:           'no',
    drinking:          'no',
    noise_tolerance:   'moderate',
    guest_preference:  'sometimes',
  })

  useEffect(() => { loadAllProfiles() }, [])

  useEffect(() => {
    function handleClick(e) {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target))
        setShowSuggestions(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Load current user's saved prefs from DB
  useEffect(() => {
    async function loadMyPrefs() {
      try {
        const data = await api.getProfile()
        const p    = data.profile || {}
        if (Object.keys(p).length > 0) {
          setMyPrefs(prev => ({
            personality_type:  p.personality_type  || prev.personality_type,
            sleep_schedule:    p.sleep_schedule    || prev.sleep_schedule,
            cleanliness_level: p.cleanliness_level || prev.cleanliness_level,
            food_preference:   p.food_preference   || prev.food_preference,
            smoking:           p.smoking           || prev.smoking,
            drinking:          p.drinking          || prev.drinking,
            noise_tolerance:   p.noise_tolerance   || prev.noise_tolerance,
            guest_preference:  p.guest_preference  || prev.guest_preference,
          }))
        }
      } catch { /* ignore */ }
    }
    loadMyPrefs()
  }, [])

  async function loadAllProfiles() {
    setFetchLoading(true)
    setFetchError(null)
    try {
      const data = await api.getMatcherProfiles()
      setProfiles(data.profiles || [])
    } catch (err) {
      setFetchError(err.message)
    } finally {
      setFetchLoading(false)
    }
  }

  function handleLocationInput(value) {
    setLocationInput(value)
    setSelectedCoords(null)
    setShowSuggestions(true)
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    if (!value.trim() || value.trim().length < 2) { setSuggestions([]); return }
    debounceTimer.current = setTimeout(async () => {
      setSuggestionsLoad(true)
      try {
        const results = await api.searchLocationSuggestions(value.trim())
        setSuggestions(results || [])
      } catch { setSuggestions([]) }
      finally { setSuggestionsLoad(false) }
    }, 350)
  }

  async function selectSuggestion(suggestion) {
    setLocationInput(suggestion.short)
    setLocationQuery(suggestion.short)
    setSelectedCoords({ lat: suggestion.lat, lng: suggestion.lng })
    setSuggestions([])
    setShowSuggestions(false)
    setResult(null)
    setActiveProfile(null)
    await fetchProfilesByCoords(suggestion.lat, suggestion.lng, suggestion.short)
  }

  async function applyLocationSearch() {
    setShowSuggestions(false)
    setResult(null)
    setActiveProfile(null)
    if (!locationInput.trim()) return
    if (selectedCoords) {
      await fetchProfilesByCoords(selectedCoords.lat, selectedCoords.lng, locationInput)
      return
    }
    setSuggestionsLoad(true)
    try {
      const results = await api.searchLocationSuggestions(locationInput.trim())
      if (results && results.length > 0) {
        const best = results[0]
        setLocationInput(best.short)
        setLocationQuery(best.short)
        setSelectedCoords({ lat: best.lat, lng: best.lng })
        await fetchProfilesByCoords(best.lat, best.lng, best.short)
      } else {
        setFetchError(`No location found for "${locationInput}". Try a more specific name.`)
      }
    } catch (err) {
      setFetchError('Location lookup failed: ' + err.message)
    } finally {
      setSuggestionsLoad(false)
    }
  }

  async function fetchProfilesByCoords(lat, lng, lbl) {
    setFetchLoading(true)
    setFetchError(null)
    setLocationQuery(lbl)
    try {
      const data = await api.getMatcherProfiles()
      const raw  = data.profiles || []
      const token = sessionStorage.getItem('token')

      const withDistance = await Promise.all(raw.map(async (p) => {
        let pLat = p.latitude, pLng = p.longitude
        if (pLat && pLng) {
          const km = haversineKm(lat, lng, pLat, pLng)
          return { ...p, distance_km: km, distance_label: formatDistance(km) }
        }
        if (p.preferred_location) {
          const coords = await geocodeLocation(p.preferred_location)
          if (coords) {
            pLat = coords.lat; pLng = coords.lng
            try {
              await fetch('http://localhost:5000/api/profile/update-coords', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: p.id, latitude: pLat, longitude: pLng }),
              })
            } catch {}
            const km = haversineKm(lat, lng, pLat, pLng)
            return { ...p, latitude: pLat, longitude: pLng, distance_km: km, distance_label: formatDistance(km) }
          }
        }
        return { ...p, distance_km: null, distance_label: null }
      }))

      withDistance.sort((a, b) => {
        if (a.distance_km == null && b.distance_km == null) return 0
        if (a.distance_km == null) return 1
        if (b.distance_km == null) return -1
        return a.distance_km - b.distance_km
      })
      setProfiles(withDistance)
    } catch (err) {
      setFetchError(err.message)
    } finally {
      setFetchLoading(false)
    }
  }

  async function clearLocation() {
    setLocationInput('')
    setLocationQuery('')
    setSelectedCoords(null)
    setSuggestions([])
    setShowSuggestions(false)
    setResult(null)
    setActiveProfile(null)
    await loadAllProfiles()
  }

  async function runMatch(profile) {
    setLoading(true)
    setResult(null)
    setActiveProfile(profile)
    try {
      const data = await api.checkCompatibility(currentUser.id, profile.id)
      setResult({ profile, ...data })
    } catch (err) {
      setResult({ profile, error: err.message, score: 0, strengths: [], risks: [], suggestions: [] })
    } finally {
      setLoading(false)
    }
  }

  async function saveMyPrefs() {
    setSavingPrefs(true)
    try {
      await api.saveSeekerProfile(myPrefs)
      setPrefsSaved(true)
      setTimeout(() => setPrefsSaved(false), 2500)
    } catch (err) {
      alert('Could not save preferences: ' + err.message)
    } finally {
      setSavingPrefs(false)
    }
  }

  function pick(name, value) { setMyPrefs(prev => ({ ...prev, [name]: value })) }

  function getDistanceBadge(profile) {
    if (profile.distance_label) return { label: profile.distance_label, km: profile.distance_km }
    if (selectedCoords && profile.latitude && profile.longitude) {
      const km = haversineKm(selectedCoords.lat, selectedCoords.lng, profile.latitude, profile.longitude)
      return { label: formatDistance(km), km }
    }
    return null
  }

  const scoreColor = result && !result.error
    ? result.score >= 80 ? 'var(--text-primary)' : result.score >= 60 ? '#f59e0b' : '#cc0000'
    : 'var(--text-primary)'

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg-page)',
      fontFamily: "'Segoe UI', sans-serif",
      display: 'flex', flexDirection: 'column',
      maxHeight: '100vh', overflow: 'hidden',
    }}>

      {/* ── Topbar ── */}
      <div style={{
        background: 'var(--topbar-bg)', borderBottom: '1px solid var(--border-default)',
        padding: '16px 28px', display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', gap: '16px', flexWrap: 'wrap', flexShrink: 0,
      }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>
            AI Roommate Matcher
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-faint)', marginTop: '2px' }}>
            Personality-based compatibility analysis powered by AI
          </p>
        </div>

        {/* Location search */}
        <div style={{ position: 'relative', flex: 1, maxWidth: '420px', minWidth: '200px' }} ref={suggestionsRef}>
          <div style={{
            display: 'flex', alignItems: 'center',
            background: 'var(--input-bg)', border: '1.5px solid var(--input-border)',
            borderRadius: '10px', padding: '0 8px 0 12px', gap: '6px',
          }}>
            <span style={{ fontSize: '14px', flexShrink: 0 }}>{suggestionsLoad ? '⏳' : '📍'}</span>
            <input
              style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: '13px', color: 'var(--input-text)', padding: '9px 0' }}
              placeholder="Type any city or area..."
              value={locationInput}
              onChange={e => handleLocationInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') applyLocationSearch() }}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            />
            {locationInput && (
              <button style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: '12px', padding: '4px' }}
                onClick={clearLocation}>✕</button>
            )}
            <button style={{
              background: 'var(--accent)', color: 'var(--accent-fg)',
              border: 'none', borderRadius: '7px', padding: '6px 14px',
              fontSize: '12px', fontWeight: '700', cursor: 'pointer',
            }} onClick={applyLocationSearch}>Search</button>
          </div>

          {showSuggestions && suggestions.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0,
              background: 'var(--card-bg)', border: '1.5px solid var(--border-strong)',
              borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
              zIndex: 200, marginTop: '4px', overflow: 'hidden',
            }}>
              {suggestions.map((s, i) => (
                <div key={i}
                  style={{ padding: '10px 14px', fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer', borderBottom: i < suggestions.length - 1 ? '1px solid var(--border-default)' : 'none' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-muted)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  onClick={() => selectSuggestion(s)}>
                  <div style={{ fontWeight: '600' }}>📍 {s.short}</div>
                  {s.display !== s.short && (
                    <div style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.display}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          style={{
            background: 'var(--card-bg)', color: 'var(--text-primary)',
            border: '1.5px solid var(--border-strong)', borderRadius: '10px',
            padding: '9px 18px', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
          }}
          onClick={() => setShowPrefs(!showPrefs)}>
          {showPrefs ? '✕ Hide Preferences' : '⚙ My Preferences'}
        </button>
      </div>

      {/* Location filter banner */}
      {locationQuery && (
        <div style={{
          background: 'var(--filter-bg)', borderBottom: '1px solid var(--filter-border)',
          padding: '8px 28px', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0,
        }}>
          <span style={{ fontSize: '13px', color: 'var(--filter-text)', flex: 1 }}>
            📍 Showing <strong>{profiles.length}</strong> profile{profiles.length !== 1 ? 's' : ''} near <strong>{locationQuery}</strong>
          </span>
          <button style={{ background: 'none', border: 'none', color: 'var(--filter-text)', fontSize: '12px', fontWeight: '700', cursor: 'pointer', textDecoration: 'underline' }}
            onClick={clearLocation}>Clear filter</button>
        </div>
      )}

      {/* My Preferences panel */}
      {showPrefs && (
        <div style={{
          background: 'var(--card-bg)', border: '1.5px solid var(--border-accent)',
          borderRadius: '16px', padding: '20px 28px', margin: '16px 28px 0', flexShrink: 0,
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' }}>
            Your Lifestyle Preferences
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-faint)', marginBottom: '16px' }}>
            These are saved to your profile and used for accurate matching
          </p>
          {PERSONALITY_OPTIONS.map(({ name, label: lbl, opts }) => (
            <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)', width: '120px', flexShrink: 0 }}>{lbl}</div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {opts.map(([value, emoji, optLabel]) => (
                  <div key={value}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      padding: '6px 12px', borderRadius: '8px', cursor: 'pointer',
                      fontSize: '12px', fontWeight: myPrefs[name] === value ? '700' : '500',
                      border: myPrefs[name] === value ? '1.5px solid var(--border-accent)' : '1.5px solid var(--border-strong)',
                      background: myPrefs[name] === value ? 'var(--bg-muted)' : 'var(--card-bg)',
                      color: myPrefs[name] === value ? 'var(--text-primary)' : 'var(--text-muted)',
                    }}
                    onClick={() => pick(name, value)}>
                    <span>{emoji}</span><span>{optLabel}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <button
            onClick={saveMyPrefs}
            disabled={savingPrefs}
            style={{
              marginTop: '8px', padding: '9px 22px',
              background: prefsSaved ? '#10b981' : 'var(--accent)',
              color: 'var(--accent-fg)', border: 'none', borderRadius: '8px',
              fontSize: '13px', fontWeight: '700', cursor: savingPrefs ? 'not-allowed' : 'pointer',
            }}>
            {savingPrefs ? 'Saving...' : prefsSaved ? '✓ Saved!' : 'Save Preferences'}
          </button>
        </div>
      )}

      {/* ── SPLIT-SCROLL CONTENT AREA ── */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        flex: 1, overflow: 'hidden',
        padding: '20px 28px 0', gap: '24px', minHeight: 0,
      }}>

        {/* ── LEFT: Profile list ── */}
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', flexShrink: 0 }}>
            <h3 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
              {locationQuery ? `Profiles near ${locationQuery}` : 'Available Profiles'}
            </h3>
            {locationQuery && (
              <span style={{ background: 'var(--accent)', color: 'var(--accent-fg)', fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '20px' }}>
                {profiles.length} found
              </span>
            )}
          </div>

          <div style={{ overflowY: 'auto', flex: 1, paddingBottom: '20px', paddingRight: '4px' }}>
            {fetchLoading ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-faint)', fontSize: '13px' }}>
                <div style={{ fontSize: '32px', marginBottom: '12px' }}>⏳</div>Loading profiles...
              </div>
            ) : fetchError ? (
              <div style={{ background: '#fff0f0', border: '1px solid #ffd0d0', borderRadius: '12px', padding: '20px', textAlign: 'center' }}>
                <div style={{ fontSize: '13px', color: '#cc0000', marginBottom: '8px' }}>⚠️ {fetchError}</div>
                <button onClick={() => { setFetchError(null); clearLocation() }}
                  style={{ padding: '6px 16px', background: 'var(--accent)', color: 'var(--accent-fg)', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>
                  Retry
                </button>
              </div>
            ) : profiles.length === 0 ? (
              <div style={{ background: 'var(--empty-bg)', border: '1px solid var(--border-default)', borderRadius: '16px', padding: '48px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: '40px', marginBottom: '12px', opacity: 0.15 }}>🗺️</div>
                <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px' }}>No profiles found</div>
                <div style={{ fontSize: '13px', color: 'var(--text-faint)' }}>
                  {locationQuery ? 'Try a nearby city or clear the filter' : 'No seeker profiles available yet'}
                </div>
                {locationQuery && (
                  <button style={{ marginTop: '14px', padding: '8px 20px', background: 'var(--accent)', color: 'var(--accent-fg)', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
                    onClick={clearLocation}>Show All Profiles</button>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {profiles.map(p => {
                  const dist    = getDistanceBadge(p)
                  const distKm  = dist?.km ?? null
                  const distTag = dist?.label ?? null
                  const prefs   = getDisplayPrefs(p)

                  const distBadgeStyle = distKm !== null
                    ? distKm <= 10
                      ? { background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }
                      : distKm <= 30
                      ? { background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' }
                      : { background: '#fff1f2', color: '#9f1239', border: '1px solid #fecdd3' }
                    : {}

                  // Budget display
                  const budgetMin = p.budget_min ? `₹${Number(p.budget_min).toLocaleString('en-IN')}` : null
                  const budgetMax = p.budget_max ? `₹${Number(p.budget_max).toLocaleString('en-IN')}` : null
                  const budgetStr = budgetMin && budgetMax && budgetMin !== budgetMax
                    ? `${budgetMin} – ${budgetMax}/mo`
                    : budgetMax ? `${budgetMax}/mo` : null

                  // Move-in date display
                  const moveIn = p.move_in_date
                    ? new Date(p.move_in_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                    : null

                  return (
                    <div key={p.id} style={{
                      background: 'var(--card-bg)',
                      border: `1.5px solid ${activeProfile?.id === p.id ? 'var(--card-border-active)' : 'var(--card-border)'}`,
                      borderRadius: '16px', padding: '18px', transition: 'border-color 0.15s',
                    }}>
                      {/* Header */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                        <div style={{
                          width: '42px', height: '42px', borderRadius: '50%',
                          background: 'var(--accent)', color: 'var(--accent-fg)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '18px', fontWeight: '700', flexShrink: 0,
                        }}>{p.name.charAt(0)}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '2px' }}>{p.name}</div>
                          <div style={{ fontSize: '12px', color: 'var(--text-faint)' }}>
                            {p.occupation || 'Seeker'}{p.preferred_location ? ` · ${p.preferred_location}` : ''}
                          </div>
                        </div>
                        {distTag && (
                          <div style={{ fontSize: '11px', fontWeight: '600', padding: '3px 9px', borderRadius: '20px', whiteSpace: 'nowrap', flexShrink: 0, ...distBadgeStyle }}>
                            {distTag}
                          </div>
                        )}
                      </div>

                      {/* About */}
                      {p.about && (
                        <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.6', marginBottom: '10px' }}>{p.about}</p>
                      )}

                      {/* Budget + Move-in */}
                      {(budgetStr || moveIn) && (
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
                          {budgetStr && (
                            <span style={{ fontSize: '12px', fontWeight: '600', color: '#166534', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '3px 10px', borderRadius: '20px' }}>
                              💰 {budgetStr}
                            </span>
                          )}
                          {moveIn && (
                            <span style={{ fontSize: '12px', fontWeight: '600', color: '#1e40af', background: '#eff6ff', border: '1px solid #bfdbfe', padding: '3px 10px', borderRadius: '20px' }}>
                              📅 Move-in: {moveIn}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Lifestyle tags */}
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                        {[prefs.personality, prefs.sleepSchedule, prefs.food, prefs.smoking].map(t => (
                          <span key={t} style={{
                            fontSize: '11px', color: 'var(--tag-text)', background: 'var(--tag-bg)',
                            padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--tag-border)',
                          }}>{t}</span>
                        ))}
                      </div>

                      {/* Detail grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '14px' }}>
                        {[
                          ['CLEANLINESS', prefs.cleanliness],
                          ['NOISE',       prefs.noise],
                          ['DRINKING',    prefs.drinking],
                          ['GUESTS',      prefs.guests],
                        ].map(([k, v]) => (
                          <div key={k} style={{ background: 'var(--detail-bg)', border: '1px solid var(--detail-border)', borderRadius: '8px', padding: '8px 10px' }}>
                            <div style={{ fontSize: '10px', color: 'var(--text-faint)', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k}</div>
                            <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)' }}>{v}</div>
                          </div>
                        ))}
                      </div>

                      {/* Preferred gender */}
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                        👤 Preferred Roommate: <strong>{prefs.gender}</strong>
                      </div>

                      {/* Action buttons */}
                      <button
                        style={{
                          width: '100%', padding: '10px',
                          background: 'var(--accent)', color: 'var(--accent-fg)',
                          border: 'none', borderRadius: '8px',
                          fontSize: '13px', fontWeight: '600',
                          cursor: loading && activeProfile?.id === p.id ? 'not-allowed' : 'pointer',
                        }}
                        onClick={() => runMatch(p)}
                        disabled={loading && activeProfile?.id === p.id}>
                        {loading && activeProfile?.id === p.id ? '⏳ Analyzing...' : '🤖 Check Compatibility'}
                      </button>

                      {/* WhatsApp request — privacy-safe */}
                      <WhatsAppRequestButton targetUserId={p.id} />
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Compatibility report ── */}
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
          <h3 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '14px', flexShrink: 0 }}>
            Compatibility Report
          </h3>

          <div style={{ overflowY: 'auto', flex: 1, paddingBottom: '20px', paddingRight: '4px' }}>
            {!result && !loading && (
              <div style={{ background: 'var(--empty-bg)', border: '1px solid var(--border-default)', borderRadius: '16px', padding: '60px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.15 }}>🤖</div>
                <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px' }}>No match analyzed yet</div>
                <div style={{ fontSize: '13px', color: 'var(--text-faint)' }}>Select a profile to run AI compatibility check</div>
              </div>
            )}

            {loading && (
              <div style={{ background: 'var(--empty-bg)', border: '1px solid var(--border-default)', borderRadius: '16px', padding: '60px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>⏳</div>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>AI is analyzing compatibility...</div>
                <div style={{ fontSize: '12px', color: 'var(--text-faint)', marginTop: '8px' }}>Comparing lifestyle + location factors</div>
              </div>
            )}

            {result && (
              <div style={{ background: 'var(--card-bg)', border: '1.5px solid var(--card-border-active)', borderRadius: '16px', padding: '24px' }}>
                {/* Result header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                  <div style={{
                    width: '48px', height: '48px', borderRadius: '50%',
                    background: 'var(--accent)', color: 'var(--accent-fg)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '20px', fontWeight: '700',
                  }}>{result.profile.name.charAt(0)}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '16px', fontWeight: '800', color: 'var(--text-primary)' }}>{result.profile.name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-faint)' }}>{result.profile.occupation || 'Seeker'}</div>
                  </div>
                  {!result.error && (
                    <div style={{
                      color: 'white', fontSize: '11px', fontWeight: '700',
                      padding: '4px 12px', borderRadius: '20px',
                      background: result.score >= 80 ? '#111' : result.score >= 60 ? '#f59e0b' : '#cc0000',
                    }}>
                      {result.score >= 80 ? 'Great Match' : result.score >= 60 ? 'Good Match' : 'Poor Match'}
                    </div>
                  )}
                </div>

                {result.error ? (
                  <div style={{ background: '#fff0f0', border: '1px solid #ffd0d0', borderRadius: '10px', padding: '16px', marginBottom: '16px' }}>
                    <div style={{ fontSize: '13px', color: '#cc0000', fontWeight: '600', marginBottom: '6px' }}>⚠️ Could not load compatibility</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{result.error}</div>
                  </div>
                ) : (
                  <>
                    {/* Score */}
                    <div style={{ marginBottom: '20px' }}>
                      <div style={{ fontSize: '12px', color: 'var(--text-faint)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Compatibility Score</div>
                      <div style={{ fontSize: '52px', fontWeight: '800', letterSpacing: '-2px', lineHeight: 1, marginBottom: '10px', color: scoreColor }}>{result.score}%</div>
                      <div style={{ height: '6px', background: 'var(--border-default)', borderRadius: '3px' }}>
                        <div style={{ height: '6px', borderRadius: '3px', transition: 'width 0.5s', width: `${result.score}%`, background: scoreColor }} />
                      </div>
                    </div>

                    <CompatibilityBreakdown
                      breakdown={result.breakdown}
                      score={result.score}
                    />

                    {result.strengths?.length > 0 && (
                      <div style={{ marginBottom: '16px' }}>
                        <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '10px' }}>✅ Strengths</div>
                        {result.strengths.map((str, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
                            <span style={{ color: '#10b981', fontWeight: '700', fontSize: '14px' }}>✓</span>
                            <span style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>{str}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {result.risks?.length > 0 && (
                      <div style={{ marginBottom: '16px' }}>
                        <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '10px' }}>⚠️ Potential Risks</div>
                        {result.risks.map((risk, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
                            <span style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#fff0f0', border: '1px solid #ffd0d0', color: '#cc0000', fontSize: '11px', fontWeight: '800', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>!</span>
                            <span style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>{risk}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {result.suggestions?.length > 0 && (
                      <div style={{ background: 'var(--suggest-bg)', border: '1px solid var(--suggest-border)', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px' }}>
                        <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' }}>🤖 AI Suggestions</div>
                        {result.suggestions.map((sg, i) => (
                          <div key={i} style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.8' }}>• {sg}</div>
                        ))}
                      </div>
                    )}

                    {/* Contact reveal after match — show ONLY after high compatibility */}
                    {result.score >= 60 && (
                      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px' }}>
                        <div style={{ fontSize: '13px', fontWeight: '700', color: '#166534', marginBottom: '8px' }}>📬 Contact This Person</div>
                        <div style={{ fontSize: '12px', color: '#166534', marginBottom: '10px' }}>
                          Good compatibility! You can request their WhatsApp number below to connect.
                        </div>
                        <WhatsAppRequestButton targetUserId={result.profile.id} />
                      </div>
                    )}
                  </>
                )}

                <button
                  style={{
                    width: '100%', padding: '11px', marginTop: '4px',
                    background: 'var(--accent)', color: 'var(--accent-fg)',
                    border: 'none', borderRadius: '10px',
                    fontSize: '13px', fontWeight: '700', cursor: 'pointer',
                  }}
                  onClick={() => window.location.href = `/seeker-chat?user=${encodeURIComponent(result.profile.name)}&id=${result.profile.id}`}>
                  💬 Start Chat with {result.profile.name.split(' ')[0]}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}