import { api } from '../utils/api'
import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'

// ── Validation helpers ─────────────────────────────────────────────────────────
function validateName(v) {
  if (!v.trim()) return 'Full name is required.'
  if (/\d/.test(v)) return 'Name must not contain numbers.'
  if (v.trim().length < 2) return 'Name must be at least 2 characters.'
  return ''
}
function validateEmail(v) {
  if (!v.trim()) return 'Email is required.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Enter a valid email address.'
  return ''
}
function validatePassword(v) {
  if (!v) return 'Password is required.'
  if (v.length < 6) return 'Password must be at least 6 characters.'
  if (!/\d/.test(v)) return 'Password must include at least 1 number.'
  if (!/[!@#$%^&*()_+\-=[\]{};':\"\\|,.<>/?`~]/.test(v))
    return 'Password must include at least 1 special character (e.g. @, #, !).'
  return ''
}
function validateConfirm(pw, confirm) {
  if (!confirm) return 'Please confirm your password.'
  if (pw !== confirm) return 'Passwords do not match.'
  return ''
}

// ── Field wrapper — defined OUTSIDE Register to prevent focus loss on re-render
function F({ err, children }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      {children}
      {err && <span style={{ display: 'block', fontSize: '12px', color: '#ef4444', marginTop: '5px', fontWeight: '500' }}>⚠ {err}</span>}
    </div>
  )
}

export default function Register() {
  const navigate = useNavigate()
  const [formData, setFormData] = useState({ name: '', email: '', password: '', confirmPassword: '', role: 'seeker' })
  const [errors, setErrors] = useState({})
  const [touched, setTouched] = useState({})
  const [apiError, setApiError] = useState('')
  const [showPass, setShowPass] = useState(false)

  function validate(data) {
    return {
      name:            validateName(data.name),
      email:           validateEmail(data.email),
      password:        validatePassword(data.password),
      confirmPassword: validateConfirm(data.password, data.confirmPassword),
    }
  }

  function handleChange(e) {
    const next = { ...formData, [e.target.name]: e.target.value }
    setFormData(next)
    if (touched[e.target.name]) {
      const errs = validate(next)
      setErrors(prev => ({ ...prev, [e.target.name]: errs[e.target.name] }))
    }
    if (e.target.name === 'password' && touched.confirmPassword) {
      setErrors(prev => ({ ...prev, confirmPassword: validateConfirm(e.target.value, next.confirmPassword) }))
    }
  }

  function handleBlur(e) {
    setTouched(prev => ({ ...prev, [e.target.name]: true }))
    const errs = validate(formData)
    setErrors(prev => ({ ...prev, [e.target.name]: errs[e.target.name] }))
  }

  async function handleRegister(e) {
    e.preventDefault()
    setApiError('')
    setTouched({ name: true, email: true, password: true, confirmPassword: true })
    const errs = validate(formData)
    setErrors(errs)
    if (Object.values(errs).some(Boolean)) return
    try {
      const { user, token } = await api.register({
        name: formData.name, email: formData.email,
        password: formData.password, role: formData.role,
      })
      sessionStorage.setItem('token', token)
      sessionStorage.setItem('currentUser', JSON.stringify(user))
      navigate('/profile-setup')
    } catch (err) {
      setApiError(err.message)
    }
  }

  const inp = (name) => ({
    ...s.input,
    ...(touched[name] && errors[name] ? s.inputErr : touched[name] && !errors[name] ? s.inputOk : {}),
  })

  const pw = formData.password
  const strength = !pw ? 0
    : (pw.length >= 6 ? 1 : 0)
    + (/\d/.test(pw) ? 1 : 0)
    + (/[!@#$%^&*()_+\-=[\]{};':\"\\|,.<>/?`~]/.test(pw) ? 1 : 0)
  const strengthLabel = ['', 'Weak', 'Fair', 'Strong']
  const strengthColor = ['', '#ef4444', '#f59e0b', '#10b981']

  return (
    <div style={s.page}>
      <div style={s.left}>
        <div style={s.leftInner}>
          <div style={s.logo}>
            <div style={s.logoBox}>R</div>
            <div>
              <span style={s.logoName}>RentMate</span>
              <span style={s.logoAI}> AI</span>
            </div>
          </div>
          <h1 style={s.headline}>Your perfect home<br />is one step away</h1>
          <p style={s.sub}>Join thousands of students and professionals finding verified rooms and compatible roommates across Kerala.</p>
          <div style={s.steps}>
            {[
              ['01', 'Create account', 'Choose your role — seeker or owner'],
              ['02', 'Setup profile', 'Tell us your lifestyle & preferences'],
              ['03', 'Get AI matched', 'Find compatible rooms & roommates instantly'],
            ].map(([n, t, d], i) => (
              <div key={i} style={s.step}>
                <div style={s.stepNum}>{n}</div>
                <div>
                  <div style={s.stepTitle}>{t}</div>
                  <div style={s.stepDesc}>{d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={s.right}>
        <div style={s.formWrap}>
          <h2 style={s.formTitle}>Create account</h2>
          <p style={s.formSub}>Start finding your perfect home today</p>
          {apiError && <div style={s.error}>⚠ {apiError}</div>}

          <form onSubmit={handleRegister} noValidate>

            <F err={touched.name && errors.name}>
              <label style={s.label}>Full name</label>
              <input style={inp('name')} type="text" name="name"
                placeholder="Your full name (letters only)"
                value={formData.name} onChange={handleChange} onBlur={handleBlur} />
            </F>

            <F err={touched.email && errors.email}>
              <label style={s.label}>Email address</label>
              <input style={inp('email')} type="email" name="email"
                placeholder="you@example.com"
                value={formData.email} onChange={handleChange} onBlur={handleBlur} />
            </F>

            <F err={touched.password && errors.password}>
              <label style={s.label}>Password</label>
              <div style={s.inputWrap}>
                <input style={{ ...inp('password'), paddingRight: '44px' }}
                  type={showPass ? 'text' : 'password'} name="password"
                  placeholder="Min 6 chars, 1 number, 1 special char"
                  value={formData.password} onChange={handleChange} onBlur={handleBlur} />
                <span style={s.eye} onClick={() => setShowPass(!showPass)}>{showPass ? '🙈' : '👁️'}</span>
              </div>
              {formData.password && (
                <div style={s.strengthWrap}>
                  <div style={s.strengthBar}>
                    {[1,2,3].map(i => (
                      <div key={i} style={{ ...s.strengthSeg, background: i <= strength ? strengthColor[strength] : '#e5e7eb' }} />
                    ))}
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: '700', color: strengthColor[strength] }}>
                    {strengthLabel[strength]}
                  </span>
                </div>
              )}
              <span style={s.hint}>Requires: 6+ characters · 1 number · 1 special character</span>
            </F>

            <F err={touched.confirmPassword && errors.confirmPassword}>
              <label style={s.label}>Confirm password</label>
              <input style={inp('confirmPassword')} type="password" name="confirmPassword"
                placeholder="Confirm your password"
                value={formData.confirmPassword} onChange={handleChange} onBlur={handleBlur} />
            </F>

            <div style={s.field}>
              <label style={s.label}>I am a</label>
              <div style={s.roleRow}>
                {[['seeker','🙋','Room Seeker','Looking for a room'],['owner','🏠','Room Owner','Have a room to rent']].map(([val,emoji,title,desc]) => (
                  <div key={val}
                    style={{ ...s.roleCard, ...(formData.role === val ? s.roleActive : {}) }}
                    onClick={() => setFormData({ ...formData, role: val })}>
                    <span style={{ fontSize: '24px' }}>{emoji}</span>
                    <span style={s.roleTitle}>{title}</span>
                    <span style={s.roleDesc}>{desc}</span>
                  </div>
                ))}
              </div>
            </div>

            <button style={s.btn} type="submit">Create Account →</button>
          </form>

          <div style={s.divider}><span style={s.divLine}/><span style={s.divText}>or</span><span style={s.divLine}/></div>
          <p style={s.switch}>Already have an account? <Link to="/login" style={s.link}>Login here →</Link></p>
        </div>
      </div>
    </div>
  )
}

const s = {
  page:         { display: 'flex', minHeight: '100vh', fontFamily: "'Segoe UI', sans-serif", background: '#fff' },
  left:         { flex: 1, background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 48px' },
  leftInner:    { maxWidth: '460px', color: 'white' },
  logo:         { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '48px' },
  logoBox:      { width: '36px', height: '36px', background: 'white', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#111', fontSize: '16px', fontWeight: '800' },
  logoName:     { fontSize: '18px', fontWeight: '800', color: 'white', letterSpacing: '-0.5px' },
  logoAI:       { fontSize: '18px', fontWeight: '300', color: '#888' },
  headline:     { fontSize: '40px', fontWeight: '800', lineHeight: '1.15', marginBottom: '16px', letterSpacing: '-1px', color: 'white' },
  sub:          { fontSize: '15px', color: '#888', lineHeight: '1.7', marginBottom: '40px' },
  steps:        { display: 'flex', flexDirection: 'column', gap: '24px' },
  step:         { display: 'flex', alignItems: 'flex-start', gap: '16px' },
  stepNum:      { width: '36px', height: '36px', border: '1px solid #333', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '700', color: '#666', flexShrink: 0 },
  stepTitle:    { fontSize: '15px', fontWeight: '700', color: 'white', marginBottom: '3px' },
  stepDesc:     { fontSize: '13px', color: '#666' },
  right:        { width: '520px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 40px', background: '#fafafa', overflowY: 'auto' },
  formWrap:     { width: '100%', maxWidth: '420px' },
  formTitle:    { fontSize: '26px', fontWeight: '800', color: '#111', marginBottom: '6px', letterSpacing: '-0.5px' },
  formSub:      { fontSize: '14px', color: '#888', marginBottom: '28px' },
  error:        { background: '#fff0f0', border: '1px solid #ffd0d0', color: '#cc0000', padding: '12px 16px', borderRadius: '10px', marginBottom: '20px', fontSize: '13px' },
  field:        { marginBottom: '16px' },
  label:        { display: 'block', fontSize: '13px', fontWeight: '600', color: '#111', marginBottom: '7px' },
  inputWrap:    { position: 'relative' },
  input:        { width: '100%', padding: '12px 16px', borderRadius: '10px', border: '1.5px solid #e5e7eb', fontSize: '14px', outline: 'none', background: 'white', boxSizing: 'border-box', color: '#111', transition: 'border-color 0.2s' },
  inputErr:     { borderColor: '#ef4444', background: '#fff8f8' },
  inputOk:      { borderColor: '#10b981', background: '#f0fdf4' },
  eye:          { position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', fontSize: '15px' },
  errMsg:       { display: 'block', fontSize: '12px', color: '#ef4444', marginTop: '5px', fontWeight: '500' },
  hint:         { display: 'block', fontSize: '11px', color: '#aaa', marginTop: '5px' },
  strengthWrap: { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '7px' },
  strengthBar:  { display: 'flex', gap: '4px', flex: 1 },
  strengthSeg:  { height: '3px', flex: 1, borderRadius: '2px', transition: 'background 0.2s' },
  roleRow:      { display: 'flex', gap: '12px' },
  roleCard:     { flex: 1, padding: '14px 10px', border: '1.5px solid #e5e7eb', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', cursor: 'pointer', background: 'white', transition: 'all 0.15s' },
  roleActive:   { border: '1.5px solid #111', background: '#f5f5f5' },
  roleTitle:    { fontSize: '13px', fontWeight: '700', color: '#111' },
  roleDesc:     { fontSize: '11px', color: '#888', textAlign: 'center' },
  btn:          { width: '100%', padding: '13px', background: '#111', color: 'white', border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: '700', cursor: 'pointer', letterSpacing: '-0.2px', marginTop: '4px' },
  divider:      { display: 'flex', alignItems: 'center', gap: '12px', margin: '24px 0' },
  divLine:      { flex: 1, height: '1px', background: '#e5e7eb' },
  divText:      { fontSize: '13px', color: '#aaa' },
  switch:       { textAlign: 'center', fontSize: '14px', color: '#666' },
  link:         { color: '#111', fontWeight: '700', textDecoration: 'none' },
}