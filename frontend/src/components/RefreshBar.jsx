import { useRef, useState, useEffect } from 'react'
import { RefreshCw, ChevronDown } from 'lucide-react'
import { useRefresh, INTERVALS } from '../context/RefreshContext'

export default function RefreshBar() {
  const { interval, setInterval, countdown, manualRefresh } = useRefresh()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const current = INTERVALS.find(i => i.value === interval) || INTERVALS[0]
  const pct = interval > 0 ? ((interval - countdown) / interval) * 100 : 0

  return (
    <div ref={ref} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      {/* Botão Refresh */}
      <button
        onClick={manualRefresh}
        title="Atualizar agora"
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 10px',
          background: 'var(--bg-panel-2)',
          border: '1px solid var(--border)',
          borderRight: 'none',
          borderRadius: 'var(--r-sm) 0 0 var(--r-sm)',
          color: 'var(--text-secondary)',
          cursor: 'pointer', fontSize: 12,
          position: 'relative', overflow: 'hidden',
        }}
      >
        <RefreshCw size={13} />
        {interval > 0 && (
          <span style={{ color: 'var(--accent)', fontWeight: 600, minWidth: 24, textAlign: 'right' }}>
            {countdown}s
          </span>
        )}
        {interval > 0 && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0,
            height: 2, width: `${pct}%`,
            background: 'var(--accent)',
            transition: 'width 1s linear',
          }} />
        )}
      </button>

      {/* Seletor de intervalo */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '6px 8px',
          background: 'var(--bg-panel-2)',
          border: '1px solid var(--border)',
          borderRadius: '0 var(--r-sm) var(--r-sm) 0',
          color: 'var(--text-secondary)',
          cursor: 'pointer', fontSize: 12,
        }}
      >
        {current.label} <ChevronDown size={12} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '110%', right: 0,
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)',
          boxShadow: '0 8px 24px rgba(0,0,0,.3)',
          zIndex: 100, minWidth: 100, overflow: 'hidden',
        }}>
          {INTERVALS.map(opt => (
            <button
              key={opt.value}
              onClick={() => { setInterval(opt.value); setOpen(false) }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '8px 14px', background: 'transparent',
                border: 'none', cursor: 'pointer', fontSize: 13,
                color: opt.value === interval ? 'var(--accent)' : 'var(--text-secondary)',
                fontWeight: opt.value === interval ? 700 : 400,
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-panel-2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
