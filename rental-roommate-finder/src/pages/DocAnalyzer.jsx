// src/pages/DocAnalyzer.jsx
// AI-powered rental document analyzer — uses POST /api/gemini/analyze-doc

import { useState, useRef } from 'react'
import { useTheme } from '../context/ThemeContext'

const API = 'http://localhost:5000/api'
function getToken() { return sessionStorage.getItem('token') || '' }

function AnalysisSection({ title, emoji, content, color }) {
  const lines = content.trim().split('\n').filter(l => l.trim())
  return (
    <div style={{
      background: 'var(--bg-card)', border: `1px solid var(--border-color)`,
      borderLeft: `3px solid ${color}`, borderRadius: 10, padding: '14px 18px', marginBottom: 10,
    }}>
      <div style={{ fontWeight: 600, fontSize: 13, color, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
        {emoji} {title}
      </div>
      {lines.map((line, i) => {
        const isBullet = line.startsWith('- ') || line.startsWith('• ') || line.match(/^\*\s/)
        const text = line.replace(/^[-•*]\s*/, '').replace(/\*\*(.*?)\*\*/g, '$1')
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 5, fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6 }}>
            {isBullet && <span style={{ color, flexShrink: 0, marginTop: 3, fontWeight: 700 }}>›</span>}
            <span>{text}</span>
          </div>
        )
      })}
    </div>
  )
}

function parseAnalysis(raw) {
  const sections = []
  const defs = [
    { key: 'Summary', emoji: '📋', color: '#534AB7' },
    { key: 'Key Clauses', emoji: '🔑', color: '#0891b2' },
    { key: 'Red Flags', emoji: '🚨', color: '#cc0000' },
    { key: 'Recommendations', emoji: '✅', color: '#166534' },
  ]
  defs.forEach(({ key, emoji, color }) => {
    const m = raw.match(new RegExp(`##[^\\n]*${key}[^\\n]*\\n([\\s\\S]*?)(?=##|$)`, 'i'))
    if (m) sections.push({ title: key, emoji, color, content: m[1].trim() })
  })
  if (!sections.length) sections.push({ title: 'Analysis', emoji: '📄', color: '#888', content: raw })
  return sections
}

export default function DocAnalyzer() {
  const { isDark } = useTheme()
  const [mode,           setMode]           = useState('text')
  const [docText,        setDocText]        = useState('')
  const [question,       setQuestion]       = useState('')
  const [file,           setFile]           = useState(null)
  const [filePreviewUrl, setFilePreviewUrl] = useState(null)
  const [showDocPanel,   setShowDocPanel]   = useState(false)
  const [dragOver,       setDragOver]       = useState(false)
  const [loading,        setLoading]        = useState(false)
  const [analysis,       setAnalysis]       = useState(null)
  const [sections,       setSections]       = useState([])
  const [error,          setError]          = useState(null)
  const fileRef = useRef(null)

  function handleFile(f) {
    if (!f) return
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    if (!allowed.includes(f.type)) { setError('Only JPG, PNG, WebP, or PDF files are supported.'); return }
    if (f.size > 10 * 1024 * 1024) { setError('File must be under 10 MB.'); return }
    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl)
    setFile(f)
    setFilePreviewUrl(URL.createObjectURL(f))
    setError(null)
  }

  function removeFile() {
    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl)
    setFile(null); setFilePreviewUrl(null)
  }

  async function analyze() {
    setError(null); setAnalysis(null); setSections([])
    if (mode === 'text' && !docText.trim()) { setError('Please paste the document text before analyzing.'); return }
    if (mode === 'file' && !file) { setError('Please upload a document before analyzing.'); return }
    setLoading(true)
    try {
      let res
      if (mode === 'file') {
        const fd = new FormData()
        fd.append('document', file)
        if (question.trim()) fd.append('question', question.trim())
        res = await fetch(`${API}/gemini/analyze-doc`, {
          method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }, body: fd,
        })
      } else {
        res = await fetch(`${API}/gemini/analyze-doc`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
          body: JSON.stringify({ text: docText, question: question.trim() || undefined }),
        })
      }
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Analysis failed')
      setAnalysis(data.analysis)
      setSections(parseAnalysis(data.analysis))
      if (mode === 'file') setShowDocPanel(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function reset() {
    setDocText(''); setQuestion(''); removeFile()
    setAnalysis(null); setSections([]); setError(null); setShowDocPanel(false)
  }

  const isPDF = file?.type === 'application/pdf'

  const s = {
    page: { maxWidth: 980, margin: '0 auto', padding: '32px 24px 60px' },
    title: { fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 },
    subtitle: { fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5 },
    tipBox: { background: 'var(--ai-box-bg)', border: '1px solid var(--ai-box-border)', borderRadius: 10, padding: '12px 16px', marginBottom: 20 },
    tipTitle: { fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 },
    tipList: { fontSize: 12, color: 'var(--text-muted)', lineHeight: 2 },
    card: { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14, padding: '22px 24px', marginBottom: 18 },
    tabRow: { display: 'flex', marginBottom: 20, border: '1px solid var(--border-color)', borderRadius: 10, overflow: 'hidden' },
    tab: (a) => ({ flex: 1, padding: '10px 0', textAlign: 'center', fontSize: 13, fontWeight: a ? 600 : 400, cursor: 'pointer', border: 'none', background: a ? 'var(--btn-primary-bg)' : 'var(--bg-secondary)', color: a ? 'var(--btn-primary-text)' : 'var(--text-muted)', transition: 'all 0.15s' }),
    textarea: { width: '100%', minHeight: 200, resize: 'vertical', border: '1px solid var(--input-border)', borderRadius: 10, padding: '11px 14px', fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-primary)', fontFamily: 'inherit', lineHeight: 1.6, outline: 'none', boxSizing: 'border-box' },
    questionInput: { width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 13, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box', marginTop: 12 },
    dropZone: { border: `2px dashed ${dragOver ? 'var(--accent-purple)' : 'var(--input-border)'}`, borderRadius: 12, padding: '36px 24px', textAlign: 'center', background: dragOver ? 'var(--ai-box-bg)' : 'var(--bg-secondary)', cursor: 'pointer', transition: 'all 0.18s' },
    analyzeBtn: { width: '100%', padding: '12px 0', borderRadius: 10, background: loading ? 'var(--border-color)' : 'var(--btn-primary-bg)', color: loading ? 'var(--text-muted)' : 'var(--btn-primary-text)', border: 'none', fontSize: 14, fontWeight: 700, cursor: loading ? 'default' : 'pointer', transition: 'background 0.2s', marginTop: 14 },
    resetBtn: { fontSize: 13, color: 'var(--text-secondary)', background: 'none', border: '1px solid var(--border-color)', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' },
    errorBox: { padding: '11px 15px', borderRadius: 10, marginTop: 12, background: 'var(--tag-red-bg)', border: '1px solid var(--tag-red-border)', color: 'var(--tag-red-text)', fontSize: 13 },
    loadingBox: { textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)', fontSize: 14 },
    badge: { fontSize: 11, padding: '4px 10px', borderRadius: 20, background: 'var(--tag-green-bg)', border: '1px solid var(--tag-green-border)', color: 'var(--tag-green-text)', fontWeight: 600 },
    warningBox: { marginTop: 16, padding: '11px 15px', borderRadius: 10, background: 'var(--tag-yellow-bg)', border: '1px solid var(--tag-yellow-border)', color: 'var(--tag-yellow-text)', fontSize: 12, lineHeight: 1.6 },
    toggleDocBtn: (active) => ({ fontSize: 12, padding: '6px 14px', borderRadius: 8, cursor: 'pointer', background: active ? 'var(--btn-primary-bg)' : 'var(--bg-secondary)', color: active ? 'var(--btn-primary-text)' : 'var(--text-secondary)', border: '1px solid var(--border-color)', fontWeight: 500 }),
  }

  return (
    <div style={s.page}>
      <div style={{ marginBottom: 24 }}>
        <div style={s.title}><span>📄</span> Doc Analyzer</div>
        <div style={s.subtitle}>Upload or paste any rental agreement, lease, or notice. Our AI will summarize it, flag red clauses, and give you actionable advice before you sign.</div>
      </div>

      <div style={s.tipBox}>
        <div style={s.tipTitle}>💡 What you can analyze</div>
        <div style={s.tipList}>Rental agreements &nbsp;·&nbsp; Lease deeds &nbsp;·&nbsp; Owner notices &nbsp;·&nbsp; Maintenance bills &nbsp;·&nbsp; Eviction letters &nbsp;·&nbsp; Any rental-related document</div>
      </div>

      {!analysis && (
        <div style={s.card}>
          <div style={s.tabRow}>
            <button style={s.tab(mode === 'text')} onClick={() => setMode('text')}>✏️ Paste Text</button>
            <button style={s.tab(mode === 'file')} onClick={() => setMode('file')}>📎 Upload File</button>
          </div>

          {mode === 'text' && (
            <>
              <textarea style={s.textarea} placeholder="Paste the full text of your rental agreement or document here..." value={docText} onChange={e => setDocText(e.target.value)} />
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{docText.trim().length} characters pasted</div>
            </>
          )}

          {mode === 'file' && (
            <>
              {file ? (
                /* ── File preview after selection ── */
                <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, overflow: 'hidden', background: 'var(--bg-secondary)' }}>
                  {isPDF ? (
                    <iframe src={filePreviewUrl} title="PDF Preview" style={{ width: '100%', height: 340, border: 'none', display: 'block' }} />
                  ) : (
                    <img src={filePreviewUrl} alt="Preview" style={{ width: '100%', maxHeight: 340, objectFit: 'contain', display: 'block' }} />
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderTop: '1px solid var(--border-color)', fontSize: 12 }}>
                    <span style={{ color: 'var(--text-muted)' }}>{isPDF ? '📄' : '🖼️'} {file.name} · {(file.size / 1024).toFixed(0)} KB</span>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <a href={filePreviewUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-purple)', textDecoration: 'none' }}>Open ↗</a>
                      <button onClick={removeFile} style={{ background: 'none', border: 'none', color: 'var(--tag-red-text)', cursor: 'pointer', fontSize: 12 }}>✕ Remove</button>
                    </div>
                  </div>
                </div>
              ) : (
                /* ── Drop zone ── */
                <>
                  <div style={s.dropZone} onClick={() => fileRef.current?.click()} onDragOver={e => { e.preventDefault(); setDragOver(true) }} onDragLeave={() => setDragOver(false)} onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }}>
                    <div style={{ fontSize: 32, marginBottom: 10 }}>🗂️</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>Drag & drop your document here</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>or click to browse — JPG, PNG, WebP, PDF · max 10 MB</div>
                  </div>
                  <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
                </>
              )}
            </>
          )}

          <input style={s.questionInput} type="text" placeholder="Optional: Ask a specific question — e.g. 'Is the security deposit clause fair?'" value={question} onChange={e => setQuestion(e.target.value)} />
          {error && <div style={s.errorBox}>⚠️ {error}</div>}
          <button style={s.analyzeBtn} onClick={analyze} disabled={loading}>
            {loading ? '🔍 Analyzing...' : '🔍 Analyze Document'}
          </button>
        </div>
      )}

      {loading && !analysis && (
        <div style={s.loadingBox}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🤖</div>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>Reading your document...</div>
          <div style={{ fontSize: 13 }}>Checking for key clauses, red flags, and tenant rights implications.</div>
        </div>
      )}

      {analysis && !loading && (
        <div>
          {/* Result header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>📊 Analysis Complete</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={s.badge}>✓ Done</span>
              {file && (
                <button style={s.toggleDocBtn(showDocPanel)} onClick={() => setShowDocPanel(v => !v)}>
                  {showDocPanel ? '🙈 Hide Doc' : '👁️ View Doc'}
                </button>
              )}
              <button style={s.resetBtn} onClick={reset}>Analyze Another</button>
            </div>
          </div>

          {/* Two-column layout when doc panel open */}
          <div style={{ display: 'grid', gridTemplateColumns: showDocPanel && file ? '1fr 1fr' : '1fr', gap: 20, alignItems: 'start' }}>

            {/* ── Document panel ── */}
            {showDocPanel && file && (
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14, overflow: 'hidden', position: 'sticky', top: 16 }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  {isPDF ? '📄' : '🖼️'} Original Document
                  <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 11, marginLeft: 'auto', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                </div>
                {isPDF ? (
                  <iframe src={filePreviewUrl} title="Document" style={{ width: '100%', height: 560, border: 'none', display: 'block' }} />
                ) : (
                  <img src={filePreviewUrl} alt="Document" style={{ width: '100%', maxHeight: 560, objectFit: 'contain', display: 'block' }} />
                )}
                <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{(file.size / 1024).toFixed(0)} KB</span>
                  <a href={filePreviewUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--accent-purple)', textDecoration: 'none' }}>Open in new tab ↗</a>
                </div>
              </div>
            )}

            {/* ── Analysis sections ── */}
            <div>
              {/* Show file reference pill when panel is hidden */}
              {file && !showDocPanel && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 8, background: 'var(--ai-box-bg)', border: '1px solid var(--ai-box-border)', color: 'var(--text-secondary)', fontSize: 12, marginBottom: 12 }}>
                  {isPDF ? '📄' : '🖼️'} {file.name}
                  <span style={{ color: 'var(--text-muted)' }}>· {(file.size / 1024).toFixed(0)} KB</span>
                </div>
              )}

              {sections.map((sec, i) => <AnalysisSection key={i} {...sec} />)}

              <div style={s.warningBox}>
                ⚠️ <strong>Disclaimer:</strong> This AI analysis is for informational purposes only and is not legal advice. For important agreements, consult a qualified lawyer before signing.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}