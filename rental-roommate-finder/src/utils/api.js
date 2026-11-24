// src/utils/api.js
const BASE_URL = 'http://localhost:5000/api'

function getToken() {
  return sessionStorage.getItem('token')
}

function getAdminToken() {
  return sessionStorage.getItem('adminToken')
}

async function request(method, path, body) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getToken()}`
    }
  }
  if (body) options.body = JSON.stringify(body)
  const res  = await fetch(BASE_URL + path, options)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Something went wrong')
  return data
}

async function adminRequest(method, path, body) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getAdminToken()}`
    }
  }
  if (body) options.body = JSON.stringify(body)
  const res  = await fetch(BASE_URL + path, options)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Something went wrong')
  return data
}

async function requestMultipart(method, path, formData) {
  const res = await fetch(BASE_URL + path, {
    method,
    headers: { 'Authorization': `Bearer ${getToken()}` },
    body: formData
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Something went wrong')
  return data
}

export const api = {
  // ─── Auth ────────────────────────────────────────────────────────────────
  register: (data) => request('POST', '/auth/register', data),
  login:    (data) => request('POST', '/auth/login',    data),

  // ─── Listings ────────────────────────────────────────────────────────────
  getListings:   (filters = {}) => request('GET', `/listings?${new URLSearchParams(filters)}`),
  getListing:    (id, notrack = false) => request('GET', `/listings/${id}${notrack ? '?notrack=1' : ''}`),
  getMyListings: ()             => request('GET', '/listings/owner/mine'),

  createListing: (data) => {
    const fd = new FormData()
    const fields = [
      'title', 'description', 'location', 'rent', 'deposit',
      'room_type', 'furnishing', 'available_from', 'amenities',
      'gender_pref', 'food_pref', 'smoking_allowed', 'pets_allowed'
    ]
    fields.forEach(key => {
      if (data[key] !== undefined && data[key] !== null) fd.append(key, data[key])
    })
    if (Array.isArray(data.photoFiles)) {
      data.photoFiles.forEach(file => fd.append('photos', file))
    }
    return requestMultipart('POST', '/listings', fd)
  },

  updateListing:        (id, data)       => request('PUT',    `/listings/${id}`, data),
  deleteListing:        (id)             => request('DELETE', `/listings/${id}`),
  toggleListingStatus:  (id, is_active)  => request('PATCH',  `/listings/${id}/status`, { is_active }),

  // ─── Subscriptions ───────────────────────────────────────────────────────
  getSubscriptionStatus: () => request('GET', '/subscriptions/status'),
  activateMockPremium:   () => request('POST', '/subscriptions/mock-activate'),
  createPaymentOrder:    () => request('POST', '/subscriptions/create-order'),
  verifyPayment:       (data) => request('POST', '/subscriptions/verify', data),
  // Records any mock payment (contact unlock, agreement, boost) to the DB
  recordPayment:       (data) => request('POST', '/subscriptions/record-payment', data),

  // ─── Bookmarks ───────────────────────────────────────────────────────────
  getBookmarks:       ()          => request('GET',    '/bookmarks'),
  // Lightweight: returns only the array of bookmarked listing IDs.
  // Used by useBookmarks hook on every page to sync the save-button state.
  getBookmarkIds:     ()          => request('GET',    '/bookmarks/ids'),
  addBookmark:        (id)        => request('POST',   `/bookmarks/${id}`),
  removeBookmark:     (id)        => request('DELETE', `/bookmarks/${id}`),
  // Save the seeker's personal note on a bookmarked listing.
  updateBookmarkNote: (id, note)  => request('PATCH',  `/bookmarks/${id}/note`, { note }),

  // ─── Visits ──────────────────────────────────────────────────────────────
  bookVisit:         (data)       => request('POST',  '/visits', data),
  getMyVisits:       ()           => request('GET',   '/visits/mine'),
  getOwnerVisits:    ()           => request('GET',   '/visits/owner'),
  updateVisitStatus: (id, status) => request('PATCH', `/visits/${id}/status`, { status }),
  cancelVisit:       (id)         => request('PATCH', `/visits/${id}/status`, { status: 'cancelled' }),
  updateVisit:       (id, status) => request('PATCH', `/visits/${id}/status`, { status }),

  // ─── Messages (Chat Engine) ───────────────────────────────────────────────
  // OLD generic methods kept so nothing else in the app breaks
  getContacts:  ()       => request('GET',  '/messages'),
  getMessages:  (userId) => request('GET',  `/messages/${userId}`),
  sendMessage:  (data)   => request('POST', '/messages', data),

  // NEW structured chat methods — used by SeekerChat and OwnerChat
  /** Returns { owner: [...], roommate: [...] } for the logged-in user */
  getConversations: () => request('GET', '/messages/conversations'),

  /** Full message thread for a specific listing + user pair (marks as read) */
  getOwnerMessages: (listingId, otherId) =>
    request('GET', `/messages/owner/${listingId}/${otherId}`),

  /** Full message thread for a roommate pair (marks as read) */
  getRoommateMessages: (otherId) =>
    request('GET', `/messages/roommate/${otherId}`),

  /** Send to owner — blocked by backend if contact not unlocked (₹29) */
  sendOwnerMessage: (data) => request('POST', '/messages/owner', data),

  /** Send to AI-matched roommate — completely free, no unlock needed */
  sendRoommateMessage: (data) => request('POST', '/messages/roommate', data),

  // ─── Notifications ───────────────────────────────────────────────────────
  getNotifications:     (params = {}) => request('GET', `/notifications?${new URLSearchParams(params)}`),
  getUnreadCount:       ()             => request('GET', '/notifications/unread-count'),
  markAllRead:          ()             => request('PUT', '/notifications/read-all'),
  markNotificationRead: (id)           => request('PATCH', `/notifications/${id}/read`),
  deleteNotification:   (id)           => request('DELETE', `/notifications/${id}`),
  getOwnerNotifications: (params = {}) => request('GET', `/owner/notifications?${new URLSearchParams(params)}`),
  markOwnerNotificationRead: (id)      => request('PATCH', `/owner/notifications/${id}/read`),
  markOwnerAllRead:           ()       => request('PATCH', '/owner/notifications/read-all'),

  // ─── Profile ─────────────────────────────────────────────────────────────
  getProfile:        ()       => request('GET',  '/profile'),
  getOwnerProfile:   (userId) => request('GET',  `/profile/owner/${userId}`),
  getSeekerProfile:  (userId) => request('GET',  `/profile/seeker/${userId}`),
  getOwnerListings:  (userId) => request('GET',  `/listings/owner/${userId}/listings`),
  saveSeekerProfile: (data)   => request('POST', '/profile/seeker', data),

  // saveOwnerProfile — sends multipart if id_document File is present, else JSON
  saveOwnerProfile: async (data) => {
    if (data.id_document instanceof File) {
      const fd = new FormData()
      const fields = ['age', 'occupation', 'phone', 'city', 'bio', 'id_type', 'id_number']
      fields.forEach(k => { if (data[k] != null && data[k] !== '') fd.append(k, String(data[k])) })
      fd.append('id_document', data.id_document)
      return requestMultipart('POST', '/profile/owner', fd)
    }
    return request('POST', '/profile/owner', data)
  },

  // ─── AI ──────────────────────────────────────────────────────────────────
  getPriceRecommendation: (location, roomType, amenities, userPrice) =>
    request('GET', `/ai/price-recommendation?location=${encodeURIComponent(location || '')}&roomType=${encodeURIComponent(roomType || '')}&amenities=${encodeURIComponent(amenities || '')}&userPrice=${encodeURIComponent(userPrice || '')}`),
  getMatches:    ()           => request('GET', '/ai/matches'),
  getMatchScore: (listingId)  => request('GET', `/ai/match-score/${listingId}`),
  getFraudCheck: (listingId)  => request('GET', `/ai/fraud-check/${listingId}`),

  // ─── Admin ───────────────────────────────────────────────────────────────
  getStats:             () =>                adminRequest('GET',    '/admin/stats'),
  getAllUsers:          (params = {}) =>      adminRequest('GET',    `/admin/users?${new URLSearchParams(params)}`),
  getAllListings:       () =>                 adminRequest('GET',    '/admin/listings'),
  deleteUser:          (id) =>               adminRequest('DELETE', `/admin/users/${id}`),
  updateUser:          (id, data) =>         adminRequest('PUT',    `/admin/users/${id}`, data),
  updateListingStatus: (id, status) =>       adminRequest('PUT',    `/admin/listings/${id}/status`, { status }),

  // Overview & Analytics
  getAdminOverview:    () =>                 adminRequest('GET', '/admin/analytics/overview'),
  getUserGrowth:       () =>                 adminRequest('GET', '/admin/analytics/user-growth'),
  getFraudAnalytics:   () =>                 adminRequest('GET', '/admin/analytics/fraud'),
  getLocationAnalytics:() =>                 adminRequest('GET', '/admin/analytics/locations'),
  getRentTrends:       () =>                 adminRequest('GET', '/admin/analytics/rent-trends'),
  getAiMatchStats:     () =>                 adminRequest('GET', '/admin/analytics/ai-matches'),
  getPlatformHealth:   () =>                 adminRequest('GET', '/admin/analytics/platform-health'),
  getRevenueTrend:     () =>                 adminRequest('GET', '/admin/analytics/revenue-trend'),
  getVisitsTrend:      () =>                 adminRequest('GET', '/admin/analytics/visits-trend'),
  getListingTypes:     () =>                 adminRequest('GET', '/admin/analytics/listing-types'),
  getReportTrends:     () =>                 adminRequest('GET', '/admin/analytics/report-trends'),
  getTopListings:      () =>                 adminRequest('GET', '/admin/analytics/top-listings'),

  // Reports
  getAdminReports:     (params = {}) =>      adminRequest('GET', `/admin/reports?${new URLSearchParams(params)}`),
  submitReport:        (data) =>             request('POST', '/admin/reports', data),
  resolveReport:       (id, note = '') =>    adminRequest('PUT', `/admin/reports/${id}/resolve`,  { admin_note: note }),
  dismissReport:       (id, note = '') =>    adminRequest('PUT', `/admin/reports/${id}/dismiss`,  { admin_note: note }),
  warnReport:          (id, note = '') =>    adminRequest('PUT', `/admin/reports/${id}/warn`,     { admin_note: note }),

  // Payments
  getAdminPayments:    (params = {}) =>      adminRequest('GET', `/admin/payments?${new URLSearchParams(params)}`),
  getPaymentsSummary:  () =>                 adminRequest('GET', '/admin/payments/summary'),

  // ─── AI Roommate Matcher ─────────────────────────────────────────────────
  getMatcherProfiles: () => request('GET', '/matcher/profiles'),

  checkCompatibility: (currentUserId, targetUserId) =>
    request('POST', '/matcher/compatibility', { currentUserId, targetUserId }),

  // Calls Nominatim DIRECTLY from the browser — no backend proxy needed
  searchLocationSuggestions: async (q) => {
    if (!q || q.trim().length < 2) return []
    const url = new URL('https://nominatim.openstreetmap.org/search')
    url.searchParams.set('q', q.trim())
    url.searchParams.set('format', 'json')
    url.searchParams.set('limit', '7')
    url.searchParams.set('addressdetails', '1')
    url.searchParams.set('countrycodes', 'in')
    try {
      const res = await fetch(url.toString(), {
        headers: { 'Accept-Language': 'en' }
      })
      if (!res.ok) return []
      const data = await res.json()
      return data.map(place => {
        const a = place.address || {}
        const parts = [
          a.suburb || a.neighbourhood || a.quarter || a.village || a.hamlet,
          a.city || a.town || a.municipality || a.county || a.state_district,
          a.state,
        ].filter(Boolean)
        const unique = parts.filter((v, i) => parts[i - 1] !== v)
        return {
          display: place.display_name,
          short:   unique.slice(0, 3).join(', ') || place.display_name,
          lat:     parseFloat(place.lat),
          lng:     parseFloat(place.lon),
        }
      })
    } catch {
      return []
    }
  },

  // Search profiles by real lat/lng — sorted by Haversine distance
  searchProfilesByLatLng: ({ lat, lng, locationLabel }) =>
    request('POST', '/matcher/search', { lat, lng, locationLabel }),

  startMatcherChat: (targetUserId) =>
    request('POST', '/matcher/chat/start', { targetUserId }),

  // ── WhatsApp Request System ───────────────────────────────────────────────
  /** Send a WhatsApp number request to another seeker */
  sendWhatsAppRequest: (targetUserId, message) =>
    request('POST', `/whatsapp-requests/request/${targetUserId}`, { message }),

  /** Check the status of MY outgoing request to targetUserId */
  getWhatsAppRequestStatus: (targetUserId) =>
    request('GET', `/whatsapp-requests/status/${targetUserId}`),

  /** Get all incoming requests (pending/accepted/rejected) for me as receiver */
  getAllIncomingRequests: () =>
    request('GET', '/whatsapp-requests/all-incoming'),

  /** Get only pending incoming requests */
  getIncomingPendingRequests: () =>
    request('GET', '/whatsapp-requests/incoming'),

  /** Accept or reject an incoming request */
  respondToWhatsAppRequest: (requestId, action) =>
    request('POST', `/whatsapp-requests/respond/${requestId}`, { action }),

  /** Get WhatsApp number after acceptance */
  getApprovedWhatsAppNumber: (targetUserId) =>
    request('GET', `/whatsapp-requests/number/${targetUserId}`),

  /** Get all outgoing requests I've sent */
  getSentWhatsAppRequests: () =>
    request('GET', '/whatsapp-requests/sent'),

  saveSeekerProfileExtended: (data) => request('POST', '/profile/seeker', data),

  // ── Contact unlock system ─────────────────────────────────────────────────
  // SECURITY: These are the ONLY methods that should determine contact visibility.
  // Boost status NEVER affects contact access.

  /** Check if the current seeker has unlocked contact for a specific listing. */
  getContactStatus: (listingId) =>
    request('GET', `/contacts/status/${listingId}`),

  /** Record unlock after payment — ties access to (user, listingId) in DB. */
  getUnlockedListingIds: () =>
    request('GET', '/contacts/unlocked-ids'),
  recordContactUnlock: (listingId, paymentId) =>
    request('POST', `/contacts/unlock/${listingId}`, { paymentId }),

  /** Fetch owner phone ONLY after server-side unlock verification. */
  getContactPhone: (listingId) =>
    request('GET', `/contacts/phone/${listingId}`),

  // ── Boost system ───────────────────────────────────────────────────────────
  // Boost = visibility feature ONLY (sort priority + badge).
  // Boost has ZERO effect on contact access.

  /** Record a listing boost in the DB after payment. */
  boostListing: (listingId, paymentId, method) =>
    request('POST', `/listings/${listingId}/boost`, { paymentId, method }),

  /** Fetch which of the owner's listings are currently boosted. */
  getBoostedListings: () =>
    request('GET', '/listings/owner/boosted'),

  // ── Reviews ───────────────────────────────────────────────────────────────

  /** All reviews (global Reviews page). Optionally pass { listing_id } to filter. */
  getReviews: (params = {}) =>
    request('GET', `/reviews?${new URLSearchParams(params)}`),

  /** Reviews for a single listing (ListingDetail panel). */
  getListingReviews: (listingId) =>
    request('GET', `/reviews/listing/${listingId}`),

  /** Aggregate stats: { total, avg_rating, histogram: {5,4,3,2,1} } */
  getReviewStats: () =>
    request('GET', '/reviews/stats'),

  /** Submit a review. Body: { listing_id, rating, text } */
  submitReview: (data) =>
    request('POST', '/reviews', data),

  /** Update own review by id. Body: { rating, text } */
  updateReview: (reviewId, data) =>
    request('PUT', `/reviews/${reviewId}`, data),

  /** Delete own review by id. */
  deleteReview: (reviewId) =>
    request('DELETE', `/reviews/${reviewId}`),

  // ── Review Replies (Owner only) ───────────────────────────────────────────

  /** Get reply for a specific review. */
  getReviewReply: (reviewId) =>
    request('GET', `/reviews/${reviewId}/reply`),

  /** Post or update owner reply to a review. Body: { text } */
  replyToReview: (reviewId, data) =>
    request('POST', `/reviews/${reviewId}/reply`, data),

  /** Delete owner reply to a review. */
  deleteReviewReply: (reviewId) =>
    request('DELETE', `/reviews/${reviewId}/reply`),

  // ── Owner Review Badge (backend-powered) ─────────────────────────────────

  /** Returns { count: N } — unread review notifications for the logged-in owner. */
  getOwnerReviewBadge: () =>
    request('GET', '/reviews/owner/badge'),

  /** Marks all review-type notifications as read (called when owner opens Reviews page). */
  markOwnerReviewsSeen: () =>
    request('PATCH', '/reviews/owner/mark-seen'),

}