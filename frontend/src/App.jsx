import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider } from './context/ThemeContext'
import { RefreshProvider } from './context/RefreshContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Metrics from './pages/Metrics'
import Operations from './pages/Operations'
import Blocklist from './pages/Blocklist'
import Whitelist from './pages/Whitelist'
import Audit from './pages/Audit'
import Users from './pages/Users'
import Tools from './pages/Tools'
import Backups from './pages/Backups'
import BindLog from './pages/BindLog'
import Profile from './pages/Profile'

function PrivateRoute({ children }) {
  const token = localStorage.getItem('dns_panel_token')
  return token ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <ThemeProvider>
      <RefreshProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard"  element={<Dashboard />} />
              <Route path="metrics"    element={<Metrics />} />
              <Route path="operations" element={<Operations />} />
              <Route path="blocklist"  element={<Blocklist />} />
              <Route path="whitelist"  element={<Whitelist />} />
              <Route path="audit"      element={<Audit />} />
              <Route path="users"      element={<Users />} />
              <Route path="tools"      element={<Tools />} />
              <Route path="backups"    element={<Backups />} />
              <Route path="bindlog"    element={<BindLog />} />
              <Route path="profile"    element={<Profile />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </RefreshProvider>
    </ThemeProvider>
  )
}
