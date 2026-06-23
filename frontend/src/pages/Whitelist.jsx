import { useState, useEffect } from 'react'
import { ShieldCheck, Plus, Trash2, Loader, ChevronDown, ChevronRight, CheckCircle2, Sparkles } from 'lucide-react'
import { api } from '../api'
import Panel from '../components/Panel'
import { useIsAdmin } from '../context/UserContext'

// ── Agrupamento de sugestões por categoria ──────────────────────────────────

function groupDefaults(items) {
  const groups = [
    { key: 'tld',   label: 'TLDs Protegidos',     test: r => /TLD/.test(r) },
    { key: 'gov',   label: 'Governo Brasileiro',   test: r => /Federal|Governo|Tribunal|Banco|Caixa|Pol[íi]cia|Minist[ée]rio|Anatel|SERPRO|Social|Fiscal|Receita|Portal|Previd[êe]ncia/.test(r) },
    { key: 'goog',  label: 'Google',               test: r => /Google|Gmail|YouTube|Chromium/.test(r) },
    { key: 'msft',  label: 'Microsoft',            test: r => /Microsoft|Windows|Azure|Outlook|Hotmail|Skype|Teams|SharePoint|OneDrive|Live/.test(r) },
    { key: 'apple', label: 'Apple',                test: r => /Apple|iCloud|App Store/.test(r) },
    { key: 'meta',  label: 'Meta / WhatsApp',      test: r => /WhatsApp|Facebook|Instagram/.test(r) },
    { key: 'cf',    label: 'Cloudflare',           test: r => /Cloudflare/.test(r) },
    { key: 'cdn',   label: 'Infraestrutura / CDN', test: r => /Amazon|AWS|Fastly|Akamai/.test(r) },
    { key: 'pki',   label: 'Certificados / PKI',   test: r => /\bCA\b|OCSP|CRL|Encrypt|DigiCert|VeriSign|Sectigo/.test(r) },
    { key: 'ntp',   label: 'NTP / Sincronismo',    test: r => /NTP|Time/.test(r) },
  ]
  const result = groups.map(g => ({ ...g, items: [] }))
  const other = { key: 'other', label: 'Outros', items: [] }
  for (const item of items) {
    const grp = result.find(g => g.test(item.reason || ''))
    if (grp) grp.items.push(item)
    else other.items.push(item)
  }
  if (other.items.length) result.push(other)
  return result.filter(g => g.items.length > 0)
}

// ── Painel de sugestões padrão ──────────────────────────────────────────────

function DefaultsPanel({ onAdded }) {
  const [defaults, setDefaults] = useState([])
  const [loadingDef, setLoadingDef] = useState(true)
  const [adding, setAdding] = useState({})
  const [collapsed, setCollapsed] = useState({})

  async function loadDefaults() {
    try {
      const data = await api.whitelistDefaults()
      setDefaults(Array.isArray(data) ? data : [])
    } catch { /* ignore */ }
    finally { setLoadingDef(false) }
  }

  useEffect(() => { loadDefaults() }, [])

  async function addOne(domain) {
    setAdding(a => ({ ...a, [domain]: true }))
    try {
      await api.whitelistSeed([domain])
      setDefaults(prev => prev.map(d => d.domain === domain ? { ...d, already_added: true } : d))
      onAdded?.()
    } catch { /* ignore */ }
    finally { setAdding(a => { const n = { ...a }; delete n[domain]; return n }) }
  }

  async function addAll() {
    const pending = defaults.filter(d => !d.already_added).map(d => d.domain)
    if (!pending.length) return
    const lmap = {}
    pending.forEach(d => { lmap[d] = true })
    setAdding(lmap)
    try {
      await api.whitelistSeed(pending)
      setDefaults(prev => prev.map(d => ({ ...d, already_added: true })))
      onAdded?.()
    } catch { /* ignore */ }
    finally { setAdding({}) }
  }

  const groups = groupDefaults(defaults)
  const total = defaults.length
  const added = defaults.filter(d => d.already_added).length
  const pending = total - added
  const anyLoading = Object.keys(adding).length > 0

  if (loadingDef) return (
    <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Carregando sugestões…
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Resumo + botão bulk */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          <strong style={{ color: 'var(--green)' }}>{added}</strong> de <strong>{total}</strong> sugestões na whitelist
          {pending > 0 && <span style={{ color: 'var(--text-muted)' }}> · {pending} pendente{pending !== 1 ? 's' : ''}</span>}
        </span>
        {pending > 0 && (
          <button
            onClick={addAll}
            disabled={anyLoading}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px',
              background: 'var(--green)',
              border: 'none', borderRadius: 'var(--r-sm)',
              color: '#fff', fontSize: 12, fontWeight: 600,
              cursor: anyLoading ? 'not-allowed' : 'pointer',
              opacity: anyLoading ? 0.7 : 1,
            }}
          >
            {anyLoading ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={12} />}
            Adicionar todos ({pending})
          </button>
        )}
      </div>

      {/* Grupos colapsáveis */}
      {groups.map(group => {
        const isOpen = !collapsed[group.key]
        const groupAdded = group.items.filter(i => i.already_added).length
        const allDone = groupAdded === group.items.length
        return (
          <div key={group.key} style={{ border: '1px solid var(--border-dim)', borderRadius: 'var(--r-sm)', overflow: 'hidden' }}>
            <button
              onClick={() => setCollapsed(c => ({ ...c, [group.key]: !c[group.key] }))}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px',
                background: 'var(--bg-panel-2)',
                border: 'none', cursor: 'pointer',
                color: 'var(--text-primary)', fontSize: 13, fontWeight: 600,
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                {group.label}
              </span>
              <span style={{ fontSize: 11, fontWeight: 400, color: allDone ? 'var(--green)' : 'var(--text-muted)' }}>
                {groupAdded}/{group.items.length}{allDone ? ' ✓' : ''}
              </span>
            </button>
            {isOpen && (
              <div>
                {group.items.map((item, idx) => (
                  <div
                    key={item.domain}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '7px 12px',
                      borderTop: '1px solid var(--border-dim)',
                      background: idx % 2 !== 0 ? 'var(--bg-panel-2)' : 'transparent',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontFamily: 'monospace', color: item.already_added ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                        {item.domain}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.reason}</span>
                    </div>
                    {item.already_added ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--green)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        <CheckCircle2 size={12} /> Adicionado
                      </span>
                    ) : (
                      <button
                        onClick={() => addOne(item.domain)}
                        disabled={!!adding[item.domain]}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
                          padding: '3px 9px',
                          background: 'transparent',
                          border: '1px solid var(--green)',
                          borderRadius: 'var(--r-sm)',
                          color: 'var(--green)', fontSize: 11, fontWeight: 600,
                          cursor: adding[item.domain] ? 'not-allowed' : 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {adding[item.domain] ? <Loader size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={11} />}
                        Adicionar
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Página principal ────────────────────────────────────────────────────────

export default function Whitelist() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [domain, setDomain] = useState('')
  const [reason, setReason] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const isAdmin = useIsAdmin()

  async function load() {
    try {
      const data = await api.listWhitelist()
      setItems(Array.isArray(data) ? data : (data.items || []))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function add(e) {
    e.preventDefault()
    if (!domain.trim()) return
    setAdding(true)
    setError('')
    try {
      await api.addWhitelist(domain.trim(), reason.trim())
      setDomain('')
      setReason('')
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setAdding(false)
    }
  }

  async function remove(d) {
    try {
      await api.removeWhitelist(d)
      await load()
    } catch (e) {
      setError(e.message)
    }
  }

  const inputStyle = {
    background: 'var(--bg-canvas)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-sm)',
    color: 'var(--text-primary)',
    padding: '8px 12px',
    fontSize: 13,
    outline: 'none',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
        <ShieldCheck size={20} color="var(--green)" /> Whitelist de Domínios
      </h1>

      {/* Adicionar manualmente — só admin */}
      {isAdmin && (
        <Panel title="Adicionar domínio" subtitle="Domínios na whitelist não são bloqueados">
          <form onSubmit={add} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              value={domain}
              onChange={e => setDomain(e.target.value)}
              placeholder="exemplo.com.br"
              style={{ ...inputStyle, flex: '1 1 180px', minWidth: 180 }}
            />
            <input
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Motivo (opcional)"
              style={{ ...inputStyle, flex: '2 1 250px' }}
            />
            <button type="submit" disabled={adding} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px',
              background: 'var(--green)',
              border: 'none', borderRadius: 'var(--r-sm)',
              color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: adding ? 'not-allowed' : 'pointer',
            }}>
              {adding ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={14} />}
              Adicionar
            </button>
          </form>
          {error && <div style={{ marginTop: 8, color: 'var(--red)', fontSize: 12 }}>{error}</div>}
        </Panel>
      )}

      {/* Sugestões padrão — só admin */}
      {isAdmin && (
        <Panel
          title="Sugestões Padrão"
          subtitle="Entradas recomendadas para proteger contra bloqueios acidentais em importações"
        >
          <DefaultsPanel onAdded={load} />
        </Panel>
      )}

      <Panel title="Domínios liberados" subtitle={`${items.length} entrada${items.length !== 1 ? 's' : ''}`}>
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>Carregando…</div>
        ) : items.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>Nenhum domínio na whitelist</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Domínio', 'Motivo', 'Adicionado por', 'Data', isAdmin ? '' : null].filter(Boolean).map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.domain} style={{ borderBottom: '1px solid var(--border-dim)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-panel-2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '9px 10px', color: 'var(--green)', fontWeight: 600, fontFamily: 'monospace' }}>{item.domain}</td>
                  <td style={{ padding: '9px 10px', color: 'var(--text-secondary)' }}>{item.reason || '—'}</td>
                  <td style={{ padding: '9px 10px', color: 'var(--text-muted)' }}>{item.created_by || '—'}</td>
                  <td style={{ padding: '9px 10px', color: 'var(--text-muted)' }}>
                    {item.created_at ? new Date(item.created_at).toLocaleString('pt-BR') : '—'}
                  </td>
                  {isAdmin && (
                    <td style={{ padding: '9px 10px', textAlign: 'right' }}>
                      <button onClick={() => remove(item.domain)} style={{
                        background: 'transparent', border: '1px solid var(--red-dim)',
                        borderRadius: 'var(--r-sm)', color: 'var(--red)',
                        padding: '4px 8px', cursor: 'pointer', fontSize: 11,
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                      }}>
                        <Trash2 size={12} /> Remover
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
