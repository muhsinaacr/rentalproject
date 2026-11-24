// routes/locations.js
const express = require('express')
const router  = express.Router()

const cache = new Map()
const CACHE_TTL_MS = 5 * 60 * 1000

// GET /api/locations/search?q=alu
router.get('/search', async (req, res) => {
  const { q } = req.query
  if (!q || q.trim().length < 2) return res.json([])

  const query = q.trim()
  const cached = cache.get(query.toLowerCase())
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return res.json(cached.data)
  }

  try {
    const url = new URL('https://nominatim.openstreetmap.org/search')
    url.searchParams.set('q', query)
    url.searchParams.set('format', 'json')
    url.searchParams.set('limit', '7')
    url.searchParams.set('addressdetails', '1')
    url.searchParams.set('countrycodes', 'in')

    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'RentMate-App/1.0 (rentmate@example.com)',
        'Accept-Language': 'en',
      },
    })

    if (!response.ok) return res.status(502).json({ error: 'Location service unavailable' })

    const data = await response.json()

    const results = data.map(place => {
      const a = place.address || {}
      const parts = [
        a.suburb || a.neighbourhood || a.quarter || a.village || a.hamlet,
        a.city || a.town || a.municipality || a.county || a.state_district,
        a.state,
        a.country,
      ].filter(Boolean)
      const unique = parts.filter((v, i) => parts[i - 1] !== v)
      return {
        display: place.display_name,
        short:   unique.slice(0, 3).join(', ') || place.display_name,
        lat:     parseFloat(place.lat),
        lng:     parseFloat(place.lon),
        type:    place.type || '',
      }
    })

    cache.set(query.toLowerCase(), { data: results, ts: Date.now() })
    res.json(results)
  } catch (err) {
    console.error('Location search error:', err.message)
    res.status(500).json({ error: 'Location search failed' })
  }
})

module.exports = router