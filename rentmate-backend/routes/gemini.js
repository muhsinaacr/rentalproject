// routes/gemini.js — RentMate AI: Groq-powered features
// Handles: /api/gemini/chat | /api/gemini/generate-description | /api/gemini/analyze-doc

const express  = require('express')
const router   = express.Router()
const multer   = require('multer')
const authMiddleware = require('../middleware/auth')

const upload    = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })
const GROQ_KEY  = process.env.GROQ_API_KEY
const GROQ_URL  = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL = 'llama-3.3-70b-versatile'  // fast + capable, free tier supported

// ── Core Groq caller ──────────────────────────────────────────────────────────
async function callGroq(messages, maxTokens = 1024) {
  if (!GROQ_KEY) throw new Error('GROQ_API_KEY not set in .env')

  const res = await fetch(GROQ_URL, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${GROQ_KEY}`,
    },
    body: JSON.stringify({
      model:      GROQ_MODEL,
      messages,
      max_tokens: maxTokens,
      temperature: 0.7,
    }),
  })

  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || 'Groq API error')
  const text = data.choices?.[0]?.message?.content
  if (!text) throw new Error('Empty response from Groq')
  return text.trim()
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/gemini/chat
// Body: { message: string, history: [{ role: 'user'|'assistant', text: string }] }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/chat', authMiddleware, async (req, res) => {
  const { message, history = [] } = req.body
  if (!message?.trim()) return res.status(400).json({ error: 'Message is required' })

  const SYSTEM = `You are RentMate AI Assistant — a smart, friendly rental and roommate guide for Kerala, India.

ABOUT THIS PLATFORM:
RentMate is an AI-powered rental and roommate finder platform for Kerala. It helps:
- Room seekers find and book rooms/flats across Kerala
- Owners list their properties with AI-generated descriptions
- Users find compatible roommates using the AI Matcher feature
- Both parties manage visit requests, rental agreements, and chat in one place
Key features: Browse Listings, AI Matcher (roommate compatibility), Visit Scheduler, Doc Analyzer (rental agreement review), Agreement Generator, Rent Analysis, and in-app Chat.
Always promote these platform features when relevant instead of suggesting external tools or third-party apps.

You ONLY answer questions related to: finding rooms/flats/roommates, rental agreements, lease clauses,
tenant rights in Kerala, rent negotiation, security deposits, roommate compatibility,
owner-tenant disputes, maintenance responsibilities, neighbourhood advice for renters,
moving tips, and any rental or housing related topics.

STRICT RULES — NO EXCEPTIONS, even if the user insists or rephrases the request:
1. NEVER write songs, poems, rhymes, lyrics, raps, jingles, limericks, or any creative/entertainment content — even if framed as being "about RentMate" or "about renting". This is strictly off-topic.
2. NEVER answer questions about cooking, sports, movies, music, politics, coding, general knowledge, jokes, or any non-rental topic.
3. If ANY request is off-topic (including creative requests), respond with ONLY this format: "I'm RentMate AI, here to help with rental and roommate questions only. I can't help with [briefly name the off-topic request], but I'd be happy to assist with finding a room, reviewing your lease, or roommate matching in Kerala!"
4. Do NOT attempt a partial answer, a creative workaround, or a rhyme as a "fun redirect". Decline clearly and immediately.

Keep on-topic answers concise (2–4 sentences unless the user needs more), practical, and conversational.
Use ₹ for Indian rupees. Never make up specific property listings or user profiles. If you don't know something, say so honestly.`

  // Build messages array for Groq (OpenAI-compatible format)
  const messages = [
    { role: 'system', content: SYSTEM },
    // Inject conversation history
    ...history.slice(-8).map(h => ({
      role:    h.role === 'user' ? 'user' : 'assistant',
      content: h.text,
    })),
    { role: 'user', content: message },
  ]

  try {
    const reply = await callGroq(messages, 512)
    res.json({ reply })
  } catch (err) {
    console.error('[groq/chat]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/gemini/generate-description
// Body: { title, location, roomType, rent, amenities, furnished, floor, facing, kitchen, bathroom }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/generate-description', authMiddleware, async (req, res) => {
  const { title, location, roomType, rent, amenities, furnished, floor, facing, kitchen, bathroom } = req.body

  if (!location || !roomType || !rent) {
    return res.status(400).json({ error: 'location, roomType, and rent are required to generate a description' })
  }

  const prompt = `You are a professional rental listing copywriter for Kerala, India.
Write a compelling property description using ONLY the details provided below — do NOT invent facts.

Property Details:
• Title: ${title || '(not provided)'}
• Location: ${location}
• Room Type: ${roomType}
• Monthly Rent: ₹${rent}
• Furnishing: ${furnished || 'Fully Furnished'}
• Amenities: ${amenities || 'Standard amenities'}
• Floor: ${floor ? `Floor ${floor}` : '(not specified)'}
• Facing: ${facing || '(not specified)'}
• Kitchen: ${kitchen || 'Shared'}
• Bathroom: ${bathroom || 'Attached'}

Write exactly 3–4 sentences.
- Sentence 1: Introduce the property with its type, location, and best highlight.
- Sentence 2: Mention furnishing and standout amenities.
- Sentence 3: Add a practical detail (bathroom, kitchen, floor/view).
- Sentence 4 (optional): Conclude with who it's ideal for.
Output ONLY the description text. No bullet points, no labels, no extra commentary.`

  const messages = [
    { role: 'system', content: 'You are a professional rental listing copywriter for Kerala, India.' },
    { role: 'user',   content: prompt },
  ]

  try {
    const description = await callGroq(messages, 300)
    res.json({ description })
  } catch (err) {
    console.error('[groq/generate-description]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/gemini/analyze-doc
// Multipart: file (image/PDF) → text extracted free (pdf-parse / tesseract.js)
// OR JSON:   { text, question }  → sent directly
// Both paths go to Groq (free)
// ─────────────────────────────────────────────────────────────────────────────
const Tesseract    = require('tesseract.js')

// Extract text from PDF using pdfjs-dist (ESM, dynamic import)
async function extractPDFText(buffer) {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) })
  const pdf = await loadingTask.promise
  let fullText = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page    = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items.map(item => item.str).join(' ')
    fullText += pageText + '\n'
  }
  return fullText.trim()
}

const ANALYST_CONTEXT = `You are a legal document analyst specializing in Indian tenancy law and Kerala rental agreements.

IMPORTANT: First check if the provided text is actually a rental/tenancy related document (agreement, lease, rent receipt, NOC, police verification, etc.).
If the text is NOT rental-related, respond ONLY with this exact line and nothing else:
NOT_RENTAL_DOCUMENT

If it IS a rental document, analyze it and respond in this exact structure:

## 📋 Summary
(2–3 sentences: what the document is, parties involved, duration)

## 🔑 Key Clauses
(Bullet list of the most important terms — rent, deposit, notice period, maintenance, lock-in, etc.)

## 🚨 Red Flags
(Any clauses that are unfair, unusual, or legally questionable for a tenant in India.
If none, say "No significant red flags found.")

## ✅ Recommendations
(Practical advice — what to negotiate, clarify, or request changes on before signing)

Use plain language. Be specific. Mention actual amounts/durations from the document where present.`

// Extract text from uploaded file (PDF or image) — fully free, no external API
async function extractTextFromFile(file) {
  const isPDF   = file.mimetype === 'application/pdf'
  const isImage = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)

  if (isPDF) {
    const text = await extractPDFText(file.buffer)
    if (!text || text.length < 20) throw new Error('Could not extract text from PDF. It may be scanned/image-based — try paste text instead.')
    return text
  }

  if (isImage) {
    const { data: { text } } = await Tesseract.recognize(file.buffer, 'eng', { logger: () => {} })
    const cleaned = text?.trim()
    if (!cleaned || cleaned.length < 20) throw new Error('Could not read text from image. Ensure the document is clear and well-lit.')
    return cleaned
  }

  throw new Error('Unsupported file type. Use JPG, PNG, WebP, or PDF.')
}

router.post('/analyze-doc', authMiddleware, upload.single('document'), async (req, res) => {
  const { text, question } = req.body
  const file = req.file

  if (!file && !text?.trim()) {
    return res.status(400).json({ error: 'Provide either a document file or paste document text' })
  }

  const userQ = question?.trim()
    || 'Analyze this rental document. Identify key clauses, red flags, and provide recommendations.'

  try {
    let docText = text

    if (file) {
      // Extract text from file first, then send to Groq
      docText = await extractTextFromFile(file)
    }

    // Rental keyword pre-check: reject clearly non-rental content before calling AI
    const rentalKeywords = [
      'rent', 'lease', 'tenant', 'landlord', 'deposit', 'agreement', 'tenancy',
      'monthly', 'premises', 'owner', 'notice', 'evict', 'clause', 'maintenance',
      'property', 'room', 'flat', 'house', 'payment', 'signature', 'stamp'
    ]
    const lowerText = (docText || '').toLowerCase()
    const matchCount = rentalKeywords.filter(k => lowerText.includes(k)).length
    if (matchCount < 2) {
      return res.status(400).json({
        error: 'This does not appear to be a rental document. Please upload a rental agreement, lease deed, rent receipt, or similar tenancy document.'
      })
    }

    const messages = [
      { role: 'system', content: ANALYST_CONTEXT },
      { role: 'user',   content: `Document text:\n---\n${docText}\n---\n\nUser's specific question: ${userQ}` },
    ]

    const analysis = await callGroq(messages, 1500)

    // If AI also flags it as non-rental, return a clear error
    if (analysis.trim().startsWith('NOT_RENTAL_DOCUMENT')) {
      return res.status(400).json({
        error: 'This does not appear to be a rental document. Please upload a rental agreement, lease deed, rent receipt, or similar tenancy document.'
      })
    }

    res.json({ analysis })
  } catch (err) {
    console.error('[analyze-doc]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/gemini/generate-from-photos
// Multipart: photos[] (up to 3 images) + optional fields (type, furnished, location, amenities)
// Uses Groq vision model to analyse room photos and generate title + description
// Auth: required (owner)
// ─────────────────────────────────────────────────────────────────────────────
const uploadPhotos = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

router.post('/generate-from-photos', authMiddleware, uploadPhotos.array('photos', 3), async (req, res) => {
  const files = req.files || []
  if (files.length === 0) {
    return res.status(400).json({ error: 'At least one photo is required.' })
  }

  const { type, furnished, location, amenities } = req.body

  // Build context string from optional form fields
  const contextParts = [
    type      ? `Room type: ${type}`          : '',
    furnished ? `Furnishing: ${furnished}`    : '',
    location  ? `Location: ${location}`       : '',
    amenities ? `Amenities: ${amenities}`     : '',
  ].filter(Boolean)
  const contextClues = contextParts.length > 0
    ? `Owner has also provided this context: ${contextParts.join('. ')}.`
    : ''

  // Convert each image to base64 data-URL content block (Groq vision format)
  const imageBlocks = files.map(f => ({
    type: 'image_url',
    image_url: {
      url: `data:${f.mimetype};base64,${f.buffer.toString('base64')}`
    }
  }))

  const textBlock = {
    type: 'text',
    text: `You are an expert rental listing copywriter for Kerala, India.
Look carefully at the room photo(s) and write a listing title and description.

${contextClues}

Rules:
- TITLE: MUST be at least 60 characters long (minimum 60, ideally 60-80). Mention the room type, a standout visible feature, and the location (e.g. "Spacious Fully Furnished Single Room with Attached Bath in Kakkanad"). Count characters before responding - if under 60 characters, expand it.
- DESCRIPTION: MUST be at least 180 characters long (minimum 180, ideally 180-240). Describe what you SEE (furnishings, space, light, cleanliness), mention comfort and convenience, end with who the room suits. Count characters before responding - if under 180 characters, expand it.
- Base your answer on the photos. Only add context-provided details if they match what you see.
- Do NOT invent amenities or features not visible or mentioned.
- CRITICAL HARD REQUIREMENT: title length >= 60 characters AND description length >= 180 characters. Do not output anything shorter.

Respond ONLY with valid JSON — no markdown, no backticks, no extra text:
{"title":"...","description":"..."}`
  }

  const messages = [
    {
      role: 'user',
      content: [...imageBlocks, textBlock]
    }
  ]

  try {
    if (!GROQ_KEY) throw new Error('GROQ_API_KEY not set in .env')

    const groqRes = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${GROQ_KEY}`,
      },
      body: JSON.stringify({
        model:       'meta-llama/llama-4-scout-17b-16e-instruct',  // Groq vision model
        messages,
        max_tokens:  500,
        temperature: 0.6,
      }),
    })

    const data = await groqRes.json()
    if (!groqRes.ok) throw new Error(data.error?.message || 'Groq vision API error')

    const raw   = data.choices?.[0]?.message?.content?.trim() || ''
    const clean = raw.replace(/```json|```/g, '').trim()

    let parsed
    try {
      parsed = JSON.parse(clean)
    } catch {
      // If JSON parse fails, try to extract with regex as fallback
      const titleMatch = clean.match(/"title"\s*:\s*"([^"]+)"/)
      const descMatch  = clean.match(/"description"\s*:\s*"([^"]+)"/)
      if (!titleMatch || !descMatch) throw new Error('Could not parse AI response. Please try again.')
      parsed = { title: titleMatch[1], description: descMatch[1] }
    }

    if (!parsed.title || !parsed.description) {
      throw new Error('AI returned incomplete data. Please try again.')
    }

    // Enforce minimum length requirements
    if (parsed.title.trim().length < 50) {
      throw new Error(`AI generated a title that is too short (${parsed.title.trim().length} chars, minimum 50). Please try again.`)
    }
    if (parsed.description.trim().length < 150) {
      throw new Error(`AI generated a description that is too short (${parsed.description.trim().length} chars, minimum 150). Please try again.`)
    }

    res.json({ title: parsed.title, description: parsed.description })
  } catch (err) {
    console.error('[generate-from-photos]', err.message)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router