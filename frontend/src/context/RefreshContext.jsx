import { createContext, useContext, useEffect, useRef, useState } from 'react'

const RefreshContext = createContext()

// Intervalos disponíveis em segundos (0 = desligado)
export const INTERVALS = [
  { label: 'Off',  value: 0   },
  { label: '5s',   value: 5   },
  { label: '10s',  value: 10  },
  { label: '30s',  value: 30  },
  { label: '1m',   value: 60  },
  { label: '5m',   value: 300 },
]

export function RefreshProvider({ children }) {
  const [interval, setInterval_] = useState(0)   // segundos
  const [tick, setTick]          = useState(0)   // incrementa a cada ciclo
  const [countdown, setCountdown] = useState(0)  // segundos restantes

  const timerRef    = useRef(null)
  const countRef    = useRef(null)

  // Limpa todos os timers
  function clearAll() {
    clearInterval(timerRef.current)
    clearInterval(countRef.current)
  }

  useEffect(() => {
    clearAll()
    if (interval === 0) {
      setCountdown(0)
      return
    }

    setCountdown(interval)

    // Tick principal
    timerRef.current = setInterval(() => {
      setTick(t => t + 1)
      setCountdown(interval)
    }, interval * 1000)

    // Countdown segundo a segundo
    countRef.current = setInterval(() => {
      setCountdown(c => Math.max(0, c - 1))
    }, 1000)

    return clearAll
  }, [interval])

  function manualRefresh() {
    setTick(t => t + 1)
    if (interval > 0) setCountdown(interval)
  }

  return (
    <RefreshContext.Provider value={{ interval, setInterval: setInterval_, tick, countdown, manualRefresh }}>
      {children}
    </RefreshContext.Provider>
  )
}

export const useRefresh = () => useContext(RefreshContext)
