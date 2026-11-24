import { useState, useEffect, useCallback } from 'react'
import jsPDF from 'jspdf'

const BASE_URL = 'http://localhost:5000/api'

function getToken() {
  return sessionStorage.getItem('token')
}

async function apiFetch(path) {
  const res = await fetch(BASE_URL + path, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getToken()}`,
    },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF builder — uses real report data fetched from backend
// ─────────────────────────────────────────────────────────────────────────────
function buildPDF(reportData, selectedSections) {
  const doc   = new jsPDF()
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 14
  const contentW = pageW - margin * 2

  let y = 0

  // Helper: check if we need a new page
  function checkPage(needed = 20) {
    if (y + needed > pageH - 25) {
      doc.addPage()
      y = 20
    }
  }

  // ── Cover header ──────────────────────────────────────────────────────────
  doc.setFillColor(12, 12, 12)
  doc.rect(0, 0, pageW, 46, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(22)
  doc.setFont('helvetica', 'bold')
  doc.text('RentMate AI', margin, 20)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(180, 180, 180)
  doc.text('Seeker Activity Report', margin, 30)
  doc.text(`Generated: ${new Date(reportData.generatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`, margin, 38)

  y = 60

  // ── User info card ────────────────────────────────────────────────────────
  const u = reportData.user
  doc.setFillColor(246, 246, 246)
  doc.roundedRect(margin, y, contentW, 38, 3, 3, 'F')
  doc.setDrawColor(220, 220, 220)
  doc.roundedRect(margin, y, contentW, 38, 3, 3, 'S')

  // Avatar circle
  doc.setFillColor(20, 20, 20)
  doc.circle(margin + 14, y + 14, 10, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text((u.name || 'S').charAt(0).toUpperCase(), margin + 14, y + 18, { align: 'center' })

  doc.setTextColor(17, 17, 17)
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text(u.name || 'Room Seeker', margin + 28, y + 13)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(100, 100, 100)
  doc.text(`Email: ${u.email || 'N/A'}   |   Role: ${u.role}   |   Member since: ${u.memberSince}`, margin + 28, y + 22)
  if (u.occupation) {
    doc.text(`Occupation: ${u.occupation}`, margin + 28, y + 30)
  }
  if (u.preferredLocation) {
    const locX = u.occupation ? margin + 28 + 80 : margin + 28
    doc.text(`Preferred Area: ${u.preferredLocation}`, locX, y + 30)
  }

  y += 50

  // ── Section divider helper ─────────────────────────────────────────────────
  function sectionHeader(title, count) {
    checkPage(22)
    doc.setFillColor(20, 20, 20)
    doc.roundedRect(margin, y, contentW, 18, 3, 3, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text(title, margin + 8, y + 12)
    if (count !== undefined) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(170, 170, 170)
      doc.text(`${count} ${count === 1 ? 'record' : 'records'}`, pageW - margin - 4, y + 12, { align: 'right' })
    }
    y += 24
  }

  function rowBg(i) {
    doc.setFillColor(i % 2 === 0 ? 250 : 245, i % 2 === 0 ? 250 : 245, i % 2 === 0 ? 250 : 245)
  }

  function emptyNote() {
    checkPage(14)
    doc.setFillColor(250, 250, 250)
    doc.rect(margin, y, contentW, 14, 'F')
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(10)
    doc.setTextColor(150, 150, 150)
    doc.text('No data available for this section.', margin + 6, y + 9)
    y += 18
  }

  function divider() {
    checkPage(8)
    doc.setDrawColor(220, 220, 220)
    doc.line(margin, y, pageW - margin, y)
    y += 10
  }

  // ── 1. Saved Listings ──────────────────────────────────────────────────────
  if (selectedSections.includes('bookmarks') && reportData.sections.bookmarks !== undefined) {
    const listings = reportData.sections.bookmarks || []
    sectionHeader('Saved Listings', listings.length)

    if (listings.length === 0) {
      emptyNote()
    } else {
      // Column headers
      doc.setFillColor(235, 235, 235)
      doc.rect(margin, y, contentW, 10, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(80, 80, 80)
      doc.text('LISTING', margin + 4, y + 7)
      doc.text('LOCATION', margin + 80, y + 7)
      doc.text('RENT', margin + 130, y + 7)
      doc.text('SAVED ON', margin + 160, y + 7)
      y += 12

      listings.forEach((l, i) => {
        checkPage(22)
        rowBg(i)
        doc.rect(margin, y, contentW, 20, 'F')

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        doc.setTextColor(17, 17, 17)
        const titleTxt = l.title.length > 35 ? l.title.slice(0, 32) + '...' : l.title
        doc.text(titleTxt, margin + 4, y + 8)

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.setTextColor(100, 100, 100)
        const roomInfo = [l.roomType, l.furnishing].filter(Boolean).join(' · ')
        if (roomInfo) doc.text(roomInfo, margin + 4, y + 15)

        doc.setTextColor(80, 80, 80)
        const locTxt = (l.location || '').length > 22 ? l.location.slice(0, 19) + '...' : l.location
        doc.text(locTxt, margin + 80, y + 8)

        doc.setFont('helvetica', 'bold')
        doc.setTextColor(17, 17, 17)
        doc.text(l.rent || 'N/A', margin + 130, y + 8)

        doc.setFont('helvetica', 'normal')
        doc.setTextColor(100, 100, 100)
        doc.text(l.savedOn || '', margin + 160, y + 8)

        if (l.note) {
          doc.setFontSize(8)
          doc.setTextColor(130, 130, 130)
          const noteTxt = l.note.length > 50 ? l.note.slice(0, 47) + '...' : l.note
          doc.text(`Note: ${noteTxt}`, margin + 80, y + 15)
        }

        y += 22
      })
    }
    divider()
  }

  // ── 2. AI Match Results ────────────────────────────────────────────────────
  if (selectedSections.includes('matches') && reportData.sections.matches !== undefined) {
    const matches = reportData.sections.matches || []
    sectionHeader('AI Match Results', matches.length)

    if (!reportData.sections.matchProfileUsed) {
      checkPage(14)
      doc.setFillColor(255, 251, 235)
      doc.rect(margin, y, contentW, 14, 'F')
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(10)
      doc.setTextColor(146, 64, 14)
      doc.text('Complete your seeker profile to enable AI matching.', margin + 6, y + 9)
      y += 18
    } else if (matches.length === 0) {
      emptyNote()
    } else {
      // Column headers
      doc.setFillColor(235, 235, 235)
      doc.rect(margin, y, contentW, 10, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(80, 80, 80)
      doc.text('LISTING', margin + 4, y + 7)
      doc.text('LOCATION', margin + 90, y + 7)
      doc.text('RENT', margin + 140, y + 7)
      doc.text('MATCH', margin + 170, y + 7)
      y += 12

      matches.forEach((m, i) => {
        checkPage(22)
        rowBg(i)
        doc.rect(margin, y, contentW, 20, 'F')

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        doc.setTextColor(17, 17, 17)
        const titleTxt = (m.title || '').length > 38 ? m.title.slice(0, 35) + '...' : m.title
        doc.text(titleTxt, margin + 4, y + 8)

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.setTextColor(100, 100, 100)
        if (m.label) doc.text(m.label, margin + 4, y + 15)

        const locTxt = (m.location || '').length > 26 ? m.location.slice(0, 23) + '...' : m.location
        doc.text(locTxt, margin + 90, y + 8)

        doc.text(m.rent || 'N/A', margin + 140, y + 8)

        // Score badge
        const score = m.score || 0
        const scoreColor = score >= 85 ? [22, 163, 74] : score >= 60 ? [234, 179, 8] : [239, 68, 68]
        doc.setFillColor(...scoreColor)
        doc.roundedRect(margin + 168, y + 4, 22, 12, 2, 2, 'F')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9)
        doc.setTextColor(255, 255, 255)
        doc.text(`${score}%`, margin + 179, y + 12, { align: 'center' })

        y += 22
      })
    }
    divider()
  }

  // ── 3. Visit Bookings ──────────────────────────────────────────────────────
  if (selectedSections.includes('visits') && reportData.sections.visits !== undefined) {
    const visits = reportData.sections.visits || []
    sectionHeader('Visit Bookings', visits.length)

    if (visits.length === 0) {
      emptyNote()
    } else {
      doc.setFillColor(235, 235, 235)
      doc.rect(margin, y, contentW, 10, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(80, 80, 80)
      doc.text('LISTING', margin + 4, y + 7)
      doc.text('DATE & TIME', margin + 90, y + 7)
      doc.text('STATUS', margin + 150, y + 7)
      y += 12

      visits.forEach((v, i) => {
        checkPage(24)
        rowBg(i)
        doc.rect(margin, y, contentW, 22, 'F')

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        doc.setTextColor(17, 17, 17)
        const titleTxt = (v.listingTitle || '').length > 38 ? v.listingTitle.slice(0, 35) + '...' : v.listingTitle
        doc.text(titleTxt, margin + 4, y + 8)

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.setTextColor(100, 100, 100)
        doc.text(v.listingLocation || '', margin + 4, y + 16)

        doc.setTextColor(60, 60, 60)
        doc.text(`${v.visitDate}  ${v.visitTime}`, margin + 90, y + 8)
        doc.setTextColor(100, 100, 100)
        doc.setFontSize(8)
        doc.text(`Owner: ${v.ownerName || 'N/A'}`, margin + 90, y + 16)

        // Status pill
        const statusColors = {
          approved:  [22, 163, 74],
          pending:   [234, 179, 8],
          rejected:  [239, 68, 68],
          cancelled: [156, 163, 175],
        }
        const sc = statusColors[v.status.toLowerCase()] || [100, 100, 100]
        doc.setFillColor(...sc)
        const statusLabel = (v.status || '').toUpperCase()
        doc.roundedRect(margin + 148, y + 5, 34, 12, 2, 2, 'F')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8)
        doc.setTextColor(255, 255, 255)
        doc.text(statusLabel, margin + 165, y + 13, { align: 'center' })

        y += 24
      })
    }
    divider()
  }

  // ── 4. Search History / Activity Summary ──────────────────────────────────
  if (selectedSections.includes('history') && reportData.sections.history !== undefined) {
    const hist = reportData.sections.history
    sectionHeader('Activity Summary', hist?.recentActivity?.length || 0)

    const summary = hist.summary || {}
    const rows = [
      ['Total Listings Viewed',  summary.totalListingsViewed ?? 0],
      ['Listings Saved',         summary.totalBookmarks      ?? 0],
      ['Visits Booked',          summary.totalVisits         ?? 0],
      ['Messages Sent',          summary.totalMessagesSent   ?? 0],
      ['Contact Unlocks',        summary.totalUnlocks        ?? 0],
    ]

    rows.forEach(([label, val], i) => {
      checkPage(14)
      rowBg(i)
      doc.rect(margin, y, contentW, 14, 'F')
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(80, 80, 80)
      doc.text(label, margin + 6, y + 9)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(17, 17, 17)
      doc.text(String(val), margin + contentW - 10, y + 9, { align: 'right' })
      y += 15
    })
    divider()
  }

  // ── 5. Activity Log (Notifications) ──────────────────────────────────────
  if (selectedSections.includes('notifications') && reportData.sections.notifications !== undefined) {
    const notifs = reportData.sections.notifications || []
    sectionHeader('Activity Log', notifs.length)

    if (notifs.length === 0) {
      emptyNote()
    } else {
      const typeIcons = { match: '🤝', message: '💬', visit: '📅', listing: '🏠', system: '⚙️', fraud: '⚠️' }

      notifs.forEach((n, i) => {
        checkPage(22)
        rowBg(i)
        doc.rect(margin, y, contentW, 20, 'F')

        // Type badge
        const typeLabel = (n.type || 'system').toUpperCase()
        const typeBadgeColors = {
          MATCH:   [16, 185, 129],
          MESSAGE: [99, 102, 241],
          VISIT:   [245, 158, 11],
          LISTING: [59, 130, 246],
          SYSTEM:  [107, 114, 128],
          FRAUD:   [239, 68, 68],
        }
        const bc = typeBadgeColors[typeLabel] || [107, 114, 128]
        doc.setFillColor(...bc)
        doc.roundedRect(margin + 4, y + 5, 20, 10, 2, 2, 'F')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(7)
        doc.setTextColor(255, 255, 255)
        doc.text(typeLabel.slice(0, 4), margin + 14, y + 12, { align: 'center' })

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        doc.setTextColor(17, 17, 17)
        const titleTxt = (n.title || '').length > 50 ? n.title.slice(0, 47) + '...' : n.title
        doc.text(titleTxt, margin + 28, y + 8)

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.setTextColor(100, 100, 100)
        const bodyTxt = (n.body || '').length > 60 ? n.body.slice(0, 57) + '...' : n.body
        doc.text(bodyTxt, margin + 28, y + 15)

        doc.setFontSize(8)
        doc.setTextColor(150, 150, 150)
        doc.text(n.time || '', pageW - margin - 4, y + 8, { align: 'right' })

        // Read status dot
        doc.setFillColor(n.isRead ? 180 : 22, n.isRead ? 180 : 163, n.isRead ? 180 : 74)
        doc.circle(pageW - margin - 4, y + 14, 2, 'F')

        y += 22
      })
    }
    divider()
  }

  // ── Footer on every page ──────────────────────────────────────────────────
  const totalPages = doc.internal.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    const fY = pageH - 14
    doc.setFillColor(12, 12, 12)
    doc.rect(0, fY - 4, pageW, 18, 'F')
    doc.setTextColor(140, 140, 140)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text('Generated by RentMate AI Platform · www.rentmateai.com', pageW / 2, fY + 4, { align: 'center' })
    doc.text(`Page ${p} of ${totalPages}`, pageW - margin, fY + 4, { align: 'right' })
  }

  return doc
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export default function SeekerExportReport() {
  const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}')

  const [selected,    setSelected]    = useState(['bookmarks', 'matches', 'visits', 'history'])
  const [loadingData, setLoadingData] = useState(false)
  const [generating,  setGenerating]  = useState(false)
  const [generated,   setGenerated]   = useState(false)
  const [reportData,  setReportData]  = useState(null)
  const [error,       setError]       = useState(null)
  const [counts,      setCounts]      = useState({
    bookmarks:     '...',
    matches:       '...',
    visits:        '...',
    history:       '...',
    notifications: '...',
  })

  // Fetch live counts on mount
  useEffect(() => {
    async function fetchCounts() {
      try {
        const data = await apiFetch('/report/seeker/data?sections=bookmarks,matches,visits,history,notifications')
        setCounts({
          bookmarks:     `${data.counts.bookmarks ?? 0} listings`,
          matches:       `${data.counts.matches ?? 0} matches`,
          visits:        `${data.counts.visits ?? 0} visits`,
          history:       `${data.counts.history ?? 0} views`,
          notifications: `${data.counts.notifications ?? 0} events`,
        })
      } catch {
        setCounts({
          bookmarks:     '— listings',
          matches:       '— matches',
          visits:        '— visits',
          history:       '— views',
          notifications: '— events',
        })
      }
    }
    fetchCounts()
  }, [])

  const sections = [
    { id: 'bookmarks',     label: 'Saved Listings',  desc: 'All bookmarked rooms',    count: counts.bookmarks },
    { id: 'matches',       label: 'AI Match Results', desc: 'Compatibility scores',    count: counts.matches },
    { id: 'visits',        label: 'Visit Bookings',   desc: 'Scheduled room visits',   count: counts.visits },
    { id: 'history',       label: 'Search History',   desc: 'Browsing activity',       count: counts.history },
    { id: 'notifications', label: 'Activity Log',     desc: 'Notification history',    count: counts.notifications },
  ]

  function toggleSection(id) {
    setSelected(selected.includes(id)
      ? selected.filter(s => s !== id)
      : [...selected, id])
    setGenerated(false)
    setReportData(null)
  }

  async function generateReport() {
    if (selected.length === 0) return
    setGenerating(true)
    setGenerated(false)
    setError(null)
    setReportData(null)
    try {
      const sectionsParam = selected.join(',')
      const data = await apiFetch(`/report/seeker/data?sections=${sectionsParam}`)
      setReportData(data)
      setGenerated(true)
    } catch (err) {
      setError(err.message || 'Failed to fetch report data. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  function downloadPDF() {
    if (!reportData) return
    const doc = buildPDF(reportData, selected)
    const safeName = (reportData.user?.name || currentUser.name || 'User').replace(/[^a-z0-9]/gi, '_')
    doc.save(`RentMate_Seeker_Report_${safeName}.pdf`)
  }

  return (
    <div style={s.page}>
      <div style={s.topbar}>
        <div>
          <h2 style={s.title}>Export My Report</h2>
          <p style={s.sub}>Download your complete search activity and AI match results as PDF</p>
        </div>
        <div style={s.seekerTag}>🙋 Room Seeker</div>
      </div>

      <div style={s.content}>
        <div style={s.grid}>
          {/* ── Report Preview ─────────────────────────────────────── */}
          <div style={s.card}>
            <h3 style={s.cardTitle}>Report Preview</h3>
            <div style={s.previewCard}>
              <div style={s.previewHeader}>
                <div style={s.previewLogo}>R</div>
                <div>
                  <div style={s.previewTitle}>RentMate AI — Seeker Report</div>
                  <div style={s.previewDate}>
                    {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </div>
                </div>
              </div>
              <div style={s.previewDivider} />
              <div style={s.previewUser}>
                <div style={s.previewAvatar}>{(currentUser.name || 'S').charAt(0).toUpperCase()}</div>
                <div>
                  <div style={s.previewName}>{currentUser.name || 'Room Seeker'}</div>
                  <div style={s.previewRole}>Room Seeker · {currentUser.email || ''}</div>
                </div>
              </div>
              <div style={s.previewDivider} />
              <div style={s.previewSections}>
                {selected.map(id => {
                  const sec = sections.find(r => r.id === id)
                  return sec ? (
                    <div key={id} style={s.previewSection}>
                      <div style={s.previewDot} />
                      <span style={s.previewSectionName}>{sec.label}</span>
                      <span style={s.previewSectionCount}>{sec.count}</span>
                    </div>
                  ) : null
                })}
              </div>
            </div>
          </div>

          {/* ── Section Selector + Generate ───────────────────────── */}
          <div>
            <div style={s.card}>
              <h3 style={s.cardTitle}>Select Sections</h3>
              <div style={s.sectionsList}>
                {sections.map(sec => (
                  <div
                    key={sec.id}
                    style={{ ...s.sectionItem, ...(selected.includes(sec.id) ? s.sectionOn : {}) }}
                    onClick={() => toggleSection(sec.id)}
                  >
                    <div style={{ ...s.checkbox, ...(selected.includes(sec.id) ? s.checkboxOn : {}) }}>
                      {selected.includes(sec.id) && '✓'}
                    </div>
                    <div style={s.sectionInfo}>
                      <div style={s.sectionLabel}>{sec.label}</div>
                      <div style={s.sectionDesc}>{sec.desc}</div>
                    </div>
                    <div style={s.sectionCount}>{sec.count}</div>
                  </div>
                ))}
              </div>

              {error && (
                <div style={s.errorBanner}>
                  ⚠️ {error}
                </div>
              )}

              <div style={s.generateSection}>
                <span style={s.generateLabel}>{selected.length} sections selected</span>
                <button
                  style={{ ...s.generateBtn, opacity: (generating || selected.length === 0) ? 0.6 : 1 }}
                  onClick={generateReport}
                  disabled={generating || selected.length === 0}
                >
                  {generating ? '⏳ Fetching data...' : '📄 Generate Report'}
                </button>
              </div>
            </div>

            {generated && reportData && (
              <div style={s.successCard}>
                <div style={s.successTop}>
                  <div style={s.successIcon}>✓</div>
                  <div>
                    <div style={s.successTitle}>PDF Ready to Download!</div>
                    <div style={s.successSub}>
                      Your seeker report is ready — {selected.length} section{selected.length !== 1 ? 's' : ''} included
                    </div>
                  </div>
                </div>
                <button style={s.downloadBtn} onClick={downloadPDF}>
                  ⬇ Download PDF Report
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const s = {
  page:               { minHeight: '100vh', background: 'var(--bg-page)', fontFamily: "'Segoe UI', sans-serif" },
  topbar:             { background: 'var(--bg-topbar)', borderBottom: '1px solid var(--border-default)', padding: '20px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title:              { fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.5px' },
  sub:                { fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' },
  seekerTag:          { background: 'var(--bg-muted)', color: 'var(--text-secondary)', border: '1px solid var(--border-default)', fontSize: '12px', fontWeight: '600', padding: '6px 14px', borderRadius: '20px' },
  content:            { padding: '28px 32px' },
  grid:               { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' },
  card:               { background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: '16px', padding: '24px', marginBottom: '16px' },
  cardTitle:          { fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '18px' },
  previewCard:        { background: 'var(--bg-muted)', border: '1px solid var(--border-default)', borderRadius: '12px', padding: '20px' },
  previewHeader:      { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' },
  previewLogo:        { width: '36px', height: '36px', background: 'var(--accent)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-fg)', fontSize: '16px', fontWeight: '800' },
  previewTitle:       { fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' },
  previewDate:        { fontSize: '11px', color: 'var(--text-faint)', marginTop: '2px' },
  previewDivider:     { height: '1px', background: 'var(--border-default)', margin: '14px 0' },
  previewUser:        { display: 'flex', alignItems: 'center', gap: '10px' },
  previewAvatar:      { width: '32px', height: '32px', borderRadius: '50%', background: 'var(--accent)', color: 'var(--accent-fg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '700', flexShrink: 0 },
  previewName:        { fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' },
  previewRole:        { fontSize: '11px', color: 'var(--text-muted)' },
  previewSections:    { display: 'flex', flexDirection: 'column', gap: '8px' },
  previewSection:     { display: 'flex', alignItems: 'center', gap: '8px' },
  previewDot:         { width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 },
  previewSectionName: { flex: 1, fontSize: '12px', color: 'var(--text-secondary)' },
  previewSectionCount:{ fontSize: '11px', color: 'var(--text-faint)' },
  sectionsList:       { display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' },
  sectionItem:        { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', border: '1.5px solid var(--border-default)', borderRadius: '10px', cursor: 'pointer', background: 'var(--bg-card)', transition: 'all 0.15s' },
  sectionOn:          { border: '1.5px solid var(--border-accent)', background: 'var(--bg-muted)' },
  checkbox:           { width: '20px', height: '20px', borderRadius: '6px', border: '2px solid var(--border-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', color: 'var(--text-faint)', flexShrink: 0 },
  checkboxOn:         { background: 'var(--accent)', borderColor: 'var(--accent)', color: 'var(--accent-fg)' },
  sectionInfo:        { flex: 1 },
  sectionLabel:       { fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '2px' },
  sectionDesc:        { fontSize: '11px', color: 'var(--text-faint)' },
  sectionCount:       { fontSize: '12px', color: 'var(--text-faint)', whiteSpace: 'nowrap' },
  generateSection:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '16px', borderTop: '1px solid var(--border-default)' },
  generateLabel:      { fontSize: '13px', color: 'var(--text-muted)' },
  generateBtn:        { background: 'var(--accent)', color: 'var(--accent-fg)', border: 'none', borderRadius: '10px', padding: '10px 20px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' },
  errorBanner:        { background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', marginBottom: '14px' },
  successCard:        { background: 'var(--bg-card)', border: '1px solid var(--border-accent)', borderRadius: '14px', padding: '20px' },
  successTop:         { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' },
  successIcon:        { width: '36px', height: '36px', borderRadius: '50%', background: 'var(--accent)', color: 'var(--accent-fg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: '700', flexShrink: 0 },
  successTitle:       { fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' },
  successSub:         { fontSize: '12px', color: 'var(--text-muted)' },
  downloadBtn:        { width: '100%', padding: '12px', background: 'var(--accent)', color: 'var(--accent-fg)', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', cursor: 'pointer' },
}