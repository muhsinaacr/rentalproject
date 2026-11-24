// AI Price Recommendation Service
// Rule-based system — can be upgraded to ML model later

const locationMultipliers = {
  'ernakulam': 1.3,
  'kakkanad': 1.1,
  'edapally': 1.2,
  'aluva': 0.9,
  'thrippunithura': 0.85,
  'palarivattom': 1.25,
  'vyttila': 1.2,
  'vytilla': 1.2,
  'kochi': 1.15,
  'thrissur': 0.95,
  'kozhikode': 0.9,
  'calicut': 0.9,
  'thiruvananthapuram': 1.0,
  'trivandrum': 1.0,
  'kollam': 0.85,
  'palakkad': 0.8,
  'kannur': 0.85,
}

const basePrices = {
  'Single': 6000,
  'Shared': 4000,
  'Studio': 9000,
  'Apartment - 1BHK': 10000,
  'Apartment - 2BHK': 15000,
  'Apartment - 3BHK': 22000,
  'Apartment - 4BHK': 30000,
  'single': 6000,
  'shared': 4000,
  'studio': 9000,
  'apartment - 1bhk': 10000,
  'apartment - 2bhk': 15000,
  'apartment - 3bhk': 22000,
  'apartment - 4bhk': 30000,
}

const premiumAmenities = ['AC', 'Gym', 'Parking', 'Swimming Pool', 'Lift']

// Furnishing multipliers: Fully Furnished commands highest rent
const furnishingMultipliers = {
  'Fully Furnished':  1.20,
  'fully furnished':  1.20,
  'Semi Furnished':   1.08,
  'semi furnished':   1.08,
  'Unfurnished':      1.00,
  'unfurnished':      1.00,
}

const furnishingLabels = {
  'Fully Furnished': 'Fully furnished adds a 20% premium over unfurnished',
  'Semi Furnished':  'Semi furnished adds an 8% premium over unfurnished',
  'Unfurnished':     'Unfurnished baseline — adding furnishing would increase market value',
}

function getPriceRecommendation(location, roomType, amenities = '', furnished = 'Fully Furnished') {
  const basePrice = basePrices[roomType] || 6000

  const loc = (location || '').toLowerCase()
  const matchedKey = Object.keys(locationMultipliers).find(k => loc.includes(k))
  const multiplier = matchedKey ? locationMultipliers[matchedKey] : 1.0

  // Normalise furnished value
  const furnishedNorm = (furnished || 'Fully Furnished').trim()
  const furnishingMult = furnishingMultipliers[furnishedNorm] ?? 1.0

  const amenityList = (amenities || '').toLowerCase()
  const premiumCount = premiumAmenities.filter(a => amenityList.includes(a.toLowerCase())).length
  const amenityBonus = premiumCount * 400

  const base = Math.round((basePrice * multiplier * furnishingMult + amenityBonus) / 100) * 100
  const min = base
  const max = Math.round((base * 1.25) / 100) * 100

  let advice = ''
  if (!matchedKey) {
    advice = 'Location not in our database yet — showing general Kerala rates'
  } else {
    advice = `Based on ${matchedKey.charAt(0).toUpperCase() + matchedKey.slice(1)} market rates`
  }

  return {
    min,
    max,
    advice,
    furnishingLabel: furnishingLabels[furnishedNorm] || '',
    breakdown: {
      basePrice,
      locationMultiplier: multiplier,
      furnishingMultiplier: furnishingMult,
      amenityBonus,
      premiumAmenitiesFound: premiumCount
    }
  }
}

function evaluateUserPrice(userPrice, min, max) {
  const price = Number(userPrice)
  if (price >= min && price <= max) {
    return { status: 'good', message: '✅ Your price is in the recommended range!' }
  } else if (price < min) {
    return { status: 'low', message: `⚠️ Price might be too low — you could charge up to ₹${max.toLocaleString()}` }
  } else {
    return { status: 'high', message: `⚠️ Price is above market rate — may reduce inquiries` }
  }
}

module.exports = { getPriceRecommendation, evaluateUserPrice }