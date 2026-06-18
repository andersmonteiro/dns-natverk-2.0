const RANGES = [
  { value: '1h',  label: '1h' },
  { value: '6h',  label: '6h' },
  { value: '12h', label: '12h' },
  { value: '24h', label: '24h' },
  { value: '7d',  label: '7d' },
  { value: '30d', label: '30d' },
]

export default function TimeRange({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 4, background: 'var(--bg-panel-2)', borderRadius: 'var(--r-md)', padding: 3, border: '1px solid var(--border)' }}>
      {RANGES.map(r => (
        <button
          key={r.value}
          onClick={() => onChange(r.value)}
          style={{
            padding: '4px 10px',
            borderRadius: 'var(--r-sm)',
            border: 'none',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
            background: value === r.value ? 'var(--accent)' : 'transparent',
            color: value === r.value ? '#fff' : 'var(--text-secondary)',
            transition: 'all .15s',
          }}
        >
          {r.label}
        </button>
      ))}
    </div>
  )
}
