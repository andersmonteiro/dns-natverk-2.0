import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
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
import BindConfig from './pages/BindConfig'
import RPKI from './pages/RPKI'

function PrivateRoute({ children }) {
  const token = localStorage.getItem('dns_panel_token')
  return token ? children : <Navigate to="/login" replace />
}

// Usa location.key pra forçar remount de qualquer página ao navegar
// (inclusive ao clicar no mesmo item do menu — limpa estado da página)
function AppRoutes() {
  const location = useLocation()
  const k = location.key

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard"  element={<Dashboard  key={k} />} />
        <Route path="metrics"    element={<Metrics    key={k} />} />
        <Route path="operations" element={<Operations key={k} />} />
        <Route path="blocklist"  element={<Blocklist  key={k} />} />
        <Route path="whitelist"  element={<Whitelist  key={k} />} />
        <Route path="audit"      element={<Audit      key={k} />} />
        <Route path="users"      element={<Users      key={k} />} />
        <Route path="tools"      element={<Tools      key={k} />} />
        <Route path="backups"    element={<Backups    key={k} />} />
        <Route path="bindlog"    element={<BindLog    key={k} />} />
        <Route path="profile"    element={<Profile    key={k} />} />
        <Route path="bindconfig" element={<BindConfig key={k} />} />
        <Route path="rpki"       element={<RPKI       key={k} />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <RefreshProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </RefreshProvider>
    </ThemeProvider>
  )
}
