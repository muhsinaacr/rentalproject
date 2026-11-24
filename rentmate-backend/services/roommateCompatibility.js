// services/roommateCompatibility.js
// Rule-based AI: calculates compatibility score between two seeker profiles
// Each attribute carries a weight; total = 100%

const WEIGHTS = {
  food:          15,   // Food preference (veg/non-veg)
  smoking:       10,   // Smoking habit
  drinking:      10,   // Drinking habit
  cleanliness:   15,   // Cleanliness expectation
  noise:         10,   // Noise tolerance
  sleep_schedule:10,   // Sleep/wake schedule
  personality:   15,   // Introvert / extrovert
  guests:        15,   // Guest frequency preference
}

// ─── Normalise helper ────────────────────────────────────────────────────────
function norm(val, fallback = '') {
  return (val || fallback).toString().toLowerCase().trim()
}

// ─── Per-attribute scorers ───────────────────────────────────────────────────
function scoreFood(a, b) {
  const va = norm(a.food_pref, 'any')
  const vb = norm(b.food_pref, 'any')
  if (va === 'any' || vb === 'any') return WEIGHTS.food     // flexible
  return va === vb ? WEIGHTS.food : 0
}

function scoreSmoke(a, b) {
  const va = norm(a.smoking, 'no')
  const vb = norm(b.smoking, 'no')
  // '0'/'false'/'no' all mean non-smoker
  const smokeA = !['0','false','no',''].includes(va)
  const smokeB = !['0','false','no',''].includes(vb)
  if (smokeA === smokeB) return WEIGHTS.smoking
  // One smokes, other uses 'okay' → partial credit
  const okA = va === 'okay'
  const okB = vb === 'okay'
  if (okA || okB) return Math.round(WEIGHTS.smoking * 0.5)
  return 0
}

function scoreDrink(a, b) {
  const va = norm(a.drinking, 'no')
  const vb = norm(b.drinking, 'no')
  const drinkA = !['0','false','no',''].includes(va)
  const drinkB = !['0','false','no',''].includes(vb)
  if (drinkA === drinkB) return WEIGHTS.drinking
  const okA = va === 'okay'
  const okB = vb === 'okay'
  if (okA || okB) return Math.round(WEIGHTS.drinking * 0.5)
  return 0
}

function scoreCleanliness(a, b) {
  // Levels: very clean > moderate/clean > relaxed
  const rank = { 'very clean': 3, 'clean': 2, 'moderate': 2, 'relaxed': 1, 'flexible': 2 }
  const ra = rank[norm(a.cleanliness_level, 'moderate')] || 2
  const rb = rank[norm(b.cleanliness_level, 'moderate')] || 2
  if (ra === rb)        return WEIGHTS.cleanliness
  if (Math.abs(ra-rb) === 1) return Math.round(WEIGHTS.cleanliness * 0.6)
  return 0
}

function scoreNoise(a, b) {
  const rank = { quiet: 1, moderate: 2, loud: 3 }
  const ra = rank[norm(a.noise_tolerance, 'moderate')] || 2
  const rb = rank[norm(b.noise_tolerance, 'moderate')] || 2
  if (ra === rb)        return WEIGHTS.noise
  if (Math.abs(ra-rb) === 1) return Math.round(WEIGHTS.noise * 0.5)
  return 0
}

function scoreSleep(a, b) {
  const va = norm(a.sleep_schedule || a.sleep_time, 'flexible')
  const vb = norm(b.sleep_schedule || b.sleep_time, 'flexible')
  if (va === 'flexible' || vb === 'flexible') return WEIGHTS.sleep_schedule
  if (va === vb) return WEIGHTS.sleep_schedule
  return 0
}

function scorePersonality(a, b) {
  const va = norm(a.personality_type, 'ambivert')
  const vb = norm(b.personality_type, 'ambivert')
  if (va === vb)                          return WEIGHTS.personality
  if (va === 'ambivert' || vb === 'ambivert') return Math.round(WEIGHTS.personality * 0.7)
  return Math.round(WEIGHTS.personality * 0.3)  // introvert+extrovert can still work
}

function scoreGuests(a, b) {
  const rank = { rarely: 1, sometimes: 2, often: 3 }
  const ra = rank[norm(a.guest_preference, 'sometimes')] || 2
  const rb = rank[norm(b.guest_preference, 'sometimes')] || 2
  if (ra === rb)        return WEIGHTS.guests
  if (Math.abs(ra-rb) === 1) return Math.round(WEIGHTS.guests * 0.5)
  return 0
}

// ─── Main function ───────────────────────────────────────────────────────────
function calculateRoommateCompatibility(profileA, profileB) {
  const scores = {
    food:           scoreFood(profileA, profileB),
    smoking:        scoreSmoke(profileA, profileB),
    drinking:       scoreDrink(profileA, profileB),
    cleanliness:    scoreCleanliness(profileA, profileB),
    noise:          scoreNoise(profileA, profileB),
    sleep_schedule: scoreSleep(profileA, profileB),
    personality:    scorePersonality(profileA, profileB),
    guests:         scoreGuests(profileA, profileB),
  }

  const total = Object.values(scores).reduce((s, v) => s + v, 0)
  const max   = Object.values(WEIGHTS).reduce((s, v) => s + v, 0)
  const percentage = Math.round((total / max) * 100)

  // Classify each attribute
  const strengths = []
  const risks     = []
  const suggestions = []

  if (scores.food          === WEIGHTS.food)           strengths.push('Compatible food preferences')
  else                                                  risks.push('Different food preferences')

  if (scores.smoking        === WEIGHTS.smoking)        strengths.push('Same smoking preference')
  else if (scores.smoking   > 0)                        suggestions.push('Discuss smoking boundaries upfront')
  else                                                  risks.push('Different smoking habits — needs adjustment')

  if (scores.drinking       === WEIGHTS.drinking)       strengths.push('Same drinking preference')
  else if (scores.drinking  > 0)                        suggestions.push('Clarify drinking comfort zones')
  else                                                  risks.push('Different drinking habits')

  if (scores.cleanliness    === WEIGHTS.cleanliness)    strengths.push('Matching cleanliness standards')
  else if (scores.cleanliness > 0)                      suggestions.push('Set shared cleaning responsibilities upfront')
  else                                                  risks.push('Different cleanliness expectations')

  if (scores.noise          === WEIGHTS.noise)          strengths.push('Similar noise tolerance')
  else if (scores.noise     > 0)                        suggestions.push('Agree on noise levels during work/study hours')
  else                                                  risks.push('Different noise tolerance — may cause issues')

  if (scores.sleep_schedule === WEIGHTS.sleep_schedule) strengths.push('Compatible sleep schedules')
  else                                                  risks.push('Different sleep schedules — may cause issues')

  if (scores.personality    === WEIGHTS.personality)    strengths.push('Similar personality types')
  else if (scores.personality > 0)                      suggestions.push('Different personality types — needs adjustment')
  else                                                  risks.push('Very different personality types — needs adjustment')

  if (scores.guests         === WEIGHTS.guests)         strengths.push('Same guest preference')
  else if (scores.guests    > 0)                        suggestions.push('Discuss quiet hours to avoid disturbances')
  else                                                  risks.push('Different guest preferences')

  // If risks exist, ensure suggestions always has at least one item
  if (risks.length > 0 && suggestions.length === 0) {
    suggestions.push('Have an open conversation about house rules before moving in')
  }

  return {
    score: percentage,
    strengths,
    risks,
    suggestions,
    breakdown: scores,
  }
}

module.exports = { calculateRoommateCompatibility }