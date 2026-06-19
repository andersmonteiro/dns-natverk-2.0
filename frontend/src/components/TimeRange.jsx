import { useRef, useState, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'

const RANGES = [
  { value: '1h',  label: '1h'  },
  { value: '3h',  label: '3h'  },
  { value: '6h',  label: '6h'  },
  { value: '12h', label: '12h' },
  { value: '24h', label: '24h' },
  { value: '7d',  label: '7d'  },
  { value: '30d', label: '30d' },
]

export default function TimeRange({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const current = RANGES.find(r => r.value === value) || RANGES[0]

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 12px',
          background: 'var(--bg-panel-2)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-sm)',
          color: 'var(--accent)',
          cursor: 'pointer', fontSize: 12, fontWeight: 700,
        }}
      >
        {current.label}
        <ChevronDown size={12} style={{ color: 'var(--text-muted)', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: '.15s' }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '110%', right: 0,
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)',
          boxShadow: '0 8px 24px rgba(0,0,0,.3)',
          zIndex: 100, minWidth: 80, overflow: 'hidden',
        }}>
          {RANGES.map(r => (
            <button
              key={r.value}
              onClick={() => { onChange(r.value); setOpen(false) }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '8px 16px', background: 'transparent',
                border: 'none', cursor: 'pointer', fontSize: 13,
                color: r.value === value ? 'var(--accent)' : 'var(--text-secondary)',
                fontWeight: r.value === value ? 700 : 400,
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-panel-2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
