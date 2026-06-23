import { useState, useEffect } from 'react'
import { ShieldCheck, Plus, Trash2, Loader } from 'lucide-react'
import { api } from '../api'
import Panel from '../components/Panel'
import { useIsAdmin } from '../context/UserContext'

export default function Whitelist() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [domain, setDomain] = useState('')
  const [reason, setReason] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const isAdmin = useIsAdmin()

  async function load() {
    try {
      const data = await api.listWhitelist()
      setItems(Array.isArray(data) ? data : (data.items || []))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function add(e) {
    e.preventDefault()
    if (!domain.trim()) return
    setAdding(true)
    setError('')
    try {
      await api.addWhitelist(domain.trim(), reason.trim())
      setDomain('')
      setReason('')
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setAdding(false)
    }
  }

  async function remove(d) {
    try {
      await api.removeWhitelist(d)
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
        <ShieldCheck size={20} color="var(--green)" /> Whitelist de Domínios
      </h1>

      {/* Adicionar — só admin */}
      {isAdmin && (
        <Panel title="Adicionar domínio" subtitle="Domínios na whitelist não são bloqueados">
          <form onSubmit={add} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              value={domain}
              onChange={e => setDomain(e.target.value)}
              placeholder="exemplo.com.br"
              style={{ ...inputStyle, flex: '1 1 180px', minWidth: 180 }}
            />
            <input
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Motivo (opcional)"
              style={{ ...inputStyle, flex: '2 1 250px' }}
            />
            <button type="submit" disabled={adding} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px',
              background: 'var(--green)',
              border: 'none', borderRadius: 'var(--r-sm)',
              color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: adding ? 'not-allowed' : 'pointer',
            }}>
              {adding ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={14} />}
              Adicionar
            </button>
          </form>
          {error && <div style={{ marginTop: 8, color: 'var(--red)', fontSize: 12 }}>{error}</div>}
        </Panel>
      )}

      <Panel title="Domínios liberados" subtitle={`${items.length} entradas`}>
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>Carregando…</div>
        ) : items.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>Nenhum domínio na whitelist</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Domínio', 'Motivo', 'Adicionado por', 'Data', isAdmin ? '' : null].filter(Boolean).map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.domain} style={{ borderBottom: '1px solid var(--border-dim)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-panel-2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '9px 10px', color: 'var(--green)', fontWeight: 600 }}>{item.domain}</td>
                  <td style={{ padding: '9px 10px', color: 'var(--text-secondary)' }}>{item.reason || '—'}</td>
                  <td style={{ padding: '9px 10px', color: 'var(--text-muted)' }}>{item.created_by || '—'}</td>
                  <td style={{ padding: '9px 10px', color: 'var(--text-muted)' }}>
                    {item.created_at ? new Date(item.created_at).toLocaleString('pt-BR') : '—'}
                  </td>
                  {isAdmin && (
                    <td style={{ padding: '9px 10px', textAlign: 'right' }}>
                      <button onClick={() => remove(item.domain)} style={{
                        background: 'transparent', border: '1px solid var(--red-dim)',
                        borderRadius: 'var(--r-sm)', color: 'var(--red)',
                        padding: '4px 8px', cursor: 'pointer', fontSize: 11,
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                      }}>
                        <Trash2 size={12} /> Remover
                      </button>
                    </td>
                  )}
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
