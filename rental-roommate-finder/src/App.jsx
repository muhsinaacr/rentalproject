import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useLocation } from 'react-router-dom'
import Navbar from './components/Navbar'
import Login from './pages/Login'
import Register from './pages/Register'
import ProfileSetup from './pages/ProfileSetup'
import SeekerDashboard from './pages/SeekerDashboard'
import OwnerDashboard from './pages/OwnerDashboard'
import ListingManager from './pages/ListingManager'
import BrowseListings from './pages/BrowseListings'
import ListingDetail from './pages/ListingDetail'
import AiMatcher from './pages/AiMatcher'
import SeekerChat from './pages/SeekerChat'
import OwnerChat from './pages/OwnerChat'
import Reviews from './pages/Reviews'
import Bookmarks from './pages/Bookmarks'
import SeekerNotifications from './pages/SeekerNotifications'
import OwnerNotifications from './pages/OwnerNotifications'
import SeekerExportReport from './pages/SeekerExportReport'
import AdminDashboard from './pages/AdminDashboard'
import AdminLogin from './pages/AdminLogin'
import AgreementGenerator from './pages/AgreementGenerator'
import NegotiationAdvisor from './pages/NegotiationAdvisor'
import RentAnalysis from './pages/RentAnalysis'
import SeekerVisits from './pages/SeekerVisits'
import OwnerVisits from './pages/OwnerVisits'
import ContactRequests from './pages/ContactRequests'
import DocAnalyzer from './pages/DocAnalyzer'
import AIChatbot from './components/AIChatbot'
import { getCurrentRole } from './utils/storage'
import { useState, useEffect } from 'react'
import { ThemeProvider } from './context/ThemeContext'
import './theme.css'

const authPages = ['/login', '/register', '/profile-setup', '/admin-login']

function ProtectedRoute({ children, allowedRoles }) {
  const role = getCurrentRole()
  if (!role) return <Navigate to="/login" />
  if (allowedRoles && !allowedRoles.includes(role)) return <Navigate to="/login" />
  return children
}

function Layout() {
  const location = useLocation()
  const isAuth = authPages.includes(location.pathname)
  const [role, setRole] = useState(() => getCurrentRole())

  useEffect(() => {
    setRole(getCurrentRole())
  }, [location.pathname])

  const showChatbot = !isAuth && !!role

  return (
    <div style={{ display: 'flex' }}>
      <Navbar />
      <div style={{ marginLeft: isAuth ? '0' : '248px', flex: 1, minHeight: '100vh', transition: 'margin-left 0.22s cubic-bezier(0.4,0,0.2,1)' }}>
        <Routes>
          <Route path="/" element={<Navigate to="/login" />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/admin-login" element={<AdminLogin />} />
          <Route path="/profile-setup" element={<ProfileSetup />} />

          {/* Seeker only */}
          <Route path="/seeker-dashboard" element={<ProtectedRoute allowedRoles={['seeker']}><SeekerDashboard /></ProtectedRoute>} />
          <Route path="/browse" element={<ProtectedRoute allowedRoles={['seeker']}><BrowseListings /></ProtectedRoute>} />
          <Route path="/listing/:id" element={<ProtectedRoute allowedRoles={['seeker']}><ListingDetail /></ProtectedRoute>} />
          <Route path="/ai-matcher" element={<ProtectedRoute allowedRoles={['seeker']}><AiMatcher /></ProtectedRoute>} />
          <Route path="/bookmarks" element={<ProtectedRoute allowedRoles={['seeker']}><Bookmarks /></ProtectedRoute>} />
          <Route path="/negotiation" element={<ProtectedRoute allowedRoles={['seeker']}><NegotiationAdvisor /></ProtectedRoute>} />
          <Route path="/my-visits" element={<ProtectedRoute allowedRoles={['seeker']}><SeekerVisits /></ProtectedRoute>} />
          <Route path="/export" element={<ProtectedRoute allowedRoles={['seeker']}><SeekerExportReport /></ProtectedRoute>} />
          <Route path="/seeker-notifications" element={<ProtectedRoute allowedRoles={['seeker']}><SeekerNotifications /></ProtectedRoute>} />
          <Route path="/seeker-chat" element={<ProtectedRoute allowedRoles={['seeker']}><SeekerChat /></ProtectedRoute>} />
          <Route path="/contact-requests" element={<ProtectedRoute allowedRoles={['seeker']}><ContactRequests /></ProtectedRoute>} />

          {/* Owner only */}
          <Route path="/owner-dashboard" element={<ProtectedRoute allowedRoles={['owner']}><OwnerDashboard /></ProtectedRoute>} />
          <Route path="/listing-manager" element={<ProtectedRoute allowedRoles={['owner']}><ListingManager /></ProtectedRoute>} />
          <Route path="/agreement" element={<ProtectedRoute allowedRoles={['owner']}><AgreementGenerator /></ProtectedRoute>} />
          <Route path="/reviews" element={<ProtectedRoute allowedRoles={['owner', 'seeker']}><Reviews /></ProtectedRoute>} />
          <Route path="/owner-visits" element={<ProtectedRoute allowedRoles={['owner']}><OwnerVisits /></ProtectedRoute>} />
          <Route path="/rent-analysis" element={<ProtectedRoute allowedRoles={['owner']}><RentAnalysis /></ProtectedRoute>} />
          <Route path="/owner-notifications" element={<ProtectedRoute allowedRoles={['owner']}><OwnerNotifications /></ProtectedRoute>} />
          <Route path="/owner-chat" element={<ProtectedRoute allowedRoles={['owner']}><OwnerChat /></ProtectedRoute>} />
          <Route path="/doc-analyzer" element={<ProtectedRoute allowedRoles={['seeker', 'owner']}><DocAnalyzer /></ProtectedRoute>} />

          {/* Admin only */}
          <Route path="/admin" element={<ProtectedRoute allowedRoles={['admin']}><AdminDashboard /></ProtectedRoute>} />
        </Routes>
      </div>
       {showChatbot && <AIChatbot />}
    </div>
  )
}

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Layout />
      </BrowserRouter>
    </ThemeProvider>
  )
}

export default App