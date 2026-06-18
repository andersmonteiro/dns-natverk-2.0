import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, setToken } from '../api'

export default function Login() {
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await api.login(user, pass)
      setToken(data.access_token)
      navigate('/dashboard')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    background: 'var(--bg-panel-2)',
    border: '1px solid var(--border-2)',
    borderRadius: 'var(--r-md)',
    color: 'var(--text-primary)',
    fontSize: 14,
    outline: 'none',
    transition: 'border-color .15s',
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-canvas)',
    }}>
      <div style={{ width: 360 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img
            src="/natverk_icon.svg"
            alt="Nätverk"
            style={{ height: 72, width: 'auto', marginBottom: 20 }}
          />
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>DNS Panel</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>BIND9 Management Interface</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-lg)',
          padding: 28,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>Usuário</label>
            <input
              type="text"
              value={user}
              onChange={e => setUser(e.target.value)}
              style={inputStyle}
              placeholder="admin"
              autoFocus
              required
              onFocus={e => e.target.style.borderColor = 'var(--accent)'}
              onBlur={e => e.target.style.borderColor = 'var(--border-2)'}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>Senha</label>
            <input
              type="password"
              value={pass}
              onChange={e => setPass(e.target.value)}
              style={inputStyle}
              required
              onFocus={e => e.target.style.borderColor = 'var(--accent)'}
              onBlur={e => e.target.style.borderColor = 'var(--border-2)'}
            />
          </div>

          {error && (
            <div style={{
              padding: '8px 12px',
              background: 'var(--red-dim)',
              border: '1px solid var(--red)',
              borderRadius: 'var(--r-sm)',
              color: 'var(--red)',
              fontSize: 13,
            }}>{error}</div>
          )}

          <button type="submit" disabled={loading} style={{
            padding: '10px',
            background: loading ? 'var(--accent-dim)' : 'var(--accent)',
            color: '#fff',
            border: 'none',
            borderRadius: 'var(--r-md)',
            fontWeight: 600,
            fontSize: 14,
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'background .15s',
          }}>
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
