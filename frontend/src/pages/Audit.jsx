import { useState, useEffect, useCallback } from 'react'
import { ClipboardList, Search, RefreshCw } from 'lucide-react'
import { api } from '../api'
import Panel from '../components/Panel'

export default function Audit() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [action, setAction] = useState('')
  const [username, setUsername] = useState('')
  const [limit, setLimit] = useState(100)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (q) params.q = q
      if (action) params.action = action
      if (username) params.username = username
      params.limit = limit
      const data = await api.listAudit(params)
      setItems(data.items || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [q, action, username, limit])

  useEffect(() => { load() }, [])

  function handleSearch(e) {
    e.preventDefault()
    load()
  }

  const inputStyle = {
    background: 'var(--bg-canvas)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-sm)',
    color: 'var(--text-primary)',
    padding: '7px 10px',
    fontSize: 12,
    outline: 'none',
  }

  const actionColors = {
    login: 'var(--green)',
    logout: 'var(--text-muted)',
    block_add: 'var(--red)',
    block_remove: 'var(--orange)',
    whitelist_add: 'var(--green)',
    whitelist_remove: 'var(--orange)',
    user_create: 'var(--accent)',
    user_delete: 'var(--red)',
    bind_restart: 'var(--orange)',
    rndc_flush: 'var(--orange)',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
        <ClipboardList size={20} color="var(--accent)" /> Auditoria
      </h1>

      <Panel title="Filtros">
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Busca</label>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="domínio, IP…" style={{ ...inputStyle, width: 180 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Ação</label>
            <input value={action} onChange={e => setAction(e.target.value)} placeholder="login, block_add…" style={{ ...inputStyle, width: 140 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Usuário</label>
            <input value={username} onChange={e => setUsername(e.target.value)} placeholder="admin" style={{ ...inputStyle, width: 120 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Limite</label>
            <select value={limit} onChange={e => setLimit(+e.target.value)} style={{ ...inputStyle, width: 80 }}>
              {[50, 100, 250, 500].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <button type="submit" style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', background: 'var(--accent)',
            border: 'none', borderRadius: 'var(--r-sm)',
            color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>
            <Search size={13} /> Buscar
          </button>
          <button type="button" onClick={load} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 12px', background: 'transparent',
            border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
            color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer',
          }}>
            <RefreshCw size={13} />
          </button>
        </form>
      </Panel>

      <Panel title="Eventos" subtitle={`${items.length} registros`}>
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>Carregando…</div>
        ) : items.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>Nenhum evento encontrado</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Data/Hora', 'Usuário', 'Ação', 'Detalhes'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '7px 10px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--border-dim)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-panel-2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '8px 10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {item.ts ? new Date(item.ts).toLocaleString('pt-BR') : '—'}
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--accent)', fontWeight: 600 }}>{item.username || '—'}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <span style={{
                        background: 'var(--bg-canvas)',
                        border: `1px solid var(--border)`,
                        borderRadius: 4,
                        padding: '2px 7px',
                        color: actionColors[item.action] || 'var(--text-primary)',
                        fontWeight: 600,
                        fontSize: 11,
                        fontFamily: 'monospace',
                      }}>{item.action}</span>
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--text-secondary)', maxWidth: 400, wordBreak: 'break-all' }}>
                      {item.detail || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}
