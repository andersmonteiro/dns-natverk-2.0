import { useState, useEffect } from 'react'
import { Users as UsersIcon, Plus, Trash2, ShieldCheck, Shield, Loader } from 'lucide-react'
import { api } from '../api'
import Panel from '../components/Panel'

const ROLES = ['admin', 'operator', 'viewer']

const roleBadge = {
  admin:    { color: 'var(--red)',    bg: 'var(--red-dim)'   },
  operator: { color: 'var(--orange)', bg: 'var(--orange-dim)' },
  viewer:   { color: 'var(--green)', bg: 'var(--green-dim)' },
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

export default function Users() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [me, setMe] = useState(null)

  // New user form
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState('viewer')
  const [adding, setAdding] = useState(false)

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
    setError('')
    try {
      await api.createUser({ username: newUsername.trim(), password: newPassword, role: newRole })
      setNewUsername('')
      setNewPassword('')
      setNewRole('viewer')
      await load()
    } catch (e) {
      setError(e.message)
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

  const inputStyle = {
    background: 'var(--bg-canvas)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-sm)',
    color: 'var(--text-primary)',
    padding: '8px 12px',
    fontSize: 13,
    outline: 'none',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
        <UsersIcon size={20} color="var(--accent)" /> Usuários
      </h1>

      <Panel title="Novo usuário">
        <form onSubmit={addUser} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            value={newUsername}
            onChange={e => setNewUsername(e.target.value)}
            placeholder="Username"
            required
            style={{ ...inputStyle, flex: '1 1 150px' }}
          />
          <input
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            type="password"
            placeholder="Senha"
            required
            style={{ ...inputStyle, flex: '1 1 150px' }}
          />
          <select value={newRole} onChange={e => setNewRole(e.target.value)} style={{ ...inputStyle, flex: '0 0 120px' }}>
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
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
        </form>
        {error && <div style={{ marginTop: 8, color: 'var(--red)', fontSize: 12 }}>{error}</div>}
      </Panel>

      <Panel title="Usuários cadastrados" subtitle={`${users.length} contas`}>
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>Carregando…</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['#', 'Username', 'Role', 'Criado em', 'Ações'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} style={{ borderBottom: '1px solid var(--border-dim)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-panel-2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '9px 10px', color: 'var(--text-muted)' }}>{u.id}</td>
                  <td style={{ padding: '9px 10px', color: 'var(--text-primary)', fontWeight: 600 }}>{u.username}</td>
                  <td style={{ padding: '9px 10px' }}><RoleBadge role={u.role} /></td>
                  <td style={{ padding: '9px 10px', color: 'var(--text-muted)' }}>
                    {u.created_at ? new Date(u.created_at).toLocaleDateString('pt-BR') : '—'}
                  </td>
                  <td style={{ padding: '9px 10px', display: 'flex', gap: 6 }}>
                    {me?.role === 'admin' && me?.username !== u.username && (
                      <>
                        {ROLES.filter(r => r !== u.role).map(r => (
                          <button key={r} onClick={() => changeRole(u.id, r)} style={{
                            background: 'transparent',
                            border: `1px solid ${roleBadge[r]?.color || 'var(--border)'}`,
                            borderRadius: 4, padding: '3px 8px',
                            color: roleBadge[r]?.color || 'var(--text-secondary)',
                            fontSize: 11, cursor: 'pointer',
                          }}>{r}</button>
                        ))}
                        <button onClick={() => deleteUser(u.id)} style={{
                          background: 'transparent', border: '1px solid var(--red-dim)',
                          borderRadius: 4, padding: '3px 8px',
                          color: 'var(--red)', fontSize: 11, cursor: 'pointer',
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                        }}>
                          <Trash2 size={11} />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
