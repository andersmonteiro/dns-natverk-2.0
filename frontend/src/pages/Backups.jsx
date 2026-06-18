import { useState, useEffect } from 'react'
import { HardDrive, RotateCcw, RefreshCw, Loader } from 'lucide-react'
import { api } from '../api'
import Panel from '../components/Panel'

function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

function fmtDate(ts) {
  return new Date(ts * 1000).toLocaleString('pt-BR')
}

export default function Backups() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [restoring, setRestoring] = useState(null)
  const [message, setMessage] = useState(null) // { type: ok|err, text }

  async function load() {
    setLoading(true)
    try {
      const data = await api.listBackups()
      setItems(data.items || [])
    } catch (e) {
      setMessage({ type: 'err', text: e.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function restore(item) {
    if (!confirm(`Restaurar ${item.name}? O arquivo original será sobrescrito.`)) return
    setRestoring(item.path)
    setMessage(null)
    try {
      const res = await api.restoreBackup(item.path)
      setMessage({ type: 'ok', text: `Restaurado: ${res.restored}` })
    } catch (e) {
      setMessage({ type: 'err', text: e.message })
    } finally {
      setRestoring(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
          <HardDrive size={20} color="var(--accent)" /> Backups BIND
        </h1>
        <button onClick={load} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '7px 12px', background: 'transparent',
          border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
          color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer',
        }}>
          <RefreshCw size={13} /> Atualizar
        </button>
      </div>

      {message && (
        <div style={{
          padding: '10px 14px',
          background: message.type === 'ok' ? 'var(--green-dim)' : 'var(--red-dim)',
          border: `1px solid ${message.type === 'ok' ? 'var(--green)' : 'var(--red)'}`,
          borderRadius: 'var(--r-sm)',
          color: message.type === 'ok' ? 'var(--green)' : 'var(--red)',
          fontSize: 13,
        }}>
          {message.text}
        </div>
      )}

      <Panel title="Arquivos de backup em /etc/bind" subtitle={`${items.length} arquivos (*.bkp*)`}>
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>Carregando…</div>
        ) : items.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
            Nenhum arquivo de backup encontrado em /etc/bind
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Arquivo', 'Tamanho', 'Modificado', 'Ação'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.path} style={{ borderBottom: '1px solid var(--border-dim)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-panel-2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '9px 10px', color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 12 }}>{item.name}</td>
                  <td style={{ padding: '9px 10px', color: 'var(--text-secondary)' }}>{fmtSize(item.size)}</td>
                  <td style={{ padding: '9px 10px', color: 'var(--text-muted)' }}>{fmtDate(item.mtime)}</td>
                  <td style={{ padding: '9px 10px' }}>
                    <button
                      onClick={() => restore(item)}
                      disabled={restoring === item.path}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '5px 10px', fontSize: 12,
                        background: 'transparent',
                        border: '1px solid var(--orange)',
                        borderRadius: 'var(--r-sm)',
                        color: 'var(--orange)', cursor: 'pointer',
                      }}
                    >
                      {restoring === item.path
                        ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} />
                        : <RotateCcw size={12} />
                      }
                      Restaurar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel title="Sobre backups" subtitle="">
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
          Esta tela lista arquivos com extensão <code style={{ color: 'var(--accent)' }}>.bkp*</code> dentro de <code style={{ color: 'var(--accent)' }}>/etc/bind</code>.
          A restauração sobrescreve o arquivo original (sem a extensão .bkp) com o conteúdo do backup.
          Após restaurar, use <strong>rndc reconfig</strong> na tela de Operações para recarregar as configurações.
        </p>
      </Panel>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
