import { useState, useEffect, useCallback } from 'react'
import { Cpu, HardDrive, MemoryStick, Wifi, Activity, Users, Globe, CheckCircle, XCircle } from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, PieChart, Pie, Legend,
} from 'recharts'
import { api } from '../api'
import Panel, { StatCard } from '../components/Panel'
import TimeRange from '../components/TimeRange'
import { useInterval } from '../hooks/useInterval'
import { useRefresh } from '../context/RefreshContext'

function fmt(n) {
  if (n == null) return '—'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k'
  return String(n)
}

function fmtTs(ts) {
  return new Date(ts * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function fmtUptime(secs) {
  if (!secs) return '—'
  const d = Math.floor(secs / 86400)
  const h = Math.floor((secs % 86400) / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

const PIE_COLORS = ['#3b82f6','#22c55e','#eab308','#ef4444','#a855f7','#06b6d4','#f97316']

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--bg-panel-2)', border: '1px solid var(--border-2)', borderRadius: 6, padding: '8px 12px', fontSize: 12 }}>
      <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.color || 'var(--text-primary)' }}>
          {fmt(p.value)} queries
        </div>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const [range, setRange] = useState('24h')
  const [sys, setSys] = useState(null)
  const [ts, setTs] = useState([])
  const [clients, setClients] = useState([])
  const [domains, setDomains] = useState([])
  const [qtypes, setQtypes] = useState([])
  const [total, setTotal] = useState(null)
  const [unique, setUnique] = useState(null)

  const loadSystem = useCallback(async () => {
    try { setSys(await api.system()) } catch {}
  }, [])

  const loadMetrics = useCallback(async () => {
    try {
      const bucket = range === '1h' ? '5m' : range === '6h' ? '15m' : '1h'
      const [t, c, d, q, tot, u] = await Promise.all([
        api.timeseries(range, bucket),
        api.topClients(range, 8),
        api.topDomains(range, 10),
        api.qtypes(range),
        api.total(range),
        api.uniqueClients(range),
      ])
      setTs(t); setClients(c); setDomains(d); setQtypes(q)
      setTotal(tot.total); setUnique(u.count)
    } catch {}
  }, [range])

  const { tick } = useRefresh()

  useEffect(() => { loadSystem(); loadMetrics() }, [loadSystem, loadMetrics])
  useEffect(() => { if (tick > 0) { loadSystem(); loadMetrics() } }, [tick])
  useInterval(loadSystem, 10_000)
  useInterval(loadMetrics, 30_000)

  const bind = sys?.bind
  const system = sys?.system
  const host = sys?.host
  const collector = sys?.collector

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>Dashboard</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 2 }}>
            {host?.fqdn || host?.hostname || 'Carregando…'} · BIND {bind?.version || '—'}
          </p>
        </div>
        <TimeRange value={range} onChange={r => { setRange(r); }} />
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <StatCard label="BIND" icon={Activity}
          value={bind?.active ? 'Online' : 'Offline'}
          sub={`uptime ${fmtUptime(bind?.uptime_secs)}`}
          color={bind?.active ? 'var(--green)' : 'var(--red)'}
        />
        <StatCard label="CPU" icon={Cpu}
          value={system ? `${system.cpu_pct}%` : '—'}
          sub={`load ${system?.load_1m ?? '—'}`}
        />
        <StatCard label="Memória" icon={MemoryStick}
          value={system ? `${system.mem_pct}%` : '—'}
          sub={system ? `${system.mem_used_mb} / ${system.mem_total_mb} MB` : '—'}
        />
        <StatCard label="Disco /" icon={HardDrive}
          value={system ? `${system.disk_pct_root}%` : '—'}
        />
        <StatCard label="Queries" icon={Globe}
          value={fmt(total)}
          sub={`últimas ${range}`}
          color="var(--accent)"
        />
        <StatCard label="Clientes únicos" icon={Users}
          value={unique ?? '—'}
          sub={`últimas ${range}`}
        />
      </div>

      {/* Gráfico de séries temporais */}
      <Panel title="Consultas DNS" subtitle={`Janela: ${range}`}>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={ts} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="qGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="ts" tickFormatter={fmtTs} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis tickFormatter={fmt} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} width={45} />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} fill="url(#qGrad)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </Panel>

      {/* Top clientes + tipos */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Panel title="Top Clientes" subtitle={`últimas ${range}`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {clients.length === 0
              ? <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Sem dados</span>
              : clients.map((c, i) => {
                  const max = clients[0]?.count || 1
                  const pct = Math.round(c.count / max * 100)
                  return (
                    <div key={c.ip}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
                        <span style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{c.ip}</span>
                        <span style={{ color: 'var(--text-muted)' }}>{fmt(c.count)}</span>
                      </div>
                      <div style={{ height: 4, background: 'var(--bg-panel-2)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: PIE_COLORS[i % PIE_COLORS.length], borderRadius: 2, transition: 'width .3s' }} />
                      </div>
                    </div>
                  )
                })
            }
          </div>
        </Panel>

        <Panel title="Tipos de Query" subtitle={`últimas ${range}`}>
          {qtypes.length === 0
            ? <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Sem dados</span>
            : <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={qtypes.map(q => ({ name: q.type, value: q.count }))}
                    dataKey="value" nameKey="name"
                    cx="50%" cy="50%" outerRadius={70}
                    stroke="none"
                  >
                    {qtypes.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Legend iconType="circle" iconSize={8}
                    formatter={(v) => <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{v}</span>}
                  />
                  <Tooltip
                    formatter={(v) => [fmt(v), 'queries']}
                    contentStyle={{ background: 'var(--bg-panel-2)', border: '1px solid var(--border-2)', borderRadius: 6, fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
          }
        </Panel>
      </div>

      {/* Top domínios */}
      <Panel title="Top Domínios" subtitle={`últimas ${range} · top 10`}>
        {domains.length === 0
          ? <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Sem dados — verifique se o querylog está ativo</span>
          : <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {['#', 'Domínio', 'Consultas'].map(h => (
                      <th key={h} style={{ textAlign: h === 'Consultas' ? 'right' : 'left', padding: '8px 10px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.5px', borderBottom: '1px solid var(--border)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {domains.map((d, i) => (
                    <tr key={d.domain} style={{ borderBottom: '1px solid var(--border)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '8px 10px', color: 'var(--text-muted)', width: 32 }}>{i + 1}</td>
                      <td style={{ padding: '8px 10px', color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 12 }}>{d.domain}</td>
                      <td style={{ padding: '8px 10px', color: 'var(--accent)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(d.count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        }
      </Panel>

      {/* Saúde da coleta */}
      {collector && (
        <Panel title="Saúde da Coleta" subtitle="Coletor de querylog">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            {[
              { label: 'Status', value: collector.running ? 'Ativo' : 'Parado', color: collector.running ? 'var(--green)' : 'var(--red)' },
              { label: 'Eventos coletados', value: fmt(collector.events_total) },
              { label: 'Eventos perdidos', value: fmt(collector.events_dropped), color: collector.events_dropped > 0 ? 'var(--yellow)' : undefined },
              { label: 'Buffer atual', value: collector.buffer_size },
            ].map(item => (
              <div key={item.label} style={{ background: 'var(--bg-panel-2)', borderRadius: 'var(--r-md)', padding: '12px 14px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>{item.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: item.color || 'var(--text-primary)' }}>{item.value ?? '—'}</div>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  )
}
