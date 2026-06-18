import { useState, useEffect } from 'react'
import { Plus, Trash2, ShieldOff } from 'lucide-react'
import { api } from '../api'
import Panel from '../components/Panel'

export default function Blocklist() {
  const [blocks, setBlocks] = useState([])
  const [newDomain, setNewDomain] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')

  async function load() {
    try { setBlocks(await api.listBlocks()) } catch {}
  }

  useEffect(() => { load() }, [])

  async function add(e) {
    e.preventDefault()
    if (!newDomain.trim()) return
    setError(''); setLoading(true)
    try {
      await api.addBlock(newDomain.trim())
      setNewDomain('')
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function remove(domain) {
    try { await api.removeBlock(domain); await load() } catch {}
  }

  const filtered = blocks.filter(b => b.domain.includes(search.toLowerCase()))

  const inputStyle = {
    padding: '8px 12px',
    background: 'var(--bg-panel-2)',
    border: '1px solid var(--border-2)',
    borderRadius: 'var(--r-md)',
    color: 'var(--text-primary)',
    fontSize: 13,
    outline: 'none',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>Lista de Bloqueios</h1>

      {/* Adicionar */}
      <Panel title="Bloquear domínio">
        <form onSubmit={add} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <input
              type="text"
              value={newDomain}
              onChange={e => setNewDomain(e.target.value)}
              placeholder="ex: ads.example.com"
              style={{ ...inputStyle, width: '100%' }}
            />
          </div>
          <button type="submit" disabled={loading} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px',
            background: 'var(--red)',
            border: 'none',
            borderRadius: 'var(--r-md)',
            color: '#fff',
            fontSize: 13, fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}>
            <Plus size={15} />
            Bloquear
          </button>
        </form>
        {error && <div style={{ marginTop: 10, color: 'var(--red)', fontSize: 13 }}>{error}</div>}
      </Panel>

      {/* Lista */}
      <Panel
        title={`Domínios bloqueados (${blocks.length})`}
        action={
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filtrar…"
            style={{ ...inputStyle, width: 180, fontSize: 12 }}
          />
        }
      >
        {filtered.length === 0
          ? <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
              <ShieldOff size={32} style={{ margin: '0 auto 8px', display: 'block', opacity: .3 }} />
              {blocks.length === 0 ? 'Nenhum domínio bloqueado' : 'Nenhum resultado para o filtro'}
            </div>
          : <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {['Domínio', 'Bloqueado por', 'Data', ''].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.5px', borderBottom: '1px solid var(--border)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(b => (
                    <tr key={b.domain} style={{ borderBottom: '1px solid var(--border)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '10px 10px', color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 12 }}>{b.domain}</td>
                      <td style={{ padding: '10px 10px', color: 'var(--text-secondary)' }}>{b.created_by || '—'}</td>
                      <td style={{ padding: '10px 10px', color: 'var(--text-muted)', fontSize: 11, whiteSpace: 'nowrap' }}>
                        {new Date(b.created_at).toLocaleString('pt-BR')}
                      </td>
                      <td style={{ padding: '10px 10px', textAlign: 'right' }}>
                        <button onClick={() => remove(b.domain)} style={{
                          background: 'transparent', border: 'none',
                          color: 'var(--text-muted)', cursor: 'pointer',
                          padding: 4, borderRadius: 4,
                          transition: 'color .15s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.color = 'var(--red)'}
                        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                        title="Remover bloqueio"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        }
      </Panel>
    </div>
  )
}
