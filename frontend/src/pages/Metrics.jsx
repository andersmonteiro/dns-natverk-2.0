import { useState, useEffect, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts'
import { api } from '../api'
import Panel from '../components/Panel'
import TimeRange from '../components/TimeRange'
import RefreshBar from '../components/RefreshBar'
import { useInterval } from '../hooks/useInterval'
import { useRefresh } from '../context/RefreshContext'

function fmt(n) {
  if (n == null) return '—'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k'
  return String(n)
}

const TYPE_COLORS = {
  A:       '#3b82f6',
  AAAA:    '#22c55e',
  HTTPS:   '#eab308',
  NS:      '#a855f7',
  MX:      '#06b6d4',
  TXT:     '#f97316',
  PTR:     '#ec4899',
  CNAME:   '#14b8a6',
  SOA:     '#f43f5e',
  SRV:     '#84cc16',
  ANY:     '#64748b',
}
const FALLBACK_COLORS = ['#6366f1','#0ea5e9','#10b981','#f59e0b','#ef4444']

function typeColor(t, idx) {
  return TYPE_COLORS[t] || FALLBACK_COLORS[idx % FALLBACK_COLORS.length]
}

const DOMAIN_COLORS = ['#3b82f6','#22c55e','#eab308','#ef4444','#a855f7','#06b6d4','#f97316','#ec4899']

export default function Metrics() {
  const [range, setRange]     = useState('1h')
  const [clients, setClients] = useState([])
  const [domains, setDomains] = useState([])
  const [qtypeData, setQtypeData] = useState([])

  const load = useCallback(async () => {
    try {
      const [c, d, q] = await Promise.all([
        api.topClientsByType(range, 20),
        api.topDomains(range, 20),
        api.qtypes(range),
      ])
      setClients(c)
      setDomains(d)
      setQtypeData(q)
    } catch {}
  }, [range])

  const { tick } = useRefresh()
  useEffect(() => { load() }, [load])
  useEffect(() => { if (tick > 0) load() }, [tick])
  useInterval(load, 30_000)

  // Tipos presentes nos dados (para empilhar as barras)
  const qtypes = [...new Set(clients.flatMap(c => Object.keys(c).filter(k => k !== 'ip' && k !== 'total')))]
    .sort((a, b) => {
      const order = ['A','AAAA','HTTPS','NS','MX','TXT','PTR','CNAME','SRV','ANY']
      return (order.indexOf(a) + 999) % 999 - (order.indexOf(b) + 999) % 999
    })

  const chartData = clients.map(c => ({ name: c.ip, ...Object.fromEntries(qtypes.map(t => [t, c[t] || 0])) }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Métricas</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <TimeRange value={range} onChange={setRange} />
          <RefreshBar />
        </div>
      </div>

      {/* Top Clientes + Top Tipos — lado a lado */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, alignItems: 'start' }}>
        <Panel title="Top 20 Clientes por Volume" subtitle={`últimas ${range}`}>
          {clients.length === 0
            ? <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Sem dados</span>
            : <ResponsiveContainer width="100%" height={Math.max(220, clients.length * 36)}>
                <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 20, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" tickFormatter={fmt}
                    tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                    tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name"
                    tick={{ fill: 'var(--text-secondary)', fontSize: 11, fontFamily: 'monospace' }}
                    tickLine={false} axisLine={false} width={130} />
                  <Tooltip
                    formatter={(v, name) => [fmt(v), name]}
                    contentStyle={{ background: 'var(--bg-panel-2)', border: '1px solid var(--border-2)', borderRadius: 6, fontSize: 12 }}
                    cursor={{ fill: 'var(--bg-hover)' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  {qtypes.map((t, i) => (
                    <Bar key={t} dataKey={t} stackId="s" fill={typeColor(t, i)}
                      radius={i === qtypes.length - 1 ? [0, 4, 4, 0] : [0, 0, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
          }
        </Panel>

        <Panel title="Top Tipos de Query" subtitle={`últimas ${range}`}>
          {qtypeData.length === 0
            ? <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Sem dados</span>
            : <>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={qtypeData}
                      dataKey="count"
                      nameKey="type"
                      cx="50%" cy="50%"
                      innerRadius={55}
                      outerRadius={95}
                      paddingAngle={2}
                      label={({ type, percent }) => percent > 0.04 ? `${type} ${(percent * 100).toFixed(0)}%` : ''}
                      labelLine={false}
                    >
                      {qtypeData.map((entry, i) => (
                        <Cell key={entry.type} fill={typeColor(entry.type, i)} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v, name) => [fmt(v), name]}
                      contentStyle={{ background: 'var(--bg-panel-2)', border: '1px solid var(--border-2)', borderRadius: 6, fontSize: 12 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                  {qtypeData.map((entry, i) => {
                    const total = qtypeData.reduce((s, e) => s + e.count, 0)
                    const pct = total > 0 ? (entry.count / total * 100).toFixed(1) : 0
                    return (
                      <div key={entry.type} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 2, background: typeColor(entry.type, i), flexShrink: 0 }} />
                        <span style={{ flex: 1, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{entry.type}</span>
                        <span style={{ color: 'var(--text-muted)' }}>{pct}%</span>
                        <span style={{ color: 'var(--accent)', minWidth: 40, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(entry.count)}</span>
                      </div>
                    )
                  })}
                </div>
              </>
          }
        </Panel>
      </div>

      {/* Top Domínios */}
      <Panel title="Top 20 Domínios Consultados" subtitle={`últimas ${range}`}>
        {domains.length === 0
          ? <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Sem dados</span>
          : <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {['#', 'Domínio', 'Consultas'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.5px', borderBottom: '1px solid var(--border)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {domains.map((d, i) => {
                    return (
                      <tr key={d.domain} style={{ borderBottom: '1px solid var(--border)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={{ padding: '8px 10px', color: 'var(--text-muted)', width: 32 }}>{i + 1}</td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 12 }}>{d.domain}</td>
                        <td style={{ padding: '8px 10px', color: 'var(--accent)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmt(d.count)}</td>
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
