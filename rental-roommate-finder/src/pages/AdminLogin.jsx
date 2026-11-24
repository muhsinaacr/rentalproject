import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'

export default function AdminLogin() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('http://localhost:5000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email, password: form.password })
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Login failed')
        return
      }

      if (data.user.role !== 'admin') {
        setError('Access denied — admin accounts only')
        return
      }

      // Save token and user — same keys api.js expects
      sessionStorage.setItem('adminToken', data.token)
      sessionStorage.setItem('adminUser', JSON.stringify(data.user))
      navigate('/admin')
    } catch (err) {
      setError('Cannot connect to server. Is the backend running?')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.logo}>
          <div style={s.logoBox}>R</div>
          <span style={s.logoName}>RentMate</span>
          <span style={s.logoAI}> AI</span>
        </div>
        <div style={s.adminBadge}>🔧 Admin Access</div>
        <h2 style={s.title}>Admin Login</h2>
        <p style={s.sub}>Restricted access — authorized personnel only</p>
        {error && <div style={s.error}>{error}</div>}
        <form onSubmit={handleLogin}>
          <div style={s.field}>
            <label style={s.label}>Admin Email</label>
            <input style={s.input} type="email" placeholder="admin@rentmate.ai" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
          </div>
          <div style={s.field}>
            <label style={s.label}>Admin Password</label>
            <input style={s.input} type="password" placeholder="Enter admin password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required />
          </div>
          <button style={s.btn} type="submit" disabled={loading}>
            {loading ? 'Logging in…' : 'Access Admin Panel →'}
          </button>
        </form>
        <Link to="/login" style={s.backLink}>← Back to main login</Link>
      </div>
    </div>
  )
}

const s = {
  page: { minHeight: '100vh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Segoe UI', sans-serif" },
  card: { background: '#18181f', border: '1px solid #2a2a35', borderRadius: '20px', padding: '40px', width: '100%', maxWidth: '420px' },
  logo: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' },
  logoBox: { width: '30px', height: '30px', background: 'white', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#111', fontSize: '14px', fontWeight: '800' },
  logoName: { fontSize: '16px', fontWeight: '800', color: 'white', letterSpacing: '-0.5px' },
  logoAI: { fontSize: '16px', fontWeight: '300', color: '#666' },
  adminBadge: { display: 'inline-block', background: '#222', border: '1px solid #333', color: '#aaa', fontSize: '12px', fontWeight: '600', padding: '4px 12px', borderRadius: '20px', marginBottom: '16px' },
  title: { fontSize: '24px', fontWeight: '800', color: 'white', marginBottom: '6px', letterSpacing: '-0.5px' },
  sub: { fontSize: '13px', color: '#666', marginBottom: '28px' },
  error: { background: '#2a1010', border: '1px solid #5a2020', color: '#ff6b6b', padding: '12px 16px', borderRadius: '10px', marginBottom: '20px', fontSize: '13px' },
  field: { marginBottom: '16px' },
  label: { display: 'block', fontSize: '13px', fontWeight: '600', color: '#aaa', marginBottom: '7px' },
  input: { width: '100%', padding: '12px 16px', borderRadius: '10px', border: '1.5px solid #2a2a35', fontSize: '14px', outline: 'none', background: '#111', boxSizing: 'border-box', color: 'white' },
  btn: { width: '100%', padding: '13px', background: 'white', color: '#111', border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: '700', cursor: 'pointer', marginTop: '4px' },
  backLink: { display: 'block', textAlign: 'center', fontSize: '13px', color: '#555', textDecoration: 'none', marginTop: '30px' },
}