// src/components/AIChatbot.jsx
import { useState, useRef, useEffect } from 'react'

const API = 'http://localhost:5000/api'
function getToken() { return sessionStorage.getItem('token') || '' }

function renderMessage(text) {
  const lines = text.split('\n')
  return lines.map((line, i) => {
    const parts = line.split(/\*\*(.*?)\*\*/g)
    const rendered = parts.map((part, j) =>
      j % 2 === 1 ? <strong key={j}>{part}</strong> : part
    )
    if (line.startsWith('- ') || line.startsWith('• ')) {
      return <div key={i} style={{ paddingLeft: 12, marginTop: 2 }}>• {rendered.slice(1)}</div>
    }
    if (line.trim() === '') return <div key={i} style={{ height: 6 }} />
    return <div key={i}>{rendered}</div>
  })
}

const QUICK_CHIPS = [
  'How do I negotiate rent?',
  'What is a fair deposit amount in Kerala?',
  'Red flags in a rental agreement?',
  'Tips for finding a good roommate',
]

export default function AIChatbot() {
  const [open,    setOpen]    = useState(false)
  const [input,   setInput]   = useState('')
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [pulse,   setPulse]   = useState(true)
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)

  useEffect(() => { if (open) setPulse(false) }, [open])
  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history, loading, open])
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 120)
  }, [open])

  async function sendMessage(text) {
    const msg = (text || input).trim()
    if (!msg || loading) return
    setInput('')
    setError(null)
    const newHistory = [...history, { role: 'user', text: msg }]
    setHistory(newHistory)
    setLoading(true)
    try {
      const res = await fetch(`${API}/gemini/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ message: msg, history: history.slice(-8) })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Chat failed')
      setHistory([...newHistory, { role: 'assistant', text: data.reply }])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function clearChat() { setHistory([]); setError(null) }

  return (
    <>
      <style>{`
        @keyframes chatPulse    { 0%,100%{transform:scale(1)}50%{transform:scale(1.25)} }
        @keyframes chatSlideUp  { from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)} }
        @keyframes typingBounce { 0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-6px)} }
        .chat-chip:hover { background: #e2e8f0 !important; color: #0a1628 !important; }
        .chat-clear:hover { background: #fee2e2 !important; color: #dc2626 !important; }
      `}</style>

      {/* FAB button */}
      <button
        style={{
          position: 'fixed', bottom: 28, right: 28, zIndex: 99999,
          width: 52, height: 52, borderRadius: '50%',
          background: '#0a1628', border: 'none',
          boxShadow: '0 4px 16px rgba(79,70,229,0.4)',
          cursor: 'pointer', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 22, color: '#fff',
          transition: 'transform 0.2s',
        }}
        onClick={() => setOpen(o => !o)}
        title="RentMate AI Assistant"
        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.08)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
      >
        {open ? '✕' : '🤖'}
        {!open && pulse && (
          <span style={{
            position: 'absolute', top: -3, right: -3,
            width: 14, height: 14, borderRadius: '50%',
            background: '#10b981', border: '2px solid #fff',
            animation: 'chatPulse 1.8s ease-in-out infinite',
          }} />
        )}
      </button>

      {/* Chat window */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 92, right: 28,
          zIndex: 99998,
          width: 360, height: 520,
          backgroundColor: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: 16,
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 12px 40px rgba(0,0,0,0.22)',
          overflow: 'hidden',
          animation: 'chatSlideUp 0.22s cubic-bezier(0.4,0,0.2,1)',
        }}>
          {/* Header */}
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid #f3f4f6',
            display: 'flex', alignItems: 'center', gap: 10,
            backgroundColor: '#f9fafb',
            flexShrink: 0,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'linear-gradient(135deg, #0a1628 0%, #1e3a5f 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 15, flexShrink: 0,
            }}>🤖</div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: '#111827' }}>RentMate AI</div>
              <div style={{ fontSize: 11, color: '#10b981', marginTop: 1 }}>● Online</div>
            </div>
            {history.length > 0 && (
              <button className="chat-clear" onClick={clearChat}
                style={{ marginLeft: 'auto', fontSize: 11, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', borderRadius: 4 }}>
                🗑 Clear
              </button>
            )}
            <button onClick={() => setOpen(false)}
              style={{ fontSize: 18, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, marginLeft: history.length > 0 ? 0 : 'auto' }}>
              ✕
            </button>
          </div>

          {/* Messages / Welcome */}
          <div style={{ flex: 1, overflowY: 'auto', backgroundColor: '#ffffff' }}>
            {history.length === 0 ? (
              <div style={{
                height: '100%', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                padding: 20, gap: 12, textAlign: 'center',
                backgroundColor: '#ffffff',
              }}>
                <div style={{ fontSize: 36 }}>🏠</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>Hi! I am your RentMate AI</div>
                <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>
                  Ask me anything about renting, agreements, roommates, or tenant rights in Kerala.
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 4 }}>
                  {QUICK_CHIPS.map(chip => (
                    <button key={chip} className="chat-chip" onClick={() => sendMessage(chip)}
                      style={{
                        fontSize: 11, padding: '5px 10px', borderRadius: 20,
                        border: '1px solid #e5e7eb', background: '#f9fafb',
                        color: '#6b7280', cursor: 'pointer', transition: 'background 0.15s',
                      }}>
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ padding: '14px 14px 4px', display: 'flex', flexDirection: 'column', gap: 10, backgroundColor: '#ffffff' }}>
                {history.map((msg, i) => (
                  <div key={i} style={{
                    display: 'flex',
                    justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    alignItems: 'flex-end', gap: 6,
                  }}>
                    {msg.role === 'assistant' && (
                      <div style={{
                        width: 22, height: 22, borderRadius: '50%',
                        background: 'linear-gradient(135deg, #0a1628 0%, #1e3a5f 100%)',
                        fontSize: 11, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', flexShrink: 0, color: '#fff',
                      }}>🤖</div>
                    )}
                    <div style={{
                      maxWidth: '82%', padding: '9px 13px',
                      borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                      backgroundColor: msg.role === 'user' ? '#0a1628' : '#f3f4f6',
                      color: msg.role === 'user' ? '#ffffff' : '#111827',
                      fontSize: 13, lineHeight: 1.55,
                      border: msg.role === 'assistant' ? '1px solid #e5e7eb' : 'none',
                    }}>
                      {msg.role === 'assistant' ? renderMessage(msg.text) : msg.text}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'flex-end', gap: 6 }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%',
                      background: 'linear-gradient(135deg, #0a1628 0%, #1e3a5f 100%)',
                      fontSize: 11, display: 'flex', alignItems: 'center',
                      justifyContent: 'center', flexShrink: 0, color: '#fff',
                    }}>🤖</div>
                    <div style={{ padding: '11px 14px', borderRadius: '14px 14px 14px 4px', backgroundColor: '#f3f4f6', border: '1px solid #e5e7eb' }}>
                      {['0s','0.2s','0.4s'].map(d => (
                        <span key={d} style={{
                          width: 7, height: 7, borderRadius: '50%', background: '#9ca3af',
                          display: 'inline-block', marginRight: 4,
                          animation: `typingBounce 1.2s ease-in-out ${d} infinite`,
                        }} />
                      ))}
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          {/* Error bar */}
          {error && (
            <div style={{ margin: '0 14px 8px', padding: '7px 11px', borderRadius: 8, backgroundColor: '#fee2e2', color: '#dc2626', fontSize: 12, flexShrink: 0 }}>
              ⚠️ {error}
            </div>
          )}

          {/* Input area */}
          <div style={{
            padding: '10px 12px', borderTop: '1px solid #f3f4f6',
            display: 'flex', gap: 8, alignItems: 'flex-end',
            backgroundColor: '#ffffff', flexShrink: 0,
          }}>
            <textarea
              ref={inputRef}
              placeholder="Ask anything about renting..."
              value={input}
              rows={1}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
              style={{
                flex: 1, resize: 'none', border: '1px solid #e5e7eb',
                borderRadius: 10, padding: '8px 11px', fontSize: 13,
                backgroundColor: '#f9fafb', color: '#111827',
                outline: 'none', lineHeight: 1.4, maxHeight: 80,
                fontFamily: 'inherit',
              }}
            />
            <button
              onClick={() => sendMessage()}
              disabled={loading || !input.trim()}
              style={{
                width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                backgroundColor: loading || !input.trim() ? '#e5e7eb' : '#0a1628',
                border: 'none', cursor: loading || !input.trim() ? 'default' : 'pointer',
                color: '#fff', fontSize: 15, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.2s',
              }}
            >➤</button>
          </div>
        </div>
      )}
    </>
  )
}