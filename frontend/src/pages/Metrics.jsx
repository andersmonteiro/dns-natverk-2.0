import { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
  AreaChart, Area,
} from 'recharts'
import { api } from '../api'
import Panel from '../components/Panel'
import TimeRange from '../components/TimeRange'
import RefreshBar from '../components/RefreshBar'
import { useInterval } from '../hooks/useInterval'
import { useRefresh } from '../context/RefreshContext'

// ── helpers ────────────────────────────────────────────────────────────────────

function fmt(n) {
  if (n == null) return '—'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k'
  return String(n)
}

function bucketFor(range) {
  return { '1h': '5m', '3h': '15m', '6h': '15m', '12h': '1h', '24h': '1h', '7d': '6h', '30d': '1d' }[range] || '1h'
}

function fmtTs(ts, range) {
  const d = new Date(ts * 1000)
  if (['7d', '30d'].includes(range))
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

// ── cores ──────────────────────────────────────────────────────────────────────

const TYPE_COLORS = {
  A: '#3b82f6', AAAA: '#22c55e', HTTPS: '#eab308', NS: '#a855f7',
  MX: '#06b6d4', TXT: '#f97316', PTR: '#ec4899', CNAME: '#14b8a6',
  SOA: '#f43f5e', SRV: '#84cc16', ANY: '#64748b',
}
const FALLBACK = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444']

function typeColor(t, i) {
  return TYPE_COLORS[t] || FALLBACK[i % FALLBACK.length]
}

const TYPE_ORDER = ['A', 'AAAA', 'HTTPS', 'NS', 'MX', 'TXT', 'PTR', 'CNAME', 'SRV', 'ANY']
function sortTypes(types) {
  return [...types].sort((a, b) => {
    const ia = TYPE_ORDER.indexOf(a), ib = TYPE_ORDER.indexOf(b)
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib)
  })
}

const tooltipStyle = {
  background: 'var(--bg-panel-2)', border: '1px solid var(--border-2)',
  borderRadius: 6, fontSize: 12,
}

// ── componente principal ───────────────────────────────────────────────────────

export default function Metrics() {
  const [range, setRange]         = useState('1h')
  const [clients, setClients]     = useState([])
  const [domains, setDomains]     = useState([])
  const [qtypeData, setQtypeData] = useState([])
  const [tsData, setTsData]       = useState([])
  const [hourData, setHourData]   = useState([])

  const load = useCallback(async () => {
    const bucket = bucketFor(range)
    const safe = (p) => p.catch(() => null)
    const [c, d, q, ts, hr] = await Promise.all([
      safe(api.topClientsByType(range, 20)),
      safe(api.topDomains(range, 20)),
      safe(api.qtypes(range)),
      safe(api.timeseriesByType(range, bucket)),
      safe(api.queriesByHour(range)),
    ])
    if (c) setClients(c)
    if (d) setDomains(d)
    if (q) setQtypeData(q)
    if (ts) setTsData(ts)
    if (hr) setHourData(hr)
  }, [range])

  const { tick } = useRefresh()
  useEffect(() => { load() }, [load])
  useEffect(() => { if (tick > 0) load() }, [tick])
  useInterval(load, 30_000)

  // tipos presentes nos dados de série temporal
  const tsTypes = sortTypes(
    [...new Set(tsData.flatMap(d => Object.keys(d).filter(k => k !== 'ts')))]
  )

  // tipos presentes nos dados de clientes (para barras empilhadas)
  const clientTypes = sortTypes(
    [...new Set(clients.flatMap(c => Object.keys(c).filter(k => k !== 'ip' && k !== 'total')))]
  )
  const clientChart = clients.map(c => ({
    name: c.ip,
    ...Object.fromEntries(clientTypes.map(t => [t, c[t] || 0])),
  }))

  // total de queries para % na tabela de domínios
  const totalDomainQueries = domains.reduce((s, d) => s + d.count, 0)

  // hora de pico
  const peakHour = hourData.reduce((best, h) => h.count > (best?.count ?? 0) ? h : best, null)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Métricas</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <TimeRange value={range} onChange={setRange} />
          <RefreshBar />
        </div>
      </div>

      {/* ── Linha 1: Série temporal por tipo (full width) ── */}
      <Panel title="Consultas por Tipo ao Longo do Tempo" subtitle={`últimas ${range}`}>
        {tsData.length === 0
          ? <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Sem dados</span>
          : <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={tsData} margin={{ left: 0, right: 16, top: 4, bottom: 0 }}>
                <defs>
                  {tsTypes.map((t, i) => (
                    <linearGradient key={t} id={`grad-${t}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={typeColor(t, i)} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={typeColor(t, i)} stopOpacity={0.02} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="ts" tickFormatter={ts => fmtTs(ts, range)}
                  tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={fmt}
                  tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
                <Tooltip
                  labelFormatter={ts => fmtTs(ts, range)}
                  formatter={(v, name) => [fmt(v), name]}
                  contentStyle={tooltipStyle}
                />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 4 }} />
                {tsTypes.map((t, i) => (
                  <Area key={t} type="monotone" dataKey={t} stackId="s"
                    stroke={typeColor(t, i)} fill={`url(#grad-${t})`} strokeWidth={1.5} dot={false} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
        }
      </Panel>

      {/* ── Linha 2: Por hora + Top Tipos ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 16 }}>
        <Panel
          title="Distribuição por Hora do Dia"
          subtitle={peakHour ? `pico às ${peakHour.label} (${fmt(peakHour.count)} queries)` : `últimas ${range}`}
        >
          {hourData.length === 0 || hourData.every(h => h.count === 0)
            ? <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                Sem dados — use um range maior (24h ou mais) para ver a distribuição por hora
              </span>
            : <ResponsiveContainer width="100%" height={200}>
                <BarChart data={hourData} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label"
                    tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false}
                    interval={2} />
                  <YAxis tickFormatter={fmt}
                    tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} width={36} />
                  <Tooltip
                    formatter={(v) => [fmt(v), 'Queries']}
                    contentStyle={tooltipStyle}
                    cursor={{ fill: 'var(--bg-hover)' }}
                  />
                  <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                    {hourData.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={entry === peakHour ? '#3b82f6' : 'var(--accent-dim)'}
                        stroke={entry === peakHour ? '#3b82f6' : 'none'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
          }
        </Panel>

        <Panel title="Top Tipos de Query" subtitle={`últimas ${range}`}>
          {qtypeData.length === 0
            ? <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Sem dados</span>
            : <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={qtypeData} dataKey="count" nameKey="type"
                      cx="50%" cy="50%" innerRadius={45} outerRadius={72} paddingAngle={2}
                      label={({ type, percent }) => percent > 0.05 ? `${type}` : ''}
                      labelLine={false}
                    >
                      {qtypeData.map((entry, i) => (
                        <Cell key={entry.type} fill={typeColor(entry.type, i)} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v, name) => [fmt(v), name]} contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6 }}>
                  {qtypeData.map((entry, i) => {
                    const total = qtypeData.reduce((s, e) => s + e.count, 0)
                    const pct = total > 0 ? (entry.count / total * 100).toFixed(1) : 0
                    return (
                      <div key={entry.type} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12 }}>
                        <span style={{ width: 9, height: 9, borderRadius: 2, background: typeColor(entry.type, i), flexShrink: 0 }} />
                        <span style={{ flex: 1, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{entry.type}</span>
                        <span style={{ color: 'var(--text-muted)', minWidth: 36, textAlign: 'right' }}>{pct}%</span>
                        <span style={{ color: 'var(--accent)', minWidth: 38, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(entry.count)}</span>
                      </div>
                    )
                  })}
                </div>
              </>
          }
        </Panel>
      </div>

      {/* ── Linha 3: Top Clientes (compacto) ── */}
      <Panel title="Top 20 Clientes por Volume" subtitle={`últimas ${range}`}>
        {clients.length === 0
          ? <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Sem dados</span>
          : <ResponsiveContainer width="100%" height={Math.max(180, clients.length * 24 + 40)}>
              <BarChart data={clientChart} layout="vertical" margin={{ left: 0, right: 20, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tickFormatter={fmt}
                  tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name"
                  tick={{ fill: 'var(--text-secondary)', fontSize: 10, fontFamily: 'monospace' }}
                  tickLine={false} axisLine={false} width={125} />
                <Tooltip
                  formatter={(v, name) => [fmt(v), name]}
                  contentStyle={tooltipStyle}
                  cursor={{ fill: 'var(--bg-hover)' }}
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
                {clientTypes.map((t, i) => (
                  <Bar key={t} dataKey={t} stackId="s" fill={typeColor(t, i)}
                    radius={i === clientTypes.length - 1 ? [0, 3, 3, 0] : [0, 0, 0, 0]}
                    barSize={14}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
        }
      </Panel>

      {/* ── Linha 4: Top Domínios ── */}
      <Panel title="Top 20 Domínios Consultados" subtitle={`últimas ${range}`}>
        {domains.length === 0
          ? <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Sem dados</span>
          : <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {['#', 'Domínio', 'Consultas', '% do total'].map(h => (
                      <th key={h} style={{
                        textAlign: h === 'Consultas' || h === '% do total' ? 'right' : 'left',
                        padding: '8px 10px',
                        color: 'var(--text-muted)', fontWeight: 600, fontSize: 11,
                        textTransform: 'uppercase', letterSpacing: '.5px',
                        borderBottom: '1px solid var(--border)',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {domains.map((d, i) => {
                    const pct = totalDomainQueries > 0 ? (d.count / totalDomainQueries * 100) : 0
                    return (
                      <tr key={d.domain} style={{ borderBottom: '1px solid var(--border)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={{ padding: '7px 10px', color: 'var(--text-muted)', width: 32 }}>{i + 1}</td>
                        <td style={{ padding: '7px 10px', color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 12 }}>{d.domain}</td>
                        <td style={{ padding: '7px 10px', color: 'var(--accent)', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{fmt(d.count)}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', minWidth: 90 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                            <div style={{ width: 60, height: 4, background: 'var(--bg-panel-2)', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ width: `${Math.round(pct)}%`, height: '100%', background: 'var(--accent)', borderRadius: 2 }} />
                            </div>
                            <span style={{ color: 'var(--text-muted)', fontSize: 11, minWidth: 34, textAlign: 'right' }}>{pct.toFixed(1)}%</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
        }
      </Panel>
    </div>
  )
}
