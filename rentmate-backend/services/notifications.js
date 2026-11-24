// services/notifications.js
// ─────────────────────────────────────────────────────────────────────────────
// Central helper for creating notifications.
//
// TYPES:
//   'match'    – AI match found
//   'message'  – New chat message
//   'visit'    – Visit request (owner receives) / status update (seeker receives)
//   'inquiry'  – Seeker inquiry on a listing
//   'review'   – Seeker left a review on owner's listing
//   'fraud'    – Fraud / suspicious listing alert
//   'listing'  – New listing in seeker's preferred area
//   'system'   – Generic system update
// ─────────────────────────────────────────────────────────────────────────────

const db = require('../db')

/**
 * Insert a notification row for a user.
 *
 * @param {number}      userId     - Recipient user ID
 * @param {string}      type       - Notification type
 * @param {string}      title      - Short heading shown in UI
 * @param {string}      message    - Descriptive body text
 * @param {object|null} [meta]     - Optional JSON payload
 * @param {number|null} [relatedId]- FK to triggering record
 */
async function createNotification(userId, type, title, message, meta = null, relatedId = null) {
  if (!userId || !title || !message) return
  // FIX: do NOT catch here — let the error propagate so callers
  // (reviews, visits, messages routes) can log the real DB error.
  // Each caller already wraps in its own try/catch.
  await db.query(
    `INSERT INTO notifications (user_id, type, title, message, is_read, meta, related_id)
     VALUES (?, ?, ?, ?, 0, ?, ?)`,
    [userId, type, title, message, meta ? JSON.stringify(meta) : null, relatedId ?? null]
  )
}

// ─── Seeker-facing helpers ────────────────────────────────────────────────────

async function notifyAIMatch(seekerId, listingTitle, score, listingId) {
  await createNotification(
    seekerId,
    'match',
    'New AI Match Found! 🤖',
    `A listing "${listingTitle}" matches ${score}% of your preferences.`,
    { listing_id: listingId },
    listingId
  )
}

/**
 * Notify a user that they received a new message.
 *
 * @param {number}      recipientId  - Who receives the notification
 * @param {string}      senderName   - Always resolved from DB before calling
 * @param {string}      context      - e.g. "MG Road listing" or "roommate chat"
 * @param {number|null} listingId
 * @param {number|null} senderId
 */
async function notifyNewMessage(recipientId, senderName, context, listingId = null, senderId = null) {
  const name = senderName && senderName !== 'undefined' ? senderName : 'Someone'
  await createNotification(
    recipientId,
    'message',
    'New Message from Seeker 💬',
    `${name} sent you a message${context ? ` about ${context}` : ''}.`,
    { listing_id: listingId, sender_id: senderId },
    listingId
  )
}

async function notifyVisitUpdate(seekerId, listingTitle, visitDate, status, visitId) {
  const approved = status === 'approved'
  await createNotification(
    seekerId,
    'visit',
    approved ? 'Visit Request Approved! ✅' : 'Visit Request Rejected',
    approved
      ? `Your visit to "${listingTitle}" on ${visitDate} has been approved!`
      : `Your visit request for "${listingTitle}" on ${visitDate} was not approved.`,
    { visit_id: visitId },
    visitId
  )
}

async function notifyVisitBooked(seekerId, listingTitle, visitDate, visitId) {
  await createNotification(
    seekerId,
    'visit',
    'Visit Request Sent 📅',
    `Your visit request for "${listingTitle}" on ${visitDate} is pending owner approval.`,
    { visit_id: visitId },
    visitId
  )
}

// ─── Owner-facing helpers ─────────────────────────────────────────────────────

/**
 * Notify owner: seeker sent a message about their listing.
 *
 * @param {number} ownerId
 * @param {string} seekerName   - Always resolved from DB, never undefined
 * @param {string} listingTitle
 * @param {number} listingId
 * @param {number} seekerId
 */
async function notifyOwnerNewMessage(ownerId, seekerName, listingTitle, listingId, seekerId) {
  const name = seekerName && seekerName !== 'undefined' ? seekerName : 'A seeker'
  await createNotification(
    ownerId,
    'message',
    'New Message from Seeker 💬',
    `${name} sent you a message about "${listingTitle}".`,
    { listing_id: listingId, sender_id: seekerId },
    listingId
  )
}

/**
 * Notify owner: seeker requested a visit.
 *
 * @param {number} ownerId
 * @param {string} seekerName
 * @param {string} listingTitle
 * @param {string} visitDate
 * @param {string} visitTime
 * @param {number} visitId
 * @param {number} listingId
 * @param {number} seekerId
 */
async function notifyOwnerVisitRequest(ownerId, seekerName, listingTitle, visitDate, visitTime, visitId, listingId, seekerId) {
  const name = seekerName && seekerName !== 'undefined' ? seekerName : 'A seeker'
  await createNotification(
    ownerId,
    'visit',
    'New Visit Request! 📅',
    `${name} wants to visit "${listingTitle}" on ${visitDate} at ${visitTime}.`,
    { visit_id: visitId, listing_id: listingId, seeker_id: seekerId },
    visitId
  )
}

/**
 * Notify owner: seeker made an inquiry on their listing.
 *
 * @param {number} ownerId
 * @param {string} seekerName
 * @param {string} listingTitle
 * @param {number} listingId
 * @param {number} seekerId
 * @param {string} [inquiryText]
 */
async function notifyOwnerInquiry(ownerId, seekerName, listingTitle, listingId, seekerId, inquiryText = '') {
  const name = seekerName && seekerName !== 'undefined' ? seekerName : 'A seeker'
  await createNotification(
    ownerId,
    'inquiry',
    'New Inquiry on Listing 🔍',
    `${name} is interested in your listing "${listingTitle}".${inquiryText ? ` They said: "${inquiryText.substring(0, 80)}${inquiryText.length > 80 ? '…' : ''}"` : ''}`,
    { listing_id: listingId, seeker_id: seekerId },
    listingId
  )
}

/**
 * Notify owner: seeker left a review on their listing.
 * Includes seekerName, listingTitle, rating, and message (review text).
 *
 * @param {number} ownerId
 * @param {string} seekerName   - Full name of the reviewer (from DB join)
 * @param {string} listingTitle
 * @param {number} rating       - 1–5
 * @param {string} reviewText   - The review message
 * @param {number} reviewId
 * @param {number} listingId
 * @param {number} seekerId
 */
async function notifyOwnerReview(ownerId, seekerName, listingTitle, rating, reviewText, reviewId, listingId, seekerId) {
  const name  = seekerName && seekerName !== 'undefined' ? seekerName : 'A seeker'
  const stars = '⭐'.repeat(Math.min(Math.max(Number(rating), 1), 5))
  const preview = reviewText
    ? `"${reviewText.substring(0, 100)}${reviewText.length > 100 ? '…' : ''}"`
    : ''

  await createNotification(
    ownerId,
    'review',
    `New Review on "${listingTitle}" ${stars}`,
    `${name} rated your listing ${rating}/5. ${preview}`.trim(),
    {
      listing_id:   listingId,
      review_id:    reviewId,
      seeker_id:    seekerId,
      seeker_name:  name,
      listing_title: listingTitle,
      rating:       Number(rating),
      review_text:  reviewText,
    },
    reviewId
  )
}

/**
 * Notify seeker: owner replied to their review.
 *
 * @param {number} seekerId     - The seeker who wrote the original review
 * @param {string} ownerName    - Name of the owner who replied
 * @param {string} listingTitle - Title of the listing being reviewed
 * @param {number} reviewId     - The review that was replied to
 * @param {number} listingId
 * @param {number} ownerId
 */
async function notifySeekerOwnerReply(seekerId, ownerName, listingTitle, reviewId, listingId, ownerId) {
  const name = ownerName && ownerName !== 'undefined' ? ownerName : 'The owner'
  await createNotification(
    seekerId,
    'reply',
    'Owner Replied to Your Review! ↩️',
    `${name} replied to your review on "${listingTitle}".`,
    { review_id: reviewId, listing_id: listingId, owner_id: ownerId },
    reviewId
  )
}

// ─── Bulk / system helpers ────────────────────────────────────────────────────

async function notifyNewListingToMatchingSeekers(listing) {
  try {
    const listingCity = (listing.location || '').split(',')[0].trim().toLowerCase()
    if (!listingCity) return

    const [seekers] = await db.query(
      `SELECT sp.user_id
       FROM seeker_profiles sp
       WHERE LOWER(COALESCE(sp.preferred_location, '')) LIKE ?
         AND COALESCE(sp.budget_max, 99999999) >= ?
       LIMIT 100`,
      [`%${listingCity}%`, listing.rent || 0]
    )

    for (const { user_id } of seekers) {
      const [existing] = await db.query(
        `SELECT id FROM notifications
         WHERE user_id = ? AND type = 'listing'
           AND JSON_EXTRACT(meta, '$.listing_id') = ?
         LIMIT 1`,
        [user_id, listing.id]
      )
      if (existing.length > 0) continue

      await createNotification(
        user_id,
        'listing',
        'New Listing in Your Area 🏠',
        `A new ${listing.room_type || 'room'} is available in ${listing.location} within your budget.`,
        { listing_id: listing.id },
        listing.id
      )
    }
  } catch (err) {
    console.error('[notifications] notifyNewListingToMatchingSeekers error:', err.message)
  }
}

async function notifyFraudAlert(seekerId, listingId, listingTitle) {
  await createNotification(
    seekerId,
    'fraud',
    'Fraud Alert ⚠️',
    `A listing you saved ("${listingTitle}") has been flagged as suspicious by our AI.`,
    { listing_id: listingId },
    listingId
  )
}

module.exports = {
  createNotification,
  // Seeker-facing
  notifyAIMatch,
  notifyNewMessage,
  notifyVisitUpdate,
  notifyVisitBooked,
  notifyNewListingToMatchingSeekers,
  notifyFraudAlert,
  notifySeekerOwnerReply,
  // Owner-facing
  notifyOwnerNewMessage,
  notifyOwnerVisitRequest,
  notifyOwnerInquiry,
  notifyOwnerReview,
}