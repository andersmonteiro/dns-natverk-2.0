import { useState } from 'react'
import { Wrench, Play, Loader } from 'lucide-react'
import { api } from '../api'

const QTYPES = ['', 'A', 'AAAA', 'MX', 'NS', 'TXT', 'SOA', 'CNAME', 'PTR', 'SRV', 'CAA', 'ANY']

const TOOLS = [
  { id: 'nslookup',   label: 'NSLookup',   desc: 'Consulta DNS (forward e reverso)',    wide: false, hasType: true  },
  { id: 'ping',       label: 'Ping',        desc: 'Testa alcançabilidade ICMP',          wide: false, hasPing: true  },
  { id: 'traceroute', label: 'Traceroute',  desc: 'Rota completa até o destino',         wide: true                  },
  { id: 'mtr',        label: 'MTR',         desc: 'Ping + traceroute combinados',        wide: true                  },
  { id: 'whois',      label: 'Whois',       desc: 'Informações de registro do domínio',  wide: true                  },
]

const inputStyle = {
  background: 'var(--bg-canvas)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-sm)',
  color: 'var(--text-primary)',
  padding: '8px 10px',
  fontSize: 12,
  outline: 'none',
}

function ToolCard({ tool }) {
  const [host, setHost]     = useState('')
  const [rtype, setRtype]   = useState('')
  const [server, setServer] = useState('')
  const [count, setCount]   = useState(5)
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState(null)

  async function run(e) {
    e.preventDefault()
    if (!host.trim()) return
    setLoading(true)
    setResult(null)
    try {
      const res = await api[tool.id]({ host: host.trim(), rtype, server, count })
      setResult(res)
    } catch (err) {
      setResult({ ok: false, output: err.message })
    } finally {
      setLoading(false)
    }
  }

  const placeholder = tool.id === 'nslookup'
    ? 'domínio ou IP (ex: google.com ou 8.8.8.8)'
    : 'ex: google.com ou 8.8.8.8'

  return (
    <div style={{
      background: 'var(--bg-panel)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--r-md)',
      padding: 16,
    }}>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{tool.label}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{tool.desc}</div>
      </div>

      <form onSubmit={run} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={host}
          onChange={e => setHost(e.target.value)}
          placeholder={placeholder}
          required
          style={{ ...inputStyle, flex: '1 1 200px', minWidth: 160 }}
        />

        {tool.hasType && (
          <>
            <select value={rtype} onChange={e => setRtype(e.target.value)}
              title="Tipo de registro (opcional)"
              style={{ ...inputStyle, width: 90 }}>
              {QTYPES.map(t => <option key={t} value={t}>{t || 'Auto'}</option>)}
            </select>
            <input
              value={server}
              onChange={e => setServer(e.target.value)}
              placeholder="DNS (opcional)"
              style={{ ...inputStyle, width: 130 }}
            />
          </>
        )}

        {tool.hasPing && (
          <input type="number" value={count} onChange={e => setCount(+e.target.value)}
            min={1} max={20} title="Nº de pacotes"
            style={{ ...inputStyle, width: 60 }} />
        )}

        <button type="submit" disabled={loading} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 14px',
          background: loading ? 'var(--accent-dim)' : 'var(--accent)',
          border: 'none', borderRadius: 'var(--r-sm)',
          color: '#fff', fontSize: 12, fontWeight: 600,
          cursor: loading ? 'not-allowed' : 'pointer',
          whiteSpace: 'nowrap',
        }}>
          {loading
            ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} />
            : <Play size={13} />}
          {loading ? 'Executando…' : 'Executar'}
        </button>
      </form>

      {result && (
        <pre style={{
          marginTop: 12,
          padding: '10px 12px',
          background: 'var(--bg-canvas)',
          border: `1px solid ${result.ok ? 'var(--border)' : 'var(--red-dim)'}`,
          borderRadius: 'var(--r-sm)',
          fontSize: 11.5,
          color: result.ok ? 'var(--text-primary)' : 'var(--red)',
          whiteSpace: 'pre',
          overflowX: 'auto',
          overflowY: 'auto',
          maxHeight: tool.wide ? 420 : 280,
          fontFamily: 'monospace',
          lineHeight: 1.55,
        }}>
          {result.output || '(sem saída)'}
        </pre>
      )}
    </div>
  )
}

export default function Tools() {
  const compact = TOOLS.filter(t => !t.wide)
  const wide    = TOOLS.filter(t => t.wide)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Wrench size={20} color="var(--accent)" /> Ferramentas de Diagnóstico
      </h1>

      {/* NSLookup + Ping — lado a lado */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 12 }}>
        {compact.map(t => <ToolCard key={t.id} tool={t} />)}
      </div>

      {/* Traceroute, MTR, Whois — largura total */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {wide.map(t => <ToolCard key={t.id} tool={t} />)}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
