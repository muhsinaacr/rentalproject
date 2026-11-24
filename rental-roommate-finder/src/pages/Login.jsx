import { api } from '../utils/api'
import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'

export default function Login() {
  const navigate = useNavigate()
  const [formData, setFormData] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [showPass, setShowPass] = useState(false)

  function handleChange(e) {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  async function handleLogin(e) {
  e.preventDefault()
  try {
    const { user, token } = await api.login(formData)
    if (user.role === 'admin') {
      setError('Admins must log in through the Admin Portal. Use the button below.')
      return
    }
    sessionStorage.setItem('token', token)
    sessionStorage.setItem('currentUser', JSON.stringify(user))
    if (user.role === 'owner') navigate('/owner-dashboard')
    else navigate('/seeker-dashboard')
  } catch (err) {
    setError(err.message)
  }
}

  return (
    <div style={s.page}>
      {/* Left Panel */}
      <div style={s.left}>
        <div style={s.leftInner}>
          <div style={s.logo}>
            <div style={s.logoBox}>R</div>
            <div>
              <span style={s.logoName}>RentMate</span>
              <span style={s.logoAI}> AI</span>
            </div>
          </div>
          <h1 style={s.headline}>Find your perfect<br />home with AI</h1>
          <p style={s.sub}>Smart rental & roommate matching platform powered by artificial intelligence.</p>
          <div style={s.pillRow}>
            {['AI Roommate Matching', 'Fraud Detection', 'Agreement Generator', 'Negotiation Advisor'].map((f, i) => (
              <div key={i} style={s.pill}>{f}</div>
            ))}
          </div>
          <div style={s.statsRow}>
            {[['2,400+', 'Active Listings'], ['1,800+', 'Happy Tenants'], ['98%', 'Verified Rooms']].map(([v, l], i) => (
              <div key={i} style={s.stat}>
                <div style={s.statVal}>{v}</div>
                <div style={s.statLbl}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel */}
      <div style={s.right}>
        <div style={s.formWrap}>
          <h2 style={s.formTitle}>Welcome back</h2>
          <p style={s.formSub}>Login to your RentMate AI account</p>

          {error && <div style={s.error}>{error}</div>}

          <form onSubmit={handleLogin}>
            <div style={s.field}>
              <label style={s.label}>Email address</label>
              <input
                style={s.input}
                type="email"
                name="email"
                placeholder="you@example.com"
                value={formData.email}
                onChange={handleChange}
                required
              />
            </div>
            <div style={s.field}>
              <label style={s.label}>Password</label>
              <div style={s.inputWrap}>
                <input
                  style={{ ...s.input, paddingRight: '44px' }}
                  type={showPass ? 'text' : 'password'}
                  name="password"
                  placeholder="Enter your password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                />
                <span style={s.eye} onClick={() => setShowPass(!showPass)}>
                  {showPass ? '🙈' : '👁️'}
                </span>
              </div>
            </div>
            <button style={s.btn} type="submit">Login to Account →</button>
          </form>

          <div style={s.divider}>
            <span style={s.divLine} />
            <span style={s.divText}>or</span>
            <span style={s.divLine} />
          </div>

          <p style={s.switch}>
            Don't have an account?{' '}
            <Link to="/register" style={s.link}>Create one free →</Link>
          </p>

          {/* Admin Access Button — replaces old 3-role icons */}
          <div style={s.adminSection}>
            <p style={s.adminText}>Are you an administrator?</p>
            <button style={s.adminBtn} onClick={() => navigate('/admin-login')}>
              🔧 Login as Admin →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const s = {
  page: {
    display: 'flex',
    minHeight: '100vh',
    fontFamily: "'Segoe UI', sans-serif",
    background: '#fff'
  },
  left: {
    flex: 1,
    background: '#0a0a0a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 48px'
  },
  leftInner: {
    maxWidth: '460px',
    color: 'white'
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '48px'
  },
  logoBox: {
    width: '36px',
    height: '36px',
    background: 'white',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#111',
    fontSize: '16px',
    fontWeight: '800'
  },
  logoName: {
    fontSize: '18px',
    fontWeight: '800',
    color: 'white',
    letterSpacing: '-0.5px'
  },
  logoAI: {
    fontSize: '18px',
    fontWeight: '300',
    color: '#888'
  },
  headline: {
    fontSize: '42px',
    fontWeight: '800',
    lineHeight: '1.15',
    marginBottom: '16px',
    letterSpacing: '-1px',
    color: 'white'
  },
  sub: {
    fontSize: '15px',
    color: '#888',
    lineHeight: '1.7',
    marginBottom: '32px'
  },
  pillRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginBottom: '40px'
  },
  pill: {
    padding: '6px 14px',
    border: '1px solid #333',
    borderRadius: '20px',
    fontSize: '12px',
    color: '#aaa'
  },
  statsRow: {
    display: 'flex',
    gap: '32px'
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  statVal: {
    fontSize: '22px',
    fontWeight: '800',
    color: 'white'
  },
  statLbl: {
    fontSize: '12px',
    color: '#666'
  },
  right: {
    width: '480px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px 40px',
    background: '#fafafa'
  },
  formWrap: {
    width: '100%',
    maxWidth: '380px'
  },
  formTitle: {
    fontSize: '26px',
    fontWeight: '800',
    color: '#111',
    marginBottom: '6px',
    letterSpacing: '-0.5px'
  },
  formSub: {
    fontSize: '14px',
    color: '#888',
    marginBottom: '28px'
  },
  error: {
    background: '#fff0f0',
    border: '1px solid #ffd0d0',
    color: '#cc0000',
    padding: '12px 16px',
    borderRadius: '10px',
    marginBottom: '20px',
    fontSize: '13px'
  },
  field: {
    marginBottom: '18px'
  },
  label: {
    display: 'block',
    fontSize: '13px',
    fontWeight: '600',
    color: '#111',
    marginBottom: '7px'
  },
  inputWrap: {
    position: 'relative'
  },
  input: {
    width: '100%',
    padding: '12px 16px',
    borderRadius: '10px',
    border: '1.5px solid #e5e7eb',
    fontSize: '14px',
    outline: 'none',
    background: 'white',
    boxSizing: 'border-box',
    color: '#111',
    transition: 'border-color 0.2s'
  },
  eye: {
    position: 'absolute',
    right: '14px',
    top: '50%',
    transform: 'translateY(-50%)',
    cursor: 'pointer',
    fontSize: '15px'
  },
  btn: {
    width: '100%',
    padding: '13px',
    background: '#111',
    color: 'white',
    border: 'none',
    borderRadius: '10px',
    fontSize: '15px',
    fontWeight: '700',
    cursor: 'pointer',
    letterSpacing: '-0.2px',
    marginTop: '4px'
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    margin: '24px 0'
  },
  divLine: {
    flex: 1,
    height: '1px',
    background: '#e5e7eb'
  },
  divText: {
    fontSize: '13px',
    color: '#aaa'
  },
  switch: {
    textAlign: 'center',
    fontSize: '14px',
    color: '#666',
    marginBottom: '24px'
  },
  link: {
    color: '#111',
    fontWeight: '700',
    textDecoration: 'none'
  },
  adminSection: {
    background: '#f5f5f5',
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    padding: '16px',
    textAlign: 'center'
  },
  adminText: {
    fontSize: '12px',
    color: '#888',
    marginBottom: '10px'
  },
  adminBtn: {
    background: '#111',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    padding: '9px 22px',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    width: '100%'
  },
}