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
      .catch(() => setUser(null))
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
  const { user } = useContext(UserContext) || {}
  return user?.role === 'admin'
}
