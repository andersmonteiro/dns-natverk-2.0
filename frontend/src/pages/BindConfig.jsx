import { useState, useEffect, useCallback } from 'react'
import {
  Server, Plus, Trash2, Edit3, Code, Layers,
  CheckCircle, XCircle, RefreshCw, Save, ChevronRight, ChevronDown,
  ArrowLeft, Loader, Shield, Lock,
} from 'lucide-react'
import { api } from '../api'

// ── estilos base ──────────────────────────────────────────────────────────────

const panel = {
  background: 'var(--bg-panel)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-md)',
  padding: 16,
}

const btn = (variant = 'primary') => ({
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '7px 14px',
  borderRadius: 'var(--r-sm)', border: 'none',
  fontSize: 12, fontWeight: 600, cursor: 'pointer',
  background: variant === 'primary' ? 'var(--accent)'
    : variant === 'danger' ? 'var(--red-dim)'
      : 'var(--bg-panel-2)',
  color: variant === 'primary' ? '#fff'
    : variant === 'danger' ? 'var(--red)'
      : 'var(--text-secondary)',
})

const input = {
  background: 'var(--bg-canvas)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-sm)',
  color: 'var(--text-primary)',
  padding: '7px 10px',
  fontSize: 12,
  outline: 'none',
  width: '100%',
}

const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'PTR', 'SRV', 'CAA']

// ── componente: editor de texto ───────────────────────────────────────────────

function TextEditor({ value, onChange, height = 400, readOnly = false }) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      readOnly={readOnly}
      spellCheck={false}
      style={{
        width: '100%',
        height,
        background: 'var(--bg-canvas)',
        color: 'var(--text-primary)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-sm)',
        padding: '12px 14px',
        fontFamily: 'monospace',
        fontSize: 12.5,
        lineHeight: 1.6,
        resize: 'vertical',
        outline: 'none',
        boxSizing: 'border-box',
      }}
    />
  )
}

// ── componente: badge de status ───────────────────────────────────────────────

function StatusBadge({ ok, msg }) {
  if (!msg) return null
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '8px 12px',
      borderRadius: 'var(--r-sm)',
      background: ok ? 'var(--green-dim)' : 'var(--red-dim)',
      color: ok ? 'var(--green)' : 'var(--red)',
      fontSize: 12, marginTop: 8,
    }}>
      {ok ? <CheckCircle size={13} /> : <XCircle size={13} />}
      <pre style={{ margin: 0, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{msg}</pre>
    </div>
  )
}

// ── componente: modal ─────────────────────────────────────────────────────────

function Modal({ title, onClose, children }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        ...panel, minWidth: 400, maxWidth: 600, width: '90%',
        boxShadow: '0 16px 40px rgba(0,0,0,.5)',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{title}</span>
          <button onClick={onClose} style={{ ...btn('ghost'), padding: '4px 8px' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ── aba: ACL & DNS ───────────────────────────────────────────────────────────

const LOCKED_NETWORKS = ['localhost', '127.0.0.1', '::1', '192.168.0.0/16', '172.16.0.0/12', '10.0.0.0/8']

const sectionLabel = {
  fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '.6px', color: 'var(--text-muted)', marginBottom: 10,
}

function Chip({ label, onRemove, locked }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: locked ? 'var(--bg-panel-2)' : 'var(--bg-canvas)',
      border: `1px solid ${locked ? 'var(--border)' : 'var(--border)'}`,
      borderRadius: 'var(--r-sm)', padding: '4px 8px',
      fontSize: 12, fontFamily: 'monospace',
      color: locked ? 'var(--text-muted)' : 'var(--text-primary)',
    }}>
      {locked && <Lock size={10} style={{ opacity: .5 }} />}
      {label}
      {!locked && (
        <button onClick={onRemove} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-muted)', padding: 0, lineHeight: 1,
          display: 'flex', alignItems: 'center',
        }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--red)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
        >×</button>
      )}
    </div>
  )
}

function ForwarderEditor({ items, onChange }) {
  const [val, setVal] = useState('')
  function add() {
    const v = val.trim()
    if (!v || items.includes(v)) return
    onChange([...items, v]); setVal('')
  }
  return (
    <div>
      <div style={sectionLabel}>Servidores de encaminhamento (forwarders)</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {items.map(i => <Chip key={i} label={i} onRemove={() => onChange(items.filter(x => x !== i))} />)}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input value={val} onChange={e => setVal(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), add())}
          placeholder="ex: 1.1.1.1 ou 2606:4700:4700::1111"
          style={{ ...input, flex: 1 }} />
        <button onClick={add} style={btn('primary')}><Plus size={13} /></button>
      </div>
    </div>
  )
}

function AclEditor() {
  const [acl, setAcl]         = useState(null)
  const [loading, setLoading]  = useState(true)
  const [saving, setSaving]    = useState(false)
  const [status, setStatus]    = useState(null)

  // IPs do servidor (listen_on)
  const [ipv4, setIpv4] = useState('')
  const [ipv6, setIpv6] = useState('')

  useEffect(() => {
    api.getAcl().then(r => {
      setAcl(r)
      // Extrai IPv4/IPv6 do listen_on (ignora 'any')
      const lo = r.listen_on || []
      const v4 = lo.find(x => x !== 'any' && !x.includes(':')) || ''
      const v6 = lo.find(x => x.includes(':')) || ''
      setIpv4(v4); setIpv6(v6)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  function set(key, val) { setAcl(a => ({ ...a, [key]: val })) }

  // Redes adicionadas pelo usuário (não-padrão)
  const userNetworks = (acl?.allow_query || []).filter(n => !LOCKED_NETWORKS.includes(n))

  function buildListenOn() {
    const parts = []
    if (ipv4.trim()) parts.push(ipv4.trim())
    if (ipv6.trim()) parts.push(ipv6.trim())
    return parts.length ? parts : ['any']
  }

  async function save() {
    setSaving(true); setStatus(null)
    try {
      const payload = {
        ...acl,
        allow_query: [...LOCKED_NETWORKS, ...userNetworks],
        listen_on: buildListenOn(),
      }
      const r = await api.saveAcl(payload)
      setStatus({ ok: r.ok, msg: r.output })
    } catch (e) {
      setStatus({ ok: false, msg: e.message })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Carregando…</div>
  if (!acl) return <div style={{ color: 'var(--red)', fontSize: 13 }}>Erro ao carregar configurações.</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* IP do servidor */}
      <div style={panel}>
        <div style={sectionLabel}>Endereço IP do servidor DNS</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>IPv4</label>
            <input value={ipv4} onChange={e => setIpv4(e.target.value)}
              placeholder="ex: 177.130.50.42  (vazio = any)" style={input} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>IPv6 <span style={{ opacity: .5 }}>(opcional)</span></label>
            <input value={ipv6} onChange={e => setIpv6(e.target.value)}
              placeholder="ex: 2804:235c::1" style={input} />
          </div>
        </div>
      </div>

      {/* Redes autorizadas */}
      <div style={panel}>
        <div style={sectionLabel}>Redes autorizadas (allow-query)</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {LOCKED_NETWORKS.map(n => <Chip key={n} label={n} locked />)}
          {userNetworks.map(n => (
            <Chip key={n} label={n} onRemove={() => set('allow_query', [...LOCKED_NETWORKS, ...userNetworks.filter(x => x !== n)])} />
          ))}
        </div>
        {/* Adicionar rede do cliente */}
        <div>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Adicionar bloco público do cliente</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              id="acl-new-net"
              placeholder="ex: 177.130.48.0/20 ou 2804:235c::/32"
              style={{ ...input, flex: 1 }}
              onKeyDown={e => {
                if (e.key !== 'Enter') return
                e.preventDefault()
                const v = e.target.value.trim()
                if (v && !acl.allow_query.includes(v)) {
                  set('allow_query', [...(acl.allow_query || []), v])
                  e.target.value = ''
                }
              }}
            />
            <button onClick={() => {
              const el = document.getElementById('acl-new-net')
              const v = el.value.trim()
              if (v && !acl.allow_query.includes(v)) {
                set('allow_query', [...(acl.allow_query || []), v])
                el.value = ''
              }
            }} style={btn('primary')}><Plus size={13} /></button>
          </div>
        </div>
      </div>

      {/* Forwarders */}
      <div style={panel}>
        <ForwarderEditor items={acl.forwarders || []} onChange={v => set('forwarders', v)} />
      </div>

      {/* Save */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={save} disabled={saving} style={btn('primary')}>
          {saving ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={13} />}
          Salvar e recarregar BIND
        </button>
      </div>

      {status && <StatusBadge ok={status.ok} msg={status.msg} />}
    </div>
  )
}

// ── aba: Avançado (options + local + bloqueios) ───────────────────────────────

function CollapsibleFile({ title, description, fetchFn, saveFn, readOnly = false }) {
  const [open, setOpen]       = useState(false)
  const [content, setContent] = useState('')
  const [loaded, setLoaded]   = useState(false)
  const [saving, setSaving]   = useState(false)
  const [status, setStatus]   = useState(null)

  async function load() {
    if (loaded) return
    const r = await fetchFn()
    setContent(r.content || '')
    setLoaded(true)
  }

  function toggle() {
    if (!open) load()
    setOpen(o => !o)
    setStatus(null)
  }

  async function save() {
    setSaving(true); setStatus(null)
    try {
      const r = await saveFn(content)
      setStatus({ ok: r.ok, msg: r.output })
    } catch (e) {
      setStatus({ ok: false, msg: e.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
      <button onClick={toggle} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', background: 'var(--bg-panel-2)',
        border: 'none', cursor: 'pointer', textAlign: 'left',
      }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', fontFamily: 'monospace' }}>{title}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{description}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {readOnly && <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-canvas)', padding: '2px 6px', borderRadius: 4 }}>somente leitura</span>}
          {open ? <ChevronDown size={16} color="var(--text-muted)" /> : <ChevronRight size={16} color="var(--text-muted)" />}
        </div>
      </button>

      {open && (
        <div style={{ padding: 16, background: 'var(--bg-canvas)' }}>
          {!loaded
            ? <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Carregando…</div>
            : <>
                <TextEditor value={content} onChange={setContent} height={360} readOnly={readOnly} />
                {!readOnly && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                    <button onClick={save} disabled={saving} style={btn('primary')}>
                      {saving ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={12} />}
                      Salvar
                    </button>
                  </div>
                )}
                {status && <StatusBadge ok={status.ok} msg={status.msg} />}
              </>
          }
        </div>
      )}
    </div>
  )
}

function AdvancedEditor() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
        Edição direta dos arquivos de configuração do BIND. Alterações são validadas antes de aplicar.
      </div>
      <CollapsibleFile
        title="named.conf.options"
        description="Opções globais: forwarders, ACL, performance, logging"
        fetchFn={api.getBindOptions}
        saveFn={content => api.saveBindOptions(content)}
      />
      <CollapsibleFile
        title="named.conf.local"
        description="Declaração de zonas DNS do servidor"
        fetchFn={api.getBindLocal}
        saveFn={content => api.saveBindLocal(content)}
      />
      <CollapsibleFile
        title="named.conf.bloqueios"
        description="Zonas de bloqueio — gerado automaticamente pela tela de Bloqueios"
        fetchFn={api.getBindBloqueios}
        saveFn={null}
        readOnly
      />
    </div>
  )
}

// ── aba: Zonas (GUI) ──────────────────────────────────────────────────────────

function ZonesGUI() {
  const [zones, setZones] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)  // zona selecionada para ver registros
  const [showAddZone, setShowAddZone] = useState(false)
  const [showAddRecord, setShowAddRecord] = useState(false)
  const [records, setRecords] = useState([])
  const [zoneFileContent, setZoneFileContent] = useState('')
  const [zoneMode, setZoneMode] = useState('gui') // gui | pro
  const [status, setStatus] = useState(null)
  const [saving, setSaving] = useState(false)

  // form nova zona
  const [newZoneName, setNewZoneName] = useState('')
  const [newZoneType, setNewZoneType] = useState('master')
  // form novo registro
  const [rec, setRec] = useState({ name: '@', ttl: '3600', type: 'A', value: '', priority: '' })

  const loadZones = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.getZones()
      setZones(r.zones || [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadZones() }, [loadZones])

  async function loadZoneRecords(zone) {
    setSelected(zone)
    setStatus(null)
    const r = await api.getZoneRecords(zone.name)
    setRecords(r.records || [])
    setZoneFileContent(r.raw || '')
  }

  async function addZone() {
    if (!newZoneName.trim()) return
    setSaving(true)
    try {
      const r = await api.createZone({ name: newZoneName, type: newZoneType })
      setStatus({ ok: r.ok, msg: r.output })
      if (r.ok) { setShowAddZone(false); setNewZoneName(''); loadZones() }
    } catch (e) {
      setStatus({ ok: false, msg: e.message })
    } finally {
      setSaving(false)
    }
  }

  async function deleteZone(name) {
    if (!confirm(`Remover zona "${name}"?`)) return
    try {
      const r = await api.deleteZone(name)
      setStatus({ ok: r.ok, msg: r.output })
      if (r.ok) { setSelected(null); loadZones() }
    } catch (e) {
      setStatus({ ok: false, msg: e.message })
    }
  }

  async function addRecord() {
    setSaving(true)
    try {
      const payload = { ...rec, priority: rec.priority ? +rec.priority : undefined }
      const r = await api.addRecord(selected.name, payload)
      setStatus({ ok: r.ok, msg: r.output })
      if (r.ok) { setShowAddRecord(false); setRec({ name: '@', ttl: '3600', type: 'A', value: '', priority: '' }); loadZoneRecords(selected) }
    } catch (e) {
      setStatus({ ok: false, msg: e.message })
    } finally {
      setSaving(false)
    }
  }

  async function saveZonePro() {
    setSaving(true)
    try {
      const r = await api.saveZoneFile(selected.name, zoneFileContent)
      setStatus({ ok: r.ok, msg: r.output })
      if (r.ok) loadZoneRecords(selected)
    } catch (e) {
      setStatus({ ok: false, msg: e.message })
    } finally {
      setSaving(false)
    }
  }

  // ── lista de zonas ──────────────────────────────────────────────────────────
  if (!selected) return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {loading ? 'Carregando…' : `${zones.length} zona(s)`}
        </span>
        <button onClick={() => setShowAddZone(true)} style={btn('primary')}>
          <Plus size={13} /> Nova Zona
        </button>
      </div>

      {status && <StatusBadge ok={status.ok} msg={status.msg} />}

      {zones.length === 0 && !loading && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>
          Nenhuma zona configurada. Clique em "Nova Zona" para começar.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {zones.map(z => (
          <div key={z.name} style={{
            ...panel, padding: '12px 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            cursor: 'pointer',
          }}
            onClick={() => loadZoneRecords(z)}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{z.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                tipo: {z.type} · arquivo: {z.file}
                {!z.exists && <span style={{ color: 'var(--red)', marginLeft: 8 }}>⚠ arquivo ausente</span>}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={e => { e.stopPropagation(); deleteZone(z.name) }} style={btn('danger')}>
                <Trash2 size={12} />
              </button>
              <ChevronRight size={16} color="var(--text-muted)" />
            </div>
          </div>
        ))}
      </div>

      {showAddZone && (
        <Modal title="Nova Zona" onClose={() => setShowAddZone(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Nome da zona</label>
              <input value={newZoneName} onChange={e => setNewZoneName(e.target.value)}
                placeholder="ex: exemplo.com.br" style={input} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Tipo</label>
              <select value={newZoneType} onChange={e => setNewZoneType(e.target.value)} style={input}>
                <option value="master">master (primária)</option>
                <option value="slave">slave (secundária)</option>
                <option value="forward">forward</option>
                <option value="hint">hint</option>
              </select>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <button onClick={() => setShowAddZone(false)} style={btn('ghost')}>Cancelar</button>
              <button onClick={addZone} disabled={saving} style={btn('primary')}>
                {saving ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={12} />}
                Criar
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )

  // ── detalhes da zona ────────────────────────────────────────────────────────
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <button onClick={() => setSelected(null)} style={btn('ghost')}>
          <ArrowLeft size={13} /> Zonas
        </button>
        <span style={{ fontWeight: 700, fontSize: 15 }}>{selected.name}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {/* Toggle GUI / Pro */}
          <div style={{
            display: 'flex',
            background: 'var(--bg-canvas)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-sm)',
            overflow: 'hidden',
         