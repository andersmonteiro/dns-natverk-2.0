import { useState, useEffect } from 'react'
import { Users as UsersIcon, Plus, Trash2, Loader, Search, X } from 'lucide-react'
import { api } from '../api'

const ROLES = ['admin', 'operator', 'viewer']

const roleBadge = {
  admin:    { color: 'var(--red)',    bg: 'var(--red-dim)'    },
  operator: { color: 'var(--orange)', bg: 'var(--orange-dim)' },
  viewer:   { color: 'var(--green)',  bg: 'var(--green-dim)'  },
}

function RoleBadge({ role }) {
  const s = roleBadge[role] || {}
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700,
      color: s.color, background: s.bg || 'var(--bg-canvas)',
      border: `1px solid ${s.color || 'var(--border)'}`,
      textTransform: 'uppercase',
    }}>{role}</span>
  )
}

function parseUA(ua) {
  if (!ua) return '—'
  let browser = 'Unknown'
  let os = 'Unknown'
  if (/OPR\/|Opera/.test(ua)) browser = 'Opera'
  else if (/Edg\//.test(ua)) browser = 'Edge'
  else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) browser = 'Chrome'
  else if (/Firefox\//.test(ua)) browser = 'Firefox'
  else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = 'Safari'
  if (/Android/.test(ua)) os = 'Android'
  else if (/iPhone|iPad|iOS/.test(ua)) os = 'iOS'
  else if (/Windows NT/.test(ua)) os = 'Windows'
  else if (/Mac OS X/.test(ua)) os = 'macOS'
  else if (/Linux/.test(ua)) os = 'Linux'
  return `${browser} on ${os}`
}

function relTime(ts) {
  if (!ts) return '—'
  const diff = Date.now() - new Date(ts + 'Z').getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'agora'
  if (m < 60) return `${m} min atrás`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h atrás`
  const d = Math.floor(h / 24)
  return `${d} dias atrás`
}

const inputStyle = {
  background: 'var(--bg-canvas)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-sm)',
  color: 'var(--text-primary)',
  padding: '8px 12px',
  fontSize: 13,
  outline: 'none',
}

export default function Users() {
  const [users, setUsers]     = useState([])
  const [me, setMe]           = useState(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [showModal, setShowModal] = useState(false)
  const [error, setError]     = useState('')

  // form
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole]         = useState('viewer')
  const [adding, setAdding]           = useState(false)
  const [formError, setFormError]     = useState('')

  async function load() {
    try {
      const [data, meData] = await Promise.all([api.listUsers(), api.me()])
      setUsers(Array.isArray(data) ? data : (data.items || []))
      setMe(meData)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function addUser(e) {
    e.preventDefault()
    if (!newUsername.trim() || !newPassword.trim()) return
    setAdding(true)
    setFormError('')
    try {
      await api.createUser({ username: newUsername.trim(), password: newPassword, role: newRole })
      setNewUsername('')
      setNewPassword('')
      setNewRole('viewer')
      setShowModal(false)
      await load()
    } catch (e) {
      setFormError(e.message)
    } finally {
      setAdding(false)
    }
  }

  async function deleteUser(id) {
    if (!confirm('Remover este usuário?')) return
    try {
      await api.deleteUser(id)
      await load()
    } catch (e) {
      setError(e.message)
    }
  }

  async function changeRole(id, role) {
    try {
      await api.changeRole(id, role)
      await load()
    } catch (e) {
      setError(e.message)
    }
  }

  const filtered = users.filter(u =>
    u.username.toLowerCase().includes(search.toLowerCase())
  )

  const isAdmin = me?.role === 'admin'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <UsersIcon size={20} color="var(--accent)" /> Usuários
          </h1>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Gerenciar usuários do painel</div>
        </div>
        {isAdmin && (
          <button onClick={() => setShowModal(true)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', background: 'var(--accent)',
            border: 'none', borderRadius: 'var(--r-sm)',
            color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>
            <Plus size={14} /> Novo usuário
          </button>
        )}
      </div>

      {error && <div style={{ color: 'var(--red)', fontSize: 12 }}>{error}</div>}

      {/* Search */}
      <div style={{ position: 'relative' }}>
        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por login..."
          style={{ ...inputStyle, width: '100%', paddingLeft: 32, boxSizing: 'border-box' }}
        />
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)' }}>
          {filtered.length} usuário{filtered.length !== 1 ? 's' : ''}
        </div>
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>Carregando…</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Login', 'Role', 'Último acesso', 'IP de origem', 'Navegador / SO', 'Ações'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 16px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.id}
                  style={{ borderBottom: '1px solid var(--border-dim)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-panel-2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '10px 16px', fontWeight: 600, color: 'var(--text-primary)' }}>{u.username}</td>
                  <td style={{ padding: '10px 16px' }}><RoleBadge role={u.role} /></td>
                  <td style={{ padding: '10px 16px', color: 'var(--text-muted)' }}>{relTime(u.last_login_at)}</td>
                  <td style={{ padding: '10px 16px', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 12 }}>
                    {u.last_login_ip || '—'}
                  </td>
                  <td style={{ padding: '10px 16px', color: 'var(--text-muted)' }}>{parseUA(u.last_login_ua)}</td>
                  <td style={{ padding: '10px 16px' }}>
                    {isAdmin && me?.username !== u.username && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <select
                          value={u.role}
                          onChange={e => changeRole(u.id, e.target.value)}
                          style={{
                            ...inputStyle,
                            padding: '4px 8px',
                            fontSize: 12,
                            cursor: 'pointer',
                          }}
                        >
                          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                        <button onClick={() => deleteUser(u.id)} title="Remover usuário" style={{
                          background: 'transparent', border: '1px solid var(--red-dim)',
                          borderRadius: 4, padding: '4px 8px',
                          color: 'var(--red)', cursor: 'pointer',
                          display: 'inline-flex', alignItems: 'center',
                        }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal Novo Usuário */}
      {showModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={() => setShowModal(false)}>
          <div style={{
            background: 'var(--bg-panel)', border: '1px solid var(--border)',
            borderRadius: 'var(--r-sm)', padding: 24, width: 400, maxWidth: '90vw',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700 }}>Novo usuário</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={addUser} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Username</label>
                <input
                  value={newUsername}
                  onChange={e => setNewUsername(e.target.value)}
                  placeholder="username"
                  required
                  style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Senha</label>
                <input
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  type="password"
                  placeholder="mínimo 6 caracteres"
                  required
                  style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Role</label>
                <select value={newRole} onChange={e => setNewRole(e.target.value)} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              {formError && <div style={{ color: 'var(--red)', fontSize: 12 }}>{formError}</div>}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                <button type="button" onClick={() => setShowModal(false)} style={{
                  padding: '8px 16px', background: 'transparent',
                  border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
                  color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer',
                }}>Cancelar</button>
                <button type="submit" disabled={adding} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 16px', background: 'var(--accent)',
                  border: 'none', borderRadius: 'var(--r-sm)',
                  color: '#fff', fontSize: 13, fontWeight: 600,
                  cursor: adding ? 'not-allowed' : 'pointer',
                }}>
                  {adding ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={14} />}
                  Criar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
