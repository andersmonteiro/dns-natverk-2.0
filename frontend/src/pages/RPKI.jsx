import { useState, useEffect, useCallback, Component } from 'react'
import {
  ShieldCheck, ChevronDown, Copy, Check, Upload, Plus, Trash2,
  RefreshCw, AlertCircle, CheckCircle, XCircle, Clock, Loader,
} from 'lucide-react'
import { api } from '../api'

// ── Error Boundary ────────────────────────────────────────────────────────────

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: '20px', margin: '20px 0',
          background: 'rgba(239,68,68,.1)', border: '1px solid var(--red)',
          borderRadius: 'var(--r-md)', color: 'var(--red)', fontSize: 13,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, marginBottom: 8 }}>
            <XCircle size={16} /> Erro na página RPKI
          </div>
          <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', opacity: 0.85, margin: 0 }}>
            {this.state.error?.message}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              marginTop: 12, padding: '6px 14px', borderRadius: 'var(--r-sm)',
              background: 'var(--red)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12,
            }}
          >
            Tentar novamente
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────

const btn = (variant = 'default') => ({
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '7px 14px', borderRadius: 'var(--r-sm)',
  border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500,
  ...(variant === 'primary'  ? { background: 'var(--accent)', color: '#fff' } :
      variant === 'danger'   ? { background: 'var(--red)', color: '#fff' } :
      variant === 'ghost'    ? { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)' } :
                               { background: 'var(--bg-panel-2)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }),
})

const input = {
  width: '100%', padding: '8px 10px',
  background: 'var(--bg-canvas)', border: '1px solid var(--border)',
  borderRadius: 'var(--r-sm)', color: 'var(--text-primary)', fontSize: 13,
  boxSizing: 'border-box',
}

const textarea = {
  ...input, fontFamily: 'monospace', fontSize: 11.5, resize: 'vertical',
  lineHeight: 1.5, minHeight: 120,
}

function StatusBadge({ ok, warn, msg }) {
  const color = ok ? 'var(--green)' : warn ? 'var(--orange, #f59e0b)' : 'var(--red)'
  const bg    = ok ? 'rgba(34,197,94,.12)' : warn ? 'rgba(245,158,11,.10)' : 'rgba(239,68,68,.12)'
  return (
    <div style={{
      marginTop: 10, padding: '8px 12px', borderRadius: 'var(--r-sm)',
      background: bg, border: `1px solid ${color}`, color,
      fontSize: 12, whiteSpace: 'pre-wrap',
    }}>
      {ok   ? <CheckCircle size={13} style={{ marginRight: 6 }} />
            : warn ? <AlertCircle size={13} style={{ marginRight: 6 }} />
                   : <XCircle size={13} style={{ marginRight: 6 }} />}
      {String(msg)}
    </div>
  )
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={copy} style={btn('ghost')}>
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? 'Copiado!' : 'Copiar'}
    </button>
  )
}

function XmlDisplay({ xml, loading }) {
  if (loading) return <div style={{ color: 'var(--text-muted)', fontSize: 12 }}><Loader size={14} /> Carregando...</div>
  if (!xml) return null
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
        <CopyButton text={xml} />
      </div>
      <textarea
        readOnly value={xml}
        style={{ ...textarea, minHeight: 150, background: 'var(--bg-canvas)' }}
      />
    </div>
  )
}

function FileUploadButton({ onLoad, label = 'Carregar arquivo .xml' }) {
  function handleChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => onLoad(ev.target.result || '')
    reader.readAsText(file)
    e.target.value = ''   // reset so same file can be re-selected
  }
  return (
    <label style={{
      ...btn('ghost'), cursor: 'pointer', display: 'inline-flex',
      alignItems: 'center', gap: 6, padding: '7px 14px',
    }}>
      <Upload size={13} /> {label}
      <input type="file" accept=".xml,.txt" onChange={handleChange} style={{ display: 'none' }} />
    </label>
  )
}

// ── Painel de detalhes da CA — estilo Krill ──────────────────────────────────

const REPO_FIELD_LABELS = {
  base_uri:              'SIA Base (rsync)',
  rpki_notify:           'RRDP Notification URI',
  sia_base:              'SIA Base (rsync)',
  rrdp_notification_uri: 'RRDP Notification URI',
  service_uri:           'Service URI',
  publisher_handle:      'Publisher Handle',
}

function relativeTime(ts) {
  if (!ts) return ''
  const ms = (String(ts).length <= 10 ? Number(ts) * 1000 : Number(ts))
  if (isNaN(ms)) return String(ts)
  const diffSec = Math.floor((Date.now() - ms) / 1000)
  if (diffSec < 60)   return `${diffSec} segundos atrás`
  if (diffSec < 3600) return `${Math.floor(diffSec/60)} minutos atrás`
  if (diffSec < 86400) return `${Math.floor(diffSec/3600)} horas atrás`
  return `${Math.floor(diffSec/86400)} dias atrás`
}

function formatUtc(ts) {
  if (!ts) return ''
  const ms = (String(ts).length <= 10 ? Number(ts) * 1000 : Number(ts))
  if (isNaN(ms)) return String(ts)
  return new Date(ms).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC')
}

function KrillTableRow({ label, children }) {
  return (
    <tr style={{ borderBottom: '1px solid var(--border-dim)' }}>
      <td style={{
        padding: '10px 20px 10px 0', color: 'var(--text-muted)',
        whiteSpace: 'nowrap', verticalAlign: 'top', fontSize: 12, fontWeight: 600, width: 160,
      }}>{label}</td>
      <td style={{ padding: '10px 0', fontSize: 12, wordBreak: 'break-all' }}>{children}</td>
    </tr>
  )
}

function CopyVal({ value }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontFamily: 'monospace', color: 'var(--accent)' }}>{value}</span>
      <button onClick={() => navigator.clipboard.writeText(value)}
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 2px', opacity: 0.5 }}>
        <Copy size={10} color="var(--text-muted)" />
      </button>
    </span>
  )
}

function ExchangeCell({ ts, ok }) {
  if (!ts) return <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
  const utc = formatUtc(ts)
  const rel = relativeTime(ts)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {ok !== false
        ? <CheckCircle size={14} color="var(--green)" />
        : <XCircle    size={14} color="var(--red)" />}
      <span style={{ color: ok !== false ? 'var(--green)' : 'var(--red)' }}>
        {utc}{rel ? ` (${rel})` : ''}
      </span>
    </span>
  )
}

function CaDetailsPanel({ ca, section }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!ca) return
    setLoading(true)
    try { setData(await api.krillCaDetails(ca)) }
    catch { setData(null) }
    finally { setLoading(false) }
  }, [ca])

  useEffect(() => { load() }, [load])

  const refreshBtn = (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
      <button onClick={load} disabled={loading} style={{ ...btn('ghost'), padding: '4px 10px' }}>
        <RefreshCw size={12} /> Atualizar
      </button>
    </div>
  )

  if (loading) return <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 8 }}><Loader size={13} /> Carregando...</div>
  if (!data)   return null

  // DEBUG temporário — remove depois
  console.log('[CaDetailsPanel]', section, JSON.stringify(data))

  // ── Parents ──────────────────────────────────────────────────────────────
  if (section === 'parents') {
    const parents = data.parents || []
    const res     = data.resources || {}
    return (
      <div style={{ marginTop: 8 }}>
        {refreshBtn}
        {parents.map(p => (
          <div key={p.handle} style={{
            border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
            overflow: 'hidden', marginBottom: 10,
          }}>
            {/* Header — nome do parent */}
            <div style={{
              padding: '10px 16px', background: 'var(--bg-panel)',
              borderBottom: '1px solid var(--border)',
              fontWeight: 700, fontSize: 13, color: 'var(--text-primary)',
            }}>{p.handle}</div>
            <div style={{ padding: '0 16px', background: 'var(--bg-canvas)' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <tbody>
                  <KrillTableRow label="Parents">
                    {p.contact ? <CopyVal value={p.contact} /> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  </KrillTableRow>
                  <KrillTableRow label="Last Exchange">
                    <ExchangeCell ts={p.last_exchange} ok={p.last_ok} />
                  </KrillTableRow>
                  {(res.asn || res.ipv4?.length || res.ipv6?.length) && (
                    <KrillTableRow label="All Resources">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {res.asn && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ color: 'var(--text-muted)', fontSize: 11, minWidth: 34 }}>ASN</span>
                            <CopyVal value={res.asn} />
                          </div>
                        )}
                        {res.ipv4?.length > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                            <span style={{ color: 'var(--text-muted)', fontSize: 11, minWidth: 34 }}>IPv4</span>
                            {res.ipv4.map(ip => <CopyVal key={ip} value={ip} />)}
                          </div>
                        )}
                        {res.ipv6?.length > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                            <span style={{ color: 'var(--text-muted)', fontSize: 11, minWidth: 34 }}>IPv6</span>
                            {res.ipv6.map(ip => <CopyVal key={ip} value={ip} />)}
                          </div>
                        )}
                      </div>
                    </KrillTableRow>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    )
  }

  // ── Repo ─────────────────────────────────────────────────────────────────
  if (section === 'repo') {
    const repo = data.repo || {}
    const uri  = repo.service_uri || repo.publisher_handle || ''
    const skip = new Set(['last_exchange', 'last_ok', 'last_result', 'service_uri', 'publisher_handle'])
    const extraRows = Object.entries(repo)
      .filter(([k, v]) => !skip.has(k) && v)
      .map(([k, v]) => [REPO_FIELD_LABELS[k] || k, String(v)])
    return (
      <div style={{ marginTop: 8 }}>
        {refreshBtn}
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', overflow: 'hidden' }}>
          <div style={{ padding: '0 16px', background: 'var(--bg-canvas)' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <tbody>
                {uri && (
                  <KrillTableRow label="URI">
                    <CopyVal value={uri} />
                  </KrillTableRow>
                )}
                {extraRows.map(([label, value]) => (
                  <KrillTableRow key={label} label={label}>
                    <CopyVal value={value} />
                  </KrillTableRow>
                ))}
                {repo.last_exchange && (
                  <KrillTableRow label="Last Exchange">
                    <ExchangeCell ts={repo.last_exchange} ok={repo.last_ok} />
                  </KrillTableRow>
                )}
              </tbody>
            </table>
          </div>
        </div>
        {/* DEBUG TEMPORÁRIO — remover depois */}
        <details style={{ marginTop: 8 }}>
          <summary style={{ fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer' }}>🔍 Debug raw JSON (remover depois)</summary>
          <pre style={{ fontSize: 10, color: 'var(--text-secondary)', background: 'var(--bg-panel)', padding: 8, borderRadius: 4, overflow: 'auto', marginTop: 4 }}>
            {JSON.stringify(data, null, 2)}
          </pre>
        </details>
      </div>
    )
  }

  return null
}

// ── CollapsibleSection ────────────────────────────────────────────────────────

function CollapsibleSection({ title, icon: Icon, badge, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '13px 16px', background: 'var(--bg-panel)',
          border: 'none', cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {Icon && <Icon size={15} color="var(--accent)" />}
          <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{title}</span>
          {badge != null && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 7px',
              borderRadius: 10, background: 'var(--accent-dim)', color: 'var(--accent)',
            }}>{String(badge)}</span>
          )}
        </div>
        <ChevronDown size={15} color="var(--text-muted)"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
      </button>
      {open && <div style={{ padding: 16, background: 'var(--bg-canvas)' }}>{children}</div>}
    </div>
  )
}

// ── Seção: Status ─────────────────────────────────────────────────────────────

function StatusSection({ status, loading, onRefresh }) {
  if (loading) return <div style={{ color: 'var(--text-muted)', fontSize: 12 }}><Loader size={14} /> Carregando...</div>

  const isOnline = status?.online === true

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Krill online/offline */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 10, height: 10, borderRadius: '50%',
          background: isOnline ? 'var(--green)' : 'var(--red)',
        }} />
        <span style={{ fontWeight: 600, fontSize: 13 }}>
          Krill {isOnline ? 'Online' : 'Offline'}
        </span>
        <button onClick={onRefresh} style={{ ...btn('ghost'), marginLeft: 'auto', padding: '4px 10px' }}>
          <RefreshCw size={12} /> Atualizar
        </button>
      </div>

      {!isOnline && (
        <div style={{
          padding: '10px 14px', borderRadius: 'var(--r-sm)',
          background: 'rgba(239,68,68,.1)', border: '1px solid var(--red)',
          color: 'var(--red)', fontSize: 12,
        }}>
          <AlertCircle size={13} style={{ marginRight: 6 }} />
          Krill inacessível. Verifique se o container está rodando.
          {status?.error && <div style={{ marginTop: 4, opacity: 0.8 }}>{String(status.error)}</div>}
        </div>
      )}

      {/* Lista de CAs */}
      {Array.isArray(status?.cas) && status.cas.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['CA', 'Parent', 'Repositório'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--text-muted)', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {status.cas.map(ca => {
              const handle  = String(ca.handle  ?? '')
              const parent  = ca.parent  ? String(ca.parent)  : null
              const hasRepo = ca.has_repo === true
              return (
                <tr key={handle} style={{ borderBottom: '1px solid var(--border-dim)' }}>
                  <td style={{ padding: '8px 10px', fontWeight: 600, fontFamily: 'monospace' }}>{handle}</td>
                  <td style={{ padding: '8px 10px' }}>
                    {parent
                      ? <span style={{ color: 'var(--green)' }}><CheckCircle size={12} style={{ marginRight: 4 }} />{parent}</span>
                      : <span style={{ color: 'var(--text-muted)' }}>Não configurado</span>}
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    {hasRepo
                      ? <span style={{ color: 'var(--green)' }}><CheckCircle size={12} style={{ marginRight: 4 }} />Configurado</span>
                      : <span style={{ color: 'var(--text-muted)' }}>Não configurado</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {isOnline && (!status?.cas || status.cas.length === 0) && (
        <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
          Nenhuma CA criada ainda. Use a seção "Configuração" abaixo.
        </div>
      )}
    </div>
  )
}

// ── Seção: Configuração RFC 8183 ──────────────────────────────────────────────
// NOTE: We derive hasParent/hasRepo from the `cas` prop (primitives only).
// We do NOT call api.krillGetCa() to avoid passing raw Krill CA objects to state.

function ConfigSection({ cas, onCaCreated }) {
  const [handle, setHandle]             = useState('')
  const [selectedCa, setSelectedCa]     = useState('')
  const [childXml, setChildXml]         = useState('')
  const [repoXml, setRepoXml]           = useState('')
  const [parentHandle, setParentHandle] = useState('registro-br')
  const [parentXml, setParentXml]       = useState('')
  const [repoResponseXml, setRepoResponseXml] = useState('')
  const [loadingXml, setLoadingXml]     = useState(false)
  const [statusMsg, setStatusMsg]       = useState(null)
  const [busy, setBusy]                 = useState(false)

  // Set first CA when list loads
  useEffect(() => {
    if (cas.length > 0 && !selectedCa) setSelectedCa(String(cas[0].handle))
  }, [cas])

  // Load XMLs when selected CA changes
  useEffect(() => {
    if (selectedCa) loadXmls(selectedCa)
  }, [selectedCa])

  // Derive hasParent and hasRepo from the cas prop (no raw CA objects needed)
  const caInfo   = cas.find(c => String(c.handle) === selectedCa) || null
  const hasParent = caInfo?.parent ? true : false
  const hasRepo   = caInfo?.has_repo === true

  async function loadXmls(ca) {
    setLoadingXml(true)
    try {
      const cr = await api.krillChildRequest(ca)
      setChildXml(String(cr.xml || ''))
      // Sempre tenta carregar o Publisher Request XML — o Krill gera do certificado de identidade
      // e deve retornar o mesmo XML independente de o repo já estar configurado
      try {
        const rr = await api.krillRepoRequest(ca)
        setRepoXml(String(rr.xml || ''))
      } catch {
        setRepoXml('')
      }
    } catch (e) {
      console.error('loadXmls error:', e)
    } finally {
      setLoadingXml(false)
    }
  }

  async function createCa() {
    if (!handle.trim()) return
    setBusy(true); setStatusMsg(null)
    try {
      await api.krillCreateCa(handle.trim())
      setStatusMsg({ ok: true, msg: `CA "${handle}" criada com sucesso.` })
      setHandle('')
      onCaCreated()
    } catch (e) {
      setStatusMsg({ ok: false, msg: String(e.message) })
    } finally { setBusy(false) }
  }

  async function submitParent() {
    if (!parentXml.trim()) return
    setBusy(true); setStatusMsg(null)
    try {
      await api.krillAddParent(selectedCa, parentHandle, parentXml.trim())
      setStatusMsg({ ok: true, msg: 'Parent configurado! Agora configure o repositório abaixo.' })
      setParentXml('')
      onCaCreated()          // refresh parent status via main loadStatus
      await loadXmls(selectedCa)
    } catch (e) {
      setStatusMsg({ ok: false, msg: String(e.message) })
    } finally { setBusy(false) }
  }

  async function submitRepo() {
    if (!repoResponseXml.trim()) return
    setBusy(true); setStatusMsg(null)
    try {
      await api.krillConfigureRepo(selectedCa, repoResponseXml.trim())
      setStatusMsg({ ok: true, msg: 'Repositório configurado! O Krill está pronto para emitir ROAs.' })
      setRepoResponseXml('')
      onCaCreated()
      await loadXmls(selectedCa)
    } catch (e) {
      setStatusMsg({ ok: false, msg: String(e.message) })
    } finally { setBusy(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Criar CA */}
      <div>
        <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
          1 · Criar CA
        </h3>
        {cas.length > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <span style={{ color: 'var(--text-muted)' }}>CA ativa:</span>
            <select value={selectedCa} onChange={e => setSelectedCa(e.target.value)} style={{ ...input, width: 'auto' }}>
              {cas.map(c => <option key={String(c.handle)} value={String(c.handle)}>{String(c.handle)}</option>)}
            </select>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={handle} onChange={e => setHandle(e.target.value)}
              placeholder="Nome da CA (ex: natverk)" style={{ ...input, maxWidth: 280 }}
              onKeyDown={e => e.key === 'Enter' && createCa()} />
            <button onClick={createCa} disabled={busy} style={btn('primary')}>
              <Plus size={13} /> Criar
            </button>
          </div>
        )}
      </div>

      {selectedCa && (
        <>
          {/* Child Request */}
          <div>
            <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              2 · Child Request XML → registro.br
            </h3>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
              Copie o XML abaixo e cole no portal do <strong>registro.br</strong> como "Child Request".
            </p>
            <XmlDisplay xml={childXml} loading={loadingXml} />
          </div>

          {/* 3 · Publisher Request XML → registro.br */}
          {hasParent && (
            <div>
              <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                3 · Publisher Request XML → registro.br
              </h3>
              {hasRepo && !repoXml ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  Repositório já configurado — Publisher Request XML processado e não armazenado pelo Krill após conclusão.
                </div>
              ) : (
                <>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
                    Copie o XML abaixo e cole no portal do registro.br como "Publisher Request".
                  </p>
                  <XmlDisplay xml={repoXml} loading={loadingXml} />
                </>
              )}
            </div>
          )}

          {/* 4 e 5 · Respostas do registro.br — lado a lado */}
          {hasParent && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

              {/* 4 · Parent Response */}
              <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: 14 }}>
                <h3 style={{ fontSize: 12, fontWeight: 700, color: hasParent ? 'var(--green)' : 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                  4 · Parent Response ← registro.br
                  {hasParent && <span style={{ marginLeft: 8 }}><CheckCircle size={12} /></span>}
                </h3>
                {hasParent ? (
                  <CaDetailsPanel ca={selectedCa} section="parents" />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div>
                      <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Nome do Parent</label>
                      <input value={parentHandle} onChange={e => setParentHandle(e.target.value)}
                        placeholder="registro-br" style={{ ...input, maxWidth: 220 }} />
                    </div>
                    <FileUploadButton label="Carregar .xml" onLoad={setParentXml} />
                    <textarea value={parentXml} onChange={e => setParentXml(e.target.value)}
                      placeholder="<ParentResponse ...>...</ParentResponse>"
                      style={{ ...textarea, minHeight: 100 }} />
                    <button onClick={submitParent} disabled={busy || !parentXml.trim()} style={btn('primary')}>
                      <Upload size={13} /> Enviar
                    </button>
                  </div>
                )}
              </div>

              {/* 5 · Repository Response */}
              <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: 14 }}>
                <h3 style={{ fontSize: 12, fontWeight: 700, color: hasRepo ? 'var(--green)' : 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                  5 · Repository Response ← registro.br
                  {hasRepo && <span style={{ marginLeft: 8 }}><CheckCircle size={12} /></span>}
                </h3>
                {hasRepo ? (
                  <div>
                    <CaDetailsPanel ca={selectedCa} section="repo" />
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <FileUploadButton label="Carregar .xml" onLoad={setRepoResponseXml} />
                    <textarea value={repoResponseXml} onChange={e => setRepoResponseXml(e.target.value)}
                      placeholder="<RepositoryResponse ...>...</RepositoryResponse>"
                      style={{ ...textarea, minHeight: 100 }} />
                    <button onClick={submitRepo} disabled={busy || !repoResponseXml.trim()} style={btn('primary')}>
                      <Upload size={13} /> Enviar
                    </button>
                  </div>
                )}
              </div>

            </div>
          )}
        </>
      )}

      {statusMsg && <StatusBadge ok={statusMsg.ok} msg={statusMsg.msg} />}
    </div>
  )
}

// ── Seção: ROAs ───────────────────────────────────────────────────────────────

function ROASection({ ca }) {
  const [roas, setRoas]       = useState([])
  const [loading, setLoading] = useState(false)
  const [asn, setAsn]         = useState('')
  const [prefix, setPrefix]   = useState('')
  const [maxLen, setMaxLen]   = useState('')
  const [statusMsg, setStatusMsg] = useState(null)
  const [busy, setBusy]       = useState(false)

  const load = useCallback(async () => {
    if (!ca) return
    setLoading(true)
    try {
      const r = await api.krillRoas(ca)
      const list = Array.isArray(r) ? r : (Array.isArray(r?.roas) ? r.roas : (Array.isArray(r?.authorized) ? r.authorized : []))
      setRoas(list)
      if (r?.error) setStatusMsg({ ok: false, msg: `Krill: ${r.error}` })
    } catch (e) {
      setStatusMsg({ ok: false, msg: String(e.message) })
    } finally { setLoading(false) }
  }, [ca])

  useEffect(() => { load() }, [load])

  async function addRoa() {
    if (!asn || !prefix) return
    setBusy(true); setStatusMsg(null)
    try {
      const prefLen = parseInt(prefix.split('/')[1] || '0')
      await api.krillAddRoa(ca, {
        asn: asn.startsWith('AS') ? asn : `AS${asn}`,
        prefix,
        max_length: maxLen ? parseInt(maxLen) : prefLen,
      })
      setStatusMsg({ ok: true, msg: 'ROA adicionado.' })
      setAsn(''); setPrefix(''); setMaxLen('')
      load()
    } catch (e) {
      setStatusMsg({ ok: false, msg: String(e.message) })
    } finally { setBusy(false) }
  }

  async function removeRoa(roa) {
    setBusy(true); setStatusMsg(null)
    try {
      await api.krillRemoveRoa(ca, {
        asn: roa.asn,
        prefix: roa.prefix,
        max_length: roa.max_length,
      })
      setStatusMsg({ ok: true, msg: 'ROA removido.' })
      load()
    } catch (e) {
      setStatusMsg({ ok: false, msg: String(e.message) })
    } finally { setBusy(false) }
  }

  if (!ca) return <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Selecione uma CA primeiro.</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Status Krill */}
      <div style={{ fontSize: 12, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <CheckCircle size={13} /> Krill pronto para emitir ROAs.
      </div>
      {/* Formulário add ROA */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8, alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>ASN</label>
          <input value={asn} onChange={e => setAsn(e.target.value)} placeholder="64500 ou AS64500" style={input} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Prefixo</label>
          <input value={prefix} onChange={e => setPrefix(e.target.value)} placeholder="177.130.48.0/22" style={input} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Max Length</label>
          <input value={maxLen} onChange={e => setMaxLen(e.target.value)} placeholder="igual ao prefixo" style={input} />
        </div>
        <button onClick={addRoa} disabled={busy || !asn || !prefix} style={btn('primary')}>
          <Plus size={13} /> Adicionar
        </button>
      </div>

      {/* Tabela ROAs */}
      {loading ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 12 }}><Loader size={14} /> Carregando...</div>
      ) : roas.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: 24 }}>
          Nenhum ROA configurado.
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['ASN', 'Prefixo', 'Max Length', ''].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '7px 10px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roas.map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border-dim)' }}>
                <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontWeight: 600 }}>{String(r.asn ?? '')}</td>
                <td style={{ padding: '8px 10px', fontFamily: 'monospace' }}>{String(r.prefix ?? '')}</td>
                <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>/{String(r.max_length ?? '')}</td>
                <td style={{ padding: '8px 10px' }}>
                  <button onClick={() => removeRoa(r)} disabled={busy} style={btn('danger')}>
                    <Trash2 size={11} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {statusMsg && <StatusBadge ok={statusMsg.ok} msg={statusMsg.msg} />}
    </div>
  )
}

// ── Seção: BGP Analysis ───────────────────────────────────────────────────────

const BGP_COLOR = {
  valid:     'var(--green)',
  invalid:   'var(--red)',
  not_found: 'var(--orange)',
}
const BGP_LABEL = {
  valid:     'Válido',
  invalid:   'Inválido',
  not_found: 'Não encontrado',
}

function BGPSection({ ca }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [statusMsg, setStatusMsg] = useState(null)

  const load = useCallback(async () => {
    if (!ca) return
    setLoading(true); setStatusMsg(null)
    try {
      const r = await api.krillBgp(ca)
      setData(r)
      if (r?.error) {
        // 404 = endpoint não disponível nesta versão do Krill — aviso sutil, não erro
        const is404 = String(r.error).includes('404')
        setStatusMsg({ ok: false, warn: is404, msg: is404
          ? 'Análise BGP não disponível nesta versão do Krill.'
          : `BGP: ${r.error}` })
      }
    } catch (e) {
      setStatusMsg({ ok: false, msg: String(e.message) })
    } finally { setLoading(false) }
  }, [ca])

  useEffect(() => { load() }, [load])

  if (!ca) return <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Selecione uma CA primeiro.</div>

  const announcements = Array.isArray(data?.announcements) ? data.announcements : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={load} disabled={loading} style={btn('ghost')}>
          <RefreshCw size={13} /> Atualizar
        </button>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 12 }}><Loader size={14} /> Consultando BGP...</div>
      ) : announcements.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: 24 }}>
          {data ? 'Nenhum anúncio BGP encontrado para os prefixos desta CA.' : 'Clique em Atualizar para carregar.'}
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Prefixo', 'ASN anunciado', 'Status'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '7px 10px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {announcements.map((a, i) => {
              const state = String(a?.validity?.state || 'not_found')
              return (
                <tr key={i} style={{ borderBottom: '1px solid var(--border-dim)' }}>
                  <td style={{ padding: '8px 10px', fontFamily: 'monospace' }}>{String(a.prefix ?? '')}</td>
                  <td style={{ padding: '8px 10px', fontFamily: 'monospace' }}>{String(a.asn ?? '')}</td>
                  <td style={{ padding: '8px 10px' }}>
                    <span style={{
                      color: BGP_COLOR[state] || 'var(--text-muted)',
                      fontWeight: 600, fontSize: 11,
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                      {state === 'valid'     && <CheckCircle size={12} />}
                      {state === 'invalid'   && <XCircle size={12} />}
                      {state === 'not_found' && <Clock size={12} />}
                      {BGP_LABEL[state] || state}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {statusMsg && <StatusBadge ok={statusMsg.ok} msg={statusMsg.msg} />}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function RPKI() {
  const [status, setStatus]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedCa, setSelectedCa] = useState('')

  const loadStatus = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.krillStatus()
      setStatus(r)
      if (Array.isArray(r.cas) && r.cas.length > 0 && !selectedCa) {
        setSelectedCa(String(r.cas[0].handle))
      }
    } catch (e) {
      setStatus({ online: false, error: String(e.message), cas: [] })
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { loadStatus() }, [loadStatus])

  const cas = Array.isArray(status?.cas) ? status.cas : []

  return (
    <ErrorBoundary>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShieldCheck size={20} color="var(--accent)" /> RPKI
            </h1>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              Krill RPKI CA — Route Origin Authorizations
            </p>
          </div>
          {cas.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>CA:</span>
              <select value={selectedCa} onChange={e => setSelectedCa(e.target.value)} style={{ ...input, width: 'auto' }}>
                {cas.map(c => <option key={String(c.handle)} value={String(c.handle)}>{String(c.handle)}</option>)}
              </select>
            </div>
          )}
        </div>

        <CollapsibleSection title="Status" icon={ShieldCheck} defaultOpen>
          <StatusSection status={status} loading={loading} onRefresh={loadStatus} />
        </CollapsibleSection>

        <CollapsibleSection title="Configuração (RFC 8183)" icon={Upload}
          badge={cas.length === 0 ? 'pendente' : null}>
          <ConfigSection cas={cas} onCaCreated={loadStatus} />
        </CollapsibleSection>

        <CollapsibleSection title="ROAs" icon={CheckCircle}>
          <ROASection ca={selectedCa} />
        </CollapsibleSection>

        <CollapsibleSection title="BGP Analysis" icon={RefreshCw}>
          <BGPSection ca={selectedCa} />
        </CollapsibleSection>
      </div>
    </ErrorBoundary>
  )
}
