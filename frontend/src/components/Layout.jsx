import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Activity, Terminal, ShieldOff, ShieldCheck,
  ClipboardList, Users, Wrench, HardDrive, FileText, UserCircle,
  LogOut, Sun, Moon, Server, Globe, ChevronDown, Wifi, ShieldCheck as ShieldIcon,
} from 'lucide-react'
import { useState } from 'react'
import { clearToken } from '../api'
import { useTheme } from '../context/ThemeContext'
import Clock from './Clock'

// ── grupos da sidebar ──────────────────────────────────────────────────────────

const DNS_ITEMS = [
  { to: '/dashboard',  icon: LayoutDashboard, label: 'Dashboard'      },
  { to: '/metrics',    icon: Activity,         label: 'Métricas'       },
  { to: '/operations', icon: Terminal,          label: 'Operações'      },
  { to: '/blocklist',  icon: ShieldOff,         label: 'Bloqueios'      },
  { to: '/whitelist',  icon: ShieldCheck,       label: 'Whitelist'      },
  { to: '/bindconfig', icon: Server,            label: 'Configurar DNS' },
  { to: '/bindlog',    icon: FileText,          label: 'Log DNS'        },
  { to: '/backups',    icon: HardDrive,         label: 'Backups'        },
]

const RPKI_ITEMS = [
  { to: '/rpki', icon: Globe, label: 'RPKI' },
]

const SISTEMA_ITEMS = [
  { to: '/tools', icon: Wrench, label: 'Ferramentas' },
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
          cursor: 'pointer', fontSize: 10, fontWeight: 700,
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
        {/* Logo */}
        <div style={{
          height: 52, flexShrink: 0,
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 16px',
        }}>
          <img src="/natverk_logo.svg" alt="Nätverk" style={{ height: 28, width: 'auto', maxWidth: 180 }} />
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 0, overflowY: 'auto' }}>
          <NavGroup label="DNS" icon={Wifi} items={DNS_ITEMS} defaultOpen={true} />
          <NavGroup label="RPKI" icon={Globe} items={RPKI_ITEMS} defaultOpen={true} />
          <NavGroup label="Sistema" icon={Wrench} items={SISTEMA_ITEMS} defaultOpen={true} />
          <NavGroup label="Admin" icon={Users} items={ADMIN_ITEMS} defaultOpen={true} />
        </nav>

        {/* Footer */}
        <div style={{ padding: '12px 8px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <NavItem to="/profile" icon={UserCircle} label="Perfil" />
          <button onClick={logout} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            width: '100%', padding: '8px 12px',
            background: 'transparent', border: 'none', borderLeft: '3px solid transparent',
            borderRadius: 'var(--r-md)', cursor: 'pointer',
            color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500,
          }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--red)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}
          >
            <LogOut size={15} /> Sair
          </button>
        </div>
      </aside>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Topbar */}
        <header style={{
          height: 52, background: 'var(--bg-panel)',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          padding: '0 20px', gap: 10, flexShrink: 0,
        }}>
          <Clock />
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
        </header>

        {/* Content */}
        <main style={{ flex: 1, overflowY: 'auto', padding: 20, background: 'var(--bg-canvas)' }}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
