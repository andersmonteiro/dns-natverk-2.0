import { useState, useEffect, useRef } from 'react'
import { FileText, RefreshCw, ArrowDown, Loader } from 'lucide-react'
import { api } from '../api'
import Panel from '../components/Panel'

const LINE_OPTIONS = [50, 100, 200, 500, 1000]

const LINE_COLORS = {
  error:   'var(--red)',
  warning: 'var(--orange)',
  queries: 'var(--text-primary)',
  client:  'var(--accent)',
  default: 'var(--text-secondary)',
}

function colorize(line) {
  const l = line.toLowerCase()
  if (l.includes('error')) return LINE_COLORS.error
  if (l.includes('warning')) return LINE_COLORS.warning
  if (l.includes('client')) return LINE_COLORS.client
  if (l.includes('queries')) return LINE_COLORS.queries
  return LINE_COLORS.default
}

export default function BindLog() {
  const [lines, setLines] = useState([])
  const [loading, setLoading] = useState(true)
  const [exists, setExists] = useState(true)
  const [linesCount, setLinesCount] = useState(200)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const bottomRef = useRef(null)
  const intervalRef = useRef(null)

  async function load() {
    try {
      const data = await api.bindlogTail(linesCount)
      setLines(data.lines || [])
      setExists(data.exists !== false)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [linesCount])

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(load, 5000)
    } else {
      clearInterval(intervalRef.current)
    }
    return () => clearInterval(intervalRef.current)
  }, [autoRefresh, linesCount])

  function scrollBottom() {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileText size={20} color="var(--accent)" /> Log do BIND (querylog)
        </h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select
            value={linesCount}
            onChange={e => setLinesCount(+e.target.value)}
            style={{
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-sm)',
              color: 'var(--text-primary)',
              padding: '6px 10px',
              fontSize: 12,
            }}
          >
            {LINE_OPTIONS.map(n => <option key={n} value={n}>{n} linhas</option>)}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />
            Auto (5s)
          </label>
          <button onClick={load} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 12px', background: 'transparent',
            border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
            color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer',
          }}>
            <RefreshCw size={13} /> Atualizar
          </button>
          <button onClick={scrollBottom} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 12px', background: 'transparent',
            border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
            color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer',
          }}>
            <ArrowDown size={13} /> Final
          </button>
        </div>
      </div>

      {!exists && (
        <div style={{
          padding: '12px 16px',
          background: 'var(--orange-dim)',
          border: '1px solid var(--orange)',
          borderRadius: 'var(--r-sm)',
          color: 'var(--orange)',
          fontSize: 13,
        }}>
          Arquivo de log não encontrado. Verifique se o querylog está ativo e se o volume está montado corretamente.
        </div>
      )}

      <Panel
        title="Saída do querylog"
        subtitle={`${lines.length} linhas${autoRefresh ? ' • Auto-refresh ativo' : ''}`}
      >
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
            <Loader size={20} style={{ animation: 'spin 1s linear infinite' }} />
          </div>
        ) : (
          <div style={{
            height: 520,
            overflowY: 'auto',
            fontFamily: 'monospace',
            fontSize: 11.5,
            lineHeight: 1.6,
            background: 'var(--bg-canvas)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-sm)',
            padding: '10px 12px',
          }}>
            {lines.length === 0 ? (
              <span style={{ color: 'var(--text-muted)' }}>Sem linhas para exibir.</span>
            ) : (
              lines.map((line, i) => (
                <div key={i} style={{ color: colorize(line), padding: '0 2px' }}>
                  {line}
                </div>
              ))
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </Panel>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
