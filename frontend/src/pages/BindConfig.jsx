import { useState, useEffect, useCallback } from 'react'
import {
  Server, Plus, Trash2, Edit3, Code, Layers,
  CheckCircle, XCircle, RefreshCw, Save, ChevronRight, ChevronDown,
  ArrowLeft, Loader, Shield, Lock,
} from 'lucide-react'
import { api } from '../api'
import { useIsAdmin } from '../context/UserContext'

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

// ── aba: ACL & Forwarders ────────────────────────────────────────────────────

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
      border: '1px solid var(--border)',
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

function ForwarderEditor({ items, onChange, readOnly = false }) {
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
        {items.map(i => <Chip key={i} label={i} locked={readOnly} onRemove={readOnly ? undefined : () => onChange(items.filter(x => x !== i))} />)}
      </div>
      {!readOnly && (
        <div style={{ display: 'flex', gap: 6 }}>
          <input value={val} onChange={e => setVal(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), add())}
            placeholder="ex: 1.1.1.1 ou 2606:4700:4700::1111"
            style={{ ...input, flex: 1 }} />
          <button onClick={add} style={btn('primary')}><Plus size={13} /></button>
        </div>
      )}
    </div>
  )
}

function AclEditor() {
  const [acl, setAcl]         = useState(null)
  const [loading, setLoading]  = useState(true)
  const [saving, setSaving]    = useState(false)
  const [status, setStatus]    = useState(null)
  const [serverIps, setServerIps] = useState({ ipv4: null, ipv6: null })
  const [newNet, setNewNet]       = useState('')
  const isAdmin = useIsAdmin()

  useEffect(() => {
    Promise.all([api.getAcl(), api.getServerIps()])
      .then(([acl, ips]) => {
        setAcl(acl)
        setServerIps(ips)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  function set(key, val) { setAcl(a => ({ ...a, [key]: val })) }

  const userNetworks = (acl?.allow_query || []).filter(n => !LOCKED_NETWORKS.includes(n))

  function addNetwork() {
    const v = newNet.trim()
    if (!v || (acl?.allow_query || []).includes(v)) return
    set('allow_query', [...(acl?.allow_query || []), v])
    setNewNet('')
  }

  async function save() {
    setSaving(true); setStatus(null)
    try {
      const payload = {
        ...acl,
        allow_query: [...LOCKED_NETWORKS, ...userNetworks],
        listen_on: ['any'],
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

      {/* IP do servidor — cards estilo Dashboard */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {[
          { label: 'IPv4 do Servidor DNS', value: serverIps.ipv4, loading: loading },
          { label: 'IPv6 do Servidor DNS', value: serverIps.ipv6, loading: loading },
        ].map(({ label, value, loading: ld }) => (
          <div key={label} style={{
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-lg)',
            padding: '16px 18px',
            display: 'flex', flexDirection: 'column', gap: 4,
          }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.6px', fontWeight: 600 }}>
              {label}
            </span>
            <div style={{ fontSize: 20, fontWeight: 700, color: value ? 'var(--accent)' : 'var(--text-muted)', letterSpacing: '-0.5px', lineHeight: 1.3, wordBreak: 'break-all' }}>
              {ld ? '…' : (value || '—')}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {value ? 'Detectado automaticamente' : 'Não detectado'}
            </div>
          </div>
        ))}
      </div>

      {/* Redes autorizadas */}
      <div style={panel}>
        <div style={sectionLabel}>Redes autorizadas (allow-query)</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {LOCKED_NETWORKS.map(n => <Chip key={n} label={n} locked />)}
          {userNetworks.map(n => (
            <Chip key={n} label={n} locked={!isAdmin} onRemove={isAdmin ? () =>
              set('allow_query', [...LOCKED_NETWORKS, ...userNetworks.filter(x => x !== n)])
            : undefined} />
          ))}
        </div>
        {isAdmin && (
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
              Adicionar bloco público do cliente
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input value={newNet} onChange={e => setNewNet(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addNetwork())}
                placeholder="ex: 177.130.48.0/20 ou 2804:235c::/32"
                style={{ ...input, flex: 1 }} />
              <button onClick={addNetwork} style={btn('primary')}><Plus size={13} /></button>
            </div>
          </div>
        )}
      </div>

      {/* Forwarders */}
      <div style={panel}>
        <ForwarderEditor items={acl.forwarders || []} onChange={v => set('forwarders', v)} readOnly={!isAdmin} />
      </div>

      {/* Save — só admin */}
      {isAdmin && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={save} disabled={saving} style={btn('primary')}>
            {saving ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={13} />}
            Salvar e recarregar BIND
          </button>
        </div>
      )}

      {status && <StatusBadge ok={status.ok} msg={status.msg} />}
    </div>
  )
}

// ── aba: Avançado (options + local + bloqueios) ───────────────────────────────

function CollapsibleFile({ title, description, fetchFn, saveFn, readOnly = false }) {
  const [open, setOpen]         = useState(false)
  const [content, setContent]   = useState('')
  const [loaded, setLoaded]     = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [saving, setSaving]     = useState(false)
  const [checking, setChecking] = useState(false)
  const [status, setStatus]     = useState(null)

  async function load() {
    if (loaded) return
    try {
      const r = await fetchFn()
      setContent(r.content || '')
      setLoaded(true)
    } catch (e) {
      setLoadError(e.message || 'Erro ao carregar arquivo')
      setLoaded(true)
    }
  }

  function toggle() {
    if (!open) load()
    setOpen(o => !o)
    setStatus(null)
  }

  async function check() {
    setChecking(true); setStatus(null)
    try {
      // Valida o conteúdo atual do editor (não o arquivo salvo em disco)
      const r = await api.validateBindContent(content, title)
      setStatus({
        ok: r.ok,
        msg: r.ok ? '✓ Configuração válida — nenhum erro encontrado' : r.output,
      })
    } catch (e) {
      setStatus({ ok: false, msg: e.message })
    } finally {
      setChecking(false)
    }
  }

  async function save() {
    setSaving(true); setStatus(null)
    try {
      const r = await saveFn(content)
      // Após salvar, roda checkconf para confirmar
      const chk = await api.checkBindConf()
      setStatus({
        ok: r.ok && chk.ok,
        msg: r.ok
          ? (chk.ok ? '✓ Arquivo salvo e BIND recarregado — configuração válida' : `Salvo, mas checkconf reportou:\n${chk.output}`)
          : r.output,
      })
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
          {readOnly && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-canvas)', padding: '2px 6px', borderRadius: 4 }}>
              somente leitura
            </span>
          )}
          {open ? <ChevronDown size={16} color="var(--text-muted)" /> : <ChevronRight size={16} color="var(--text-muted)" />}
        </div>
      </button>

      {open && (
        <div style={{ padding: 16, background: 'var(--bg-canvas)' }}>
          {!loaded
            ? <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Carregando…</div>
            : loadError
            ? <div style={{ color: 'var(--red)', fontSize: 13 }}>Erro: {loadError}</div>
            : <>
                <TextEditor value={content} onChange={setContent} height={360} readOnly={readOnly} />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                  <button onClick={check} disabled={checking || saving} style={btn('ghost')}>
                    {checking
                      ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} />
                      : <CheckCircle size={12} />}
                    Validar
                  </button>
                  {!readOnly && (
                    <button onClick={save} disabled={saving || checking} style={btn('primary')}>
                      {saving
                        ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} />
                        : <Save size={12} />}
                      Salvar
                    </button>
                  )}
                </div>
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
        description="Zonas de bloqueio — editável. Atenção: a tela de Bloqueios sobrescreve este arquivo automaticamente ao adicionar/remover domínios."
        fetchFn={api.getBindBloqueios}
        saveFn={content => api.saveBindBloqueios(content)}
      />
    </div>
  )
}

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
          }}>
            {[['gui', <Layers size={12} />, 'GUI'], ['pro', <Code size={12} />, 'Pro']].map(([m, ico, lbl]) => (
              <button key={m} onClick={() => setZoneMode(m)} style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '6px 12px', border: 'none', cursor: 'pointer', fontSize: 12,
                background: zoneMode === m ? 'var(--accent)' : 'transparent',
                color: zoneMode === m ? '#fff' : 'var(--text-secondary)',
                fontWeight: zoneMode === m ? 700 : 400,
              }}>{ico}{lbl}</button>
            ))}
          </div>
          {zoneMode === 'gui' && (
            <button onClick={() => setShowAddRecord(true)} style={btn('primary')}>
              <Plus size={13} /> Registro
            </button>
          )}
          {zoneMode === 'pro' && (
            <button onClick={saveZonePro} disabled={saving} style={btn('primary')}>
              {saving ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={12} />}
              Salvar
            </button>
          )}
        </div>
      </div>

      {status && <StatusBadge ok={status.ok} msg={status.msg} />}

      {/* GUI: tabela de registros */}
      {zoneMode === 'gui' && (
        <div>
          {records.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>
              Nenhum registro encontrado. Clique em "Registro" para adicionar.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Nome', 'TTL', 'Tipo', 'Valor'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11 }}>{h}</th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {records.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border-dim)' }}>
                    <td style={{ padding: '9px 12px', fontWeight: 500 }}>{r.name}</td>
                    <td style={{ padding: '9px 12px', color: 'var(--text-muted)' }}>{r.ttl}</td>
                    <td style={{ padding: '9px 12px' }}>
                      <span style={{
                        background: 'var(--accent-dim)', color: 'var(--accent)',
                        padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                      }}>{r.type}</span>
                    </td>
                    <td style={{ padding: '9px 12px', fontFamily: 'monospace' }}>{r.value}</td>
                    <td style={{ padding: '9px 12px' }}>
                      <button style={btn('danger')} onClick={async () => {
                        const raw = `${r.name} ${r.ttl} IN ${r.type} ${r.value}`
                        const res = await api.deleteRecord(selected.name, raw)
                        setStatus({ ok: res.ok, msg: res.output })
                        if (res.ok) loadZoneRecords(selected)
                      }}>
                        <Trash2 size={11} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Pro: editor de texto */}
      {zoneMode === 'pro' && (
        <TextEditor value={zoneFileContent} onChange={setZoneFileContent} height={480} />
      )}

      {/* Modal: novo registro */}
      {showAddRecord && (
        <Modal title="Adicionar Registro" onClose={() => setShowAddRecord(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Nome</label>
                <input value={rec.name} onChange={e => setRec(r => ({ ...r, name: e.target.value }))} placeholder="@ ou subdomínio" style={input} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>TTL</label>
                <input value={rec.ttl} onChange={e => setRec(r => ({ ...r, ttl: e.target.value }))} placeholder="3600" style={input} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Tipo</label>
                <select value={rec.type} onChange={e => setRec(r => ({ ...r, type: e.target.value }))} style={input}>
                  {RECORD_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              {rec.type === 'MX' && (
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Prioridade</label>
                  <input value={rec.priority} onChange={e => setRec(r => ({ ...r, priority: e.target.value }))} placeholder="10" style={input} />
                </div>
              )}
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Valor</label>
              <input value={rec.value} onChange={e => setRec(r => ({ ...r, value: e.target.value }))}
                placeholder={rec.type === 'A' ? '192.168.1.1' : rec.type === 'CNAME' ? 'alvo.dominio.com.' : 'valor'}
                style={input} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <button onClick={() => setShowAddRecord(false)} style={btn('ghost')}>Cancelar</button>
              <button onClick={addRecord} disabled={saving} style={btn('primary')}>
                {saving ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={12} />}
                Adicionar
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── página principal ──────────────────────────────────────────────────────────

const TABS = [
  { id: 'acl',      label: 'ACL & DNS', icon: Shield },
  { id: 'zones',    label: 'Zonas',     icon: Layers },
  { id: 'avancado', label: 'Avançado',  icon: Code },
]

export default function BindConfig() {
  const [tab, setTab] = useState('acl')
  const isAdmin = useIsAdmin()
  const visibleTabs = isAdmin ? TABS : TABS.filter(t => t.id === 'acl')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Server size={20} color="var(--accent)" /> Configurar DNS
      </h1>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 0,
        background: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-md)',
        overflow: 'hidden',
      }}>
        {visibleTabs.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)} style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            padding: '11px 16px', border: 'none', cursor: 'pointer', fontSize: 13,
            background: tab === id ? 'var(--accent-dim)' : 'transparent',
            color: tab === id ? 'var(--accent)' : 'var(--text-secondary)',
            fontWeight: tab === id ? 700 : 500,
            borderBottom: tab === id ? '2px solid var(--accent)' : '2px solid transparent',
          }}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      <div style={panel}>
        {tab === 'acl'      && <AclEditor />}
        {tab === 'zones'    && <ZonesGUI />}
        {tab === 'avancado' && <AdvancedEditor />}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
