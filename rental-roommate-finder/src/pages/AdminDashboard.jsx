import { useState, useEffect } from 'react'
import { useTheme } from '../context/ThemeContext'

// Formats "2026-04-23" or MySQL Date objects → "23 Apr 2026"
function formatDate(dateStr) {
  if (!dateStr) return '—'
  const clean = String(dateStr).split('T')[0]
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return '—'
  const d = new Date(clean + 'T00:00:00')
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

import { api } from '../utils/api'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'

// Default empty arrays — real data is loaded from the backend
const EMPTY_GROWTH  = []
const EMPTY_FRAUD   = [{ name: 'Safe Listings', value: 1 }, { name: 'Suspicious', value: 0 }, { name: 'Flagged', value: 0 }]
const EMPTY_LOCS    = []
const EMPTY_RENTS   = []

const FRAUD_COLORS = ['#111', '#888', '#ccc']

// Reports are loaded from the backend — no hardcoded fallback needed

// Users are loaded from the backend

// ── Feature name normaliser ──
// Collapses legacy/variant names into the canonical display labels.
// Handles old DB rows recorded before naming was standardised.
function normaliseFeature(raw) {
  const f = (raw || '').toLowerCase().trim()
  if (!f) return 'Other'
  if (f.includes('contact') || f.includes('unlock') || f.includes('chat')) return 'Contact & Chat'
  if (f.includes('agreement') || f.includes('pdf'))                         return 'Agreement Generator'
  if (f.includes('boost') || f.includes('top pick') || f.includes('top_pick') || f.includes('⭐')) return 'Top Pick'
  if (f.includes('premium'))                                                 return 'Premium'
  return raw || 'Other'
}

// ── PaymentsTab Component ──
function PaymentsTab({ payments = [], summary = null, loading = false }) {
  const [roleFilter, setRoleFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [search, setSearch] = useState('')

  // Normalise backend payment rows to UI shape
  const normalised = payments.map(p => ({
    id:        p.transaction_ref || `PAY_${p.id}`,
    name:      p.user_name  || 'Unknown',
    role:      p.user_role  || 'seeker',
    feature:   normaliseFeature(p.description || (p.subscription_id ? p.plan : null)),
    amount:    Number(p.amount || 0) / 100,   // DB stores in paise; convert to ₹
    method:    p.payment_method || p.method || '—',
    status:    p.status,
    timestamp: p.created_at,
  }))

  const successful = normalised.filter(p => p.status === 'success')

  const filtered = normalised.filter(p => {
    const matchRole = roleFilter === 'all' || p.role === roleFilter
    const matchType = typeFilter === 'all' || p.feature === typeFilter
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase())
    return matchRole && matchType && matchSearch
  })

  const totalRevenue   = summary ? Number(summary.successful_revenue || 0) / 100   // paise → ₹
    : successful.reduce((s, p) => s + p.amount, 0)
  const seekerRevenue  = successful.filter(p => p.role === 'seeker').reduce((s, p) => s + p.amount, 0)
  const ownerRevenue   = successful.filter(p => p.role === 'owner').reduce((s, p) => s + p.amount, 0)

  const featureRevenue = {}
  successful.forEach(p => { featureRevenue[p.feature] = (featureRevenue[p.feature] || 0) + p.amount })

  const topPickRevenue = successful.filter(p => p.feature === 'Top Pick').reduce((s, p) => s + p.amount, 0)

  const uniqueFeatures = [...new Set(normalised.map(p => p.feature))]

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>Loading payments…</div>

  return (
    <div>
      <div style={pt.summaryRow}>
        {[
          { label: 'Total Revenue',  value: `₹${totalRevenue.toLocaleString()}`,    sub: `${successful.length} transactions` },
          { label: 'From Seekers',   value: `₹${seekerRevenue.toLocaleString()}`,   sub: `${successful.filter(x => x.role === 'seeker').length} payments` },
          { label: 'From Owners',    value: `₹${ownerRevenue.toLocaleString()}`,    sub: `${successful.filter(x => x.role === 'owner').length} payments` },
          { label: 'Top Pick Boosts',value: `₹${topPickRevenue.toLocaleString()}`,  sub: `${successful.filter(x => x.feature === 'Top Pick').length} boosts` },
          { label: 'Avg. Payment',   value: `₹${successful.length ? Math.round(totalRevenue / successful.length) : 0}`, sub: 'Per transaction' },
        ].map((st, i) => (
          <div key={i} style={pt.summaryCard}>
            <div style={pt.summaryLabel}>{st.label}</div>
            <div style={pt.summaryValue}>{st.value}</div>
            <div style={pt.summarySub}>{st.sub}</div>
          </div>
        ))}
      </div>

      {Object.keys(featureRevenue).length > 0 && (
        <div style={pt.revenueByFeature}>
          <div style={pt.featureTitle}>Revenue by Feature</div>
          {Object.entries(featureRevenue).map(([feature, amount]) => (
            <div key={feature} style={pt.featureRow}>
              <span style={pt.featureName}>{feature}</span>
              <div style={pt.featureBarWrap}>
                <div style={{ ...pt.featureBar, width: totalRevenue ? `${Math.round((amount / totalRevenue) * 100)}%` : '0%' }} />
              </div>
              <span style={pt.featureAmount}>₹{amount.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}

      <div style={pt.tableCard}>
        <div style={pt.tableHeader}>
          <h3 style={pt.tableTitle}>All Payments</h3>
          <div style={pt.controls}>
            <input style={pt.searchInput} placeholder="Search by name..." value={search} onChange={e => setSearch(e.target.value)} />
            <select style={pt.select} value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
              <option value="all">All Roles</option>
              <option value="seeker">Seekers</option>
              <option value="owner">Owners</option>
            </select>
            <select style={pt.select} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
              <option value="all">All Features</option>
              {uniqueFeatures.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        </div>
        <table style={pt.table}>
          <thead>
            <tr style={pt.thead}>
              {['Payment ID', 'User', 'Role', 'Feature', 'Amount', 'Method', 'Status', 'Date'].map(h => <th key={h} style={pt.th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtered.map((pay, idx) => (
              <tr key={pay.id || idx} style={pt.tr}>
                <td style={{ ...pt.td, fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-muted)' }}>{pay.id}</td>
                <td style={pt.td}>
                  <div style={pt.userCell}>
                    <div style={pt.userAvatar}>{(pay.name || '?').charAt(0)}</div>
                    <span style={pt.userName}>{pay.name}</span>
                  </div>
                </td>
                <td style={pt.td}>
                  <span style={{ ...pt.roleBadge, ...(pay.role === 'owner' ? pt.ownerBadge : pt.seekerBadge) }}>{pay.role}</span>
                </td>
                <td style={{ ...pt.td, fontSize: '12px', color: 'var(--text-secondary)' }}>{pay.feature}</td>
                <td style={pt.td}><strong style={{ color: '#10b981' }}>₹{pay.amount}</strong></td>
                <td style={{ ...pt.td, fontSize: '12px', color: 'var(--text-muted)' }}>{pay.method}</td>
                <td style={pt.td}>
                  <span style={{ ...pt.successBadge, ...(pay.status !== 'success' ? { background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' } : {}) }}>{pay.status}</span>
                </td>
                <td style={{ ...pt.td, fontSize: '11px', color: 'var(--text-muted)' }}>
                  {pay.timestamp ? new Date(pay.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div style={pt.empty}>{normalised.length === 0 ? 'No payment records found' : 'No payments match your filters'}</div>
        )}
        <div style={pt.tableFooter}>
          <span>Showing {filtered.length} of {normalised.length} payments</span>
          <span>Total: ₹{filtered.reduce((s, x) => s + x.amount, 0).toLocaleString()}</span>
        </div>
      </div>
    </div>
  )
}

const pt = {
  summaryRow: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', marginBottom: '20px' },
  summaryCard: { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '20px' },
  summaryLabel: { fontSize: '12px', color: 'var(--text-muted)', fontWeight: '500', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' },
  summaryValue: { fontSize: '26px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-1px', marginBottom: '4px' },
  summarySub: { fontSize: '12px', color: '#10b981', fontWeight: '500' },
  revenueByFeature: { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '20px', marginBottom: '20px' },
  featureTitle: { fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '16px' },
  featureRow: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' },
  featureName: { fontSize: '12px', color: 'var(--text-secondary)', width: '160px', flexShrink: 0 },
  featureBarWrap: { flex: 1, height: '8px', background: 'var(--bg-secondary)', borderRadius: '4px', overflow: 'hidden' },
  featureBar: { height: '8px', background: 'var(--btn-primary-bg)', borderRadius: '4px', transition: 'width 0.5s' },
  featureAmount: { fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', width: '80px', textAlign: 'right' },
  tableCard: { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px', overflow: 'hidden' },
  tableHeader: { padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  tableTitle: { fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)' },
  controls: { display: 'flex', gap: '10px', alignItems: 'center' },
  searchInput: { padding: '8px 14px', border: '1.5px solid var(--input-border)', borderRadius: '8px', fontSize: '13px', outline: 'none', width: '200px', background: 'var(--bg-card)', color: 'var(--text-primary)' },
  select: { padding: '8px 12px', border: '1.5px solid var(--input-border)', borderRadius: '8px', fontSize: '12px', outline: 'none', color: 'var(--text-secondary)', background: 'var(--bg-card)' },
  table: { width: '100%', borderCollapse: 'collapse' },
  thead: { background: 'var(--bg-primary)' },
  th: { padding: '12px 16px', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border-color)' },
  tr: { borderBottom: '1px solid var(--border-color)' },
  td: { padding: '12px 16px', fontSize: '13px', color: 'var(--text-secondary)' },
  userCell: { display: 'flex', alignItems: 'center', gap: '8px' },
  userAvatar: { width: '26px', height: '26px', borderRadius: '50%', background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', flexShrink: 0 },
  userName: { fontWeight: '600', color: 'var(--text-primary)' },
  roleBadge: { fontSize: '11px', fontWeight: '600', padding: '3px 8px', borderRadius: '4px' },
  seekerBadge: { background: '#eff6ff', color: '#1e40af' },
  ownerBadge: { background: '#f0fdf4', color: '#166534' },
  successBadge: { background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', fontSize: '11px', fontWeight: '600', padding: '3px 8px', borderRadius: '4px', textTransform: 'capitalize' },
  empty: { textAlign: 'center', padding: '32px', fontSize: '14px', color: 'var(--text-muted)' },
  tableFooter: { padding: '12px 20px', fontSize: '12px', color: 'var(--text-muted)', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between' },
}

// ── Helper: relative time ─────────────────────────────────────────────────
function timeAgo(dateStr) {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  if (mins  < 60)  return `${mins}m ago`
  if (hours < 24)  return `${hours}h ago`
  if (days  < 30)  return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Main AdminDashboard ──
export default function AdminDashboard() {
  const { isDark } = useTheme()
  const [activeTab, setActiveTab] = useState(() => {
    const saved = localStorage.getItem('adminActiveTab')
    const valid = ['overview', 'users', 'listings', 'reports', 'analytics', 'payments', 'support']
    return valid.includes(saved) ? saved : 'overview'
  })

  // ── Real users state ──
  const [users, setUsers] = useState([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersError, setUsersError] = useState(null)
  const [userSearch, setUserSearch] = useState('')

  // ── Overview / Analytics state ──
  const [overview, setOverview] = useState(null)
  const [overviewError, setOverviewError] = useState(null)
  const [userGrowthData, setUserGrowthData] = useState(EMPTY_GROWTH)
  const [fraudData, setFraudData] = useState(EMPTY_FRAUD)
  const [locationData, setLocationData] = useState(EMPTY_LOCS)
  const [rentTrendData, setRentTrendData] = useState(EMPTY_RENTS)
  const [aiStats, setAiStats] = useState(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [platformHealth, setPlatformHealth]   = useState(null)
  const [revenueTrend, setRevenueTrend]       = useState([])
  const [visitsTrend, setVisitsTrend]         = useState([])
  const [listingTypes, setListingTypes]       = useState(null)
  const [reportTrends, setReportTrends]       = useState(null)
  const [topListings, setTopListings]         = useState([])

  // ── Reports state ──
  const [reports, setReports] = useState([])
  const [reportsLoading, setReportsLoading] = useState(false)
  const [reportsError, setReportsError] = useState(null)
  const [reportCategoryFilter, setReportCategoryFilter] = useState('all')
  const [reportStatusFilter, setReportStatusFilter] = useState('all')
  const [resolveModal, setResolveModal] = useState(null) // { report, mode: 'resolve'|'dismiss' }
  const [resolveNote, setResolveNote] = useState('')
  const [resolveAction, setResolveAction] = useState('note_only')
  const [resolving, setResolving] = useState(false)
  const [adminToast, setAdminToast] = useState(null)

  // ── Payments state ──
  const [paymentsData, setPaymentsData] = useState([])
  const [paymentsSummary, setPaymentsSummary] = useState(null)
  const [paymentsLoading, setPaymentsLoading] = useState(false)
  const [userFilter, setUserFilter] = useState('all')
  const [userSort, setUserSort] = useState('date')
  const [selectedListing, setSelectedListing] = useState(null)

  // ── Real listings state ──
  const [listings, setListings] = useState([])
  const [listingsLoading, setListingsLoading] = useState(false)
  const [listingsError, setListingsError] = useState(null)

  // ── Listings filter/sort state ──
  const [listingSearch, setListingSearch] = useState('')
  const [listingTypeFilter, setListingTypeFilter] = useState('all')
  const [listingStatusFilter, setListingStatusFilter] = useState('all')
  const [listingSort, setListingSort] = useState('date_desc')

  // ── Support Queries state ──
  const [supportQueries, setSupportQueries]           = useState([])
  const [supportLoading, setSupportLoading]           = useState(false)
  const [supportError, setSupportError]               = useState('')
  const [supportStatusFilter, setSupportStatusFilter] = useState('all')
  const [supportRoleFilter, setSupportRoleFilter]     = useState('all')
  const [supportSearch, setSupportSearch]             = useState('')
  const [supportUnread, setSupportUnread]             = useState(0)
  const [replyModal, setReplyModal]                   = useState(null)
  const [replyText, setReplyText]                     = useState('')
  const [replying, setReplying]                       = useState(false)
  const [expandedQuery, setExpandedQuery]             = useState(null)
  const [confirmDialog, setConfirmDialog]             = useState(null) // { title, message, onConfirm }

  // ── Unread badge counts (listings, reports, support) ──
  const [listingsUnread, setListingsUnread] = useState(0)
  const [reportsUnread,  setReportsUnread]  = useState(0)

  useEffect(() => {
    if (activeTab === 'overview')   fetchAnalytics()
    if (activeTab === 'listings')  { fetchListings();  markTabRead('listings')  }
    if (activeTab === 'users')      fetchUsers()
    if (activeTab === 'reports')   { fetchReports();   markTabRead('reports')   }
    if (activeTab === 'analytics')  fetchAnalytics()
    if (activeTab === 'payments')   fetchPayments()
    if (activeTab === 'support')   { fetchSupportQueries(); markTabRead('support') }
  }, [activeTab])

  // ── Badge helpers ──────────────────────────────────────────────────
  function markTabRead(tab) {
    // Store current seen-count so badge resets when tab is opened
    if (tab === 'listings') {
      localStorage.setItem('admin_seen_listings', Date.now().toString())
      setListingsUnread(0)
    }
    if (tab === 'reports') {
      localStorage.setItem('admin_seen_reports', Date.now().toString())
      setReportsUnread(0)
    }
    if (tab === 'support') {
      localStorage.setItem('admin_seen_support', Date.now().toString())
      setSupportUnread(0)
    }
  }

  function computeUnread(tab, newCount) {
    // Compare new total count with what was seen last time
    const seenKey  = `admin_seen_${tab}_count`
    const seenCount = parseInt(localStorage.getItem(seenKey) || '0', 10)
    const diff = Math.max(0, newCount - seenCount)
    if (tab === 'listings') setListingsUnread(diff)
    if (tab === 'reports')  setReportsUnread(diff)
    if (tab === 'support')  setSupportUnread(diff)
  }

  // Poll counts on mount and every 30s for live badges
  useEffect(() => {
    const token = sessionStorage.getItem('adminToken')
    if (!token) return

    async function pollCounts() {
      try {
        // Support: use existing endpoint
        const sRes = await fetch('http://localhost:5000/api/support/admin/unread-count', {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (sRes.ok) {
          const sd = await sRes.json()
          const total = sd.count || 0
          if (activeTab !== 'support') computeUnread('support', total)
        }
      } catch {}

      try {
        // Listings: pending count
        const lRes = await fetch('http://localhost:5000/api/admin/listings-count', {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (lRes.ok) {
          const ld = await lRes.json()
          const total = ld.count || 0
          if (activeTab !== 'listings') setListingsUnread(total)
        }
      } catch {}

      try {
        // Reports: pending count
        const rRes = await fetch('http://localhost:5000/api/admin/reports-count', {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (rRes.ok) {
          const rd = await rRes.json()
          const total = rd.count || 0
          if (activeTab !== 'reports') setReportsUnread(total)
        }
      } catch {}
    }

    pollCounts()
    const interval = setInterval(pollCounts, 30000)
    return () => clearInterval(interval)
  }, [])

  async function fetchUsers() {
    setUsersLoading(true)
    setUsersError(null)
    try {
      const params = {}
      if (userFilter !== 'all') params.role = userFilter
      if (userSearch.trim())    params.search = userSearch.trim()
      const data = await api.getAllUsers(params)
      // Normalise: map backend `banned` → `status`
      setUsers(data.map(u => ({
        ...u,
        status: u.banned ? 'suspended' : 'active',
        joined: timeAgo(u.created_at),
      })))
    } catch (err) {
      setUsersError(err.message || 'Failed to load users')
    } finally {
      setUsersLoading(false)
    }
  }

  // Re-fetch users when filter or search changes while on the Users tab
  useEffect(() => {
    if (activeTab === 'users') fetchUsers()
  }, [userFilter, userSearch])

  // ── Helper: convert YYYY-MM to short month label ──
  function shortMonth(ym) {
    if (!ym) return ''
    const [y, m] = ym.split('-')
    return new Date(Number(y), Number(m) - 1).toLocaleString('en-IN', { month: 'short' })
  }

  async function fetchAnalytics() {
    setAnalyticsLoading(true)
    setOverviewError(null)
    try {
      const [ov, growth, fraud, locs, rents, ai, health, revTrend, visitsTr, ltypes, rptTrends, topL] = await Promise.all([
        api.getAdminOverview().catch(err => { setOverviewError(err.message || 'Failed to load overview'); return null }),
        api.getUserGrowth().catch(err => { console.error('User growth failed:', err.message); return [] }),
        api.getFraudAnalytics().catch(err => { console.error('Fraud analytics failed:', err.message); return { safe: 1, suspicious: 0, flagged: 0 } }),
        api.getLocationAnalytics().catch(err => { console.error('Location analytics failed:', err.message); return [] }),
        api.getRentTrends().catch(err => { console.error('Rent trends failed:', err.message); return [] }),
        api.getAiMatchStats().catch(err => { console.error('AI match stats failed:', err.message); return null }),
        api.getPlatformHealth().catch(err => { console.error('Platform health failed:', err.message); return null }),
        api.getRevenueTrend().catch(err => { console.error('Revenue trend failed:', err.message); return [] }),
        api.getVisitsTrend().catch(err => { console.error('Visits trend failed:', err.message); return [] }),
        api.getListingTypes().catch(err => { console.error('Listing types failed:', err.message); return null }),
        api.getReportTrends().catch(err => { console.error('Report trends failed:', err.message); return null }),
        api.getTopListings().catch(err => { console.error('Top listings failed:', err.message); return [] }),
      ])

      setOverview(ov)
      setAiStats(ai)
      setPlatformHealth(health)
      setRevenueTrend(revTrend.map(r => ({ ...r, month: shortMonth(r.month) })))
      setVisitsTrend(visitsTr.map(r => ({ ...r, month: shortMonth(r.month) })))
      setListingTypes(ltypes)
      setReportTrends(rptTrends)
      setTopListings(topL)

      // User growth: pivot to { month, seekers, owners }
      setUserGrowthData(growth.map(r => ({ ...r, month: shortMonth(r.month) })))

      // Fraud pie
      setFraudData([
        { name: 'Safe Listings', value: fraud.safe       || 0 },
        { name: 'Suspicious',    value: fraud.suspicious  || 0 },
        { name: 'Flagged',       value: fraud.flagged     || 0 },
      ])

      // Locations bar — backend uses `count`, chart expects `searches`
      setLocationData(locs.map(r => ({ location: r.location, searches: r.count })))

      // Rent trends: pivot [{ month, room_type, avg_rent }] → [{ month, single, shared, studio }]
      const rentMap = {}
      for (const row of rents) {
        const m = shortMonth(row.month)
        if (!rentMap[m]) rentMap[m] = { month: m, single: 0, shared: 0, studio: 0, apartment: 0 }
        const type = (row.room_type || '').toLowerCase()
        if (type.includes('single')) rentMap[m].single = Number(row.avg_rent)
        else if (type.includes('shared') || type.includes('roommate')) rentMap[m].shared = Number(row.avg_rent)
        else if (type.includes('studio')) rentMap[m].studio = Number(row.avg_rent)
        else if (type.includes('apartment') || type.includes('flat') || type.includes('bhk')) rentMap[m].apartment = Number(row.avg_rent)
      }
      setRentTrendData(Object.values(rentMap))
    } catch (err) {
      console.error('Analytics fetch failed:', err.message)
    } finally {
      setAnalyticsLoading(false)
    }
  }

  async function fetchReports() {
    setReportsLoading(true)
    setReportsError(null)
    try {
      const data = await api.getAdminReports()
      setReports(data.map(r => {
        // If reporter is an owner and target is a user → it's a seeker report
        const category = (r.reporter?.role === 'owner' && r.type === 'user')
          ? 'seeker'
          : r.report_category || (r.type === 'listing' ? 'listing' : 'owner')
        return {
          id:           r.id,
          type:         r.type,
          category,
          target:       r.type === 'listing'
            ? (r.target?.title || 'Unknown listing')
            : (r.target?.name  || 'Unknown user'),
          targetEmail:  r.type === 'listing' ? '' : (r.target?.email || ''),
          targetUserId: r.type === 'user' ? (r.target?.id || null) : null,
          reporter:     r.reporter?.name || 'Unknown',
          reason:       r.reason,
          details:      r.details || '',
          status:       r.status,
          adminNote:    r.adminNote || '',
          time:         timeAgo(r.createdAt),
        }
      }))
      // Save pending count baseline so badge can diff correctly
      const pendingCount = data.filter(r => r.status === 'pending').length
      localStorage.setItem('admin_seen_reports_count', pendingCount.toString())
    } catch (err) {
      setReportsError(err.message || 'Failed to load reports')
    } finally {
      setReportsLoading(false)
    }
  }

  async function fetchPayments() {
    setPaymentsLoading(true)
    try {
      const [list, summary] = await Promise.all([
        api.getAdminPayments({ limit: 100 }),
        api.getPaymentsSummary(),
      ])
      setPaymentsData(list.rows || [])
      setPaymentsSummary(summary)
    } catch (err) {
      console.error('Payments fetch failed:', err.message)
    } finally {
      setPaymentsLoading(false)
    }
  }


  async function fetchSupportQueries(overrides = {}) {
    setSupportLoading(true)
    setSupportError('')
    try {
      const token = sessionStorage.getItem('adminToken')
      if (!token) { setSupportError('Not authenticated. Please log in again.'); setSupportLoading(false); return }
      const statusVal = overrides.status  !== undefined ? overrides.status  : supportStatusFilter
      const roleVal   = overrides.role    !== undefined ? overrides.role    : supportRoleFilter
      const searchVal = overrides.search  !== undefined ? overrides.search  : supportSearch
      const params = new URLSearchParams({ limit: 100 })
      if (statusVal && statusVal !== 'all') params.set('status', statusVal)
      if (roleVal   && roleVal   !== 'all') params.set('role',   roleVal)
      if (searchVal && searchVal.trim())    params.set('search', searchVal.trim())
      const res = await fetch(`http://localhost:5000/api/support/admin/queries?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        const msg = errData.error || `Server error (${res.status})`
        console.error('Support fetch failed:', res.status, errData)
        setSupportError(msg)
        setSupportQueries([])
        return
      }
      const data = await res.json()
      setSupportQueries(data.queries || [])
      // Update unread badge from open count
      const openCount = (data.queries || []).filter(q => q.status === 'open').length
      setSupportUnread(openCount)
    } catch (err) {
      console.error('Support fetch error:', err)
      setSupportError('Could not connect to server. Is the backend running?')
      setSupportQueries([])
    }
    finally { setSupportLoading(false) }
  }

  async function handleSupportReply(queryId) {
    if (!replyText.trim()) return
    setReplying(true)
    try {
      const token = sessionStorage.getItem('adminToken')
      const res = await fetch(`http://localhost:5000/api/support/admin/queries/${queryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ admin_reply: replyText.trim(), status: 'resolved' }),
      })
      if (!res.ok) throw new Error()
      setReplyModal(null)
      setReplyText('')
      setSupportUnread(n => Math.max(0, n - 1))
      fetchSupportQueries()
    } catch { /* silent */ } finally { setReplying(false) }
  }

  async function handleSupportStatus(queryId, status) {
    try {
      const token = sessionStorage.getItem('adminToken')
      await fetch(`http://localhost:5000/api/support/admin/queries/${queryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      })
      const labels = { open: 'Reopened', in_progress: 'Marked In Progress', resolved: 'Marked Resolved', closed: 'Closed' }
      showToast('✓ ' + (labels[status] || status), '#166534')
      fetchSupportQueries()
    } catch { showToast('Failed to update status', '#cc0000') }
  }

  async function handleSupportFlag(queryId, currentlyFlagged) {
    try {
      const token = sessionStorage.getItem('adminToken')
      const res = await fetch(`http://localhost:5000/api/support/admin/queries/${queryId}/flag`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.is_flagged) {
        showToast('📌 Query flagged as urgent — moved to top', '#b45309')
      } else {
        showToast('📌 Flag removed', '#374151')
      }
      fetchSupportQueries()
    } catch { showToast('Failed to update flag', '#cc0000') }
  }

  async function fetchListings() {
    setListingsLoading(true)
    setListingsError(null)
    try {
      const data = await api.getAllListings()
      setListings(data)
      // When admin views listings tab, update the seen count baseline
      localStorage.setItem('admin_seen_listings_count', (data.length || 0).toString())
    } catch (err) {
      setListingsError(err.message || 'Failed to load listings')
    } finally {
      setListingsLoading(false)
    }
  }

  async function updateListingStatus(id, status) {
    try {
      await api.updateListingStatus(id, status)
      setListings(prev => prev.map(l => l.id === id ? { ...l, status } : l))
    } catch (err) {
      alert('Failed to update status: ' + (err.message || 'Unknown error'))
    }
  }

  // ── Compute filtered + sorted listings ──
  const uniqueTypes = [...new Set(listings.map(l => l.type).filter(Boolean))]

  const displayedListings = listings
    .filter(l => {
      const matchSearch = !listingSearch ||
        l.title?.toLowerCase().includes(listingSearch.toLowerCase()) ||
        l.owner?.toLowerCase().includes(listingSearch.toLowerCase()) ||
        l.location?.toLowerCase().includes(listingSearch.toLowerCase())
      const matchType = listingTypeFilter === 'all' || l.type === listingTypeFilter
      const matchStatus = listingStatusFilter === 'all' || (l.status || 'pending') === listingStatusFilter
      return matchSearch && matchType && matchStatus
    })
    .sort((a, b) => {
      if (listingSort === 'date_desc') return new Date(b.created_at) - new Date(a.created_at)
      if (listingSort === 'date_asc')  return new Date(a.created_at) - new Date(b.created_at)
      if (listingSort === 'price_asc') return Number(a.price) - Number(b.price)
      if (listingSort === 'price_desc') return Number(b.price) - Number(a.price)
      if (listingSort === 'type')      return (a.type || '').localeCompare(b.type || '')
      return 0
    })

  const allPayments = paymentsData
  const totalRevenue = paymentsSummary
    ? Number(paymentsSummary.successful_revenue || 0) / 100   // paise → ₹
    : allPayments.reduce((s, p) => s + Number(p.amount || 0) / 100, 0)

  const STATS = overview ? [
    { label: 'Total Users',       value: overview.totalUsers.toLocaleString(),       change: `+${overview.newUsersThisMonth} this month` },
    { label: 'Active Listings',   value: overview.activeListings.toLocaleString(),    change: `+${overview.newListingsWeek} this week` },
    { label: 'Total Revenue',     value: `₹${totalRevenue.toLocaleString()}`,         change: 'All time' },
    { label: 'Transactions',      value: overview.transactions.toLocaleString(),      change: 'Total payments' },
    { label: 'AI Matches Made',   value: overview.aiMatches.toLocaleString(),         change: '+208 this month' },
    { label: 'Match Success Rate',value: `${overview.matchSuccessRate}%`,             change: '+3% vs last month' },
  ] : [
    { label: 'Total Users',       value: analyticsLoading ? '…' : '—', change: analyticsLoading ? 'Loading' : 'No data' },
    { label: 'Active Listings',   value: analyticsLoading ? '…' : '—', change: analyticsLoading ? 'Loading' : 'No data' },
    { label: 'Total Revenue',     value: analyticsLoading ? '…' : '—', change: analyticsLoading ? 'Loading' : 'No data' },
    { label: 'Transactions',      value: analyticsLoading ? '…' : '—', change: analyticsLoading ? 'Loading' : 'No data' },
    { label: 'AI Matches Made',   value: analyticsLoading ? '…' : '—', change: analyticsLoading ? 'Loading' : 'No data' },
    { label: 'Match Success Rate',value: analyticsLoading ? '…' : '—', change: analyticsLoading ? 'Loading' : 'No data' },
  ]

  function handleLogout() {
    sessionStorage.removeItem('adminUser')
    sessionStorage.removeItem('adminToken')
    window.location.href = '/admin-login'
  }

  function showToast(msg, color = '#111') {
    setAdminToast({ msg, color })
    setTimeout(() => setAdminToast(null), 3000)
  }

  function openResolveModal(report, mode) {
    setResolveModal({ report, mode })
    setResolveNote('')
    setResolveAction('note_only')
  }

  async function confirmResolve() {
    if (!resolveModal) return
    const { report, mode } = resolveModal
    setResolving(true)
    try {
      if (mode === 'resolve') {
        if (resolveAction === 'suspend_user' && report.type === 'user') {
          // Suspend the user account, then resolve the report
          if (!report.targetUserId) throw new Error('Cannot suspend: target user ID is missing')
          await api.updateUser(report.targetUserId, { banned: true })
          await api.resolveReport(report.id, resolveNote.trim() || 'User account suspended')
          setReports(prev => prev.map(r => r.id === report.id ? { ...r, status: 'resolved', adminNote: resolveNote.trim() } : r))
          // Sync Users tab immediately and re-fetch to ensure accuracy
          setUsers(prev => prev.map(u => u.id === report.targetUserId ? { ...u, status: 'suspended' } : u))
          fetchUsers()
          showToast('✓ Report resolved · User suspended', '#166534')
        } else if (resolveAction === 'warn_user' && report.type === 'user') {
          // Send a warning notification to the user, then resolve the report
          await api.warnReport(report.id, resolveNote.trim())
          setReports(prev => prev.map(r => r.id === report.id ? { ...r, status: 'resolved', adminNote: resolveNote.trim() } : r))
          showToast('✓ Report resolved · Warning sent to user', '#b45309')
        } else {
          // Note only — just mark report resolved
          await api.resolveReport(report.id, resolveNote.trim())
          setReports(prev => prev.map(r => r.id === report.id ? { ...r, status: 'resolved', adminNote: resolveNote.trim() } : r))
          showToast('✓ Report resolved', '#166534')
        }
      } else {
        await api.dismissReport(report.id, resolveNote.trim())
        setReports(prev => prev.map(r => r.id === report.id ? { ...r, status: 'dismissed', adminNote: resolveNote.trim() } : r))
        showToast('Report dismissed — no action taken', '#555')
      }
      setResolveModal(null)
    } catch (err) {
      showToast('Failed: ' + (err.message || 'Unknown error'), '#cc0000')
    } finally {
      setResolving(false)
    }
  }

  async function toggleUserStatus(id) {
    const user = users.find(u => u.id === id)
    if (!user) return
    const newBanned = user.status === 'active'
    // Optimistic UI update
    setUsers(prev => prev.map(u =>
      u.id === id ? { ...u, status: newBanned ? 'suspended' : 'active' } : u
    ))
    try {
      await api.updateUser(id, { banned: newBanned })
    } catch (err) {
      // Roll back on failure
      setUsers(prev => prev.map(u =>
        u.id === id ? { ...u, status: newBanned ? 'active' : 'suspended' } : u
      ))
      alert('Failed to update user: ' + (err.message || 'Unknown error'))
    }
  }

  const filteredUsers = [...users].sort((a, b) => {
    if (userSort === 'role') return (a.role || '').localeCompare(b.role || '')
    if (userSort === 'name') return (a.name || '').localeCompare(b.name || '')
    // default: date joined (newest first)
    return new Date(b.created_at) - new Date(a.created_at)
  })

  const tabs = ['overview', 'users', 'listings', 'reports', 'analytics', 'payments', 'support']

  return (
    <div style={s.page}>
      {/* Admin Topbar */}
      <div style={s.topbar}>
        <div style={s.topbarLeft}>
          <div style={s.logo}><div style={s.logoBox}>R</div><span style={s.logoName}>RentMate</span><span style={s.logoAI}> AI</span></div>
          <div style={s.adminBadge}>Admin Panel</div>
        </div>
        <div style={s.topbarRight}>
          <div style={s.adminInfo}>
            <div style={s.adminAvatar}>A</div>
            <div>
              <div style={s.adminName}>Administrator</div>
              <div style={s.adminRole}>Super Admin</div>
            </div>
          </div>
          <button style={s.logoutBtn} onClick={handleLogout}>Logout →</button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={s.tabBar}>
        {tabs.map(t => {
          const badgeCount = t === 'listings' ? listingsUnread : t === 'reports' ? reportsUnread : t === 'support' ? supportUnread : 0
          return (
            <button key={t} style={{ ...s.tab, ...(activeTab === t ? s.tabActive : {}), position: 'relative' }} onClick={() => { setActiveTab(t); localStorage.setItem('adminActiveTab', t) }}>
              {t === 'support' ? 'Support' : t.charAt(0).toUpperCase() + t.slice(1)}
              {badgeCount > 0 && (
                <span style={{ marginLeft: 6, background: '#ef4444', color: '#fff', borderRadius: 20, fontSize: 10, fontWeight: 800, padding: '1px 6px', lineHeight: '16px', display: 'inline-block', verticalAlign: 'middle' }}>
                  {badgeCount}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div style={s.content}>
        {/* ── OVERVIEW TAB ── */}
        {activeTab === 'overview' && (
          <>
            {analyticsLoading && (
              <div style={{ textAlign: 'center', padding: '10px', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                ⏳ Loading live data…
              </div>
            )}
            {!analyticsLoading && overviewError && (
              <div style={{ background: 'var(--tag-yellow-bg)', border: '1px solid var(--tag-yellow-border)', borderRadius: '10px', padding: '12px 16px', marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px', color: '#92400e' }}>⚠️ Stats failed to load: {overviewError}</span>
                <button onClick={fetchAnalytics} style={{ background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)', border: 'none', borderRadius: '7px', padding: '6px 14px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>↺ Retry</button>
              </div>
            )}
            <div style={s.statsGrid}>
              {STATS.map((st, i) => (
                <div key={i} style={s.statCard}>
                  <div style={s.statLabel}>{st.label}</div>
                  <div style={s.statValue}>{st.value}</div>
                  <div style={s.statChange}>{st.change}</div>
                </div>
              ))}
            </div>
            <div style={s.chartsRow}>
              <div style={s.chartCard}>
                <h3 style={s.chartTitle}>User Growth</h3>
                <p style={s.chartSub}>Seekers vs Owners over time</p>
                {userGrowthData.length === 0
                  ? <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>No data yet</div>
                  : <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={userGrowthData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#aaa' }} />
                        <YAxis tick={{ fontSize: 12, fill: '#aaa' }} />
                        <Tooltip /><Legend />
                        <Line type="monotone" dataKey="seekers" stroke="#111" strokeWidth={2} dot={{ r: 3 }} name="Seekers" />
                        <Line type="monotone" dataKey="owners" stroke="#888" strokeWidth={2} dot={{ r: 3 }} name="Owners" />
                      </LineChart>
                    </ResponsiveContainer>
                }
              </div>
              <div style={s.chartCard}>
                <h3 style={s.chartTitle}>Fraud Detection</h3>
                <p style={s.chartSub}>Listing safety breakdown</p>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={fraudData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" nameKey="name">
                      {fraudData.map((_, i) => <Cell key={i} fill={FRAUD_COLORS[i]} />)}
                    </Pie>
                    <Tooltip /><Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div style={s.chartsRow}>
              <div style={s.chartCard}>
                <h3 style={s.chartTitle}>Most Listed Locations</h3>
                <p style={s.chartSub}>Top areas by listing count</p>
                {locationData.length === 0
                  ? <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>No data yet</div>
                  : <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={locationData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis type="number" tick={{ fontSize: 12, fill: '#aaa' }} />
                        <YAxis dataKey="location" type="category" tick={{ fontSize: 11, fill: '#aaa' }} width={90} />
                        <Tooltip />
                        <Bar dataKey="searches" fill="#111" radius={[0, 4, 4, 0]} name="Listings" />
                      </BarChart>
                    </ResponsiveContainer>
                }
              </div>
              <div style={s.chartCard}>
                <h3 style={s.chartTitle}>Average Rent Trends</h3>
                <p style={s.chartSub}>Monthly rent by room type (₹)</p>
                {rentTrendData.length === 0
                  ? <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>No data yet</div>
                  : <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={rentTrendData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#aaa' }} />
                        <YAxis tick={{ fontSize: 12, fill: '#aaa' }} />
                        <Tooltip formatter={(v) => `₹${v.toLocaleString()}`} /><Legend />
                        <Line type="monotone" dataKey="single"    stroke="#111"    strokeWidth={2} name="Single" />
                        <Line type="monotone" dataKey="shared"    stroke="#888"    strokeWidth={2} name="Shared" />
                        <Line type="monotone" dataKey="studio"    stroke="#bbb"    strokeWidth={2} name="Studio" />
                        <Line type="monotone" dataKey="apartment" stroke="#6366f1" strokeWidth={2} name="Apartment" />
                      </LineChart>
                    </ResponsiveContainer>
                }
              </div>
            </div>
            <div style={s.matchCard}>
              <h3 style={s.chartTitle}>AI Match Metrics</h3>
              <div style={s.matchStats}>
                {(() => {
                  const totalFraud = fraudData.reduce((s, d) => s + d.value, 0)
                  const safeRate = totalFraud > 0 ? Math.round((fraudData[0].value / totalFraud) * 100) : 94
                  const overallRate = overview?.matchSuccessRate ?? aiStats?.avg_score ?? 87
                  const hqRate = aiStats?.total_matches > 0 ? Math.round((aiStats.high_quality / aiStats.total_matches) * 100) : 72
                  return [
                    { label: 'Overall Match Rate',   value: overallRate },
                    { label: 'High-Quality Matches', value: hqRate },
                    { label: 'Safe Listings',        value: safeRate },
                    { label: 'Fraud Prevention',     value: fraudData[2]?.value === 0 ? 100 : Math.max(0, 100 - Math.round((fraudData[2]?.value / Math.max(totalFraud, 1)) * 100)) },
                  ]
                })().map((m, i) => (
                  <div key={i} style={s.matchItem}>
                    <div style={s.matchTop}>
                      <span style={s.matchLabel}>{m.label}</span>
                      <span style={s.matchPct}>{m.value}%</span>
                    </div>
                    <div style={s.matchBar}><div style={{ ...s.matchFill, width: `${m.value}%` }} /></div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── USERS TAB ── */}
        {activeTab === 'users' && (
          <div style={s.tableCard}>
            <div style={s.tableHeader}>
              <h3 style={s.tableTitle}>All Users</h3>
              <div style={s.tableControls}>
                <div style={s.filterTabs}>
                  {['all', 'seeker', 'owner'].map(f => (
                    <button key={f} style={{ ...s.filterTab, ...(userFilter === f ? s.filterTabOn : {}) }} onClick={() => setUserFilter(f)}>
                      {f === 'all' ? 'All' : f === 'seeker' ? 'Seekers' : 'Owners'}
                    </button>
                  ))}
                </div>
                <select style={s.sortSelect} value={userSort} onChange={e => setUserSort(e.target.value)}>
                  <option value="date">Sort: Date Joined</option>
                  <option value="role">Sort: Role</option>
                  <option value="name">Sort: Name</option>
                </select>
                <input
                  style={s.searchInput}
                  placeholder="Search users..."
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                />
              </div>
            </div>
            {usersLoading && (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>
                Loading users…
              </div>
            )}
            {usersError && (
              <div style={{ padding: '20px', color: '#cc0000', fontSize: '13px' }}>
                ⚠️ {usersError} &nbsp;
                <button style={{ fontSize: '12px', cursor: 'pointer' }} onClick={fetchUsers}>Retry</button>
              </div>
            )}
            {!usersLoading && !usersError && (
              <>
                <table style={s.table}>
                  <thead>
                    <tr style={s.thead}>
                      {['Name', 'Role', 'Email', 'Joined', 'Status', 'Actions'].map(h => <th key={h} style={s.th}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map(u => (
                      <tr key={u.id} style={s.tr}>
                        <td style={s.td}>
                          <div style={s.userCell}>
                            <div style={s.userAvatar}>{u.name.charAt(0)}</div>
                            <span style={s.userName}>{u.name}</span>
                          </div>
                        </td>
                        <td style={s.td}><span style={{ ...s.roleBadge, ...(u.role === 'owner' ? s.ownerBadge : s.seekerBadge) }}>{u.role}</span></td>
                        <td style={{ ...s.td, color: 'var(--text-muted)', fontSize: '12px' }}>{u.email}</td>
                        <td style={{ ...s.td, color: 'var(--text-muted)', fontSize: '12px' }}>{u.joined}</td>
                        <td style={s.td}><span style={{ ...s.statusBadge, ...(u.status === 'active' ? s.activeBadge : s.suspendedBadge) }}>{u.status}</span></td>
                        <td style={s.td}>
                          <button style={s.actionBtn} onClick={() => toggleUserStatus(u.id)}>
                            {u.status === 'active' ? 'Suspend' : 'Activate'}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredUsers.length === 0 && (
                      <tr><td colSpan={6} style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>No users found</td></tr>
                    )}
                  </tbody>
                </table>
                <div style={s.tableFooter}>Showing {filteredUsers.length} of {users.length} users</div>
              </>
            )}
          </div>
        )}

        {/* ── REPORTS TAB ── */}
        {activeTab === 'reports' && (() => {
          const CATEGORY_CONFIG = {
            all:      { label: 'All Reports',      icon: '📋', color: 'var(--text-primary)',    bg: '#f5f5f5'  },
            owner:    { label: 'Owner Reports',    icon: '🏠', color: '#92400e', bg: '#fffbeb'  },
            roommate: { label: 'Roommate Reports', icon: '🤝', color: '#1e40af', bg: '#eff6ff'  },
            listing:  { label: 'Listing Reports',  icon: '📍', color: '#166534', bg: '#f0fdf4'  },
            seeker:   { label: 'Seeker Reports',   icon: '🔍', color: '#6b21a8', bg: '#faf5ff'  },
          }
          const STATUS_COLORS = {
            pending:   { color: '#92400e', bg: '#fffbeb', border: '#fde68a' },
            resolved:  { color: '#166534', bg: '#f0fdf4', border: '#bbf7d0' },
            dismissed: { color: 'var(--text-muted)',    bg: '#f5f5f5', border: '#ddd'    },
            reviewing: { color: '#1e40af', bg: '#eff6ff', border: '#bfdbfe' },
          }
          const filtered = reports.filter(r => {
            const matchCat    = reportCategoryFilter === 'all' || r.category === reportCategoryFilter
            const matchStatus = reportStatusFilter   === 'all' || r.status   === reportStatusFilter
            return matchCat && matchStatus
          })
          const counts = {
            all:      reports.length,
            owner:    reports.filter(r => r.category === 'owner').length,
            roommate: reports.filter(r => r.category === 'roommate').length,
            listing:  reports.filter(r => r.category === 'listing').length,
            seeker:   reports.filter(r => r.category === 'seeker').length,
          }
          const pendingCount = reports.filter(r => r.status === 'pending').length

          return (
            <div style={s.tableCard}>
              {/* Header */}
              <div style={s.tableHeader}>
                <div>
                  <h3 style={s.tableTitle}>User Reports</h3>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Reports submitted by users about owners, roommates and listings</p>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={s.pendingCount}>{pendingCount} pending</span>
                  <button style={{ fontSize: 12, padding: '6px 12px', border: '1px solid var(--input-border)', borderRadius: 8, background: 'var(--bg-card)', cursor: 'pointer', color: 'var(--text-secondary)' }} onClick={fetchReports}>↻ Refresh</button>
                </div>
              </div>

              {/* Category tabs */}
              <div style={{ display: 'flex', gap: 8, padding: '0 0 16px', flexWrap: 'wrap' }}>
                {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
                  <button
                    key={key}
                    onClick={() => setReportCategoryFilter(key)}
                    style={{
                      padding: '7px 16px', borderRadius: 30, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      border: reportCategoryFilter === key ? `2px solid ${cfg.color}` : '1.5px solid #e5e7eb',
                      background: reportCategoryFilter === key ? cfg.bg : '#fff',
                      color: reportCategoryFilter === key ? cfg.color : '#888',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}
                  >
                    {cfg.icon} {cfg.label}
                    <span style={{ background: reportCategoryFilter === key ? cfg.color : '#e5e7eb', color: reportCategoryFilter === key ? '#fff' : '#555', borderRadius: 10, padding: '1px 7px', fontSize: 11 }}>
                      {counts[key] ?? 0}
                    </span>
                  </button>
                ))}

                {/* Status filter */}
                <select
                  value={reportStatusFilter}
                  onChange={e => setReportStatusFilter(e.target.value)}
                  style={{ marginLeft: 'auto', padding: '7px 12px', borderRadius: 8, border: '1.5px solid var(--input-border)', fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-card)', cursor: 'pointer' }}
                >
                  <option value="all">All Statuses</option>
                  <option value="pending">Pending</option>
                  <option value="reviewing">Reviewing</option>
                  <option value="resolved">Resolved</option>
                  <option value="dismissed">Dismissed</option>
                </select>
              </div>

              {reportsLoading && <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>Loading reports…</div>}
              {reportsError  && (
                <div style={{ padding: '20px', color: '#cc0000', fontSize: '13px' }}>
                  ⚠️ {reportsError} &nbsp;
                  <button style={{ fontSize: '12px', cursor: 'pointer' }} onClick={fetchReports}>Retry</button>
                </div>
              )}

              {!reportsLoading && !reportsError && (
                <div style={s.reportsList}>
                  {filtered.length === 0 && (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                      <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.2 }}>📋</div>
                      No {reportCategoryFilter !== 'all' ? CATEGORY_CONFIG[reportCategoryFilter]?.label.toLowerCase() : 'reports'} found
                    </div>
                  )}
                  {filtered.map(r => {
                    const catCfg = CATEGORY_CONFIG[r.category] || CATEGORY_CONFIG.owner
                    const stCfg  = STATUS_COLORS[r.status]     || STATUS_COLORS.pending
                    return (
                      <div key={r.id} style={s.reportCard}>
                        <div style={s.reportLeft}>
                          <div style={{ ...s.reportTypeBadge, background: catCfg.bg, color: catCfg.color, border: `1px solid ${catCfg.color}22`, minWidth: 90, textAlign: 'center' }}>
                            {catCfg.icon} {catCfg.label.replace(' Reports', '')}
                          </div>
                          <div style={s.reportInfo}>
                            <div style={s.reportTitle}>
                              Reported: <strong>{r.target}</strong>
                              {r.targetEmail && <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>({r.targetEmail})</span>}
                            </div>
                            <div style={s.reportSub}>By {r.reporter} · <strong>{r.reason}</strong> · {r.time}</div>
                            {r.details && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, fontStyle: 'italic' }}>"{r.details}"</div>}
                          </div>
                        </div>
                        <div style={s.reportRight}>
                          <span style={{ ...s.statusPill, background: stCfg.bg, color: stCfg.color, border: `1px solid ${stCfg.border}` }}>
                            {r.status}
                          </span>
                          {r.status === 'pending' && (
                            <div style={s.reportActions}>
                              <button style={s.resolveBtn} onClick={() => openResolveModal(r, 'resolve')}>✓ Resolve</button>
                              <button style={s.dismissBtn} onClick={() => openResolveModal(r, 'dismiss')}>Dismiss</button>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })()}

        {/* ── ANALYTICS TAB ── */}
        {activeTab === 'analytics' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* ── Header Bar ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)', margin: 0 }}>Platform Analytics</h2>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '3px 0 0' }}>Full system overview — users, revenue, listings, AI, and activity</p>
              </div>
              <button onClick={fetchAnalytics} disabled={analyticsLoading}
                style={{ background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)', border: 'none', borderRadius: '9px', padding: '9px 18px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', opacity: analyticsLoading ? 0.6 : 1 }}>
                {analyticsLoading ? '⏳ Loading…' : '↺ Refresh'}
              </button>
            </div>

            {/* ── Error Banner ── */}
            {!analyticsLoading && overviewError && (
              <div style={{ background: 'var(--tag-yellow-bg)', border: '1px solid var(--tag-yellow-border)', borderRadius: '10px', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px', color: '#92400e' }}>⚠️ Some stats failed to load: {overviewError}</span>
                <button onClick={fetchAnalytics} style={{ background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)', border: 'none', borderRadius: '7px', padding: '6px 14px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>↺ Retry</button>
              </div>
            )}

            {/* ── KPI Cards Row 1: Core metrics ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
              {[
                { icon: '👥', title: 'Total Users',       value: overview ? overview.totalUsers.toLocaleString() : '—',               sub: `+${overview?.newUsersThisMonth ?? 0} this month`,                      accent: '#6366f1' },
                { icon: '🏠', title: 'Active Listings',   value: overview ? overview.activeListings.toLocaleString() : '—',           sub: `+${overview?.newListingsWeek ?? 0} this week`,                         accent: '#10b981' },
                { icon: '₹',  title: 'Total Revenue',     value: overview ? `₹${Number(overview.totalRevenue || 0).toLocaleString()}` : '—', sub: `${overview?.revenueChange >= 0 ? '+' : ''}${overview?.revenueChange ?? 0}% this month`, accent: '#f59e0b' },
                { icon: '🤖', title: 'AI Matches',        value: overview ? overview.aiMatches.toLocaleString() : '—',                sub: `${overview?.matchSuccessRate ?? 0}% avg score`,                        accent: '#ec4899' },
              ].map((k, i) => (
                <div key={i} style={{ background: 'var(--bg-card)', borderRadius: '14px', padding: '18px 20px', border: '1px solid var(--border-color)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: k.accent + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: '700', color: k.accent }}>{k.icon}</div>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)' }}>{k.title}</span>
                  </div>
                  <div style={{ fontSize: '26px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>{analyticsLoading ? <span style={{ color: '#ddd' }}>—</span> : k.value}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{k.sub}</div>
                </div>
              ))}
            </div>

            {/* ── KPI Cards Row 2: Activity metrics ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
              {[
                { icon: '📅', title: 'Total Visits',      value: platformHealth ? platformHealth.total_visits.toLocaleString() : '—',     sub: `${platformHealth?.visits_change >= 0 ? '+' : ''}${platformHealth?.visits_change ?? 0}% vs last week`, accent: '#0ea5e9' },
                { icon: '💬', title: 'Total Messages',    value: platformHealth ? platformHealth.total_messages.toLocaleString() : '—',    sub: 'All-time messages sent',       accent: '#8b5cf6' },
                { icon: '🔖', title: 'Total Bookmarks',   value: platformHealth ? platformHealth.total_bookmarks.toLocaleString() : '—',   sub: 'Listings saved by seekers',    accent: '#f43f5e' },
                { icon: '⭐', title: 'Avg. Rating',       value: platformHealth ? (platformHealth.avg_rating || 0) + ' / 5' : '—',        sub: `${platformHealth?.total_reviews ?? 0} reviews total`, accent: '#f59e0b' },
              ].map((k, i) => (
                <div key={i} style={{ background: 'var(--bg-card)', borderRadius: '14px', padding: '18px 20px', border: '1px solid var(--border-color)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: k.accent + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>{k.icon}</div>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)' }}>{k.title}</span>
                  </div>
                  <div style={{ fontSize: '26px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>{analyticsLoading ? <span style={{ color: '#ddd' }}>—</span> : k.value}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{k.sub}</div>
                </div>
              ))}
            </div>

            {/* ── Row: User Growth + Revenue Trend ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div style={{ background: 'var(--bg-card)', borderRadius: '14px', padding: '20px', border: '1px solid var(--border-color)' }}>
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>📈 User Growth</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Seekers vs Owners joining per month</div>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={userGrowthData} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#bbb' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#bbb' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '10px', border: '1px solid var(--border-color)', fontSize: '12px' }} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '12px' }} />
                    <Bar dataKey="seekers" fill="#111" radius={[4, 4, 0, 0]} name="Seekers" />
                    <Bar dataKey="owners"  fill="#d1d5db" radius={[4, 4, 0, 0]} name="Owners" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div style={{ background: 'var(--bg-card)', borderRadius: '14px', padding: '20px', border: '1px solid var(--border-color)' }}>
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>💰 Revenue Trend</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Monthly revenue (₹) over the past 12 months</div>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={revenueTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#bbb' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#bbb' }} axisLine={false} tickLine={false} tickFormatter={v => `₹${v.toLocaleString()}`} />
                    <Tooltip formatter={(v, n) => n === 'revenue' ? [`₹${Number(v).toLocaleString()}`, 'Revenue'] : [v, n]} contentStyle={{ borderRadius: '10px', border: '1px solid var(--border-color)', fontSize: '12px' }} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '12px' }} />
                    <Line type="monotone" dataKey="revenue" stroke="#111" strokeWidth={2.5} dot={{ r: 4, fill: '#111' }} name="Revenue (₹)" />
                    <Line type="monotone" dataKey="transactions" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} name="Transactions" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* ── Row: Visit Requests + Rent Trends ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div style={{ background: 'var(--bg-card)', borderRadius: '14px', padding: '20px', border: '1px solid var(--border-color)' }}>
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>📅 Visit Requests</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Approved, pending & rejected visits monthly</div>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={visitsTrend} barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#bbb' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#bbb' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '10px', border: '1px solid var(--border-color)', fontSize: '12px' }} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '12px' }} />
                    <Bar dataKey="approved" fill="#10b981" radius={[4, 4, 0, 0]} name="Approved" stackId="a" />
                    <Bar dataKey="pending"  fill="#f59e0b" radius={[0, 0, 0, 0]} name="Pending"  stackId="a" />
                    <Bar dataKey="rejected" fill="#ef4444" radius={[0, 0, 4, 4]} name="Rejected" stackId="a" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div style={{ background: 'var(--bg-card)', borderRadius: '14px', padding: '20px', border: '1px solid var(--border-color)' }}>
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>🏷️ Avg. Rent by Room Type</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Single, shared & studio rent trends (₹/mo)</div>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={rentTrendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#bbb' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#bbb' }} axisLine={false} tickLine={false} tickFormatter={v => `₹${v}`} />
                    <Tooltip formatter={v => [`₹${Number(v).toLocaleString()}`, '']} contentStyle={{ borderRadius: '10px', border: '1px solid var(--border-color)', fontSize: '12px' }} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '12px' }} />
                    <Line type="monotone" dataKey="single"    stroke="#111"    strokeWidth={2} dot={{ r: 3 }} name="Single Room" />
                    <Line type="monotone" dataKey="shared"    stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} name="Shared Room" />
                    <Line type="monotone" dataKey="studio"    stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} name="Studio" />
                    <Line type="monotone" dataKey="apartment" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} name="Apartment" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* ── Row: Fraud Analysis + Listing Types ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div style={{ background: 'var(--bg-card)', borderRadius: '14px', padding: '20px', border: '1px solid var(--border-color)' }}>
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>🛡️ Fraud Detection</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>AI-powered listing safety breakdown</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                  <PieChart width={160} height={160}>
                    <Pie data={fraudData} cx={75} cy={75} innerRadius={45} outerRadius={72} dataKey="value" paddingAngle={3}>
                      {fraudData.map((_, i) => <Cell key={i} fill={['#10b981', '#f59e0b', '#ef4444'][i]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '10px', border: '1px solid var(--border-color)', fontSize: '12px' }} />
                  </PieChart>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {[
                      { label: '✅ Safe',        color: '#10b981', key: 0 },
                      { label: '⚠️ Suspicious',  color: '#f59e0b', key: 1 },
                      { label: '🚨 Flagged',     color: '#ef4444', key: 2 },
                    ].map(({ label, color, key }) => (
                      <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: color }} />
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{label}</span>
                        </div>
                        <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>{fraudData[key]?.value ?? 0}</span>
                      </div>
                    ))}
                    <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '8px', marginTop: '2px' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Total listings analysed</div>
                      <div style={{ fontSize: '16px', fontWeight: '800', color: 'var(--text-primary)' }}>{fraudData.reduce((s, d) => s + (d.value || 0), 0)}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ background: 'var(--bg-card)', borderRadius: '14px', padding: '20px', border: '1px solid var(--border-color)' }}>
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>🏘️ Listings by Type</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Count and avg rent per room type</div>
                </div>
                {listingTypes?.by_type?.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {listingTypes.by_type.slice(0, 5).map((t, i) => {
                      const maxCount = Math.max(...listingTypes.by_type.map(x => x.count))
                      const pct = maxCount > 0 ? Math.round((t.count / maxCount) * 100) : 0
                      const colors = ['#111', '#6366f1', '#10b981', '#f59e0b', '#ec4899']
                      return (
                        <div key={i}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)' }}>{t.type}</span>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{t.count} listings · ₹{t.avg_rent.toLocaleString()}/mo</span>
                          </div>
                          <div style={{ height: '6px', background: 'var(--bg-secondary)', borderRadius: '3px' }}>
                            <div style={{ height: '6px', background: colors[i % colors.length], borderRadius: '3px', width: `${pct}%`, transition: 'width 0.6s ease' }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>No listing data yet</div>
                )}
                {listingTypes?.by_status?.length > 0 && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #f5f5f5' }}>
                    {listingTypes.by_status.map((s2, i) => (
                      <div key={i} style={{ background: 'var(--bg-secondary)', borderRadius: '20px', padding: '4px 12px', fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600' }}>
                        {s2.status}: {s2.count}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── Row: Top Locations + Report Trends ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div style={{ background: 'var(--bg-card)', borderRadius: '14px', padding: '20px', border: '1px solid var(--border-color)' }}>
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>📍 Top Listing Locations</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Most listed areas on the platform</div>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={locationData.slice(0, 7)} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#bbb' }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="location" tick={{ fontSize: 11, fill: '#555' }} axisLine={false} tickLine={false} width={90} />
                    <Tooltip contentStyle={{ borderRadius: '10px', border: '1px solid var(--border-color)', fontSize: '12px' }} />
                    <Bar dataKey="searches" fill="#111" radius={[0, 4, 4, 0]} name="Listings" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div style={{ background: 'var(--bg-card)', borderRadius: '14px', padding: '20px', border: '1px solid var(--border-color)' }}>
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>🚨 Report Trends</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Monthly reports filed and resolved</div>
                </div>
                {reportTrends?.trend?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={reportTrends.trend.map(r => ({ ...r, month: shortMonth(r.month) }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#bbb' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: '#bbb' }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ borderRadius: '10px', border: '1px solid var(--border-color)', fontSize: '12px' }} />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
                      <Bar dataKey="total"    fill="#111"    radius={[4, 4, 0, 0]} name="Total" />
                      <Bar dataKey="resolved" fill="#10b981" radius={[4, 4, 0, 0]} name="Resolved" />
                      <Bar dataKey="pending"  fill="#f59e0b" radius={[4, 4, 0, 0]} name="Pending" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>No report data yet</div>
                )}
                {reportTrends?.by_category?.length > 0 && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #f5f5f5' }}>
                    {reportTrends.by_category.map((c, i) => (
                      <div key={i} style={{ background: 'var(--bg-secondary)', borderRadius: '20px', padding: '4px 12px', fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600' }}>
                        {c.category}: {c.count}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── AI Matcher Stats ── */}
            <div style={{ background: 'var(--bg-card)', borderRadius: '14px', padding: '22px 24px', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>🤖 AI Matcher Performance</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Match scores, quality, and distribution stats</div>
                </div>
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '20px', padding: '5px 14px', fontSize: '12px', fontWeight: '700', color: '#059669' }}>
                  {aiStats ? `${aiStats.avg_score ?? 0}% avg score` : overview ? `${overview.matchSuccessRate ?? 0}% avg score` : 'Loading…'}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                {[
                  { label: 'Total Matches Made',   value: aiStats ? aiStats.total_matches.toLocaleString() : (overview?.aiMatches ?? '—'), icon: '🎯', color: '#6366f1' },
                  { label: 'High-Quality Matches',  value: aiStats ? aiStats.high_quality.toLocaleString() : '—',                            icon: '⭐', color: '#f59e0b' },
                  { label: 'Average Match Score',   value: aiStats ? `${aiStats.avg_score}%` : `${overview?.matchSuccessRate ?? 0}%`,         icon: '📊', color: '#10b981' },
                  { label: 'Repeat Users',          value: overview ? `${overview.repeatUserRate ?? 0}%` : '—',                               icon: '🔄', color: '#ec4899' },
                ].map((m2, i) => (
                  <div key={i} style={{ background: 'var(--bg-primary)', borderRadius: '12px', padding: '16px', textAlign: 'center' }}>
                    <div style={{ fontSize: '22px', marginBottom: '8px' }}>{m2.icon}</div>
                    <div style={{ fontSize: '20px', fontWeight: '800', color: m2.color }}>{analyticsLoading ? '—' : m2.value}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{m2.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Top Listings Table ── */}
            <div style={{ background: 'var(--bg-card)', borderRadius: '14px', padding: '22px 24px', border: '1px solid var(--border-color)' }}>
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>🏆 Top Performing Listings</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Ranked by bookmarks + visit requests</div>
              </div>
              {topListings.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      {['#', 'Listing', 'Location', 'Rent', 'Type', '🔖 Bookmarks', '📅 Visits', 'Score'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {topListings.map((l, i) => (
                      <tr key={l.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '10px 12px', fontWeight: '700', color: i < 3 ? ['#f59e0b','#94a3b8','#cd7c54'][i] : '#bbb', fontSize: '14px' }}>
                          {i < 3 ? ['🥇','🥈','🥉'][i] : `${i + 1}`}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ fontWeight: '600', color: 'var(--text-primary)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.title}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{l.owner}</div>
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>📍 {l.location}</td>
                        <td style={{ padding: '10px 12px', fontWeight: '700', color: 'var(--text-primary)' }}>₹{Number(l.rent).toLocaleString()}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ background: 'var(--bg-secondary)', borderRadius: '20px', padding: '3px 10px', fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)' }}>{l.type}</span>
                        </td>
                        <td style={{ padding: '10px 12px', fontWeight: '700', color: '#6366f1' }}>{l.bookmarks}</td>
                        <td style={{ padding: '10px 12px', fontWeight: '700', color: '#10b981' }}>{l.visits}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ flex: 1, height: '5px', background: 'var(--bg-secondary)', borderRadius: '3px', minWidth: '50px' }}>
                              <div style={{ height: '5px', background: 'var(--btn-primary-bg)', borderRadius: '3px', width: `${Math.min(100, Math.round((l.score / (topListings[0]?.score || 1)) * 100))}%` }} />
                            </div>
                            <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-primary)', minWidth: '22px' }}>{l.score}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                  {analyticsLoading ? 'Loading top listings…' : 'No listing data yet'}
                </div>
              )}
            </div>

            {/* ── Platform Health Snapshot ── */}
            <div style={{ background: 'var(--btn-primary-bg)', borderRadius: '16px', padding: '24px 28px', color: 'var(--btn-primary-text)' }}>
              <div style={{ fontSize: '14px', fontWeight: '700', marginBottom: '18px', opacity: 0.9 }}>⚡ Platform Health Snapshot</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px' }}>
                {[
                  { label: 'Pending Visits',     value: platformHealth?.pending_visits    ?? '—', icon: '⏳', good: false },
                  { label: 'Agreements Made',    value: platformHealth?.total_agreements  ?? '—', icon: '📝', good: true  },
                  { label: 'Contact Requests',   value: platformHealth?.total_contacts    ?? '—', icon: '📞', good: true  },
                  { label: 'Visits This Week',   value: platformHealth?.visits_this_week  ?? '—', icon: '📅', good: true  },
                  { label: 'Reviews on Platform',value: platformHealth?.total_reviews     ?? '—', icon: '⭐', good: true  },
                ].map((h, i) => (
                  <div key={i} style={{ textAlign: 'center', background: 'rgba(255,255,255,0.07)', borderRadius: '12px', padding: '14px 10px' }}>
                    <div style={{ fontSize: '20px', marginBottom: '6px' }}>{h.icon}</div>
                    <div style={{ fontSize: '22px', fontWeight: '800', color: h.good ? '#10b981' : '#f59e0b' }}>{analyticsLoading ? '—' : h.value}</div>
                    <div style={{ fontSize: '10px', opacity: 0.6, marginTop: '3px' }}>{h.label}</div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* ── LISTINGS TAB ── */}
        {activeTab === 'listings' && (
          <div style={s.tableCard}>
            <div style={s.tableHeader}>
              <h3 style={s.tableTitle}>
                All Listings
                {!listingsLoading && listings.length > 0 && (
                  <span style={s.listingCount}>{displayedListings.length} of {listings.length}</span>
                )}
              </h3>
              <button style={s.refreshBtn} onClick={fetchListings}>↻ Refresh</button>
            </div>

            {/* ── Filter/Sort Bar ── */}
            <div style={s.filterBar}>
              <input
                style={s.filterSearch}
                placeholder="Search title, owner, location…"
                value={listingSearch}
                onChange={e => setListingSearch(e.target.value)}
              />
              <select style={s.filterSelect} value={listingTypeFilter} onChange={e => setListingTypeFilter(e.target.value)}>
                <option value="all">All Types</option>
                {uniqueTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select style={s.filterSelect} value={listingStatusFilter} onChange={e => setListingStatusFilter(e.target.value)}>
                <option value="all">All Status</option>
                <option value="pending">🟡 Pending</option>
                <option value="verified">🟢 Verified</option>
                <option value="flagged">🔴 Flagged</option>
                <option value="removed">⛔ Removed</option>
              </select>
              <select style={s.filterSelect} value={listingSort} onChange={e => setListingSort(e.target.value)}>
                <option value="date_desc">Newest First</option>
                <option value="date_asc">Oldest First</option>
                <option value="price_asc">Price: Low → High</option>
                <option value="price_desc">Price: High → Low</option>
                <option value="type">Sort by Type</option>
              </select>
              {(listingSearch || listingTypeFilter !== 'all' || listingStatusFilter !== 'all') && (
                <button style={s.clearBtn} onClick={() => { setListingSearch(''); setListingTypeFilter('all'); setListingStatusFilter('all') }}>
                  ✕ Clear
                </button>
              )}
            </div>

            {/* Loading */}
            {listingsLoading && (
              <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>Loading listings…</div>
            )}

            {/* Error */}
            {!listingsLoading && listingsError && (
              <div style={{ padding: '48px', textAlign: 'center' }}>
                <span style={{ color: '#e67e22', fontSize: '14px' }}>⚠ {listingsError}</span>
                <button style={{ ...s.resolveBtn, marginLeft: '12px' }} onClick={fetchListings}>Retry</button>
              </div>
            )}

            {/* Empty */}
            {!listingsLoading && !listingsError && listings.length === 0 && (
              <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>No listings found.</div>
            )}

            {/* No results after filter */}
            {!listingsLoading && !listingsError && listings.length > 0 && displayedListings.length === 0 && (
              <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>
                No listings match your filters.
                <button style={{ ...s.clearBtn, marginLeft: '10px' }} onClick={() => { setListingSearch(''); setListingTypeFilter('all'); setListingStatusFilter('all') }}>Clear filters</button>
              </div>
            )}

            {/* Table */}
            {!listingsLoading && !listingsError && displayedListings.length > 0 && (
              <table style={s.table}>
                <thead>
                  <tr style={s.thead}>
                    {['Title', 'Owner', 'Location', 'Price', 'Type', 'Status', 'Actions'].map(h => <th key={h} style={s.th}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {displayedListings.map(l => {
                    const status = l.status || 'pending'
                    return (
                      <tr key={l.id} style={s.tr}>
                        <td style={s.td}><span style={s.listingTitle2}>{l.title}</span></td>
                        <td style={{ ...s.td, fontSize: '12px', color: 'var(--text-secondary)' }}>{l.owner}</td>
                        <td style={{ ...s.td, color: 'var(--text-muted)', fontSize: '12px' }}>📍 {l.location}</td>
                        <td style={s.td}><strong>₹{Number(l.price).toLocaleString()}/mo</strong></td>
                        <td style={s.td}><span style={s.typeTag}>{l.type}</span></td>
                        <td style={s.td}>
                          <span style={{ ...s.statusBadge, ...(status === 'verified' ? s.activeBadge : status === 'flagged' ? s.flaggedBadge : s.pendingBadge2) }}>
                            {status === 'verified' ? '🟢 Verified' : status === 'flagged' ? '🔴 Flagged' : status === 'removed' ? '⛔ Removed' : '🟡 Pending'}
                          </span>
                        </td>
                        <td style={s.td}>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button style={s.viewBtn} onClick={() => setSelectedListing(l)}>View</button>
                            <button style={s.resolveBtn} onClick={() => updateListingStatus(l.id, 'verified')}>✓ Verify</button>
                            <button style={s.flagBtn} onClick={() => updateListingStatus(l.id, 'flagged')}>⚠ Flag</button>
                            <button style={s.dismissBtn} onClick={() => updateListingStatus(l.id, 'inactive')}>✕ Remove</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}

            {!listingsLoading && displayedListings.length > 0 && (
              <div style={s.tableFooter}>
                Showing {displayedListings.length} of {listings.length} listing{listings.length !== 1 ? 's' : ''}
                {(listingTypeFilter !== 'all' || listingStatusFilter !== 'all' || listingSearch) && ' (filtered)'}
              </div>
            )}
          </div>
        )}

        {/* ── PAYMENTS TAB ── */}
        {activeTab === 'payments' && <PaymentsTab payments={paymentsData} summary={paymentsSummary} loading={paymentsLoading} />}

        {/* ── SUPPORT QUERIES TAB ── */}
        {activeTab === 'support' && (
          <div>
            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Support Queries</h2>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '3px 0 0' }}>Contact messages from seekers &amp; owners</p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <select value={supportStatusFilter}
                  onChange={e => { setSupportStatusFilter(e.target.value); fetchSupportQueries({ status: e.target.value }) }}
                  style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer', outline: 'none' }}>
                  <option value="all">All Statuses</option>
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
                <select value={supportRoleFilter}
                  onChange={e => { setSupportRoleFilter(e.target.value); fetchSupportQueries({ role: e.target.value }) }}
                  style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer', outline: 'none' }}>
                  <option value="all">All Roles</option>
                  <option value="seeker">Seekers</option>
                  <option value="owner">Owners</option>
                </select>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input type="text" placeholder="Search…" value={supportSearch}
                    onChange={e => setSupportSearch(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && fetchSupportQueries()}
                    style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13, outline: 'none', width: 180 }} />
                  <button onClick={() => fetchSupportQueries()}
                    style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: 'var(--text-primary)', color: 'var(--bg-page)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    Search
                  </button>
                </div>
                <button onClick={() => fetchSupportQueries()}
                  style={{ padding: '7px 13px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                  ↺ Refresh
                </button>
              </div>
            </div>

            {/* Table card — matches Reports/Users style */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14, overflow: 'hidden' }}>
              {/* Table header */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 0.7fr 0.7fr 1.2fr', gap: 0, padding: '10px 20px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-muted)' }}>
                {['Subject / User', 'Category', 'Role', 'Status', 'Actions'].map(h => (
                  <div key={h} style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</div>
                ))}
              </div>

              {supportLoading ? (
                <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>Loading queries…</div>
              ) : supportError ? (
                <div style={{ padding: '48px 20px', textAlign: 'center' }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>⚠️</div>
                  <div style={{ fontWeight: 600, marginBottom: 4, color: '#dc2626' }}>Failed to load queries</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 16 }}>{supportError}</div>
                  <button onClick={() => fetchSupportQueries()} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'var(--text-primary)', color: 'var(--bg-page)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    Try Again
                  </button>
                </div>
              ) : supportQueries.length === 0 ? (
                <div style={{ padding: '56px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>📭</div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>No support queries yet</div>
                  <div style={{ fontSize: 12 }}>Queries submitted via Contact Support will appear here</div>
                </div>
              ) : (
                supportQueries.map((q, idx) => {
                  const isExpanded = expandedQuery === q.id
                  const SC = { open: { bg: '#dbeafe', color: '#1d4ed8' }, in_progress: { bg: '#fef3c7', color: '#b45309' }, resolved: { bg: '#dcfce7', color: '#15803d' }, closed: { bg: '#f3f4f6', color: '#6b7280' } }
                  const sc = SC[q.status] || SC.open
                  const RC = { seeker: { bg: '#eff6ff', color: '#2563eb' }, owner: { bg: '#fef9c3', color: '#a16207' } }
                  const rc2 = RC[q.user_role] || RC.seeker
                  const CATS = { account: 'Account', listing: 'Listing', payment: 'Payment', technical: 'Technical', other: 'General' }
                  return (
                    <div key={q.id}>
                      {/* Row */}
                      <div
                        onClick={() => setExpandedQuery(isExpanded ? null : q.id)}
                        style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 0.7fr 0.7fr 1.2fr', gap: 0, padding: '13px 20px', borderBottom: idx < supportQueries.length - 1 || isExpanded ? '1px solid var(--border-color)' : 'none', cursor: 'pointer', background: isExpanded ? 'var(--bg-muted)' : (q.is_flagged ? 'rgba(245,158,11,0.07)' : q.status === 'open' ? 'rgba(59,130,246,0.04)' : 'transparent'), transition: 'background 0.12s', alignItems: 'center' }}
                      >
                        {/* Subject/User */}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.is_flagged && <span style={{ fontSize: 11, fontWeight: 700, background: '#fef3c7', color: '#b45309', border: '1px solid #f59e0b', borderRadius: 4, padding: '1px 5px', marginRight: 6 }}>URGENT</span>}{q.subject}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{q.user_name} · {q.user_email}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 1 }}>{new Date(q.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                        </div>
                        {/* Category */}
                        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{CATS[q.category] || q.category}</div>
                        {/* Role */}
                        <div><span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: rc2.bg, color: rc2.color, textTransform: 'capitalize' }}>{q.user_role}</span></div>
                        {/* Status */}
                        <div><span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: sc.bg, color: sc.color }}>{q.status.replace('_',' ').replace(/\b\w/g, c => c.toUpperCase())}</span></div>
                        {/* Actions */}
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                          <button onClick={() => { setReplyModal(q); setReplyText(q.admin_reply || '') }}
                            style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            {q.admin_reply ? '✏️ Edit' : '💬 Reply'}
                          </button>
                          {q.status === 'open' && (
                            <button onClick={() => handleSupportStatus(q.id, 'in_progress')}
                              style={{ padding: '4px 9px', borderRadius: 6, border: '1px solid #fbbf24', background: '#fffbeb', color: '#d97706', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                              ▶
                            </button>
                          )}
                          {q.status !== 'resolved' && q.status !== 'closed' && (
                            <button onClick={() => handleSupportStatus(q.id, 'resolved')}
                              style={{ padding: '4px 9px', borderRadius: 6, border: '1px solid #86efac', background: '#f0fdf4', color: '#16a34a', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                              ✓
                            </button>
                          )}
                          <button onClick={() => handleSupportFlag(q.id, q.is_flagged)}
                            style={{ padding: '4px 8px', borderRadius: 6, border: q.is_flagged ? '1px solid #f59e0b' : '1px solid #d1d5db', background: q.is_flagged ? '#fef3c7' : '#f9fafb', color: q.is_flagged ? '#b45309' : '#9ca3af', fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s' }}
                            title={q.is_flagged ? 'Unpin (remove urgent flag)' : 'Pin as urgent — moves to top'}>
                            📌
                          </button>
                        </div>
                      </div>

                      {/* Expanded detail panel */}
                      {isExpanded && (
                        <div style={{ padding: '16px 20px 18px', borderBottom: idx < supportQueries.length - 1 ? '1px solid var(--border-color)' : 'none', background: 'var(--bg-card)' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                            <div>
                              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>User Message</div>
                              <div style={{ fontSize: 13.5, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: 1.6, background: 'var(--bg-muted)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)' }}>{q.message}</div>
                            </div>
                            <div>
                              {q.admin_reply ? (
                                <>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Admin Reply</div>
                                  <div style={{ fontSize: 13.5, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: 1.6, background: '#f0fdf4', padding: '10px 14px', borderRadius: 8, border: '1px solid #86efac' }}>{q.admin_reply}</div>
                                  {q.replied_at && <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 5 }}>Replied {new Date(q.replied_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>}
                                </>
                              ) : (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 80 }}>
                                  <button onClick={() => { setReplyModal(q); setReplyText('') }}
                                    style={{ padding: '10px 20px', borderRadius: 9, border: 'none', background: 'var(--text-primary)', color: 'var(--bg-page)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
                                    💬 Write a Reply
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                            {q.status !== 'resolved' && <button onClick={() => handleSupportStatus(q.id, 'resolved')} style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid #86efac', background: '#f0fdf4', color: '#15803d', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>✅ Mark Resolved</button>}
                            {q.status !== 'closed'   && <button onClick={() => handleSupportStatus(q.id, 'closed')}   style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid var(--border-color)', background: 'var(--bg-muted)', color: 'var(--text-muted)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>🔒 Close</button>}
                            {q.status === 'closed'   && <button onClick={() => handleSupportStatus(q.id, 'open')}     style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid #93c5fd', background: '#eff6ff', color: '#1d4ed8', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>🔓 Reopen</button>}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })
              )}

              {/* Table footer */}
              {supportQueries.length > 0 && (
                <div style={{ padding: '10px 20px', fontSize: 12, color: 'var(--text-muted)', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{supportQueries.length} quer{supportQueries.length === 1 ? 'y' : 'ies'} shown</span>
                  <span>{supportQueries.filter(q => q.status === 'open').length} open · {supportQueries.filter(q => q.status === 'resolved').length} resolved</span>
                </div>
              )}
            </div>

            {/* Reply Modal */}
            {replyModal && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                <div style={{ background: 'var(--bg-card)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 520, boxShadow: '0 24px 64px rgba(0,0,0,0.3)', border: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Reply to Query</div>
                    <button onClick={() => setReplyModal(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)', lineHeight: 1 }}>✕</button>
                  </div>
                  <div style={{ background: 'var(--bg-muted)', borderRadius: 9, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, border: '1px solid var(--border-color)' }}>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>{replyModal.user_name} <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>({replyModal.user_role})</span></div>
                    <div style={{ fontStyle: 'italic' }}>"{replyModal.subject}"</div>
                    <div style={{ marginTop: 8, color: 'var(--text-primary)', fontStyle: 'normal', whiteSpace: 'pre-wrap' }}>{replyModal.message}</div>
                  </div>
                  <textarea
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    placeholder="Write your reply here…"
                    style={{ width: '100%', boxSizing: 'border-box', minHeight: 110, padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border-color)', background: 'var(--bg-muted)', color: 'var(--text-primary)', fontSize: 13.5, fontFamily: 'inherit', resize: 'vertical', outline: 'none', lineHeight: 1.5 }}
                  />
                  <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                    <button onClick={() => setReplyModal(null)} style={{ flex: 1, padding: '10px', borderRadius: 9, border: '1px solid var(--border-color)', background: 'var(--bg-muted)', color: 'var(--text-secondary)', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={() => handleSupportReply(replyModal.id)} disabled={replying || !replyText.trim()}
                      style={{ flex: 2, padding: '10px', borderRadius: 9, border: 'none', background: 'var(--text-primary)', color: 'var(--bg-page)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', opacity: (replying || !replyText.trim()) ? 0.5 : 1 }}>
                      {replying ? 'Sending…' : '📨 Send Reply & Mark Resolved'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── CONFIRM DIALOG (replaces window.confirm) ── */}
      {confirmDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 420, boxShadow: '0 24px 64px rgba(0,0,0,0.3)', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: 36, textAlign: 'center', marginBottom: 12 }}>{confirmDialog.icon || '❓'}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center', marginBottom: 10 }}>{confirmDialog.title}</div>
            <div style={{ fontSize: 13.5, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.6, marginBottom: 22 }}>{confirmDialog.message}</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmDialog(null)}
                style={{ flex: 1, padding: '10px', borderRadius: 9, border: '1px solid var(--border-color)', background: 'var(--bg-muted)', color: 'var(--text-secondary)', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={confirmDialog.onConfirm}
                style={{ flex: 1, padding: '10px', borderRadius: 9, border: 'none', background: confirmDialog.btnColor || '#374151', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
                {confirmDialog.btnLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── LISTING DETAIL MODAL ── */}
      {selectedListing && (
        <div style={m.overlay}>
          <div style={m.modal}>
            <div style={m.modalHeader}>
              <h3 style={m.modalTitle}>Listing Details</h3>
              <button style={m.closeBtn} onClick={() => setSelectedListing(null)}>✕</button>
            </div>
            {/* FIX: Show real listing photo if available */}
            <div style={{ ...m.imgPlaceholder, padding: 0, overflow: 'hidden' }}>
              {selectedListing.photos && selectedListing.photos.length > 0
                ? <img src={selectedListing.photos[0].url} alt={selectedListing.title}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontSize: '48px', opacity: 0.1 }}>🏠</span>
              }
            </div>

            <div style={m.modalBody}>
              {/* Price + status row */}
              <div style={m.modalTop}>
                <div>
                  <div style={m.modalPrice}>
                    ₹{Number(selectedListing.price).toLocaleString()}
                    <span style={m.perMonth}>/month</span>
                  </div>
                  {selectedListing.deposit > 0 && (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      + ₹{Number(selectedListing.deposit).toLocaleString()} deposit
                    </div>
                  )}
                </div>
                <span style={{ ...s.statusBadge, ...(selectedListing.status === 'verified' ? s.activeBadge : selectedListing.status === 'flagged' ? s.flaggedBadge : s.pendingBadge2) }}>
                  {selectedListing.status === 'verified' ? '🟢 Verified' : selectedListing.status === 'flagged' ? '🔴 Flagged' : selectedListing.status === 'inactive' ? '⛔ Removed' : '🟡 Pending'}
                </span>
              </div>

              <div style={m.modalTitleText}>{selectedListing.title}</div>
              <div style={m.modalLoc}>📍 {selectedListing.location}</div>
              <p style={m.modalDesc}>{selectedListing.description || 'No description provided.'}</p>

              {/* Detail grid — FIX: format date, show deposit & maintenance */}
              <div style={m.detailGrid}>
                {[
                  ['Type',        selectedListing.type       || '—'],
                  ['Furnished',   selectedListing.furnished  || '—'],
                  ['Available',   formatDate(selectedListing.availableFrom)],
                  ['Deposit',     selectedListing.deposit > 0 ? `₹${Number(selectedListing.deposit).toLocaleString()}` : '—'],
                  ['Maintenance', selectedListing.maintenance > 0 ? `₹${Number(selectedListing.maintenance).toLocaleString()}/mo` : '—'],
                  ['Amenities',   selectedListing.amenities  || '—'],
                ].map(([k, v]) => (
                  <div key={k} style={m.detailItem}>
                    <div style={m.detailKey}>{k}</div>
                    <div style={m.detailVal}>{v}</div>
                  </div>
                ))}
              </div>

              {/* AI Trust Score — shown if backend provides trustScore */}
              {selectedListing.trustLabel && (
                <div style={{
                  borderRadius: '10px', padding: '12px 14px', marginBottom: '14px',
                  background: selectedListing.trustLevel === 'low' ? '#f0fdf4'
                    : selectedListing.trustLevel === 'medium' ? '#fffbeb' : '#fff0f0',
                  border: `1px solid ${selectedListing.trustLevel === 'low' ? '#bbf7d0'
                    : selectedListing.trustLevel === 'medium' ? '#fde68a' : '#ffd0d0'}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: selectedListing.trustColor }}>
                      🤖 AI Trust Analysis: {selectedListing.trustLabel}
                    </span>
                    <span style={{
                      fontSize: '11px', fontWeight: '800', padding: '2px 8px', borderRadius: '20px',
                      background: selectedListing.trustColor, color: 'white'
                    }}>
                      Risk {selectedListing.trustScore}%
                    </span>
                  </div>
                  {/* Trust bar */}
                  <div style={{ height: '4px', background: 'rgba(0,0,0,0.08)', borderRadius: '2px', marginBottom: '8px' }}>
                    <div style={{ height: '4px', borderRadius: '2px', width: `${selectedListing.trustScore}%`, background: selectedListing.trustColor, transition: 'width 0.4s' }} />
                  </div>
                  {selectedListing.trustFlags && selectedListing.trustFlags.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      {selectedListing.trustFlags.map((f, i) => (
                        <div key={i} style={{ fontSize: '12px', color: '#cc0000' }}>{f}</div>
                      ))}
                    </div>
                  )}
                  {selectedListing.trustWarnings && selectedListing.trustWarnings.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '4px' }}>
                      {selectedListing.trustWarnings.map((w, i) => (
                        <div key={i} style={{ fontSize: '12px', color: '#92400e' }}>{w}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Owner details — FIX: show phone number */}
              <div style={m.ownerSection}>
                <div style={m.ownerLabel}>Owner Details</div>
                <div style={m.ownerRow}>
                  <div style={m.ownerAvatar}>{(selectedListing.owner || '?').charAt(0).toUpperCase()}</div>
                  <div>
                    <div style={m.ownerName}>{selectedListing.owner || '—'}</div>
                    <div style={m.ownerPhone}>
                      📞 {selectedListing.ownerPhone || 'Phone not provided'}
                    </div>
                  </div>
                </div>
              </div>

              <div style={m.modalActions}>
                <button style={m.verifyBtn}
                  onClick={() => { updateListingStatus(selectedListing.id, 'verified'); setSelectedListing({ ...selectedListing, status: 'verified' }) }}>
                  ✓ Verify Listing
                </button>
                <button style={m.flagBtn2}
                  onClick={() => { updateListingStatus(selectedListing.id, 'flagged'); setSelectedListing({ ...selectedListing, status: 'flagged' }) }}>
                  ⚠ Flag
                </button>
                <button style={m.removeBtn}
                  onClick={() => { updateListingStatus(selectedListing.id, 'inactive'); setSelectedListing(null) }}>
                  ✕ Remove
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Admin Toast ── */}
      {adminToast && (
        <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: adminToast.color, color: 'var(--btn-primary-text)', padding: '12px 28px', borderRadius: 30, fontSize: 13, fontWeight: 600, zIndex: 9999, boxShadow: '0 4px 20px rgba(0,0,0,0.18)', whiteSpace: 'nowrap' }}>
          {adminToast.msg}
        </div>
      )}

      {/* ── Resolve / Dismiss Modal ── */}
      {resolveModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => e.target === e.currentTarget && setResolveModal(null)}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 20, padding: 32, width: '100%', maxWidth: 480, boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>
                  {resolveModal.mode === 'resolve' ? '✓ Resolve Report' : 'Dismiss Report'}
                </h3>
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {resolveModal.mode === 'resolve'
                    ? 'Mark this report as resolved after taking action'
                    : 'Dismiss this report — no action will be taken'}
                </p>
              </div>
              <button onClick={() => setResolveModal(null)} style={{ background: 'none', border: '1px solid var(--input-border)', borderRadius: 8, padding: '5px 11px', fontSize: 13, cursor: 'pointer', color: 'var(--text-secondary)' }}>✕</button>
            </div>

            {/* Report summary */}
            <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: '14px 16px', marginBottom: 20, fontSize: 13, color: 'var(--text-secondary)' }}>
              <div><strong style={{ color: 'var(--text-primary)' }}>Reported:</strong> {resolveModal.report.target}</div>
              <div style={{ marginTop: 4 }}><strong style={{ color: 'var(--text-primary)' }}>Reason:</strong> {resolveModal.report.reason}</div>
              <div style={{ marginTop: 4 }}><strong style={{ color: 'var(--text-primary)' }}>By:</strong> {resolveModal.report.reporter}</div>
              {resolveModal.report.details && <div style={{ marginTop: 6, fontStyle: 'italic', color: 'var(--text-muted)' }}>"{resolveModal.report.details}"</div>}
            </div>

            {/* Action choice (resolve mode only, for user reports) */}
            {resolveModal.mode === 'resolve' && resolveModal.report.type === 'user' && (
              <div style={{ marginBottom: 18 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: 10 }}>Action taken</label>
                {[
                  { value: 'note_only',    label: '📝 Note only',       sub: 'Record the resolution with a note, no user action' },
                  { value: 'warn_user',    label: '⚠️ Warn user',        sub: 'Logged internally — contact reported user separately' },
                  { value: 'suspend_user', label: '🚫 Suspend user',     sub: 'Immediately suspends the reported user\'s account' },
                ].map(opt => (
                  <div key={opt.value}
                    onClick={() => setResolveAction(opt.value)}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', borderRadius: 10, border: `1.5px solid ${resolveAction === opt.value ? '#111' : '#e5e7eb'}`, background: resolveAction === opt.value ? '#f5f5f5' : '#fff', cursor: 'pointer', marginBottom: 8 }}>
                    <div style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${resolveAction === opt.value ? '#111' : '#ccc'}`, background: resolveAction === opt.value ? '#111' : 'transparent', marginTop: 2, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{opt.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{opt.sub}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Admin note */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: 8 }}>
                Admin note <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span>
              </label>
              <textarea
                value={resolveNote}
                onChange={e => setResolveNote(e.target.value)}
                placeholder={resolveModal.mode === 'resolve' ? 'e.g. User warned via email, behaviour confirmed...' : 'e.g. Report found to be inaccurate...'}
                rows={3}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid var(--input-border)', fontSize: 13, outline: 'none', boxSizing: 'border-box', resize: 'vertical', color: 'var(--text-primary)' }}
              />
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setResolveModal(null)} disabled={resolving}
                style={{ flex: 1, padding: 12, background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1.5px solid var(--input-border)', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={confirmResolve} disabled={resolving}
                style={{ flex: 1, padding: 12, background: resolveModal.mode === 'resolve' ? '#111' : '#fff', color: resolveModal.mode === 'resolve' ? '#fff' : '#cc0000', border: resolveModal.mode === 'resolve' ? 'none' : '1.5px solid #ffd0d0', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: resolving ? 0.6 : 1 }}>
                {resolving ? 'Processing…' : resolveModal.mode === 'resolve' ? '✓ Confirm Resolve' : 'Confirm Dismiss'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const s = {
  page: { minHeight: '100vh', background: 'var(--bg-primary)', fontFamily: "'Segoe UI', sans-serif" },
  topbar: { background: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)', padding: '14px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  topbarLeft: { display: 'flex', alignItems: 'center', gap: '16px' },
  logo: { display: 'flex', alignItems: 'center', gap: '8px' },
  logoBox: { width: '28px', height: '28px', background: 'var(--btn-primary-bg)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '13px', fontWeight: '800' },
  logoName: { fontSize: '15px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.5px' },
  logoAI: { fontSize: '15px', fontWeight: '300', color: 'var(--text-muted)' },
  adminBadge: { background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)', fontSize: '11px', fontWeight: '700', padding: '3px 10px', borderRadius: '4px' },
  topbarRight: { display: 'flex', alignItems: 'center', gap: '16px' },
  adminInfo: { display: 'flex', alignItems: 'center', gap: '10px' },
  adminAvatar: { width: '32px', height: '32px', borderRadius: '50%', background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '700' },
  adminName: { fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' },
  adminRole: { fontSize: '11px', color: 'var(--text-muted)' },
  logoutBtn: { background: 'none', border: '1.5px solid var(--input-border)', borderRadius: '8px', padding: '7px 14px', fontSize: '13px', cursor: 'pointer', color: 'var(--text-secondary)', fontWeight: '500' },
  tabBar: { background: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)', padding: '0 32px', display: 'flex', gap: '4px' },
  tab: { padding: '12px 18px', background: 'none', border: 'none', fontSize: '13px', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: '500', borderBottom: '2px solid transparent', transition: 'all 0.15s' },
  tabActive: { color: 'var(--text-primary)', fontWeight: '700', borderBottom: '2px solid var(--text-primary)' },
  content: { padding: '24px 32px' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '12px', marginBottom: '24px' },
  statCard: { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px' },
  statLabel: { fontSize: '11px', color: 'var(--text-muted)', fontWeight: '500', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' },
  statValue: { fontSize: '22px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.5px', marginBottom: '4px' },
  statChange: { fontSize: '11px', color: '#10b981', fontWeight: '500' },
  chartsRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' },
  chartCard: { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '20px' },
  chartTitle: { fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' },
  chartSub: { fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' },
  matchCard: { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '20px', marginTop: '16px' },
  matchStats: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '16px' },
  matchItem: { display: 'flex', flexDirection: 'column', gap: '6px' },
  matchTop: { display: 'flex', justifyContent: 'space-between' },
  matchLabel: { fontSize: '13px', color: 'var(--text-secondary)' },
  matchPct: { fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' },
  matchBar: { height: '6px', background: 'var(--bg-secondary)', borderRadius: '3px' },
  matchFill: { height: '6px', background: 'var(--btn-primary-bg)', borderRadius: '3px', transition: 'width 0.5s' },
  tableCard: { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px', overflow: 'hidden' },
  tableHeader: { padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  tableTitle: { fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px' },
  listingCount: { fontSize: '12px', fontWeight: '500', color: 'var(--text-muted)', background: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: '10px' },
  refreshBtn: { background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)', border: 'none', borderRadius: '8px', padding: '7px 14px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' },

  // ── Filter bar (NEW) ──
  filterBar: { padding: '12px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', background: 'var(--bg-primary)' },
  filterSearch: { padding: '8px 14px', border: '1.5px solid var(--input-border)', borderRadius: '8px', fontSize: '13px', outline: 'none', width: '240px', background: 'var(--bg-card)', color: 'var(--text-primary)' },
  filterSelect: { padding: '8px 12px', border: '1.5px solid var(--input-border)', borderRadius: '8px', fontSize: '12px', outline: 'none', color: 'var(--text-secondary)', background: 'var(--bg-card)', cursor: 'pointer' },
  clearBtn: { padding: '7px 12px', background: 'var(--bg-card)', border: '1.5px solid var(--input-border)', borderRadius: '8px', fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: '500' },

  searchInput: { padding: '8px 14px', border: '1.5px solid var(--input-border)', borderRadius: '8px', fontSize: '13px', outline: 'none', width: '220px' },
  table: { width: '100%', borderCollapse: 'collapse' },
  thead: { background: 'var(--bg-primary)' },
  th: { padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border-color)' },
  tr: { borderBottom: '1px solid var(--border-color)' },
  td: { padding: '12px 16px', fontSize: '13px', color: 'var(--text-secondary)' },
  userCell: { display: 'flex', alignItems: 'center', gap: '10px' },
  userAvatar: { width: '30px', height: '30px', borderRadius: '50%', background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '700', flexShrink: 0 },
  userName: { fontWeight: '600', color: 'var(--text-primary)' },
  roleBadge: { fontSize: '11px', fontWeight: '600', padding: '3px 8px', borderRadius: '4px' },
  seekerBadge: { background: '#eff6ff', color: '#1e40af' },
  ownerBadge: { background: '#f0fdf4', color: '#166534' },
  statusBadge: { fontSize: '11px', fontWeight: '600', padding: '3px 8px', borderRadius: '4px' },
  activeBadge: { background: '#f0fdf4', color: '#166534' },
  suspendedBadge: { background: '#fff0f0', color: '#cc0000' },
  actionBtn: { background: 'none', border: '1px solid var(--input-border)', borderRadius: '6px', padding: '5px 12px', fontSize: '12px', cursor: 'pointer', color: 'var(--text-secondary)', fontWeight: '500' },
  reportsList: { padding: '8px 0' },
  reportCard: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid var(--border-color)' },
  reportLeft: { display: 'flex', alignItems: 'center', gap: '12px' },
  reportTypeBadge: { fontSize: '11px', fontWeight: '700', padding: '3px 8px', borderRadius: '4px', flexShrink: 0 },
  listingType: { background: '#eff6ff', color: '#1e40af' },
  userType: { background: '#fdf4ff', color: '#7e22ce' },
  reportInfo: {},
  reportTitle: { fontSize: '13px', color: 'var(--text-primary)', marginBottom: '3px' },
  reportSub: { fontSize: '12px', color: 'var(--text-muted)' },
  reportRight: { display: 'flex', alignItems: 'center', gap: '10px' },
  statusPill: { fontSize: '11px', fontWeight: '600', padding: '3px 10px', borderRadius: '20px' },
  pendingPill: { background: '#fffbeb', color: '#92400e' },
  resolvedPill: { background: '#f0fdf4', color: '#166534' },
  reviewingPill: { background: '#eff6ff', color: '#1e40af' },
  reportActions: { display: 'flex', gap: '6px' },
  resolveBtn: { background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)', border: 'none', borderRadius: '6px', padding: '5px 12px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' },
  dismissBtn: { background: 'var(--bg-card)', color: '#cc0000', border: '1px solid #ffd0d0', borderRadius: '6px', padding: '5px 12px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' },
  pendingCount: { background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', fontSize: '12px', fontWeight: '700', padding: '4px 12px', borderRadius: '20px' },
  analyticsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' },
  analyticCard: { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '20px' },
  analyticTitle: { fontSize: '12px', color: 'var(--text-muted)', fontWeight: '500', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' },
  analyticValue: { fontSize: '28px', fontWeight: '800', letterSpacing: '-1px', marginBottom: '4px' },
  analyticChange: { fontSize: '12px', color: '#10b981', fontWeight: '500' },
  typeTag: { fontSize: '11px', color: 'var(--text-muted)', background: 'var(--bg-secondary)', padding: '2px 7px', borderRadius: '4px', border: '1px solid var(--border-color)' },
  listingTitle2: { fontWeight: '600', color: 'var(--text-primary)' },
  tableControls: { display: 'flex', alignItems: 'center', gap: '10px' },
  filterTabs: { display: 'flex', border: '1px solid var(--input-border)', borderRadius: '8px', overflow: 'hidden' },
  filterTab: { padding: '7px 14px', background: 'var(--bg-card)', border: 'none', fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary)', cursor: 'pointer' },
  filterTabOn: { background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)' },
  sortSelect: { padding: '7px 12px', border: '1.5px solid var(--input-border)', borderRadius: '8px', fontSize: '12px', outline: 'none', color: 'var(--text-secondary)', background: 'var(--bg-card)' },
  tableFooter: { padding: '12px 20px', fontSize: '12px', color: 'var(--text-muted)', borderTop: '1px solid var(--border-color)' },
  flaggedBadge: { background: '#fff0f0', color: '#cc0000', border: '1px solid #ffd0d0' },
  pendingBadge2: { background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' },
  viewBtn: { background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '5px 10px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' },
  flagBtn: { background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', borderRadius: '6px', padding: '5px 10px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' },
}

const m = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: 'var(--bg-card)', borderRadius: '20px', width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid var(--border-color)' },
  modalTitle: { fontSize: '17px', fontWeight: '800', color: 'var(--text-primary)' },
  closeBtn: { background: 'none', border: '1.5px solid var(--input-border)', borderRadius: '8px', padding: '6px 12px', fontSize: '14px', cursor: 'pointer' },
  imgPlaceholder: { height: '180px', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modalBody: { padding: '20px 24px' },
  modalTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' },
  modalPrice: { fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.5px' },
  perMonth: { fontSize: '13px', fontWeight: '400', color: 'var(--text-muted)' },
  modalTitleText: { fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' },
  modalLoc: { fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px' },
  modalDesc: { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.7', marginBottom: '16px' },
  detailGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '16px' },
  detailItem: { background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 12px' },
  detailKey: { fontSize: '11px', color: 'var(--text-muted)', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.05em' },
  detailVal: { fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' },
  ownerSection: { background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px' },
  ownerLabel: { fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' },
  ownerRow: { display: 'flex', alignItems: 'center', gap: '12px' },
  ownerAvatar: { width: '36px', height: '36px', borderRadius: '50%', background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '700' },
  ownerName: { fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '2px' },
  ownerPhone: { fontSize: '12px', color: 'var(--text-muted)' },
  modalActions: { display: 'flex', gap: '10px' },
  verifyBtn: { flex: 1, padding: '11px', background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' },
  flagBtn2: { padding: '11px 16px', background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', borderRadius: '10px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' },
  removeBtn: { padding: '11px 16px', background: 'var(--bg-card)', color: '#cc0000', border: '1px solid #ffd0d0', borderRadius: '10px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' },
}