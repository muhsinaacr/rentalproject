// server.js — RentMate AI
const express = require('express')
const cors    = require('cors')
require('dotenv').config()

const app = express()

app.use(cors({ origin: 'http://localhost:5173' }))
app.use(express.json())
app.use('/uploads', express.static('uploads'))

app.use('/api/auth',               require('./routes/auth'))
app.use('/api/listings',           require('./routes/listings'))
app.use('/api/contacts',           require('./routes/contacts'))
app.use('/api/whatsapp-requests',  require('./routes/whatsapp_requests'))
app.use('/api/subscriptions',      require('./routes/subscriptions'))
app.use('/api/bookmarks',          require('./routes/bookmarks'))
app.use('/api/visits',             require('./routes/visits'))
app.use('/api/messages',           require('./routes/messages'))
app.use('/api/notifications',      require('./routes/notifications'))
app.use('/api/owner/notifications', require('./routes/ownerNotifications'))
app.use('/api/admin',              require('./routes/admin'))   // ← full admin backend
app.use('/api/profile',            require('./routes/profile'))
app.use('/api/ai',                 require('./routes/ai'))
app.use('/api/ai',                 require('./routes/rentai'))
app.use('/api/matcher',            require('./routes/matcher'))
app.use('/api/locations',          require('./routes/locations'))
app.use('/api/report',             require('./routes/report'))
app.use('/api/dashboard',          require('./routes/dashboard'))
app.use('/api/agreements',         require('./routes/agreements'))
app.use('/api/reviews',            require('./routes/reviews'))
app.use('/api/support',            require('./routes/support'))   // ← Contact Us
app.use('/api/gemini', require('./routes/gemini'))

const PORT = process.env.PORT || 5000
app.listen(PORT, () => console.log(`✅ RentMate backend running on port ${PORT}`))