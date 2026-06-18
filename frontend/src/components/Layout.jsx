import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Activity, Terminal, ShieldOff, ShieldCheck,
  ClipboardList, Users, Wrench, HardDrive, FileText, UserCircle,
  LogOut, Sun, Moon, RefreshCw, ChevronDown,
} from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { clearToken } from '../api'
import { useTheme } from '../context/ThemeContext'
import { useRefresh, INTERVALS } from '../context/RefreshContext'
import Clock from './Clock'

const navItems = [
  { to: '/dashboard',  icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/metrics',    icon: Activity,         label: 'Métricas' },
  { to: '/operations', icon: Terminal,          label: 'Operações' },
  { to: '/blocklist',  icon: ShieldOff,         label: 'Bloqueios' },
  { to: '/whitelist',  icon: ShieldCheck,       label: 'Whitelist' },
  { to: '/tools',      icon: Wrench,            label: 'Ferramentas' },
  { to: '/bindlog',    icon: FileText,           label: 'Log BIND' },
  { to: '/backups',    icon: HardDrive,          label: 'Backups' },
  { to: '/users',      icon: Users,             label: 'Usuários' },
  { to: '/audit',      icon: ClipboardList,     label: 'Auditoria' },
]

function RefreshButton() {
  const { interval, setInterval, countdown, manualRefresh } = useRefresh()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const current = INTERVALS.find(i => i.value === interval) || INTERVALS[0]
  const pct = interval > 0 ? ((interval - countdown) / interval) * 100 : 0

  return (
    <div ref={ref} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 0 }}>
      {/* Botão Refresh manual */}
      <button
        onClick={manualRefresh}
        title="Refresh agora"
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 10px',
          background: 'var(--bg-panel-2)',
          border: '1px solid var(--border)',
          borderRight: 'none',
          borderRadius: 'var(--r-sm) 0 0 var(--r-sm)',
          color: 'var(--text-secondary)',
          cursor: 'pointer', fontSize: 12,
          position: 'relative', overflow: 'hidden',
        }}
      >
        <RefreshCw size={13} />
        {interval > 0 && (
          <span style={{ color: 'var(--accent)', fontWeight: 600, minWidth: 24, textAlign: 'right' }}>
            {countdown}s
          </span>
        )}
        {/* barra de progresso */}
        {interval > 0 && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0,
            height: 2, width: `${pct}%`,
            background: 'var(--accent)',
            transition: 'width 1s linear',
          }} />
        )}
      </button>

      {/* Seletor de intervalo */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '6px 8px',
          background: 'var(--bg-panel-2)',
          border: '1px solid var(--border)',
          borderRadius: '0 var(--r-sm) var(--r-sm) 0',
          color: 'var(--text-secondary)',
          cursor: 'pointer', fontSize: 12,
        }}
      >
        {current.label} <ChevronDown size={12} />
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: '110%', right: 0,
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)',
          boxShadow: '0 8px 24px rgba(0,0,0,.3)',
          zIndex: 100, minWidth: 100, overflow: 'hidden',
        }}>
          {INTERVALS.map(opt => (
            <button
              key={opt.value}
              onClick={() => { setInterval(opt.value); setOpen(false) }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '8px 14px', background: 'transparent',
                border: 'none', cursor: 'pointer',
                color: opt.value === interval ? 'var(--accent)' : 'var(--text-secondary)',
                fontWeight: opt.value === interval ? 700 : 400,
                fontSize: 13,
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-panel-2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

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
        {/* Logo */}
        <div style={{
          padding: '16px 16px 12px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <img
            src="/natverk_logo.svg"
            alt="Nätverk"
            style={{ height: 32, width: 'auto', maxWidth: 180 }}
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

          <RefreshButton />

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
