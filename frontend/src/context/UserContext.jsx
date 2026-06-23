import { createContext, useContext, useState, useEffect } from 'react'
import { api } from '../api'

const UserContext = createContext(null)

export function UserProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('dns_panel_token')
    if (!token) { setLoading(false); return }
    api.me()
      .then(data => setUser(data))
      .catch(e => { console.warn('[UserContext] api.me() falhou:', e); setUser(null) })
      .finally(() => setLoading(false))
  }, [])

  return (
    <UserContext.Provider value={{ user, setUser, loading }}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  return useContext(UserContext)
}

export function useIsAdmin() {
  const ctx = useContext(UserContext) || {}
  // Enquanto carrega, não restringe nada — o backend é quem enforça permissões
  if (ctx.loading !== false) return true
  return ctx.user?.role === 'admin'
}
