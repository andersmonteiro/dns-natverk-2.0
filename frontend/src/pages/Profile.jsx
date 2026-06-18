import { useState, useEffect } from 'react'
import { UserCircle, KeyRound, Loader, CheckCircle, XCircle } from 'lucide-react'
import { api } from '../api'
import Panel from '../components/Panel'

export default function Profile() {
  const [me, setMe] = useState(null)
  const [current, setCurrent] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState(null) // { ok, msg }

  useEffect(() => {
    api.me().then(setMe).catch(console.error)
  }, [])

  async function changePassword(e) {
    e.preventDefault()
    if (newPw !== confirm) {
      setResult({ ok: false, msg: 'As senhas não coincidem' })
      return
    }
    setSaving(true)
    setResult(null)
    try {
      await api.changePassword(current, newPw)
      setResult({ ok: true, msg: 'Senha alterada com sucesso!' })
      setCurrent('')
      setNewPw('')
      setConfirm('')
    } catch (e) {
      setResult({ ok: false, msg: e.message })
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = {
    background: 'var(--bg-canvas)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-sm)',
    color: 'var(--text-primary)',
    padding: '9px 12px',
    fontSize: 13,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  }

  const roleBadgeStyle = {
    admin:    { color: 'var(--red)',    bg: 'var(--red-dim)'    },
    operator: { color: 'var(--orange)', bg: 'var(--orange-dim)' },
    viewer:   { color: 'var(--green)',  bg: 'var(--green-dim)'  },
  }

  const rStyle = me ? (roleBadgeStyle[me.role] || {}) : {}

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
        <UserCircle size={20} color="var(--accent)" /> Perfil
      </h1>

      <Panel title="Informações da conta">
        {me ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                background: 'var(--accent-dim)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <UserCircle size={32} color="var(--accent)" />
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{me.username}</div>
                <span style={{
                  marginTop: 4, display: 'inline-block',
                  padding: '2px 9px', borderRadius: 4,
                  color: rStyle.color, background: rStyle.bg,
                  border: `1px solid ${rStyle.color || 'var(--border)'}`,
                  fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                }}>{me.role}</span>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Carregando…</div>
        )}
      </Panel>

      <Panel title="Alterar senha">
        <form onSubmit={changePassword} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>Senha atual</label>
            <input
              type="password"
              value={current}
              onChange={e => setCurrent(e.target.value)}
              required
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>Nova senha</label>
            <input
              type="password"
              value={newPw}
              onChange={e => setNewPw(e.target.value)}
              required
              minLength={6}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>Confirmar nova senha</label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              style={inputStyle}
            />
          </div>

          {result && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '9px 12px',
              background: result.ok ? 'var(--green-dim)' : 'var(--red-dim)',
              border: `1px solid ${result.ok ? 'var(--green)' : 'var(--red)'}`,
              borderRadius: 'var(--r-sm)',
              color: result.ok ? 'var(--green)' : 'var(--red)',
              fontSize: 13,
            }}>
              {result.ok ? <CheckCircle size={15} /> : <XCircle size={15} />}
              {result.msg}
            </div>
          )}

          <button type="submit" disabled={saving} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '10px', background: 'var(--accent)',
            border: 'none', borderRadius: 'var(--r-sm)',
            color: '#fff', fontSize: 13, fontWeight: 600,
            cursor: saving ? 'not-allowed' : 'pointer',
          }}>
            {saving ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <KeyRound size={14} />}
            Alterar senha
          </button>
        </form>
      </Panel>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
