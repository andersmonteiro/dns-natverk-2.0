import { useState } from 'react'
import { Play, CheckCircle, XCircle, Loader, Power } from 'lucide-react'
import { api } from '../api'
import Panel from '../components/Panel'

function OpButton({ label, description, action, danger }) {
  const [state, setState] = useState('idle') // idle | loading | ok | err
  const [output, setOutput] = useState('')

  async function run() {
    setState('loading')
    setOutput('')
    try {
      const res = await action()
      setState(res.ok ? 'ok' : 'err')
      setOutput(res.output || '')
    } catch (e) {
      setState('err')
      setOutput(e.message)
    }
  }

  const colors = {
    idle: danger ? 'var(--red)' : 'var(--accent)',
    loading: 'var(--text-muted)',
    ok: 'var(--green)',
    err: 'var(--red)',
  }

  return (
    <div style={{
      background: 'var(--bg-panel-2)',
      border: `1px solid ${state === 'ok' ? 'var(--green-dim)' : state === 'err' ? 'var(--red-dim)' : 'var(--border)'}`,
      borderRadius: 'var(--r-md)',
      padding: 16,
      transition: 'border-color .2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{label}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>{description}</div>
        </div>
        <button onClick={run} disabled={state === 'loading'} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '7px 14px',
          background: 'transparent',
          border: `1px solid ${colors[state]}`,
          borderRadius: 'var(--r-sm)',
          color: colors[state],
          cursor: state === 'loading' ? 'not-allowed' : 'pointer',
          fontSize: 12, fontWeight: 600,
          whiteSpace: 'nowrap',
          transition: 'all .15s',
          flexShrink: 0,
        }}>
          {state === 'loading' && <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} />}
          {state === 'ok' && <CheckCircle size={13} />}
          {state === 'err' && <XCircle size={13} />}
          {state === 'idle' && <Play size={13} />}
          {state === 'loading' ? 'Executando…' : state === 'ok' ? 'OK' : state === 'err' ? 'Erro' : 'Executar'}
        </button>
      </div>

      {output && (
        <pre style={{
          marginTop: 12,
          padding: '10px 12px',
          background: 'var(--bg-canvas)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-sm)',
          fontSize: 12,
          color: state === 'err' ? 'var(--red)' : 'var(--green)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          fontFamily: 'monospace',
          maxHeight: 200,
          overflowY: 'auto',
        }}>
          {output}
        </pre>
      )}
    </div>
  )
}

export default function Operations() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>Operações BIND9</h1>

      <Panel title="Serviço BIND" subtitle="Controle do daemon named">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <OpButton
            label="Reiniciar BIND (systemctl restart named)"
            description="Reinicia o serviço named no host via nsenter. Use com cautela em produção."
            action={api.restartBind}
            danger
          />
        </div>
      </Panel>

      <Panel title="Controle do BIND" subtitle="Comandos rndc">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <OpButton
            label="Testar configuração"
            description="Executa named-checkconf e retorna qualquer erro de sintaxe"
            action={api.checkconf}
          />
          <OpButton
            label="rndc flush"
            description="Limpa o cache do BIND (todos os registros TTL expiram imediatamente)"
            action={api.rndcFlush}
            danger
          />
          <OpButton
            label="rndc stats"
            description="Gera /var/cache/bind/named.stats com estatísticas detalhadas"
            action={api.rndcStats}
          />
          <OpButton
            label="rndc reconfig"
            description="Recarrega named.conf sem reiniciar o serviço (hot reload)"
            action={api.rndcReconfig}
          />
          <OpButton
            label="rndc querylog on"
            description="Ativa o query log (necessário após rndc reconfig)"
            action={api.rndcQuerylog}
          />
        </div>
      </Panel>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
