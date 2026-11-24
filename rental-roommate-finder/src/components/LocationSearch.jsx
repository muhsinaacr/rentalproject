// src/components/LocationSearch.jsx
// Real location search using Nominatim (OpenStreetMap) + live Leaflet map preview
// No API key needed.

import { useState, useEffect, useRef } from 'react'

export default function LocationSearch({ value, onChange, placeholder = 'Search location in Kerala...' }) {
  const [query, setQuery]                 = useState(value || '')
  const [suggestions, setSuggestions]     = useState([])
  const [loading, setLoading]             = useState(false)
  const [showDropdown, setShowDropdown]   = useState(false)
  const [selectedPlace, setSelectedPlace] = useState(null)
  const [mapReady, setMapReady]           = useState(false)
  const debounceRef    = useRef(null)
  const wrapperRef     = useRef(null)
  const mapRef         = useRef(null)
  const mapInstanceRef = useRef(null)
  const markerRef      = useRef(null)
  const initedForValue = useRef(null)

  // ── Sync query text when parent changes value (edit mode pre-fill) ──────────
  useEffect(() => {
    setQuery(value || '')
  }, [value])

  // ── When a pre-filled value arrives and we have no selectedPlace yet,
  //    silently geocode it so the map appears automatically ───────────────────
  useEffect(() => {
    if (!value || selectedPlace || initedForValue.current === value) return
    initedForValue.current = value
    async function geocodeInitial() {
      const url =
        `https://nominatim.openstreetmap.org/search` +
        `?q=${encodeURIComponent(value)}` +
        `&format=json&limit=1` +
        `&countrycodes=in` +
        `&viewbox=74.85,8.17,77.62,12.78&bounded=0` +
        `&namedetails=1&addressdetails=0`
      try {
        const res     = await fetch(url, { headers: { 'Accept-Language': 'en', 'User-Agent': 'RentMate/1.0' } })
        const results = await res.json()
        if (results && results.length > 0) setSelectedPlace(results[0])
      } catch { /* silent */ }
    }
    geocodeInitial()
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Close dropdown on outside click ────────────────────────────────────────
  useEffect(() => {
    function handleClick(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target))
        setShowDropdown(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // ── Callback ref: fires when map div mounts/unmounts ───────────────────────
  const mapDivRef = (node) => {
    mapRef.current = node
    if (node) setMapReady(true)
    else      setMapReady(false)
  }

  // ── Init / update Leaflet map ───────────────────────────────────────────────
  useEffect(() => {
    if (!selectedPlace || !mapReady || !mapRef.current) return

    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link')
      link.id    = 'leaflet-css'
      link.rel   = 'stylesheet'
      link.href  = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)
    }

    const lat = parseFloat(selectedPlace.lat)
    const lon = parseFloat(selectedPlace.lon)

    function initMap() {
      const L = window.L
      if (mapInstanceRef.current) {
        mapInstanceRef.current.setView([lat, lon], 15)
        if (markerRef.current) markerRef.current.remove()
        markerRef.current = L.marker([lat, lon]).addTo(mapInstanceRef.current)
        setTimeout(() => mapInstanceRef.current && mapInstanceRef.current.invalidateSize(), 100)
        return
      }
      mapInstanceRef.current = L.map(mapRef.current, { zoomControl: true }).setView([lat, lon], 15)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(mapInstanceRef.current)
      markerRef.current = L.marker([lat, lon]).addTo(mapInstanceRef.current)
      setTimeout(() => mapInstanceRef.current && mapInstanceRef.current.invalidateSize(), 100)
    }

    if (window.L) {
      initMap()
    } else {
      const script  = document.createElement('script')
      script.src    = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
      script.onload = initMap
      document.head.appendChild(script)
    }
  }, [selectedPlace, mapReady])

  // ── Destroy map on unmount ──────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [])

  // ── Fetch autocomplete suggestions ─────────────────────────────────────────
  async function fetchSuggestions(val) {
    setLoading(true)
    const url =
      `https://nominatim.openstreetmap.org/search` +
      `?q=${encodeURIComponent(val)}` +
      `&format=json&limit=8` +
      `&countrycodes=in` +
      `&viewbox=74.85,8.17,77.62,12.78&bounded=0` +
      `&namedetails=1&addressdetails=0`
    try {
      const res     = await fetch(url, { headers: { 'Accept-Language': 'en', 'User-Agent': 'RentMate/1.0' } })
      const results = await res.json()
      setSuggestions(results)
      setShowDropdown(results.length > 0)
    } catch {
      setSuggestions([])
    }
    setLoading(false)
  }

  function handleInput(e) {
    const val = e.target.value
    setQuery(val)
    onChange(val)
    if (!val) {
      setSelectedPlace(null)
      initedForValue.current = null
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null }
    }
    clearTimeout(debounceRef.current)
    if (val.length < 2) { setSuggestions([]); setShowDropdown(false); return }
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 250)
  }

  function handleSelect(place) {
    const name = place.namedetails?.name || place.display_name.split(',')[0]
    setQuery(name)
    onChange(name)
    setSuggestions([])
    setShowDropdown(false)
    initedForValue.current = name
    setSelectedPlace(place)
  }

  function clearSelection() {
    setSelectedPlace(null)
    initedForValue.current = null
    setQuery('')
    onChange('')
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove()
      mapInstanceRef.current = null
    }
  }

  return (
    <div ref={wrapperRef} style={{ width: '100%', position: 'relative' }}>
      {/* Input */}
      <div style={{ position: 'relative' }}>
        <span style={s.icon}>🔍</span>
        <input
          style={s.input}
          type="text"
          value={query}
          onChange={handleInput}
          placeholder={placeholder}
          onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
          autoComplete="off"
        />
        {loading && <span style={s.loadingDot}>●</span>}
        {selectedPlace && !loading && (
          <button style={s.clearBtn} type="button" onClick={clearSelection}>✕</button>
        )}
      </div>

      {/* Suggestions dropdown */}
      {showDropdown && suggestions.length > 0 && (
        <div style={s.dropdown}>
          {suggestions.map((place, i) => {
            const main = place.namedetails?.name || place.display_name.split(',')[0]
            const sub  = place.display_name.split(',').slice(1, 3).join(',').trim()
            return (
              <div
                key={i}
                style={s.option}
                onClick={() => handleSelect(place)}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary,#f3f4f6)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <span style={s.pin}>📍</span>
                <div>
                  <div style={s.optionMain}>{main}</div>
                  {sub && <div style={s.optionSub}>{sub}</div>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Map preview — shown whenever selectedPlace is set */}
      {selectedPlace && (
        <div style={s.mapCard}>
          <div style={s.mapTopBar}>
            <span style={{ fontSize: '13px' }}>📍</span>
            <span style={s.mapName}>{query}</span>
            <button style={s.changeBtn} type="button" onClick={clearSelection}>Change</button>
          </div>
          <div ref={mapDivRef} style={s.mapBox} />
        </div>
      )}
    </div>
  )
}

const s = {
  input: {
    width: '100%',
    padding: '11px 38px 11px 36px',
    borderRadius: '10px',
    border: '1.5px solid var(--input-border,#e5e7eb)',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
    color: 'var(--text-primary,#111)',
    background: 'var(--input-bg,white)',
  },
  icon: {
    position: 'absolute', left: '11px', top: '50%',
    transform: 'translateY(-50%)', fontSize: '13px', pointerEvents: 'none',
  },
  loadingDot: {
    position: 'absolute', right: '13px', top: '50%',
    transform: 'translateY(-50%)', fontSize: '10px',
    color: 'var(--accent-purple,#534ab7)', animation: 'pulse 1s infinite',
  },
  clearBtn: {
    position: 'absolute', right: '10px', top: '50%',
    transform: 'translateY(-50%)', background: 'none', border: 'none',
    cursor: 'pointer', fontSize: '12px', color: 'var(--text-muted,#888)', padding: '4px',
  },
  dropdown: {
    position: 'absolute', zIndex: 1000, width: '100%', marginTop: '4px',
    background: 'var(--bg-primary,white)',
    border: '1.5px solid var(--border-color,#e5e7eb)',
    borderRadius: '12px',
    boxShadow: '0 12px 32px rgba(0,0,0,0.13)',
    overflow: 'hidden',
  },
  option: {
    display: 'flex', alignItems: 'flex-start', gap: '10px',
    padding: '10px 14px', cursor: 'pointer', transition: 'background 0.1s',
  },
  pin:        { fontSize: '14px', flexShrink: 0, marginTop: '1px' },
  optionMain: { fontSize: '13px', fontWeight: '600', color: 'var(--text-primary,#111)' },
  optionSub:  { fontSize: '11px', color: 'var(--text-muted,#888)', marginTop: '2px' },

  mapCard: {
    marginTop: '10px',
    borderRadius: '12px',
    overflow: 'hidden',
    border: '1.5px solid var(--border-color,#e5e7eb)',
  },
  mapTopBar: {
    display: 'flex', alignItems: 'center', gap: '8px',
    padding: '8px 12px',
    background: 'var(--bg-secondary,#f9fafb)',
    borderBottom: '1px solid var(--border-color,#e5e7eb)',
  },
  mapName: {
    flex: 1, fontSize: '13px', fontWeight: '600',
    color: 'var(--text-primary,#111)',
  },
  changeBtn: {
    background: 'none',
    border: '1px solid var(--border-color,#e5e7eb)',
    borderRadius: '6px', padding: '3px 10px',
    fontSize: '12px', cursor: 'pointer',
    color: 'var(--text-secondary,#555)',
  },
  mapBox: { height: '220px', width: '100%' },
}