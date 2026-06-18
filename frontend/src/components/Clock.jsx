import { useState, useEffect } from 'react'

export default function Clock() {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <span style={{
      fontVariantNumeric: 'tabular-nums',
      fontSize: 13,
      color: 'var(--text-secondary)',
      background: 'var(--bg-panel-2)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--r-sm)',
      padding: '4px 10px',
      letterSpacing: '.3px',
    }}>
      {time.toLocaleTimeString('pt-BR')}
    </span>
  )
}
