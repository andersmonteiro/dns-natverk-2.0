import { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, ShieldOff, Upload, X, CheckCircle, AlertCircle, FileText, Loader } from 'lucide-react'
import { api } from '../api'
import Panel from '../components/Panel'
import { useIsAdmin } from '../context/UserContext'

// ── Estilos base ──────────────────────────────────────────────────────────────

const inputStyle = {
  padding: '8px 12px',
  background: 'var(--bg-panel-2)',
  border: '1px solid var(--border-2)',
  borderRadius: 'var(--r-md)',
  color: 'var(--text-primary)',
  fontSize: 13,
  outline: 'none',
}

// ── Stat Card para o preview ──────────────────────────────────────────────────

function StatChip({ label, value, color }) {
  return (
    <div style={{
      flex: 1, minWidth: 100,
      background: 'var(--bg-panel-2)', borderRadius: 'var(--r-md)',
      padding: '12px 14px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || 'var(--text-primary)' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
    </div>
  )
}

// ── Modal de importação em lote ───────────────────────────────────────────────

function ImportModal({ onClose, onSuccess }) {
  const fileRef = useRef(null)
  const [step, setStep]         = useState('upload')
  const [files, setFiles]       = useState([])
  const [dragging, setDragging] = useState(false)
  const [preview, setPreview]   = useState(null)
  const [result, setResult]     = useState(null)
  const [error, setError]       = useState('')
  const [progress, setProgress] = useState({ current: 0, total: 0, file: '' })

  function addFiles(list) {
    const valid = list.filter(f => /\.(xlsx|pdf)$/i.test(f.name))
    if (!valid.length) { setError('Selecione arquivos .xlsx ou .pdf'); return }
    setFiles(prev => {
      const names = new Set(prev.map(f => f.name))
      return [...prev, ...valid.filter(f => !names.has(f.name))]
    })
    setError('')
  }

  function removeFile(name) {
    setFiles(prev => prev.filter(f => f.name !== name))
  }

  async function handleProcess() {
    if (!files.length) return
    setStep('processing')
    setError('')
    setProgress({ current: 0, total: files.length, file: '' })

    const agg = {
      found: 0, already_blocked: 0, whitelisted: 0,
      domains: new Set(), files: [], errors: [],
    }

    for (let i = 0; i < files.length; i++) {
      const f = files[i]
      setProgress({ current: i + 1, total: files.length, file: f.name })
      try {
        const res = await api.importBlocksPreview([f])
        agg.found          += res.found          || 0
        agg.already_blocked += res.already_blocked || 0
        agg.whitelisted    += res.whitelisted    || 0
        res.domains?.forEach(d => agg.domains.add(d))
        agg.files.push(...(res.files || []))
        if (res.errors?.length) agg.errors.push(...res.errors)
      } catch (e) {
        agg.errors.push(`${f.name}: ${e.message}`)
      }
    }

    const domains = [...agg.domains]
    setPreview({
      found: agg.found,
      already_blocked: agg.already_blocked,
      whitelisted: agg.whitelisted,
      new: domains.length,
      domains,
      sample: domains.slice(0, 100),
      files: agg.files,
      errors: agg.errors,
    })
    setStep('preview')
  }

  async function handleApply() {
    setStep('applying')
    try {
      const source = files.map(f => f.name).join(', ')
      const data = await api.importBlocksApply(preview.domains, source)
      setResult(data)
      setStep('done')
      onSuccess()
    } catch (e) {
      setError(e.message)
      setStep('preview')
    }
  }

  const overlay = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  }
  const box = {
    background: 'var(--bg-panel)', border: '1px solid var(--border)',
    borderRadius: 'var(--r-sm)', padding: 28, width: 600, maxWidth: '95vw',
    maxHeight: '90vh', overflowY: 'auto',
  }
  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0

  return (
    <div style={overlay} onClick={onClose}>
      <div style={box} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>Importar Bloqueios em Lote</h2>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Aceita planilhas Anatel (.xlsx) e ofícios em PDF
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        {/* ── STEP: upload ── */}
        {step === 'upload' && (
          <>
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); addFiles([...e.dataTransfer.files]) }}
              onClick={() => fileRef.current?.click()}
              style={{
                border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 8, padding: 32, textAlign: 'center', cursor: 'pointer',
                background: dragging ? 'var(--accent-dim)' : 'var(--bg-canvas)',
                transition: '.15s', marginBottom: 14,
              }}
            >
              <Upload size={28} style={{ margin: '0 auto 10px', display: 'block', color: 'var(--text-muted)' }} />
              <div style={{ color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500 }}>
                Arraste arquivos aqui ou clique para selecionar
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>
                .xlsx (planilha Anatel) · .pdf (ofício de bloqueio)
              </div>
              <input ref={fileRef} type="file" multiple accept=".xlsx,.pdf"
                style={{ display: 'none' }} onChange={e => addFiles([...e.target.files])} />
            </div>

            {files.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                {files.map(f => (
                  <div key={f.name} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: 'var(--bg-panel-2)', borderRadius: 6, padding: '7px 12px', fontSize: 13,
                  }}>
                    <FileText size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                    <span style={{ flex: 1, color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: 12 }}>{f.name}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{(f.size / 1024).toFixed(0)} KB</span>
                    <button onClick={() => removeFile(f.name)} style={{
                      background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2,
                    }}><X size={12} /></button>
                  </div>
                ))}
              </div>
            )}

            {error && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>
                <AlertCircle size={14} /> {error}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={onClose} style={{
                padding: '8px 16px', background: 'transparent', border: '1px solid var(--border)',
                borderRadius: 'var(--r-sm)', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer',
              }}>Cancelar</button>
              <button onClick={handleProcess} disabled={!files.length} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', background: 'var(--accent)', border: 'none',
                borderRadius: 'var(--r-sm)', color: '#fff', fontSize: 13, fontWeight: 600,
                cursor: !files.length ? 'not-allowed' : 'pointer', opacity: !files.length ? 0.5 : 1,
              }}>
                <Upload size={14} /> Analisar
              </button>
            </div>
          </>
        )}

        {/* ── STEP: processing — barra de progresso ── */}
        {step === 'processing' && (
          <div style={{ padding: '8px 0 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>
                Processando arquivo {progress.current} de {progress.total}
              </span>
              <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 700 }}>{pct}%</span>
            </div>
            <div style={{
              fontSize: 11, color: 'var(--text-muted)', marginBottom: 14,
              fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {progress.file || '…'}
            </div>
            {/* Barra de progresso */}
            <div style={{ background: 'var(--bg-canvas)', borderRadius: 99, height: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
              <div style={{
                height: '100%', borderRadius: 99,
                width: `${pct}%`,
                background: 'linear-gradient(90deg, var(--accent), var(--green))',
                transition: 'width 0.4s ease',
              }} />
            </div>
            {/* Lista de arquivos com indicador */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 16 }}>
              {files.map((f, i) => (
                <div key={f.name} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '5px 0', fontSize: 11,
                  color: i < progress.current ? 'var(--green)' : i === progress.current - 1 ? 'var(--text-primary)' : 'var(--text-muted)',
                }}>
                  {i < progress.current
                    ? <CheckCircle size={12} style={{ flexShrink: 0, color: 'var(--green)' }} />
                    : i === progress.current - 1
                      ? <Loader size={12} style={{ flexShrink: 0, animation: 'spin 1s linear infinite' }} />
                      : <div style={{ width: 12, height: 12, flexShrink: 0 }} />
                  }
                  <span style={{ fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                  <span style={{ marginLeft: 'auto', flexShrink: 0 }}>{(f.size / 1024).toFixed(0)} KB</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── STEP: preview ── */}
        {step === 'preview' && preview && (
          <>
            <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
              <StatChip label="Encontrados"  value={preview.found} />
              <StatChip label="Já bloqueados" value={preview.already_blocked} color="var(--text-muted)" />
              <StatChip label="Na whitelist"  value={preview.whitelisted} color="var(--yellow)" />
              <StatChip label="Novos"         value={preview.new} color="var(--accent)" />
            </div>

            {preview.errors?.length > 0 && (
              <div style={{ background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: 6, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: 'var(--red)' }}>
                {preview.errors.map((e, i) => <div key={i}>{e}</div>)}
              </div>
            )}

            {preview.new === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: '16px 0', marginBottom: 16 }}>
                Nenhum domínio novo para adicionar.
              </div>
            ) : (
              <>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                  Amostra dos primeiros {Math.min(preview.sample.length, 100)} domínios novos:
                </div>
                <div style={{
                  background: 'var(--bg-canvas)', border: '1px solid var(--border)',
                  borderRadius: 6, padding: '10px 12px', maxHeight: 180, overflowY: 'auto',
                  fontFamily: 'monospace', fontSize: 11, color: 'var(--text-secondary)',
                  lineHeight: 1.7, marginBottom: 16,
                }}>
                  {preview.sample.join('\n')}
                  {preview.new > preview.sample.length && (
                    <div style={{ color: 'var(--text-muted)', marginTop: 6 }}>
                      … e mais {preview.new - preview.sample.length} domínios
                    </div>
                  )}
                </div>
              </>
            )}

            {error && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>
                <AlertCircle size={14} /> {error}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <button onClick={() => { setStep('upload'); setPreview(null) }} style={{
                padding: '8px 16px', background: 'transparent', border: '1px solid var(--border)',
                borderRadius: 'var(--r-sm)', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer',
              }}>← Voltar</button>
              {preview.new > 0 ? (
                <button onClick={handleApply} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 20px', background: 'var(--red)', border: 'none',
                  borderRadius: 'var(--r-sm)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}>
                  <ShieldOff size={14} /> Bloquear {preview.new} domínios
                </button>
              ) : (
                <button onClick={onClose} style={{
                  padding: '8px 16px', background: 'var(--accent)', border: 'none',
                  borderRadius: 'var(--r-sm)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}>Fechar</button>
              )}
            </div>
          </>
        )}

        {/* ── STEP: applying ── */}
        {step === 'applying' && (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <Loader size={32} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px', display: 'block', color: 'var(--accent)' }} />
            <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Aplicando bloqueios e recarregando BIND…</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>Isso pode levar alguns segundos</div>
          </div>
        )}

        {/* ── STEP: done ── */}
        {step === 'done' && result && (
          <>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <CheckCircle size={40} style={{ color: 'var(--green)', margin: '0 auto 12px', display: 'block' }} />
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Importação concluída!</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>BIND recarregado com sucesso</div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 24, justifyContent: 'center' }}>
              <StatChip label="Adicionados" value={result.inserted} color="var(--green)" />
              <StatChip label="Ignorados"   value={result.skipped}  color="var(--text-muted)" />
            </div>
            <div style={{ textAlign: 'center' }}>
              <button onClick={onClose} style={{
                padding: '10px 28px', background: 'var(--accent)', border: 'none',
                borderRadius: 'var(--r-sm)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>Fechar</button>
            </div>
          </>
        )}

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function Blocklist() {
  const [blocks, setBlocks]         = useState([])
  const [newDomain, setNewDomain]   = useState('')
  const [error, setError]           = useState('')
  const [loading, setLoading]       = useState(false)
  const [search, setSearch]         = useState('')
  const [showImport, setShowImport] = useState(false)
  const [selected, setSelected]     = useState(new Set())
  const [removing, setRemoving]     = useState(false)
  const isAdmin = useIsAdmin()

  async function load() {
    try { setBlocks(await api.listBlocks()) } catch {}
    setSelected(new Set())
  }

  useEffect(() => { load() }, [])

  async function add(e) {
    e.preventDefault()
    if (!newDomain.trim()) return
    setError(''); setLoading(true)
    try {
      await api.addBlock(newDomain.trim())
      setNewDomain('')
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function remove(domain) {
    try { await api.removeBlock(domain); await load() } catch {}
  }

  async function removeSelected() {
    if (!selected.size) return
    setRemoving(true)
    try {
      await api.bulkRemoveBlocks([...selected])
      await load()
    } catch {}
    finally { setRemoving(false) }
  }

  function toggleSelect(domain) {
    setSelected(prev => {
      const s = new Set(prev)
      s.has(domain) ? s.delete(domain) : s.add(domain)
      return s
    })
  }

  const filtered = blocks.filter(b => b.domain.includes(search.toLowerCase()))
  const allSelected = filtered.length > 0 && filtered.every(b => selected.has(b.domain))

  function toggleAll() {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(filtered.map(b => b.domain)))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Lista de Bloqueios</h1>
        {isAdmin && (
          <button onClick={() => setShowImport(true)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px',
            background: 'var(--bg-panel-2)', border: '1px solid var(--border)',
            borderRadius: 'var(--r-sm)', color: 'var(--text-secondary)',
            fontSize: 13, fontWeight: 500, cursor: 'pointer',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
          >
            <Upload size={14} /> Importar
          </button>
        )}
      </div>

      {/* Adicionar manualmente — só admin */}
      {isAdmin && (
        <Panel title="Bloquear domínio">
          <form onSubmit={add} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <input
                type="text" value={newDomain}
                onChange={e => setNewDomain(e.target.value)}
                placeholder="ex: ads.example.com"
                style={{ ...inputStyle, width: '100%' }}
              />
            </div>
            <button type="submit" disabled={loading} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', background: 'var(--red)', border: 'none',
              borderRadius: 'var(--r-md)', color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}>
              <Plus size={15} /> Bloquear
            </button>
          </form>
          {error && <div style={{ marginTop: 10, color: 'var(--red)', fontSize: 13 }}>{error}</div>}
        </Panel>
      )}

      {/* Lista */}
      <Panel
        title={`Domínios bloqueados (${blocks.length})`}
        action={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {isAdmin && selected.size > 0 && (
              <button onClick={removeSelected} disabled={removing} style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '6px 12px', background: 'var(--red)', border: 'none',
                borderRadius: 'var(--r-sm)', color: '#fff', fontSize: 12, fontWeight: 600,
                cursor: removing ? 'not-allowed' : 'pointer',
              }}>
                {removing
                  ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} />
                  : <Trash2 size={12} />}
                Remover {selected.size}
              </button>
            )}
            <input
              type="text" value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filtrar…"
              style={{ ...inputStyle, width: 180, fontSize: 12 }}
            />
          </div>
        }
      >
        {filtered.length === 0
          ? <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
              <ShieldOff size={32} style={{ margin: '0 auto 8px', display: 'block', opacity: .3 }} />
              {blocks.length === 0 ? 'Nenhum domínio bloqueado' : 'Nenhum resultado para o filtro'}
            </div>
          : <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {isAdmin && (
                      <th style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', width: 32 }}>
                        <input type="checkbox" checked={allSelected} onChange={toggleAll}
                          style={{ cursor: 'pointer', accentColor: 'var(--accent)' }} />
                      </th>
                    )}
                    {['Domínio', 'Origem', 'Bloqueado por', 'Data', isAdmin ? '' : null].filter(Boolean).map(h => (
                      <th key={h} style={{
                        textAlign: 'left', padding: '8px 10px',
                        color: 'var(--text-muted)', fontWeight: 600, fontSize: 11,
                        textTransform: 'uppercase', letterSpacing: '.5px',
                        borderBottom: '1px solid var(--border)',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(b => (
                    <tr key={b.domain}
                      style={{ borderBottom: '1px solid var(--border)', background: selected.has(b.domain) ? 'var(--accent-dim)' : 'transparent' }}
                      onMouseEnter={e => { if (!selected.has(b.domain)) e.currentTarget.style.background = 'var(--bg-hover)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = selected.has(b.domain) ? 'var(--accent-dim)' : 'transparent' }}
                    >
                      {isAdmin && (
                        <td style={{ padding: '9px 10px' }}>
                          <input type="checkbox" checked={selected.has(b.domain)} onChange={() => toggleSelect(b.domain)}
                            style={{ cursor: 'pointer', accentColor: 'var(--accent)' }} />
                        </td>
                      )}
                      <td style={{ padding: '9px 10px', color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 12 }}>
                        {b.domain}
                      </td>
                      <td style={{ padding: '9px 10px' }}>
                        <span style={{
                          fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 10, letterSpacing: '.3px',
                          background: b.source && b.source !== 'manual' ? 'var(--accent-dim)' : 'var(--bg-panel-2)',
                          color: b.source && b.source !== 'manual' ? 'var(--accent)' : 'var(--text-muted)',
                        }}>
                          {b.source && b.source !== 'manual' ? 'importado' : 'manual'}
                        </span>
                      </td>
                      <td style={{ padding: '9px 10px', color: 'var(--text-secondary)' }}>{b.created_by || '—'}</td>
                      <td style={{ padding: '9px 10px', color: 'var(--text-muted)', fontSize: 11, whiteSpace: 'nowrap' }}>
                        {b.created_at ? new Date(b.created_at).toLocaleString('pt-BR') : '—'}
                      </td>
                      {isAdmin && (
                        <td style={{ padding: '9px 10px', textAlign: 'right' }}>
                          <button onClick={() => remove(b.domain)} style={{
                            background: 'transparent', border: 'none',
                            color: 'var(--text-muted)', cursor: 'pointer',
                            padding: 4, borderRadius: 4, transition: 'color .15s',
                          }}
                          onMouseEnter={e => e.currentTarget.style.color = 'var(--red)'}
                          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                          title="Remover bloqueio"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        }
      </Panel>

      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onSuccess={() => { setShowImport(false); load() }}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
