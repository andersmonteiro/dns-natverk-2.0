import { useState, useEffect } from 'react'
import { Users as UsersIcon, Plus, Trash2, Loader, Search, X, KeyRound } from 'lucide-react'
import { api } from '../api'
import { useUser, useIsAdmin } from '../context/UserContext'

const ROLES = ['admin', 'viewer']

const roleColor = {}

function parseUA(ua) {
  if (!ua) return '—'
  let browser = 'Unknown', os = 'Unknown'
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
  return `${browser} / ${os}`
}

function relTime(ts) {
  if (!ts) return '—'
  const diff = Date.now() - new Date(ts + 'Z').getTime()
  if (diff < 0) return 'agora'
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'agora'
  if (m < 60) return `${m} min atrás`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h atrás`
  return `${Math.floor(h / 24)} dias atrás`
}

const base = {
  background: 'var(--bg-canvas)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-sm)',
  color: 'var(--text-primary)',
  padding: '8px 12px',
  fontSize: 13,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
}

function Modal({ title, onClose, children }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg-panel)', border: '1px solid var(--border)',
        borderRadius: 'var(--r-sm)', padding: 24, width: 400, maxWidth: '90vw',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700 }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export default function Users() {
  const [users, setUsers]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [error, setError]       = useState('')

  // Usa UserContext em vez de chamar api.me() separadamente
  const { user: me } = useUser() || {}
  const isAdmin = useIsAdmin()

  // Modal: criar usuário
  const [showCreate, setShowCreate] = useState(false)
  const [newUser, setNewUser]       = useState({ username: '', password: '', role: 'viewer' })
  const [creating, setCreating]     = useState(false)
  const [createErr, setCreateErr]   = useState('')

  // Modal: reset senha
  const [editUser, setEditUser]     = useState(null)
  const [newPass, setNewPass]       = useState('')
  const [resetting, setResetting]   = useState(false)
  const [resetErr, setResetErr]     = useState('')

  async function load() {
    try {
      const data = await api.listUsers()
      setUsers(Array.isArray(data) ? data : (data.items || []))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleCreate(e) {
    e.preventDefault()
    setCreating(true); setCreateErr('')
    try {
      await api.createUser(newUser)
      setNewUser({ username: '', password: '', role: 'viewer' })
      setShowCreate(false)
      await load()
    } catch (e) { setCreateErr(e.message) }
    finally { setCreating(false) }
  }

  async function handleDelete(u) {
    if (!confirm(`Remover o usuário "${u.username}"?`)) return
    try { await api.deleteUser(u.id); await load() }
    catch (e) { setError(e.message) }
  }

  async function handleRole(id, role) {
    try { await api.changeRole(id, role); await load() }
    catch (e) { setError(e.message) }
  }

  async function handleResetPass(e) {
    e.preventDefault()
    setResetting(true); setResetErr('')
    try {
      await api.adminResetPassword(editUser.id, newPass)
      setEditUser(null); setNewPass('')
    } catch (e) { setResetErr(e.message) }
    finally { setResetting(false) }
  }

  const filtered = users.filter(u => u.username.toLowerCase().includes(search.toLowerCase()))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <UsersIcon size={20} color="var(--accent)" /> Usuários
          </h1>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Gerenciar usuários do painel</div>
        </div>
        {isAdmin && (
          <button onClick={() => { setShowCreate(true); setCreateErr('') }} style={{
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
        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por login..."
          style={{ ...base, paddingLeft: 32 }}
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
              {filtered.map(u => {
                const isSelf = me?.username === u.username
                const canEdit = isAdmin && !isSelf
                const rc = roleColor[u.role] || {}
                return (
                  <tr key={u.id}
                    style={{ borderBottom: '1px solid var(--border-dim)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-panel-2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    {/* Login */}
                    <td style={{ padding: '10px 16px', fontWeight: 600 }}>{u.username}</td>

                    {/* Role — select para admin em outros, badge para o resto */}
                    <td style={{ padding: '10px 16px' }}>
                      {canEdit ? (
                        <select
                          value={u.role}
                          onChange={e => handleRole(u.id, e.target.value)}
                          style={{
                            background: 'var(--bg-canvas)',
                            border: '1px solid var(--border)',
                            borderRadius: 4, padding: '3px 8px',
                            color: 'var(--text-primary)',
                            fontSize: 12, cursor: 'pointer', outline: 'none',
                          }}
                        >
                          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>{u.role}</span>
                      )}
                    </td>

                    {/* Último acesso */}
                    <td style={{ padding: '10px 16px', color: 'var(--text-muted)' }}>{relTime(u.last_login_at)}</td>

                    {/* IP */}
                    <td style={{ padding: '10px 16px', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 12 }}>
                      {u.last_login_ip || '—'}
                    </td>

                    {/* Navegador / SO */}
                    <td style={{ padding: '10px 16px', color: 'var(--text-muted)' }}>{parseUA(u.last_login_ua)}</td>

                    {/* Ações */}
                    <td style={{ padding: '10px 16px' }}>
                      {canEdit && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            onClick={() => { setEditUser(u); setNewPass(''); setResetErr('') }}
                            title="Redefinir senha"
                            style={{
                              background: 'transparent', border: '1px solid var(--border)',
                              borderRadius: 4, padding: '4px 8px',
                              color: 'var(--text-secondary)', cursor: 'pointer',
                              display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11,
                            }}
                          >
                            <KeyRound size={12} /> Senha
                          </button>
                          <button
                            onClick={() => handleDelete(u)}
                            title="Remover usuário"
                            style={{
                              background: 'transparent', border: '1px solid var(--red-dim)',
                              borderRadius: 4, padding: '4px 8px',
                              color: 'var(--red)', cursor: 'pointer',
                              display: 'inline-flex', alignItems: 'center',
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal: Novo usuário */}
      {showCreate && (
        <Modal title="Novo usuário" onClose={() => setShowCreate(false)}>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Username</label>
              <input value={newUser.username} onChange={e => setNewUser(p => ({ ...p, username: e.target.value }))}
                placeholder="username" required style={base} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Senha</label>
              <input value={newUser.password} onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))}
                type="password" placeholder="mínimo 6 caracteres" required style={base} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Role</label>
              <select value={newUser.role} onChange={e => setNewUser(p => ({ ...p, role: e.target.value }))} style={base}>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            {createErr && <div style={{ color: 'var(--red)', fontSize: 12 }}>{createErr}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <button type="button" onClick={() => setShowCreate(false)} style={{
                padding: '8px 16px', background: 'transparent',
                border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
                color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer',
              }}>Cancelar</button>
              <button type="submit" disabled={creating} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', background: 'var(--accent)',
                border: 'none', borderRadius: 'var(--r-sm)',
                color: '#fff', fontSize: 13, fontWeight: 600,
                cursor: creating ? 'not-allowed' : 'pointer',
              }}>
                {creating ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={14} />}
                Criar
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Redefinir senha */}
      {editUser && (
        <Modal title={`Redefinir senha — ${editUser.username}`} onClose={() => setEditUser(null)}>
          <form onSubmit={handleResetPass} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Nova senha</label>
              <input
                value={newPass}
                onChange={e => setNewPass(e.target.value)}
                type="password"
                placeholder="mínimo 6 caracteres"
                required
                style={base}
              />
            </div>
            {resetErr && <div style={{ color: 'var(--red)', fontSize: 12 }}>{resetErr}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <button type="button" onClick={() => setEditUser(null)} style={{
                padding: '8px 16px', background: 'transparent',
                border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
                color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer',
              }}>Cancelar</button>
              <button type="submit" disabled={resetting} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', background: 'var(--accent)',
                border: 'none', borderRadius: 'var(--r-sm)',
                color: '#fff', fontSize: 13, fontWeight: 600,
                cursor: resetting ? 'not-allowed' : 'pointer',
              }}>
                {resetting ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <KeyRound size={14} />}
                Salvar
              </button>
            </div>
          </form>
        </Modal>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
