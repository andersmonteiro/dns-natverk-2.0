import { useState, useEffect, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
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

const COLORS = ['#3b82f6','#22c55e','#eab308','#ef4444','#a855f7','#06b6d4','#f97316','#ec4899']

export default function Metrics() {
  const [range, setRange] = useState('24h')
  const [clients, setClients] = useState([])
  const [domains, setDomains] = useState([])

  const load = useCallback(async () => {
    try {
      const [c, d] = await Promise.all([
        api.topClients(range, 20),
        api.topDomains(range, 20),
      ])
      setClients(c)
      setDomains(d)
    } catch {}
  }, [range])

  const { tick } = useRefresh()

  useEffect(() => { load() }, [load])
  useEffect(() => { if (tick > 0) load() }, [tick])
  useInterval(load, 30_000)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Métricas</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <TimeRange value={range} onChange={setRange} />
          <RefreshBar />
        </div>
      </div>

      <Panel title="Top 20 Clientes por Volume" subtitle={`últimas ${range}`}>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={clients.map(c => ({ name: c.ip, count: c.count }))}
            layout="vertical" margin={{ left: 20, right: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
            <XAxis type="number" tickFormatter={fmt} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 11, fontFamily: 'monospace' }} tickLine={false} axisLine={false} width={130} />
            <Tooltip
              formatter={(v) => [fmt(v), 'queries']}
              contentStyle={{ background: 'var(--bg-panel-2)', border: '1px solid var(--border-2)', borderRadius: 6, fontSize: 12 }}
              cursor={{ fill: 'var(--bg-hover)' }}
            />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {clients.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      <Panel title="Top 20 Domínios Consultados" subtitle={`últimas ${range}`}>
        {domains.length === 0
          ? <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Sem dados</span>
          : <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {['#', 'Domínio', 'Consultas', 'Barra'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.5px', borderBottom: '1px solid var(--border)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {domains.map((d, i) => {
                    const max = domains[0]?.count || 1
                    const pct = Math.round(d.count / max * 100)
                    return (
                      <tr key={d.domain} style={{ borderBottom: '1px solid var(--border)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={{ padding: '8px 10px', color: 'var(--text-muted)', width: 32 }}>{i + 1}</td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 12 }}>{d.domain}</td>
                        <td style={{ padding: '8px 10px', color: 'var(--accent)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmt(d.count)}</td>
                        <td style={{ padding: '8px 10px', width: 200 }}>
                          <div style={{ height: 6, background: 'var(--bg-panel-2)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: COLORS[i % COLORS.length], borderRadius: 3, transition: 'width .3s' }} />
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
