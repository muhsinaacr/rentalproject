const express = require('express')
const router = express.Router()
const db = require('../db')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')

router.post('/register', async (req, res) => {
  const { name, email, password, role } = req.body
  try {
    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email])
    if (existing.length > 0) return res.status(400).json({ error: 'Email already registered' })

    const hashedPassword = await bcrypt.hash(password, 10)
    const [result] = await db.query(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name, email, hashedPassword, role]
    )

    const user = { id: result.insertId, name, email, role }
    const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '7d' })
    res.json({ user, token })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/login', async (req, res) => {
  const { email, password } = req.body
  try {
    const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email])
    if (users.length === 0) return res.status(400).json({ error: 'Invalid email or password' })

    const user = users[0]
    const isMatch = await bcrypt.compare(password, user.password)
    if (!isMatch) return res.status(400).json({ error: 'Invalid email or password' })

    if (user.banned) return res.status(403).json({ error: 'Your account has been suspended. Please contact support.' })

    const payload = { id: user.id, name: user.name, email: user.email, role: user.role }
    const token = jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' })
    res.json({ user: payload, token })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router