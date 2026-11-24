import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { getCurrentUser, logout } from '../utils/storage'
import { getTheme, toggleTheme } from '../utils/theme'
import { getUnseenSeekerReplyCount } from '../pages/Reviews'
import ContactUsModal from './ContactUsModal'

const BASE_URL = 'http://localhost:5000/api'

async function fetchPendingCount() {
  const token = sessionStorage.getItem('token')
  if (!token) return 0
  try {
    const res = await fetch(`${BASE_URL}/whatsapp-requests/incoming`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) return 0
    const data = await res.json()
    return (data.requests || []).length
  } catch { return 0 }
}

async function fetchOwnerPendingVisits() {
  const token = sessionStorage.getItem('token')
  if (!token) return 0
  try {
    const res = await fetch(`${BASE_URL}/visits/owner`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) return 0
    const data = await res.json()
    const today = new Date(); today.setHours(0, 0, 0, 0)
    return (data || []).filter(v => {
      if (v.status !== 'pending') return false
      // Exclude visits whose date has already passed (they are effectively expired)
      if (v.visit_date && new Date(v.visit_date) < today) return false
      return true
    }).length
  } catch { return 0 }
}

async function fetchOwnerNotifUnreadCount() {
  const token = sessionStorage.getItem('token')
  if (!token) return 0
  try {
    const res = await fetch(`${BASE_URL}/owner/notifications`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) return 0
    const data = await res.json()
    return data?.unreadCount || 0
  } catch { return 0 }
}

async function fetchSeekerNotifUnreadCount() {
  const token = sessionStorage.getItem('token')
  if (!token) return 0
  try {
    const res = await fetch(`${BASE_URL}/notifications/unread-count`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) return 0
    const data = await res.json()
    return data?.count ?? data?.unreadCount ?? 0
  } catch { return 0 }
}

async function fetchOwnerReviewBadge() {
  const token = sessionStorage.getItem('token')
  if (!token) return 0
  try {
    const res = await fetch(`${BASE_URL}/reviews/owner/badge`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) return 0
    const data = await res.json()
    return data?.count ?? 0
  } catch { return 0 }
}

async function fetchChatUnreadCount() {
  const token = sessionStorage.getItem('token')
  if (!token) return 0
  try {
    const res = await fetch(`${BASE_URL}/messages/conversations`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) return 0
    const data = await res.json()
    const all = [...(data.owner || []), ...(data.roommate || [])]
    return all.reduce((sum, c) => sum + (c.unread_count || 0), 0)
  } catch { return 0 }
}

const Icons = {
  Dashboard: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  Browse: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>,
  AIMatcher: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 6v6l4 2"/><circle cx="19" cy="5" r="3"/></svg>,
  Bookmarks: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>,
  Visits: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  Chat: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  Contacts: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  Negotiation: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>,
  Notifications: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  Export: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 18 15 15"/></svg>,
  Listings: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  Agreement: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  RentAnalysis: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>,
  Reviews: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  Admin: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  ContactUs: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="9" y1="10" x2="15" y2="10"/><line x1="9" y1="14" x2="13" y2="14"/></svg>,
  // ✅ NEW — Doc Analyzer icon
  DocAnalyzer: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><circle cx="11" cy="14" r="2"/><path d="m13.5 16.5 1.5 1.5"/></svg>,
  Sun: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>,
  Moon: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>,
  ChevronLeft: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>,
  ChevronRight: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>,
  LogOut: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
}

export default function Navbar() {
  const navigate = useNavigate()
  const location = useLocation()
  const currentUser = getCurrentUser()
  const isAuth = ['/login', '/register', '/profile-setup', '/admin-login'].includes(location.pathname)
  const [theme, setTheme] = useState(getTheme())
  const [pendingCount, setPendingCount] = useState(0)
  const [ownerPendingVisits, setOwnerPendingVisits] = useState(0)
  const [chatUnread, setChatUnread] = useState(0)
  const [reviewBadge, setReviewBadge] = useState(0)
  const [ownerNotifUnread, setOwnerNotifUnread] = useState(0)
  const [seekerNotifUnread, setSeekerNotifUnread] = useState(0)
  const [collapsed, setCollapsed] = useState(false)
  const [tooltip, setTooltip] = useState(null)
  const [contactUsOpen, setContactUsOpen] = useState(false)

  useEffect(() => {
    if (!currentUser?.id || currentUser.role !== 'seeker') return
    fetchPendingCount().then(setPendingCount)
    const interval = setInterval(() => fetchPendingCount().then(setPendingCount), 30000)
    return () => clearInterval(interval)
  }, [currentUser?.id])

  useEffect(() => {
    if (!currentUser?.id || currentUser.role !== 'owner') return
    fetchOwnerPendingVisits().then(setOwnerPendingVisits)
    const interval = setInterval(() => fetchOwnerPendingVisits().then(setOwnerPendingVisits), 30000)
    return () => clearInterval(interval)
  }, [currentUser?.id])

  useEffect(() => {
    if (!currentUser?.id) return
    fetchChatUnreadCount().then(setChatUnread)
    const interval = setInterval(() => fetchChatUnreadCount().then(setChatUnread), 30000)
    return () => clearInterval(interval)
  }, [currentUser?.id])

  useEffect(() => {
    if (!currentUser?.id || currentUser.role !== 'owner') return
    fetchOwnerNotifUnreadCount().then(setOwnerNotifUnread)
    const interval = setInterval(() => fetchOwnerNotifUnreadCount().then(setOwnerNotifUnread), 30000)
    const handler = () => fetchOwnerNotifUnreadCount().then(setOwnerNotifUnread)
    window.addEventListener('ownerNotifsRead', handler)
    return () => { clearInterval(interval); window.removeEventListener('ownerNotifsRead', handler) }
  }, [currentUser?.id, currentUser?.role])

  useEffect(() => {
    if (!currentUser?.id || currentUser.role !== 'seeker') return
    fetchSeekerNotifUnreadCount().then(setSeekerNotifUnread)
    const interval = setInterval(() => fetchSeekerNotifUnreadCount().then(setSeekerNotifUnread), 30000)
    const handler = () => fetchSeekerNotifUnreadCount().then(setSeekerNotifUnread)
    window.addEventListener('seekerNotifsRead', handler)
    return () => { clearInterval(interval); window.removeEventListener('seekerNotifsRead', handler) }
  }, [currentUser?.id, currentUser?.role])

  useEffect(() => {
    if (!currentUser?.id) return
    if (currentUser.role === 'owner') {
      fetchOwnerReviewBadge().then(setReviewBadge)
      const interval = setInterval(() => fetchOwnerReviewBadge().then(setReviewBadge), 30000)
      const handler = () => fetchOwnerReviewBadge().then(setReviewBadge)
      window.addEventListener('reviewsSeen', handler)
      window.addEventListener('reviewNotifAdded', handler)
      return () => {
        clearInterval(interval)
        window.removeEventListener('reviewsSeen', handler)
        window.removeEventListener('reviewNotifAdded', handler)
      }
    } else if (currentUser.role === 'seeker') {
      function updateSeekerReplyBadge() {
        setReviewBadge(getUnseenSeekerReplyCount(currentUser.id))
      }
      updateSeekerReplyBadge()
      const interval = setInterval(updateSeekerReplyBadge, 15000)
      window.addEventListener('replyNotifAdded', updateSeekerReplyBadge)
      return () => {
        clearInterval(interval)
        window.removeEventListener('replyNotifAdded', updateSeekerReplyBadge)
      }
    }
  }, [currentUser?.id, currentUser?.role])

  if (isAuth || !currentUser.id) return null

  // ✅ Doc Analyzer added to seeker Activity group
  const seekerGroups = [
    { group: 'Main', items: [
      { label: 'Dashboard',          path: '/seeker-dashboard', Icon: Icons.Dashboard },
      { label: 'Browse Listings',    path: '/browse',           Icon: Icons.Browse    },
      { label: 'AI Matcher',         path: '/ai-matcher',       Icon: Icons.AIMatcher },
      { label: 'Bookmarks',          path: '/bookmarks',        Icon: Icons.Bookmarks },
    ]},
    { group: 'Activity', items: [
      { label: 'My Visits',          path: '/my-visits',        Icon: Icons.Visits      },
      { label: 'Chat',               path: '/seeker-chat',      Icon: Icons.Chat, badge: chatUnread },
      { label: 'Contact Requests',   path: '/contact-requests', Icon: Icons.Contacts, badge: pendingCount },
      { label: 'Negotiation Advisor',path: '/negotiation',      Icon: Icons.Negotiation },
      { label: 'Doc Analyzer',       path: '/doc-analyzer',     Icon: Icons.DocAnalyzer }, // ✅ NEW
    ]},
    { group: 'Settings', items: [
      { label: 'Notifications',      path: '/seeker-notifications', Icon: Icons.Notifications, badge: seekerNotifUnread },
      { label: 'Export Report',      path: '/export',               Icon: Icons.Export        },
      { label: 'Contact Support',    path: null,                    Icon: Icons.ContactUs, isContactUs: true },
    ]},
  ]

  // ✅ Doc Analyzer added to owner Activity group
  const ownerGroups = [
    { group: 'Main', items: [
      { label: 'Dashboard',      path: '/owner-dashboard',  Icon: Icons.Dashboard },
      { label: 'My Listings',    path: '/listing-manager',  Icon: Icons.Listings  },
      { label: 'Visit Requests', path: '/owner-visits',     Icon: Icons.Visits, badge: ownerPendingVisits },
    ]},
    { group: 'Activity', items: [
      { label: 'Chat',                 path: '/owner-chat',    Icon: Icons.Chat, badge: chatUnread },
      { label: 'Agreement Generator',  path: '/agreement',     Icon: Icons.Agreement    },
      { label: 'Rent Analysis',        path: '/rent-analysis', Icon: Icons.RentAnalysis },
      { label: 'Doc Analyzer',         path: '/doc-analyzer',  Icon: Icons.DocAnalyzer  }, // ✅ NEW
      { label: 'Reviews',              path: '/reviews',       Icon: Icons.Reviews, badge: reviewBadge },
    ]},
    { group: 'Settings', items: [
      { label: 'Notifications', path: '/owner-notifications', Icon: Icons.Notifications, badge: ownerNotifUnread },
      { label: 'Contact Support', path: null, Icon: Icons.ContactUs, isContactUs: true },
    ]},
  ]

  const adminGroups = [
    { group: 'Admin', items: [
      { label: 'Admin Dashboard', path: '/admin', Icon: Icons.Admin },
    ]},
  ]

  const groups = currentUser.role === 'owner' ? ownerGroups
    : currentUser.role === 'admin' ? adminGroups
    : seekerGroups

  const roleColors = {
    owner:  { bg: '#fef3c7', text: '#b45309', dot: '#f59e0b' },
    seeker: { bg: '#eff6ff', text: '#1d4ed8', dot: '#3b82f6' },
    admin:  { bg: '#f5f3ff', text: '#6d28d9', dot: '#8b5cf6' },
  }
  const rc = roleColors[currentUser.role] || roleColors.seeker

  function handleLogout() { logout(); navigate('/login') }
  function handleToggleTheme() { const next = toggleTheme(); setTheme(next) }

  const W = collapsed ? 68 : 248

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        .rms {
          width: ${W}px; min-height: 100vh;
          background: var(--bg-sidebar);
          border-right: 1px solid var(--border-default);
          display: flex; flex-direction: column;
          position: fixed; top: 0; left: 0; z-index: 100;
          transition: width 0.22s cubic-bezier(0.4,0,0.2,1);
          overflow: hidden;
          font-family: 'DM Sans', 'Segoe UI', system-ui, sans-serif;
          box-shadow: 2px 0 20px rgba(0,0,0,0.05);
        }
        .rms-logo {
          padding: ${collapsed ? '18px 0' : '18px 16px'};
          border-bottom: 1px solid var(--border-default);
          display: flex; align-items: center;
          justify-content: ${collapsed ? 'center' : 'space-between'};
          min-height: 62px; gap: 10px;
        }
        .rms-logo-inner { display: flex; align-items: center; gap: 10px; flex: 1; overflow: hidden; cursor: pointer; }
        .rms-mark {
          width: 34px; height: 34px; flex-shrink: 0;
          background: var(--text-primary);
          border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          color: var(--bg-page); font-size: 15px; font-weight: 800;
          letter-spacing: -0.5px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        }
        .rms-brand { opacity: ${collapsed ? 0 : 1}; transition: opacity 0.12s; white-space: nowrap; }
        .rms-brand-name { font-size: 15px; font-weight: 800; color: var(--text-primary); letter-spacing: -0.5px; line-height: 1.1; }
        .rms-brand-sub { font-size: 10.5px; color: var(--text-faint); font-weight: 400; }
        .rms-cbtn {
          width: 25px; height: 25px; border-radius: 7px;
          background: var(--bg-muted); border: 1px solid var(--border-strong);
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; flex-shrink: 0; color: var(--text-muted);
          transition: all 0.15s;
        }
        .rms-cbtn:hover { background: var(--bg-hover); color: var(--text-primary); }
        .rms-expand-wrap { display: flex; justify-content: center; padding: 10px 0 2px; }
        .rms-nav { flex: 1; padding: 10px 8px; overflow-y: auto; overflow-x: hidden; }
        .rms-nav::-webkit-scrollbar { width: 3px; }
        .rms-nav::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 2px; }
        .rms-glabel {
          font-size: 10px; font-weight: 700; color: var(--text-faint);
          letter-spacing: 0.09em; text-transform: uppercase;
          padding: ${collapsed ? '0' : '8px 8px 3px'};
          height: ${collapsed ? '6px' : 'auto'};
          opacity: ${collapsed ? 0 : 1};
          overflow: hidden; white-space: nowrap;
          transition: opacity 0.12s, height 0.12s;
        }
        .rms-item {
          display: flex; align-items: center;
          gap: 10px;
          padding: ${collapsed ? '10px 0' : '9px 10px'};
          justify-content: ${collapsed ? 'center' : 'flex-start'};
          border-radius: 9px;
          font-size: 13.5px; color: var(--text-muted);
          cursor: pointer; font-weight: 500;
          margin-bottom: 2px;
          transition: background 0.14s, color 0.14s, transform 0.14s;
          position: relative; white-space: nowrap; overflow: hidden;
        }
        .rms-item:hover { background: var(--bg-hover); color: var(--text-primary); transform: translateX(${collapsed ? 0 : 1}px); }
        .rms-item.act {
          background: var(--bg-hover); color: var(--text-primary); font-weight: 700;
        }
        .rms-item.act::before {
          content: ''; position: absolute;
          left: 0; top: 18%; bottom: 18%; width: 3px;
          border-radius: 0 3px 3px 0; background: var(--text-primary);
        }
        .rms-icon { flex-shrink: 0; display: flex; align-items: center; }
        .rms-lbl { opacity: ${collapsed ? 0 : 1}; transition: opacity 0.1s; flex: 1; overflow: hidden; text-overflow: ellipsis; }
        .rms-badge {
          background: #ef4444; color: #fff;
          font-size: 10px; font-weight: 800;
          padding: 1px 5px; border-radius: 20px;
          min-width: 17px; text-align: center; line-height: 16px;
          opacity: ${collapsed ? 0 : 1}; transition: opacity 0.1s;
        }
        .rms-item-contact { color: var(--text-secondary) !important; }
        .rms-item-contact:hover { background: #eff6ff !important; color: #1d4ed8 !important; }
        [data-theme="dark"] .rms-item-contact:hover { background: #1e3a5f !important; color: #93c5fd !important; }
        .rms-bdot {
          position: absolute; top: 7px; right: 10px;
          width: 7px; height: 7px;
          background: #ef4444; border-radius: 50%;
          border: 1.5px solid var(--bg-sidebar);
          display: ${collapsed ? 'block' : 'none'};
        }
        .rms-divider { height: 1px; background: var(--border-default); margin: 6px 8px; }
        .rms-theme {
          margin: 5px 8px;
          display: flex; align-items: center;
          justify-content: ${collapsed ? 'center' : 'flex-start'};
          gap: 8px;
          padding: ${collapsed ? '10px 0' : '9px 10px'};
          border-radius: 9px;
          background: var(--bg-muted); border: 1px solid var(--border-strong);
          cursor: pointer; transition: all 0.14s; overflow: hidden;
        }
        .rms-theme:hover { background: var(--bg-hover); border-color: var(--border-accent); }
        .rms-theme-lbl {
          font-size: 13px; color: var(--text-secondary); font-weight: 500;
          white-space: nowrap;
          opacity: ${collapsed ? 0 : 1}; transition: opacity 0.1s;
        }
        .rms-footer {
          padding: ${collapsed ? '13px 8px' : '13px 12px'};
          border-top: 1px solid var(--border-default);
          display: flex; align-items: center;
          justify-content: ${collapsed ? 'center' : 'flex-start'};
          gap: 10px; overflow: hidden;
        }
        .rms-av {
          width: 32px; height: 32px; border-radius: 9px;
          background: var(--text-primary);
          display: flex; align-items: center; justify-content: center;
          color: var(--bg-page); font-size: 13px; font-weight: 700; flex-shrink: 0;
        }
        .rms-uinfo {
          flex: 1; overflow: hidden;
          opacity: ${collapsed ? 0 : 1}; transition: opacity 0.1s;
        }
        .rms-uname { font-size: 13px; font-weight: 600; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .rms-rpill {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 10.5px; font-weight: 600;
          padding: 1px 7px; border-radius: 20px; margin-top: 2px;
          text-transform: capitalize;
        }
        .rms-out {
          background: none; border: 1px solid var(--border-strong);
          border-radius: 7px; padding: 5px 7px;
          cursor: pointer; color: var(--text-muted);
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; transition: all 0.15s;
          opacity: ${collapsed ? 0 : 1};
        }
        .rms-out:hover { background: #fee2e2; border-color: #fca5a5; color: #dc2626; }
        [data-theme="dark"] .rms-out:hover { background: #3f1111; border-color: #7f1d1d; color: #f87171; }
        .rms-contact {
          margin: 5px 8px;
          display: flex; align-items: center;
          justify-content: ${collapsed ? 'center' : 'flex-start'};
          gap: 8px;
          padding: ${collapsed ? '10px 0' : '9px 10px'};
          border-radius: 9px;
          background: transparent; border: 1px solid var(--border-strong);
          cursor: pointer; transition: all 0.14s; overflow: hidden;
          color: var(--text-muted);
        }
        .rms-contact:hover { background: #eff6ff; border-color: #93c5fd; color: #1d4ed8; }
        [data-theme="dark"] .rms-contact:hover { background: #1e3a5f; border-color: #3b82f6; color: #93c5fd; }
        .rms-contact-lbl {
          font-size: 13px; font-weight: 600;
          white-space: nowrap;
          opacity: ${collapsed ? 0 : 1}; transition: opacity 0.1s;
        }
        .rms-tip {
          position: fixed; left: 76px;
          background: var(--text-primary); color: var(--bg-page);
          font-size: 12px; font-weight: 600;
          padding: 5px 10px; border-radius: 7px;
          white-space: nowrap; pointer-events: none;
          z-index: 9999; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          font-family: 'DM Sans', system-ui, sans-serif;
        }
        .rms-tip::before {
          content: ''; position: absolute;
          left: -5px; top: 50%; transform: translateY(-50%);
          border-top: 5px solid transparent; border-bottom: 5px solid transparent;
          border-right: 5px solid var(--text-primary);
        }
      `}</style>

      <div className="rms">
        {/* Logo */}
        <div className="rms-logo">
          <div className="rms-logo-inner" onClick={() => !collapsed && navigate('/')}>
            <div className="rms-mark">R</div>
            <div className="rms-brand">
              <div className="rms-brand-name">RentMate</div>
              <div className="rms-brand-sub">AI-powered rentals</div>
            </div>
          </div>
          {!collapsed && (
            <div className="rms-cbtn" onClick={() => setCollapsed(true)}>
              <Icons.ChevronLeft />
            </div>
          )}
        </div>

        {collapsed && (
          <div className="rms-expand-wrap">
            <div className="rms-cbtn" onClick={() => setCollapsed(false)}>
              <Icons.ChevronRight />
            </div>
          </div>
        )}

        {/* Nav groups */}
        <div className="rms-nav">
          {groups.map((g, gi) => (
            <div key={gi}>
              {gi > 0 && <div className="rms-divider" />}
              <div className="rms-glabel">{g.group}</div>
              {g.items.map((item, ii) => {
                const isActive = location.pathname === item.path
                return (
                  <div
                    key={ii}
                    className={`rms-item${isActive ? ' act' : ''}${item.isContactUs ? ' rms-item-contact' : ''}`}
                    onClick={() => item.isContactUs ? setContactUsOpen(true) : navigate(item.path)}
                    onMouseEnter={(e) => {
                      if (collapsed) {
                        const rect = e.currentTarget.getBoundingClientRect()
                        setTooltip({ label: item.label, top: rect.top + rect.height / 2 - 13 })
                      }
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  >
                    <span className="rms-icon"><item.Icon /></span>
                    <span className="rms-lbl">{item.label}</span>
                    {item.badge > 0 && <span className="rms-badge">{item.badge}</span>}
                    {item.badge > 0 && <span className="rms-bdot" />}
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        {/* Theme toggle */}
        <div className="rms-theme" onClick={handleToggleTheme}>
          <span style={{ flexShrink: 0, display: 'flex', color: 'var(--text-secondary)' }}>
            {theme === 'dark' ? <Icons.Sun /> : <Icons.Moon />}
          </span>
          <span className="rms-theme-lbl">{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
        </div>

        {/* Footer */}
        <div className="rms-footer">
          <div className="rms-av">{currentUser.name?.charAt(0).toUpperCase()}</div>
          <div className="rms-uinfo">
            <div className="rms-uname">{currentUser.name}</div>
            <div className="rms-rpill" style={{ background: rc.bg, color: rc.text }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: rc.dot, display: 'inline-block' }} />
              {currentUser.role}
            </div>
          </div>
          <button className="rms-out" onClick={handleLogout} title="Logout">
            <Icons.LogOut />
          </button>
        </div>
      </div>

      {collapsed && tooltip && (
        <div className="rms-tip" style={{ top: tooltip.top }}>{tooltip.label}</div>
      )}

      <ContactUsModal isOpen={contactUsOpen} onClose={() => setContactUsOpen(false)} />
    </>
  )
}