/**
 * LocationAutocomplete.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Reusable location search component used by BOTH:
 *   • AI Matcher   (AiMatcher.jsx)
 *   • Browse Listings (BrowseListings.jsx)
 *
 * Props:
 *   value          – string  – current text value (controlled)
 *   onChange       – fn(text, coords) – fires on every input change
 *                   coords = { lat, lng, short, display } | null
 *   onSelect       – fn({ short, display, lat, lng }) – fires only on selection
 *   onClear        – fn() – fires when ✕ is pressed
 *   placeholder    – string
 *   showSearchBtn  – bool – show "Search" button (default false)
 *   onSearch       – fn() – fires when Search button / Enter pressed
 *   variant        – 'topbar' | 'filter' – style variant
 *                    'topbar'  → horizontal pill (used in topbar)
 *                    'filter'  → vertical field (used in filter panel)
 *
 * Behaviour:
 *   • Debounced 300ms input → Nominatim suggestions via backend proxy or direct
 *   • If user types but doesn't pick → onSelect is NOT called (no ghost search)
 *   • Clear button resets everything
 *   • "No results found" shown when search has ≥2 chars and 0 results
 *   • Caches recent searches in memory (session-lived)
 */

import { useState, useEffect, useRef, useCallback } from 'react'

// ── In-memory cache for Nominatim results ────────────────────────────────────
const _cache = new Map()

async function fetchSuggestions(query) {
  const key = query.trim().toLowerCase()
  if (_cache.has(key)) return _cache.get(key)

  // Try backend proxy first (avoids browser CORS + Nominatim rate-limit)
  try {
    const backendUrl = `http://localhost:5000/api/locations/search?q=${encodeURIComponent(key)}`
    const res = await fetch(backendUrl)
    if (res.ok) {
      const data = await res.json()
      if (Array.isArray(data)) {
        _cache.set(key, data)
        return data
      }
    }
  } catch { /* backend not available — fall through to direct Nominatim */ }

  // Fallback: direct Nominatim (no API key needed)
  try {
    const url = new URL('https://nominatim.openstreetmap.org/search')
    url.searchParams.set('q', key)
    url.searchParams.set('format', 'json')
    url.searchParams.set('limit', '7')
    url.searchParams.set('addressdetails', '1')
    url.searchParams.set('countrycodes', 'in')

    const res = await fetch(url.toString(), {
      headers: { 'Accept-Language': 'en', 'User-Agent': 'RentMate/1.0' },
    })
    const data = await res.json()

    const results = data.map(place => {
      const a = place.address || {}
      const parts = [
        a.suburb || a.neighbourhood || a.quarter || a.village || a.hamlet,
        a.city || a.town || a.municipality || a.county || a.state_district,
        a.state,
      ].filter(Boolean)
      const unique = parts.filter((v, i) => parts[i - 1] !== v)
      return {
        display: place.display_name,
        short:   unique.slice(0, 3).join(', ') || place.display_name.split(',')[0],
        lat:     parseFloat(place.lat),
        lng:     parseFloat(place.lon),
      }
    })

    _cache.set(key, results)
    return results
  } catch {
    return []
  }
}

// ─────────────────────────────────────────────────────────────────────────────
export default function LocationAutocomplete({
  value        = '',
  onChange,
  onSelect,
  onClear,
  placeholder  = 'Search location in Kerala...',
  showSearchBtn = false,
  onSearch,
  variant      = 'topbar',
}) {
  const [query, setQuery]               = useState(value)
  const [suggestions, setSuggestions]   = useState([])
  const [loading, setLoading]           = useState(false)
  const [showDrop, setShowDrop]         = useState(false)
  const [isSelected, setIsSelected]     = useState(false)   // true once user picks from list

  const wrapperRef  = useRef(null)
  const debounceRef = useRef(null)

  // ── Sync controlled value ──────────────────────────────────────────────────
  useEffect(() => {
    setQuery(value)
    // If parent resets value to '' clear selection flag too
    if (!value) setIsSelected(false)
  }, [value])

  // ── Close dropdown on outside click ───────────────────────────────────────
  useEffect(() => {
    function onMouseDown(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setShowDrop(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  // ── Input change handler ───────────────────────────────────────────────────
  function handleInput(e) {
    const val = e.target.value
    setQuery(val)
    setIsSelected(false)   // user is typing again — selection lost
    onChange?.(val, null)  // notify parent: text changed, no coords yet

    clearTimeout(debounceRef.current)

    if (!val.trim() || val.trim().length < 2) {
      setSuggestions([])
      setShowDrop(false)
      return
    }

    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      const results = await fetchSuggestions(val.trim())
      setSuggestions(results)
      setShowDrop(true)
      setLoading(false)
    }, 300)
  }

  // ── User picks a suggestion ────────────────────────────────────────────────
  function handleSelect(place) {
    setQuery(place.short)
    setSuggestions([])
    setShowDrop(false)
    setIsSelected(true)
    onChange?.(place.short, { lat: place.lat, lng: place.lng })
    onSelect?.(place)
  }

  // ── Clear button ───────────────────────────────────────────────────────────
  function handleClear() {
    setQuery('')
    setSuggestions([])
    setShowDrop(false)
    setIsSelected(false)
    clearTimeout(debounceRef.current)
    onChange?.('', null)
    onClear?.()
  }

  // ── Enter / Search button ──────────────────────────────────────────────────
  async function handleSearch() {
    setShowDrop(false)
    if (!query.trim()) return

    // If user typed but didn't select — auto-resolve to first suggestion
    if (!isSelected && query.trim().length >= 2) {
      setLoading(true)
      const results = await fetchSuggestions(query.trim())
      setLoading(false)
      if (results.length > 0) {
        handleSelect(results[0])
        return
      }
    }

    onSearch?.()
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleSearch()
    if (e.key === 'Escape') setShowDrop(false)
  }

  const hasQuery = query.trim().length > 0
  const noResults = showDrop && !loading && query.trim().length >= 2 && suggestions.length === 0

  // ────────────────────────────────────────────────────────────────────────────
  // RENDER — two visual variants
  // ────────────────────────────────────────────────────────────────────────────
  if (variant === 'topbar') {
    return (
      <div ref={wrapperRef} style={{ position: 'relative', flex: 1, maxWidth: '500px' }}>
        {/* Pill wrapper */}
        <div style={ts.pill}>
          <span style={ts.pinIcon}>{loading ? '⏳' : '📍'}</span>
          <input
            style={ts.input}
            type="text"
            value={query}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onFocus={() => suggestions.length > 0 && setShowDrop(true)}
            placeholder={placeholder}
            autoComplete="off"
          />
          {hasQuery && (
            <button style={ts.clearBtn} type="button" onClick={handleClear} title="Clear">✕</button>
          )}
          {showSearchBtn && (
            <button style={ts.searchBtn} type="button" onClick={handleSearch}>Search</button>
          )}
        </div>

        {/* Suggestions */}
        {showDrop && suggestions.length > 0 && (
          <div style={ts.dropdown}>
            {suggestions.map((s, i) => (
              <div
                key={i}
                style={ts.option}
                onClick={() => handleSelect(s)}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-muted,#f3f4f6)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <span style={ts.optPin}>📍</span>
                <div>
                  <div style={ts.optMain}>{s.short}</div>
                  {s.display !== s.short && (
                    <div style={ts.optSub}>{s.display.split(',').slice(0, 3).join(',')}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* No results */}
        {noResults && (
          <div style={ts.noResults}>No matching locations found. Try a different spelling.</div>
        )}
      </div>
    )
  }

  // variant === 'filter'
  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%' }}>
      {/* Input with icon */}
      <div style={fs.inputWrap}>
        <span style={fs.pinIcon}>{loading ? '⏳' : '📍'}</span>
        <input
          style={fs.input}
          type="text"
          value={query}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onFocus={() => suggestions.length > 0 && setShowDrop(true)}
          placeholder={placeholder}
          autoComplete="off"
        />
        {hasQuery && (
          <button style={fs.clearBtn} type="button" onClick={handleClear} title="Clear">✕</button>
        )}
      </div>

      {/* Selected indicator */}
      {isSelected && hasQuery && (
        <div style={fs.selectedBadge}>
          <span style={{ fontSize: '11px' }}>✓</span>
          <span>Location selected — radius filtering active</span>
        </div>
      )}

      {/* Suggestions */}
      {showDrop && suggestions.length > 0 && (
        <div style={fs.dropdown}>
          {suggestions.map((s, i) => (
            <div
              key={i}
              style={fs.option}
              onClick={() => handleSelect(s)}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-muted,#f3f4f6)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={fs.optPin}>📍</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={fs.optMain}>{s.short}</div>
                {s.display !== s.short && (
                  <div style={fs.optSub}>{s.display.split(',').slice(0, 3).join(',').trim()}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* No results */}
      {noResults && (
        <div style={fs.noResults}>No matching locations found.</div>
      )}
    </div>
  )
}

// ── Topbar styles ─────────────────────────────────────────────────────────────
const ts = {
  pill: {
    display: 'flex', alignItems: 'center',
    background: 'var(--bg-subtle, #f9fafb)',
    border: '1.5px solid var(--border, #e5e7eb)',
    borderRadius: '40px',
    padding: '6px 8px 6px 14px',
    gap: '6px',
  },
  pinIcon: { fontSize: '14px', flexShrink: 0 },
  input: {
    flex: 1, background: 'none', border: 'none', outline: 'none',
    fontSize: '13px', color: 'var(--text-primary, #111)',
    padding: '3px 0', minWidth: 0,
  },
  clearBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: '12px', color: 'var(--text-muted, #888)', padding: '4px', flexShrink: 0,
  },
  searchBtn: {
    background: '#111', color: '#fff', border: 'none',
    borderRadius: '30px', padding: '7px 18px',
    fontSize: '12px', fontWeight: '700', cursor: 'pointer', flexShrink: 0,
  },
  dropdown: {
    position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 500,
    background: 'var(--bg-card, white)',
    border: '1.5px solid var(--border, #e5e7eb)',
    borderRadius: '12px',
    boxShadow: '0 12px 32px rgba(0,0,0,0.13)',
    overflow: 'hidden',
  },
  option: {
    display: 'flex', alignItems: 'flex-start', gap: '10px',
    padding: '10px 14px', cursor: 'pointer', transition: 'background 0.1s',
    borderBottom: '1px solid var(--border, #f0f0f0)',
  },
  optPin: { fontSize: '13px', flexShrink: 0, marginTop: '1px' },
  optMain: { fontSize: '13px', fontWeight: '600', color: 'var(--text-primary, #111)' },
  optSub: { fontSize: '11px', color: 'var(--text-muted, #888)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  noResults: {
    position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 500,
    background: 'var(--bg-card, white)',
    border: '1.5px solid var(--border, #e5e7eb)',
    borderRadius: '12px',
    padding: '12px 16px',
    fontSize: '12px', color: 'var(--text-muted, #888)',
    boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
  },
}

// ── Filter styles ─────────────────────────────────────────────────────────────
const fs = {
  inputWrap: {
    position: 'relative', display: 'flex', alignItems: 'center',
  },
  pinIcon: {
    position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)',
    fontSize: '13px', pointerEvents: 'none', color: 'var(--text-muted, #888)',
  },
  input: {
    width: '100%', padding: '8px 32px 8px 30px',
    borderRadius: '8px', border: '1.5px solid var(--input-border, #e5e7eb)',
    fontSize: '13px', outline: 'none',
    color: 'var(--input-text, #111)', background: 'var(--input-bg, white)',
    boxSizing: 'border-box', height: '36px',
  },
  clearBtn: {
    position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: '11px', color: 'var(--text-muted, #aaa)', padding: '4px',
  },
  selectedBadge: {
    display: 'flex', alignItems: 'center', gap: '5px', marginTop: '4px',
    fontSize: '11px', color: '#166534', fontWeight: '600',
  },
  dropdown: {
    position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 500,
    background: 'var(--bg-card, white)',
    border: '1.5px solid var(--border, #e5e7eb)',
    borderRadius: '10px',
    boxShadow: '0 12px 32px rgba(0,0,0,0.13)',
    overflow: 'hidden',
  },
  option: {
    display: 'flex', alignItems: 'flex-start', gap: '8px',
    padding: '9px 12px', cursor: 'pointer', transition: 'background 0.1s',
    borderBottom: '1px solid var(--border, #f5f5f5)',
  },
  optPin: { fontSize: '12px', flexShrink: 0, marginTop: '1px' },
  optMain: { fontSize: '12px', fontWeight: '600', color: 'var(--text-primary, #111)' },
  optSub: { fontSize: '11px', color: 'var(--text-muted, #888)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  noResults: {
    position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 500,
    background: 'var(--bg-card, white)',
    border: '1.5px solid var(--border, #e5e7eb)',
    borderRadius: '10px',
    padding: '10px 12px',
    fontSize: '12px', color: 'var(--text-muted, #888)',
    boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
  },
}