// src/hooks/useBookmarks.js
// Single source of truth for bookmark state across BrowseListings, ListingDetail, Bookmarks.
// Uses the real backend API — no localStorage.
// Falls back gracefully if the backend hasn't been updated yet.

import { useState, useEffect, useCallback } from 'react'
import { api } from '../utils/api'

export function useBookmarks() {
  const [bookmarkedIds, setBookmarkedIds] = useState(new Set())
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      let ids
      // Try the new lightweight /ids endpoint first.
      // Falls back to full getBookmarks() if the old backend doesn't have /ids yet.
      try {
        ids = await api.getBookmarkIds()
      } catch {
        const rows = await api.getBookmarks()
        ids = Array.isArray(rows) ? rows.map(r => r.id) : []
      }
      setBookmarkedIds(new Set(ids))
    } catch {
      setBookmarkedIds(new Set())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const isBookmarked = useCallback(
    (id) => bookmarkedIds.has(id),
    [bookmarkedIds]
  )

  const toggleBookmark = useCallback(async (listing) => {
    const id = listing.id
    const currently = bookmarkedIds.has(id)

    // Optimistic update — instant UI feedback
    setBookmarkedIds(prev => {
      const next = new Set(prev)
      if (currently) next.delete(id)
      else           next.add(id)
      return next
    })

    try {
      if (currently) {
        await api.removeBookmark(id)
        return false
      } else {
        await api.addBookmark(id)
        return true
      }
    } catch (err) {
      // Rollback on failure
      setBookmarkedIds(prev => {
        const next = new Set(prev)
        if (currently) next.add(id)
        else           next.delete(id)
        return next
      })
      throw err
    }
  }, [bookmarkedIds])

  return { bookmarkedIds, isBookmarked, toggleBookmark, refresh, loading }
}