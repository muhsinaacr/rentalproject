// AI Roommate & Room Matcher Service
// Scores compatibility between a seeker and a listing (0-100)

function calculateMatchScore(seekerProfile, listing) {
  let score = 0
  let maxScore = 0
  const reasons = []
  const mismatches = []

  // ── Budget Match (25 points) ──────────────────────────
  maxScore += 25
  const seekerBudget = Number(seekerProfile.budget_max || seekerProfile.budget || 0)
  const listingRent = Number(listing.rent || listing.price || 0)

  if (seekerBudget > 0 && listingRent > 0) {
    if (listingRent <= seekerBudget) {
      score += 25
      reasons.push('✅ Within your budget')
    } else if (listingRent <= seekerBudget * 1.1) {
      score += 15
      reasons.push('⚠️ Slightly above budget')
    } else {
      mismatches.push('❌ Above your budget')
    }
  }

  // ── Location Match (20 points) ────────────────────────
  maxScore += 20
  const seekerLocation = (seekerProfile.preferred_location || '').toLowerCase()
  const listingLocation = (listing.location || '').toLowerCase()

  if (seekerLocation && listingLocation) {
    if (listingLocation.includes(seekerLocation) || seekerLocation.includes(listingLocation)) {
      score += 20
      reasons.push('✅ Matches your preferred location')
    } else {
      score += 5
      mismatches.push('📍 Different from preferred location')
    }
  }

  // ── Food Preference (15 points) ───────────────────────
  maxScore += 15
  const seekerFood = (seekerProfile.food_pref || 'any').toLowerCase()
  const listingFood = (listing.food_pref || 'any').toLowerCase()

  if (seekerFood === 'any' || listingFood === 'any') {
    score += 15
    reasons.push('✅ Food preference compatible')
  } else if (seekerFood === listingFood) {
    score += 15
    reasons.push('✅ Same food preference')
  } else {
    mismatches.push('🍽️ Food preference mismatch')
  }

  // ── Gender Preference (10 points) ────────────────────
  maxScore += 10
  const seekerGender = (seekerProfile.gender_pref || 'any').toLowerCase()
  const listingGender = (listing.gender_pref || 'any').toLowerCase()

  if (listingGender === 'any' || seekerGender === 'any' || listingGender === seekerGender) {
    score += 10
    reasons.push('✅ Gender preference matched')
  } else {
    mismatches.push('👤 Gender preference not matched')
  }

  // ── Smoking (10 points) ───────────────────────────────
  maxScore += 10
  const seekerSmoking = seekerProfile.smoking === true || seekerProfile.smoking === 1
  const listingSmokingAllowed = listing.smoking_allowed === true || listing.smoking_allowed === 1

  if (!seekerSmoking) {
    score += 10
    reasons.push('✅ Non-smoking compatible')
  } else if (seekerSmoking && listingSmokingAllowed) {
    score += 10
    reasons.push('✅ Smoking allowed')
  } else {
    mismatches.push('🚬 Smoking not allowed here')
  }

  // ── Pets (10 points) ──────────────────────────────────
  maxScore += 10
  const seekerPets = seekerProfile.pets === true || seekerProfile.pets === 1
  const listingPetsAllowed = listing.pets_allowed === true || listing.pets_allowed === 1

  if (!seekerPets) {
    score += 10
  } else if (seekerPets && listingPetsAllowed) {
    score += 10
    reasons.push('✅ Pets allowed')
  } else {
    mismatches.push('🐾 Pets not allowed here')
  }

  // ── Amenities Bonus (10 points) ──────────────────────
  maxScore += 10
  const listingAmenities = (listing.amenities || '').toLowerCase()
  const wantedAmenities = ['wifi', 'ac', 'parking', 'gym', 'lift']
  const matchedAmenities = wantedAmenities.filter(a => listingAmenities.includes(a))

  if (matchedAmenities.length >= 3) {
    score += 10
    reasons.push(`✅ Great amenities: ${matchedAmenities.join(', ').toUpperCase()}`)
  } else if (matchedAmenities.length > 0) {
    score += 5
    reasons.push(`✅ Has: ${matchedAmenities.join(', ').toUpperCase()}`)
  }

  // Calculate final percentage
  const percentage = Math.round((score / maxScore) * 100)

  let label = ''
  let color = ''
  if (percentage >= 85) { label = 'Excellent Match'; color = '#10b981' }
  else if (percentage >= 70) { label = 'Good Match'; color = '#3b82f6' }
  else if (percentage >= 50) { label = 'Fair Match'; color = '#f59e0b' }
  else { label = 'Poor Match'; color = '#ef4444' }

  return { score: percentage, label, color, reasons, mismatches }
}

module.exports = { calculateMatchScore }