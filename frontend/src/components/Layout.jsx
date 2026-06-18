import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Activity, Terminal, ShieldOff, ShieldCheck,
  ClipboardList, Users, Wrench, HardDrive, FileText, UserCircle,
  LogOut, Sun, Moon, Server,
} from 'lucide-react'
import { useState } from 'react'
import { clearToken } from '../api'
import { useTheme } from '../context/ThemeContext'
import Clock from './Clock'

const navItems = [
  { to: '/dashboard',  icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/metrics',    icon: Activity,         label: 'Métricas' },
  { to: '/operations', icon: Terminal,          label: 'Operações' },
  { to: '/blocklist',  icon: ShieldOff,         label: 'Bloqueios' },
  { to: '/whitelist',  icon: ShieldCheck,       label: 'Whitelist' },
  { to: '/tools',      icon: Wrench,            label: 'Ferramentas' },
  { to: '/bindconfig', icon: Server,             label: 'Configurar DNS' },
  { to: '/bindlog',    icon: FileText,           label: 'Log DNS' },
  { to: '/backups',    icon: HardDrive,          label: 'Backups' },
  { to: '/users',      icon: Users,             label: 'Usuários' },
  { to: '/audit',      icon: ClipboardList,     label: 'Auditoria' },
]

export default function Layout() {
  const navigate = useNavigate()
  const { theme, toggle } = useTheme()

  function logout() {
    clearToken()
    navigate('/login')
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar */}
      <aside style={{
        width: 220,
        background: 'var(--bg-panel)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}>
        {/* Logo — mesma altura da topbar (52px) */}
        <div style={{
          height: 52,
          flexShrink: 0,
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 16px',
        }}>
          <img
            src="/natverk_logo.svg"
            alt="Nätverk"
            style={{ height: 28, width: 'auto', maxWidth: 180 }}
          />
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '9px 12px',
              borderRadius: 'var(--r-md)',
              textDecoration: 'none',
              fontSize: 13,
              fontWeight: 500,
              color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
              background: isActive ? 'var(--accent-dim)' : 'transparent',
              borderLeft: isActive ? `3px solid var(--accent)` : '3px solid transparent',
              transition: 'all .15s',
            })}>
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Footer sidebar */}
        <div style={{ padding: '12px 8px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <NavLink to="/profile" style={({ isActive }) => ({
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '9px 12px', borderRadius: 'var(--r-md)',
            textDecoration: 'none', fontSize: 13, fontWeight: 500,
            color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
            background: isActive ? 'var(--accent-dim)' : 'transparent',
            borderLeft: isActive ? `3px solid var(--accent)` : '3px solid transparent',
          })}>
            <UserCircle size={16} /> Perfil
          </NavLink>
          <button onClick={logout} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            width: '100%', padding: '9px 12px',
            background: 'transparent', border: 'none',
            borderRadius: 'var(--r-md)', cursor: 'pointer',
            color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500,
            transition: 'all .15s',
          }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--red)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}
          >
            <LogOut size={16} />
            Sair
          </button>
        </div>
      </aside>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Topbar */}
        <header style={{
          height: 52,
          background: 'var(--bg-panel)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          padding: '0 20px',
          gap: 10,
          flexShrink: 0,
        }}>
          <Clock />

          {/* Theme toggle */}
          <button
            onClick={toggle}
            title={theme === 'dark' ? 'Mudar para claro' : 'Mudar para escuro'}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 32, height: 32,
              background: 'var(--bg-panel-2)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-sm)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'all .15s',
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </header>

        {/* Content */}
        <main style={{ flex: 1, overflowY: 'auto', padding: 20, background: 'var(--bg-canvas)' }}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
