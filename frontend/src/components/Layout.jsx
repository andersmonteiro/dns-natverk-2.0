import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Activity, Terminal, ShieldOff, ShieldCheck,
  ClipboardList, Users, Wrench, HardDrive, FileText, UserCircle,
  LogOut, Sun, Moon, Server, Globe, ChevronDown, Wifi, Settings,
} from 'lucide-react'
import { useState } from 'react'
import { clearToken } from '../api'
import { useTheme } from '../context/ThemeContext'
import { useIsAdmin, useUser } from '../context/UserContext'
import Clock from './Clock'

// ── grupos da sidebar ──────────────────────────────────────────────────────────

const DNS_ITEMS = [
  { to: '/dashboard',  icon: LayoutDashboard, label: 'Dashboard'      },
  { to: '/metrics',    icon: Activity,         label: 'Métricas'       },
  { to: '/blocklist',  icon: ShieldOff,         label: 'Bloqueios'      },
  { to: '/whitelist',  icon: ShieldCheck,       label: 'Whitelist'      },
  { to: '/bindconfig', icon: Server,            label: 'Configurar DNS' },
  { to: '/operations', icon: Terminal,          label: 'Serviços DNS'   },
  { to: '/bindlog',    icon: FileText,          label: 'Log DNS'        },
]

const DNS_ITEMS_VIEWER = [
  { to: '/dashboard',  icon: LayoutDashboard, label: 'Dashboard'      },
  { to: '/metrics',    icon: Activity,         label: 'Métricas'       },
  { to: '/blocklist',  icon: ShieldOff,         label: 'Bloqueios'      },
  { to: '/whitelist',  icon: ShieldCheck,       label: 'Whitelist'      },
  { to: '/bindconfig', icon: Server,            label: 'Configurar DNS' },
  { to: '/bindlog',    icon: FileText,          label: 'Log DNS'        },
]

const RPKI_ITEMS = [
  { to: '/rpki', icon: Globe, label: 'RPKI' },
]

const SISTEMA_ITEMS = [
  { to: '/tools', icon: Wrench, label: 'Ferramentas' },
]

const SISTEMA_ITEMS_ADMIN = [
  { to: '/tools',    icon: Wrench,    label: 'Ferramentas' },
  { to: '/backups',  icon: HardDrive, label: 'Backups'     },
]

const ADMIN_ITEMS = [
  { to: '/users', icon: Users,         label: 'Usuários'  },
  { to: '/audit', icon: ClipboardList, label: 'Auditoria' },
]

// ── componente de link ─────────────────────────────────────────────────────────

function NavItem({ to, icon: Icon, label }) {
  return (
    <NavLink to={to} style={({ isActive }) => ({
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 14px',
      borderRadius: 'var(--r-md)',
      textDecoration: 'none',
      fontSize: 14, fontWeight: 500,
      color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
      background: isActive ? 'var(--accent-dim)' : 'transparent',
      borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
      transition: 'all .15s',
    })}>
      <Icon size={16} />
      {label}
    </NavLink>
  )
}

// ── componente de grupo recolhível ─────────────────────────────────────────────

function NavGroup({ label, icon: Icon, items, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          width: '100%', padding: '6px 12px 6px 10px',
          background: 'transparent', border: 'none',
          cursor: 'pointer', fontSize: 12, fontWeight: 700,
          color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.8px',
          marginBottom: 2,
        }}
      >
        {Icon && <Icon size={12} />}
        <span style={{ flex: 1, textAlign: 'left' }}>{label}</span>
        <ChevronDown size={11} style={{ transition: '.2s', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }} />
      </button>

      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginBottom: 8 }}>
          {items.map(item => <NavItem key={item.to} {...item} />)}
        </div>
      )}
    </div>
  )
}

// ── layout principal ───────────────────────────────────────────────────────────

export default function Layout() {
  const navigate = useNavigate()
  const { theme, toggle } = useTheme()
  const isAdmin = useIsAdmin()
  const { user } = useUser() || {}

  function logout() {
    clearToken()
    navigate('/login')
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar */}
      <aside style={{
        width: 220, background: 'var(--bg-panel)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', flexShrink: 0,
      }}>
        {/* Logo — clicável para dashboard */}
        <NavLink to="/dashboard" style={{
          height: 52, flexShrink: 0,
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 16px', textDecoration: 'none',
        }}>
          <img src="/natverk_logo.svg" alt="Nätverk" style={{ height: 28, width: 'auto', maxWidth: 180 }} />
        </NavLink>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 0, overflowY: 'auto' }}>
          <NavGroup label="DNS" icon={Wifi} items={isAdmin ? DNS_ITEMS : DNS_ITEMS_VIEWER} defaultOpen={true} />
          <NavGroup label="RPKI" icon={Globe} items={RPKI_ITEMS} defaultOpen={true} />
          <NavGroup label="Sistema" icon={Wrench} items={isAdmin ? SISTEMA_ITEMS_ADMIN : SISTEMA_ITEMS} defaultOpen={true} />
          {isAdmin && <NavGroup label="Admin" icon={Users} items={ADMIN_ITEMS} defaultOpen={true} />}
        </nav>
      </aside>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Topbar */}
        <header style={{
          height: 52, background: 'var(--bg-panel)',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          padding: '0 20px', gap: 8, flexShrink: 0,
        }}>
          <Clock />

          {/* Usuário logado */}
          <NavLink to="/profile" title="Perfil" style={({ isActive }) => ({
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '5px 10px',
            background: isActive ? 'var(--accent-dim)' : 'var(--bg-panel-2)',
            border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 'var(--r-sm)',
            color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
            textDecoration: 'none', fontSize: 13, fontWeight: 500,
          })}>
            <UserCircle size={15} />
            {user?.username || '—'}
          </NavLink>

          {/* Tema */}
          <button
            onClick={toggle}
            title={theme === 'dark' ? 'Mudar para claro' : 'Mudar para escuro'}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 32, height: 32,
              background: 'var(--bg-panel-2)', border: '1px solid var(--border)',
              borderRadius: 'var(--r-sm)', color: 'var(--text-secondary)', cursor: 'pointer',
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          {/* Sair */}
          <button onClick={logout} title="Sair" style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 10px',
            background: 'var(--bg-panel-2)', border: '1px solid var(--border)',
            borderRadius: 'var(--r-sm)', color: 'var(--text-secondary)',
            fontSize: 13, fontWeight: 500, cursor: 'pointer',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--red)'; e.currentTarget.style.borderColor = 'var(--red-dim)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border)' }}
          >
            <LogOut size={14} /> Sair
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
