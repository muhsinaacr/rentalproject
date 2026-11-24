// src/components/ContactUsModal.jsx  —  RentMate AI
import { useState, useEffect } from 'react'

const BASE_URL = 'http://localhost:5000/api'

const CATEGORIES = [
  { value: 'account',   label: '👤 Account Issue'    },
  { value: 'listing',   label: '🏠 Listing Problem'   },
  { value: 'payment',   label: '💳 Payment & Billing' },
  { value: 'technical', label: '🔧 Technical Issue'   },
  { value: 'other',     label: '💬 General Query'     },
]

const STATUS_META = {
  open:        { label: 'Open',        color: '#3b82f6', bg: '#eff6ff' },
  in_progress: { label: 'In Progress', color: '#f59e0b', bg: '#fffbeb' },
  resolved:    { label: 'Resolved',    color: '#10b981', bg: '#f0fdf4' },
  closed:      { label: 'Closed',      color: '#6b7280', bg: '#f3f4f6' },
}

export default function ContactUsModal({ isOpen, onClose }) {
  const [tab, setTab]           = useState('new')
  const [subject, setSubject]   = useState('')
  const [category, setCategory] = useState('other')
  const [message, setMessage]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [success, setSuccess]   = useState(false)
  const [error, setError]       = useState('')
  const [history, setHistory]   = useState([])
  const [histLoading, setHistLoading] = useState(false)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    if (tab === 'history' && isOpen) loadHistory()
  }, [tab, isOpen])

  useEffect(() => {
    if (!isOpen) { setSuccess(false); setError('') }
  }, [isOpen])

  async function loadHistory() {
    setHistLoading(true)
    try {
      const token = sessionStorage.getItem('token')
      const res   = await fetch(`${BASE_URL}/support/my-queries`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      setHistory(Array.isArray(data) ? data : [])
    } catch { setHistory([]) }
    finally { setHistLoading(false) }
  }

  async function handleSubmit() {
    if (!subject.trim() || !message.trim()) {
      setError('Please fill in both subject and message.')
      return
    }
    setLoading(true); setError('')
    try {
      const token = sessionStorage.getItem('token')
      const res   = await fetch(`${BASE_URL}/support/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ subject: subject.trim(), category, message: message.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to submit')
      setSuccess(true); setSubject(''); setCategory('other'); setMessage('')
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  function fmt(d) {
    if (!d) return ''
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  if (!isOpen) return null

  return (
    <>
      <style>{`
        .cu-overlay {
          position: fixed; inset: 0; z-index: 1000;
          background: rgba(0,0,0,0.4);
          backdrop-filter: blur(3px);
          animation: cuFadeIn 0.18s ease;
          display: flex; align-items: center; justify-content: center;
        }
        @keyframes cuFadeIn { from{opacity:0} to{opacity:1} }

        .cu-modal {
          position: relative;
          width: 480px; max-width: calc(100vw - 32px);
          height: 620px; max-height: calc(100vh - 48px);
          background: var(--bg-page);
          border: 1px solid var(--border-default);
          border-radius: 20px;
          display: flex; flex-direction: column;
          overflow: hidden;
          box-shadow: 0 24px 60px rgba(0,0,0,0.22);
          animation: cuPop 0.22s cubic-bezier(0.34,1.56,0.64,1);
          font-family: 'DM Sans','Segoe UI',system-ui,sans-serif;
        }
        @keyframes cuPop {
          from{transform:scale(0.94);opacity:0}
          to{transform:scale(1);opacity:1}
        }

        .cu-header {
          padding: 20px 20px 0;
          display: flex; align-items: flex-start; justify-content: space-between;
          flex-shrink: 0;
        }
        .cu-title  { font-size: 17px; font-weight: 800; color: var(--text-primary); letter-spacing: -0.3px; }
        .cu-subtitle { font-size: 12px; color: var(--text-faint); margin-top: 2px; }
        .cu-close {
          width: 30px; height: 30px; border-radius: 8px;
          background: var(--bg-muted); border: 1px solid var(--border-strong);
          cursor: pointer; display: flex; align-items: center; justify-content: center;
          color: var(--text-muted); font-size: 15px; flex-shrink: 0; transition: all 0.14s;
        }
        .cu-close:hover { background: #fee2e2; color: #dc2626; border-color: #fca5a5; }

        .cu-tabs {
          display: flex; gap: 4px;
          padding: 14px 20px 0;
          border-bottom: 1px solid var(--border-default);
          flex-shrink: 0;
        }
        .cu-tab {
          padding: 7px 18px; border-radius: 8px 8px 0 0;
          font-size: 13px; font-weight: 600; cursor: pointer;
          color: var(--text-muted); border: 1px solid transparent;
          border-bottom: none; transition: all 0.14s; background: transparent;
        }
        .cu-tab.act {
          background: var(--bg-page); color: var(--text-primary);
          border-color: var(--border-default); border-bottom-color: var(--bg-page);
          margin-bottom: -1px; position: relative;
        }
        .cu-tab:not(.act):hover { color: var(--text-primary); background: var(--bg-hover); }

        .cu-body {
          flex: 1; overflow-y: auto; padding: 18px 20px; min-height: 0;
        }
        .cu-body::-webkit-scrollbar { width: 4px; }
        .cu-body::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 2px; }

        .cu-field { margin-bottom: 13px; }
        .cu-label {
          font-size: 11px; font-weight: 700; color: var(--text-secondary);
          text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 5px;
        }
        .cu-input, .cu-select, .cu-textarea {
          width: 100%; box-sizing: border-box;
          padding: 9px 12px; border-radius: 10px;
          border: 1px solid var(--border-default);
          background: var(--bg-muted); color: var(--text-primary);
          font-size: 13.5px; font-family: inherit;
          transition: border-color 0.14s; outline: none;
        }
        .cu-input:focus,.cu-select:focus,.cu-textarea:focus {
          border-color: var(--border-accent); background: var(--bg-page);
        }
        .cu-select {
          cursor: pointer; appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position: right 12px center;
        }
        .cu-textarea { resize: vertical; min-height: 90px; line-height: 1.5; }
        .cu-error {
          background: #fee2e2; color: #dc2626;
          border: 1px solid #fca5a5; border-radius: 9px;
          padding: 9px 12px; font-size: 13px; margin-bottom: 12px;
        }
        .cu-tip {
          background: var(--bg-muted); border: 1px solid var(--border-default);
          border-radius: 10px; padding: 10px 12px; margin-bottom: 13px;
          font-size: 12.5px; color: var(--text-faint); line-height: 1.5;
        }
        .cu-tip strong { color: var(--text-secondary); }

        .cu-footer {
          flex-shrink: 0; padding: 12px 20px 16px;
          border-top: 1px solid var(--border-default);
          background: var(--bg-page); display: flex; gap: 8px;
        }
        .cu-btn {
          flex: 1; padding: 10px; border-radius: 10px;
          font-size: 13.5px; font-weight: 700; cursor: pointer;
          border: none; transition: all 0.15s; font-family: inherit;
        }
        .cu-btn-primary { background: var(--text-primary); color: var(--bg-page); }
        .cu-btn-primary:hover:not(:disabled) { opacity: 0.88; }
        .cu-btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }
        .cu-btn-secondary {
          background: var(--bg-muted); color: var(--text-secondary);
          border: 1px solid var(--border-strong);
        }
        .cu-btn-secondary:hover { background: var(--bg-hover); color: var(--text-primary); }

        .cu-success { text-align: center; padding: 32px 16px; }
        .cu-success-icon  { font-size: 48px; margin-bottom: 12px; }
        .cu-success-title { font-size: 17px; font-weight: 800; color: var(--text-primary); margin-bottom: 6px; }
        .cu-success-sub   { font-size: 13px; color: var(--text-faint); line-height: 1.6; }

        .cu-hist-item {
          border: 1px solid var(--border-default);
          border-radius: 12px; overflow: hidden; margin-bottom: 8px;
          transition: box-shadow 0.14s;
        }
        .cu-hist-item:hover { box-shadow: 0 2px 10px rgba(0,0,0,0.07); }
        .cu-hist-head {
          padding: 12px 14px; cursor: pointer;
          display: flex; align-items: center; justify-content: space-between; gap: 10px;
        }
        .cu-hist-head:hover { background: var(--bg-hover); }
        .cu-hist-left { flex: 1; min-width: 0; }
        .cu-hist-subject {
          font-size: 13.5px; font-weight: 600; color: var(--text-primary);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .cu-hist-date { font-size: 11px; color: var(--text-faint); margin-top: 2px; }
        .cu-hist-right { display: flex; align-items: center; gap: 7px; flex-shrink: 0; }
        .cu-pill { font-size: 10.5px; font-weight: 700; padding: 3px 9px; border-radius: 20px; }
        .cu-chevron { color: var(--text-faint); font-size: 11px; transition: transform 0.15s; }

        .cu-hist-body {
          padding: 0 14px 14px;
          border-top: 1px solid var(--border-default);
          background: var(--bg-muted);
        }
        .cu-detail-grid {
          display: grid; grid-template-columns: auto 1fr; gap: 5px 12px;
          margin-top: 11px; font-size: 12.5px;
        }
        .cu-detail-label { font-weight: 700; color: var(--text-faint); font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.05em; padding-top: 2px; white-space: nowrap; }
        .cu-detail-value { color: var(--text-primary); line-height: 1.5; }
        .cu-msg-box {
          margin-top: 10px;
          background: var(--bg-page); border: 1px solid var(--border-default);
          border-radius: 8px; padding: 10px 12px;
          font-size: 13px; color: var(--text-secondary); line-height: 1.6;
          white-space: pre-wrap; word-break: break-word;
        }
        .cu-reply-box {
          margin-top: 10px;
          background: var(--bg-page); border: 1px solid #86efac;
          border-left: 4px solid #10b981; border-radius: 8px; padding: 10px 12px;
          font-size: 13px; color: var(--text-primary); line-height: 1.6;
          white-space: pre-wrap; word-break: break-word;
        }
        .cu-reply-label {
          font-size: 10.5px; font-weight: 700; color: #10b981;
          text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 5px;
        }
        .cu-msg-label {
          font-size: 10.5px; font-weight: 700; color: var(--text-faint);
          text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 5px;
        }
        .cu-awaiting {
          margin-top: 10px; padding: 10px 12px;
          background: var(--bg-page); border: 1px dashed var(--border-default);
          border-radius: 8px; font-size: 12.5px; color: var(--text-faint);
          font-style: italic; text-align: center;
        }
        .cu-empty {
          text-align: center; padding: 48px 16px; color: var(--text-faint); font-size: 13.5px;
        }
        .cu-empty-icon { font-size: 40px; margin-bottom: 10px; }
      `}</style>

      <div className="cu-overlay" onClick={onClose}>
        <div className="cu-modal" onClick={e => e.stopPropagation()}>

          {/* Header */}
          <div className="cu-header">
            <div>
              <div className="cu-title">💬 Contact Support</div>
              <div className="cu-subtitle">We usually respond within 24 hours</div>
            </div>
            <div className="cu-close" onClick={onClose}>✕</div>
          </div>

          {/* Tabs */}
          <div className="cu-tabs">
            <div
              className={`cu-tab${tab === 'new' ? ' act' : ''}`}
              onClick={() => { setTab('new'); setSuccess(false); setError('') }}
            >
              New Query
            </div>
            <div
              className={`cu-tab${tab === 'history' ? ' act' : ''}`}
              onClick={() => setTab('history')}
            >
              My Queries
              {history.length > 0 && (
                <span style={{
                  marginLeft: 6, fontSize: 10, fontWeight: 700,
                  background: '#3b82f6', color: '#fff',
                  borderRadius: 20, padding: '1px 6px', verticalAlign: 'middle'
                }}>{history.length}</span>
              )}
            </div>
          </div>

          {/* ── NEW QUERY TAB ── */}
          {tab === 'new' && (
            success ? (
              <>
                <div className="cu-body">
                  <div className="cu-success">
                    <div className="cu-success-icon">✅</div>
                    <div className="cu-success-title">Query Submitted!</div>
                    <div className="cu-success-sub">
                      Your message has been sent to our support team.<br />
                      Track it under <strong>My Queries</strong>.
                    </div>
                  </div>
                </div>
                <div className="cu-footer">
                  <button className="cu-btn cu-btn-secondary" onClick={() => { setSuccess(false); setTab('history'); loadHistory() }}>
                    View My Queries
                  </button>
                  <button className="cu-btn cu-btn-primary" onClick={() => setSuccess(false)}>
                    Send Another
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="cu-body">
                  <div className="cu-tip">
                    <strong>Need help?</strong> Describe your issue clearly and our admin team will get back to you as soon as possible.
                  </div>
                  {error && <div className="cu-error">{error}</div>}
                  <div className="cu-field">
                    <div className="cu-label">Category</div>
                    <select className="cu-select" value={category} onChange={e => setCategory(e.target.value)}>
                      {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                  <div className="cu-field">
                    <div className="cu-label">Subject</div>
                    <input
                      className="cu-input" type="text"
                      placeholder="e.g. Cannot upload listing photos"
                      value={subject} onChange={e => setSubject(e.target.value)} maxLength={200}
                    />
                  </div>
                  <div className="cu-field">
                    <div className="cu-label">Message</div>
                    <textarea
                      className="cu-textarea"
                      placeholder="Describe your issue in detail. Include any relevant listing IDs, error messages, or steps to reproduce the problem."
                      value={message} onChange={e => setMessage(e.target.value)} maxLength={2000}
                    />
                    <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-faint)', marginTop: 3 }}>
                      {message.length}/2000
                    </div>
                  </div>
                </div>
                <div className="cu-footer">
                  <button className="cu-btn cu-btn-secondary" onClick={onClose}>Cancel</button>
                  <button
                    className="cu-btn cu-btn-primary"
                    onClick={handleSubmit}
                    disabled={loading || !subject.trim() || !message.trim()}
                  >
                    {loading ? 'Sending…' : '📨 Send to Admin'}
                  </button>
                </div>
              </>
            )
          )}

          {/* ── MY QUERIES TAB ── */}
          {tab === 'history' && (
            <>
              <div className="cu-body">
                {histLoading ? (
                  <div className="cu-empty">
                    <div className="cu-empty-icon">⏳</div>
                    <div>Loading your queries…</div>
                  </div>
                ) : history.length === 0 ? (
                  <div className="cu-empty">
                    <div className="cu-empty-icon">📭</div>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>No queries yet</div>
                    <div style={{ fontSize: 12.5, marginBottom: 18 }}>Submit a query and track it here.</div>
                    <button
                      className="cu-btn cu-btn-primary"
                      style={{ maxWidth: 160, margin: '0 auto' }}
                      onClick={() => setTab('new')}
                    >
                      New Query
                    </button>
                  </div>
                ) : (
                  history.map(q => {
                    const sm      = STATUS_META[q.status] || STATUS_META.open
                    const isExp   = expanded === q.id
                    const catLabel = CATEGORIES.find(c => c.value === q.category)?.label || q.category
                    return (
                      <div key={q.id} className="cu-hist-item">
                        <div className="cu-hist-head" onClick={() => setExpanded(isExp ? null : q.id)}>
                          <div className="cu-hist-left">
                            <div className="cu-hist-subject">{q.subject}</div>
                            <div className="cu-hist-date">{catLabel} · {fmt(q.created_at)}</div>
                          </div>
                          <div className="cu-hist-right">
                            <span className="cu-pill" style={{ background: sm.bg, color: sm.color }}>{sm.label}</span>
                            <span className="cu-chevron" style={isExp ? { transform: 'rotate(180deg)' } : {}}>▼</span>
                          </div>
                        </div>

                        {isExp && (
                          <div className="cu-hist-body">
                            <div className="cu-detail-grid">
                              <div className="cu-detail-label">Submitted</div>
                              <div className="cu-detail-value">{fmt(q.created_at)}</div>
                              {q.replied_at && (
                                <>
                                  <div className="cu-detail-label">Replied</div>
                                  <div className="cu-detail-value">{fmt(q.replied_at)}</div>
                                </>
                              )}
                            </div>

                            <div style={{ marginTop: 10 }}>
                              <div className="cu-msg-label">📝 Your Message</div>
                              <div className="cu-msg-box">{q.message}</div>
                            </div>

                            {q.admin_reply ? (
                              <div style={{ marginTop: 10 }}>
                                <div className="cu-reply-label">🛡️ Admin Reply</div>
                                <div className="cu-reply-box">{q.admin_reply}</div>
                              </div>
                            ) : (
                              <div className="cu-awaiting">⏳ Awaiting admin response…</div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>

              <div className="cu-footer">
                <button className="cu-btn cu-btn-secondary" style={{ flex: 'none', padding: '10px 16px' }} onClick={loadHistory}>
                  ↺ Refresh
                </button>
                <button className="cu-btn cu-btn-primary" onClick={() => { setTab('new'); setSuccess(false) }}>
                  + New Query
                </button>
              </div>
            </>
          )}

        </div>
      </div>
    </>
  )
}