import { useState } from 'react'
import MaterialIcon from '../common/MaterialIcon'
import RingButton from '../common/RingButton'
import Placeholder from '../common/Placeholder'
import { useTenantStore } from '../../store/tenantStore'
import { deleteFlow, renameFlow } from '../../hooks/useFlows'
import { relativeLabel } from '../../lib/format'
import { sx } from '../../styles/sx'
import type { Flow } from '../../types'

export default function FlowsList({ flows, loading, onOpen, onCreate, onCreateWithAI }: {
  flows: Flow[]
  loading: boolean
  onOpen: (id: string) => void
  onCreate: () => Promise<void> | void
  onCreateWithAI: () => void
}) {
  const readOnly = useTenantStore((s) => s.readOnly)
  const [busy, setBusy] = useState(false)

  function handleRename(flow: Flow) {
    const n = window.prompt('Nome do fluxo:', flow.name)?.trim()
    if (!n || n === flow.name) return
    renameFlow(flow.id, n).catch((e) => {
      alert(e instanceof Error ? e.message : 'Falha ao renomear o fluxo.')
    })
  }

  function handleDelete(flow: Flow) {
    if (!window.confirm(`Excluir o fluxo "${flow.name}"? Isso não pode ser desfeito.`)) return
    deleteFlow(flow.id).catch((e) => {
      alert(e instanceof Error ? e.message : 'Falha ao excluir o fluxo.')
    })
  }

  async function handleCreate() {
    setBusy(true)
    try { await onCreate() } finally { setBusy(false) }
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '24px 30px 0', marginBottom: 22 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#1d1726' }}>Fluxos</div>
          <div style={{ fontSize: 12.5, color: '#6e6780' }}>
            Desenhe seus processos num quadro livre — ou peça para a IA montar.
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {!readOnly && (
          <>
            <button onClick={onCreateWithAI} style={{ ...sx.btnGhost }}>
              <MaterialIcon name="auto_awesome" size={18} color="#7a52a0" /> Criar com IA
            </button>
            <RingButton radius={11} onClick={handleCreate} disabled={busy} style={{ ...sx.btnPrimary, opacity: busy ? 0.6 : 1 }}>
              <MaterialIcon name="add" size={18} /> Novo fluxo
            </RingButton>
          </>
        )}
      </div>

      {loading ? (
        <div style={{ padding: '0 30px 40px', fontSize: 13, color: '#9c95a8' }}>Carregando...</div>
      ) : flows.length === 0 ? (
        <Placeholder
          icon="account_tree"
          title="Nenhum fluxo por aqui ainda"
          note={readOnly
            ? 'Este cliente ainda não criou nenhum fluxo.'
            : 'Crie um quadro em branco e arraste as etapas, ou descreva o processo e deixe a IA desenhar.'}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(268px,1fr))', gap: 14, padding: '0 30px 40px' }}>
          {flows.map((f) => (
            <div
              key={f.id}
              onClick={() => onOpen(f.id)}
              style={{ ...sx.card, padding: '16px 18px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 10 }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 11, background: 'rgba(150,110,200,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <MaterialIcon name={f.source === 'ia' ? 'auto_awesome' : 'account_tree'} size={20} color="#7a52a0" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#1d1726', wordBreak: 'break-word' }}>{f.name}</div>
                  <div style={{ fontSize: 11.5, color: '#9c95a8', marginTop: 2 }}>
                    {f.nodes.length} {f.nodes.length === 1 ? 'etapa' : 'etapas'}
                    {f.updatedAt && ` · ${relativeLabel(f.updatedAt)}`}
                  </div>
                </div>
              </div>

              {!readOnly && (
                <div style={{ display: 'flex', gap: 6, paddingTop: 10, borderTop: '1px solid #f1eff5' }}>
                  <CardAction icon="edit" label="Renomear" onClick={(e) => { e.stopPropagation(); handleRename(f) }} />
                  <CardAction icon="delete" label="Excluir" color="#b73d6d" onClick={(e) => { e.stopPropagation(); handleDelete(f) }} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CardAction({ icon, label, color = '#6e6780', onClick }: {
  icon: string
  label: string
  color?: string
  onClick: (e: React.MouseEvent) => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 5, flex: 1, justifyContent: 'center',
        background: 'transparent', border: 'none', borderRadius: 8, padding: '6px 0',
        color, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: "'Manrope',sans-serif",
      }}
    >
      <MaterialIcon name={icon} size={16} /> {label}
    </button>
  )
}
