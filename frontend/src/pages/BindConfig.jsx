import { useState, useEffect, useCallback } from 'react'
import {
  Server, Plus, Trash2, Edit3, Code, Layers,
  CheckCircle, XCircle, RefreshCw, Save, ChevronRight,
  ArrowLeft, Loader, Shield,
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

// ── aba: ACL & Forwarders ────────────────────────────────────────────────────

function ListEditor({ label, items, onChange, placeholder }) {
  const [val, setVal] = useState('')

  function add() {
    const v = val.trim()
    if (!v || items.includes(v)) return
    onChange([...items, v])
    setVal('')
  }

  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 600 }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {items.map(item => (
          <div key={item} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: 'var(--bg-canvas)', border: '1px solid var(--border)',
            borderRadius: 'var(--r-sm)', padding: '4px 8px', fontSize: 12,
            fontFamily: 'monospace', color: 'var(--text-primary)',
          }}>
            {item}
            <button onClick={() => onChange(items.filter(i => i !== item))} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', padding: 0, lineHeight: 1,
              display: 'flex', alignItems: 'center',
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--red)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
            >×</button>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), add())}
          placeholder={placeholder}
          style={{ ...input, flex: 1 }}
        />
        <button onClick={add} style={btn('primary')}><Plus size={13} /></button>
      </div>
    </div>
  )
}

function AclEditor() {
  const [acl, setAcl]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [status, setStatus]   = useState(null)

  useEffect(() => {
    api.getAcl().then(r => { setAcl(r); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  function set(key, val) { setAcl(a => ({ ...a, [key]: val })) }

  async function save() {
    setSaving(true); setStatus(null)
    try {
      const r = await api.saveAcl(acl)
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

      {/* ACL */}
      <div style={panel}>
        <ListEditor
          label="Redes autorizadas (allow-query)"
          items={acl.allow_query || []}
          onChange={v => set('allow_query', v)}
          placeholder="ex: 192.168.1.0/24 ou 10.0.0.0/8"
        />
      </div>

      {/* Forwarders */}
      <div style={panel}>
        <ListEditor
          label="Servidores de encaminhamento (forwarders)"
          items={acl.forwarders || []}
          onChange={v => set('forwarders', v)}
          placeholder="ex: 1.1.1.1 ou 2606:4700:4700::1111"
        />
      </div>

      {/* Listen-on */}
      <div style={panel}>
        <ListEditor
          label="Interfaces de escuta (listen-on)"
          items={acl.listen_on || []}
          onChange={v => set('listen_on', v)}
          placeholder='ex: 177.130.50.42 ou "any"'
        />
      </div>

      {/* Performance */}
      <div style={panel}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 600 }}>Performance</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
          {[
            ['max_cache_size',    'Max cache size',      'text',   '4096M'],
            ['recursive_clients', 'Recursive clients',   'number', 15000],
            ['tcp_clients',       'TCP clients',         'number', 5000],
            ['min_cache_ttl',     'Min cache TTL (s)',   'number', 60],
            ['max_cache_ttl',     'Max cache TTL (s)',   'number', 86400],
            ['max_ncache_ttl',    'Max ncache TTL (s)',  'number', 3600],
          ].map(([key, lbl, type, def]) => (
            <div key={key}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{lbl}</label>
              <input
                type={type}
                value={acl[key] ?? def}
                onChange={e => set(key, type === 'number' ? +e.target.value : e.target.value)}
                style={{ ...input }}
              />
            </div>
          ))}
        </div>

        {/* Toggles */}
        <div style={{ display: 'flex', gap: 24, marginTop: 16 }}>
          {[
            ['version_hidden',  'Ocultar versão do BIND'],
            ['auth_nxdomain',   'auth-nxdomain yes'],
          ].map(([key, lbl]) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={!!acl[key]} onChange={e => set(key, e.target.checked)} />
              {lbl}
            </label>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 13, color: 'var(--text-muted)' }}>DNSSEC:</label>
            <select value={acl.dnssec_validation || 'auto'} onChange={e => set('dnssec_validation', e.target.value)}
              style={{ ...input, width: 'auto', padding: '4px 8px' }}>
              <option value="auto">auto</option>
              <option value="yes">yes</option>
              <option value="no">no</option>
            </select>
          </div>
        </div>
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

// ── aba: named.conf.options ───────────────────────────────────────────────────

function OptionsEditor() {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState(null)

  useEffect(() => {
    api.getBindOptions().then(r => {
      setContent(r.content || '')
      setLoading(false)
    })
  }, [])

  async function save() {
    setSaving(true)
    try {
      const r = await api.saveBindOptions(content)
      setStatus({ ok: r.ok, msg: r.output })
    } catch (e) {
      setStatus({ ok: false, msg: e.message })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Carregando…</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>named.conf.options — opções globais do servidor</span>
        <button onClick={save} disabled={saving} style={btn('primary')}>
          {saving ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={12} />}
          Salvar
        </button>
      </div>
      <TextEditor value={content} onChange={setContent} height={500} />
      {status && <StatusBadge ok={status.ok} msg={status.msg} />}
    </div>
  )
}

// ── aba: named.conf.local (pro) ───────────────────────────────────────────────

function LocalEditor() {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState(null)

  useEffect(() => {
    api.getBindLocal().then(r => {
      setContent(r.content || '')
      setLoading(false)
    })
  }, [])

  async function save() {
    setSaving(true)
    try {
      const r = await api.saveBindLocal(content)
      setStatus({ ok: r.ok, msg: r.output })
    } catch (e) {
      setStatus({ ok: false, msg: e.message })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Carregando…</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>named.conf.local — declaração de zonas</span>
        <button onClick={save} disabled={saving} style={btn('primary')}>
          {saving ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={12} />}
          Salvar
        </button>
      </div>
      <TextEditor value={content} onChange={setContent} height={500} />
      {status && <StatusBadge ok={status.ok} msg={status.msg} />}
    </div>
  )
}

// ── página principal ──────────────────────────────────────────────────────────

const TABS = [
  { id: 'acl',     label: 'ACL & DNS',         icon: Shield },
  { id: 'zones',   label: 'Zonas',             icon: Layers },
  { id: 'options', label: 'Opções (avançado)',  icon: Server },
  { id: 'local',   label: 'named.conf.local',  icon: Code },
]

export default function BindConfig() {
  const [tab, setTab] = useState('acl')

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
        {TABS.map(({ id, label, icon: Icon }) => (
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
        {tab === 'acl'     && <AclEditor />}
        {tab === 'zones'   && <ZonesGUI />}
        {tab === 'options' && <OptionsEditor />}
        {tab === 'local'   && <LocalEditor />}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
