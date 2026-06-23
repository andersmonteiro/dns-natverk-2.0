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
  const [step, setStep]         = useState('upload')   // upload | processing | preview | applying | done
  const [files, setFiles]       = useState([])
  const [dragging, setDragging] = useState(false)
  const [preview, setPreview]   = useState(null)
  const [result, setResult]     = useState(null)
  const [error, setError]       = useState('')

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
    setStep('processing'); setError('')
    try {
      const data = await api.importBlocksPreview(files)
      setPreview(data)
      setStep('preview')
    } catch (e) {
      setError(e.message)
      setStep('upload')
    }
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
        {(step === 'upload' || step === 'processing') && (
          <>
            {/* Drop zone */}
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

            {/* Lista de arquivos selecionados */}
            {files.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                {files.map(f => (
                  <div key={f.name} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: 'var(--bg-panel-2)', borderRadius: 6, padding: '7px 12px',
                    fontSize: 13,
                  }}>
                    <FileText size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                    <span style={{ flex: 1, color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: 12 }}>{f.name}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                      {(f.size / 1024).toFixed(0)} KB
                    </span>
                    <button onClick={() => removeFile(f.name)} style={{
                      background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2,
                    }}>
                      <X size={12} />
                    </button>
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
              <button onClick={handleProcess} disabled={!files.length || step === 'processing'} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', background: 'var(--accent)', border: 'none',
                borderRadius: 'var(--r-sm)', color: '#fff', fontSize: 13, fontWeight: 600,
                cursor: !files.length || step === 'processing' ? 'not-allowed' : 'pointer',
                opacity: !files.length ? 0.5 : 1,
              }}>
                {step === 'processing'
                  ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Processando…</>
                  : <><Upload size={14} /> Analisar</>
                }
              </button>
            </div>
          </>
        )}

        {/* ── STEP: preview ── */}
        {step === 'preview' && preview && (
          <>
            {/* Stats */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
              <StatChip label="Encontrados" value={preview.found} />
              <StatChip label="Já bloqueados" value={preview.already_blocked} color="var(--text-muted)" />
              <StatChip label="Na whitelist" value={preview.whitelisted} color="var(--yellow)" />
              <StatChip label="Novos" value={preview.new} color="var(--accent)" />
            </div>

            {/* Erros de extração */}
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

              {preview.new > 0 && (
                <button onClick={handleApply} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 20px', background: 'var(--red)', border: 'none',
                  borderRadius: 'var(--r-sm)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}>
                  <ShieldOff size={14} /> Bloquear {preview.new} domínios
                </button>
              )}
              {preview.new === 0 && (
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
              <StatChip label="Ignorados" value={result.skipped} color="var(--text-muted)" />
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
  const [blocks, setBlocks]       = useState([])
  const [newDomain, setNewDomain] = useState('')
  const [error, setError]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [search, setSearch]       = useState('')
  const [showImport, setShowImport] = useState(false)
  const isAdmin = useIsAdmin()

  async function load() {
    try { setBlocks(await api.listBlocks()) } catch {}
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

  const filtered = blocks.filter(b => b.domain.includes(search.toLowerCase()))

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
            <Upload size={14} /> Importar lote
          </button>
        )}
      </div>

      {/* Adicionar manualmente — só admin */}
      {isAdmin && (
        <Panel title="Bloquear domínio">
          <form onSubmit={add} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <input
                type="text"
                value={newDomain}
                onChange={e => setNewDomain(e.target.value)}
                placeholder="ex: ads.example.com"
                style={{ ...inputStyle, width: '100%' }}
              />
            </div>
            <button type="submit" disabled={loading} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px',
              background: 'var(--red)', border: 'none',
              borderRadius: 'var(--r-md)', color: '#fff',
              fontSize: 13, fontWeight: 600,
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
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filtrar…"
            style={{ ...inputStyle, width: 180, fontSize: 12 }}
          />
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
                    <tr key={b.domain} style={{ borderBottom: '1px solid var(--border)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '9px 10px', color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 12 }}>
                        {b.domain}
                      </td>
                      <td style={{ padding: '9px 10px' }}>
                        <span style={{
                          fontSize: 10, fontWeight: 600, padding: '2px 7px',
                          borderRadius: 10, letterSpacing: '.3px',
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

      {/* Modal de importação */}
      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onSuccess={() => { setShowImport(false); load() }}
        />
      )}
    </div>
  )
}
