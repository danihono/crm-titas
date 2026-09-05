import { useState } from 'react'
import Modal from '../modals/Modal'
import MaterialIcon from '../common/MaterialIcon'
import RingButton from '../common/RingButton'
import { callGerarFluxoIA, type GeneratedFlow } from '../../hooks/useFlows'
import { kindMeta } from '../../lib/flow'
import { C, sx } from '../../styles/sx'

const EXEMPLOS = [
  'Captação de lead por indicação até o fechamento',
  'Onboarding de cliente novo depois da assinatura',
  'Cobrança de nota vencida, com régua de contato',
]

export default function AiFlowModal({ onClose, onConfirm }: {
  onClose: () => void
  onConfirm: (flow: GeneratedFlow) => Promise<void> | void
}) {
  const [descricao, setDescricao] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<GeneratedFlow | null>(null)

  async function generate() {
    const d = descricao.trim()
    if (!d || loading) return
    setLoading(true)
    setError('')
    try {
      const flow = await callGerarFluxoIA(d)
      if (!flow.nodes.length) {
        setError('A IA não conseguiu montar um fluxo com essa descrição. Tente detalhar mais.')
        return
      }
      setPreview(flow)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível gerar o fluxo agora.')
    } finally {
      setLoading(false)
    }
  }

  async function confirm() {
    if (!preview || saving) return
    setSaving(true)
    try {
      await onConfirm(preview)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal width={preview ? 560 : 480} onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 18 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(140deg,#9a6fb8,#5a3a7e)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <MaterialIcon name="auto_awesome" size={21} color="#fff" />
        </div>
        <div>
          <div style={{ fontSize: 15.5, fontWeight: 700, color: C.ink }}>Criar fluxo com IA</div>
          <div style={{ fontSize: 12, color: C.sub }}>Descreva o processo e o Titã IA desenha</div>
        </div>
      </div>

      {preview ? (
        <>
          <div style={{ fontSize: 13.5, color: C.ink, fontWeight: 700, marginBottom: 4 }}>{preview.name}</div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>
            {preview.nodes.length} etapas · {preview.edges.length} ligações
          </div>
          <div style={{ maxHeight: 280, overflowY: 'auto', border: `1px solid ${C.line}`, borderRadius: 12, padding: 12, background: C.surfaceAlt }}>
            {preview.nodes.map((n) => {
              const meta = kindMeta(n.kind)
              return (
                <div key={n.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '7px 0' }}>
                  <MaterialIcon name={meta.icon} size={16} color={meta.color} style={{ marginTop: 1 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{n.title}</div>
                    {n.subtitle && <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.4 }}>{n.subtitle}</div>}
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
            <button onClick={() => setPreview(null)} style={{ ...sx.btnGhost }}>
              <MaterialIcon name="refresh" size={17} /> Refazer
            </button>
            <div style={{ flex: 1 }} />
            <button onClick={onClose} style={{ ...sx.btnGhost }}>Cancelar</button>
            <RingButton radius={11} onClick={confirm} disabled={saving} style={{ ...sx.btnPrimary, opacity: saving ? 0.6 : 1 }}>
              <MaterialIcon name="check" size={18} /> {saving ? 'Criando...' : 'Criar fluxo'}
            </RingButton>
          </div>
        </>
      ) : (
        <>
          <label style={sx.label}>O que este fluxo precisa cobrir?</label>
          <textarea
            value={descricao}
            autoFocus
            rows={4}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Ex.: da chegada do lead pelo WhatsApp até o fechamento, com qualificação, proposta e uma decisão de aprovação de crédito."
            style={{ ...sx.input, margin: '6px 0 12px', resize: 'vertical', lineHeight: 1.5 }}
          />

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            {EXEMPLOS.map((ex) => (
              <button
                key={ex}
                onClick={() => setDescricao(ex)}
                style={{ background: C.surface, border: '1px solid #e2dcee', borderRadius: 20, padding: '6px 12px', color: C.purple, fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}
              >
                {ex}
              </button>
            ))}
          </div>

          {error && (
            <div style={{ fontSize: 12.5, color: C.roseDeep, background: 'rgba(193,77,119,0.08)', border: '1px solid rgba(193,77,119,0.25)', borderRadius: 10, padding: '9px 12px', marginBottom: 14, lineHeight: 1.45 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={{ ...sx.btnGhost }}>Cancelar</button>
            <RingButton
              radius={11}
              onClick={generate}
              disabled={loading || !descricao.trim()}
              style={{ ...sx.btnPrimary, opacity: loading || !descricao.trim() ? 0.6 : 1 }}
            >
              <MaterialIcon name="auto_awesome" size={18} /> {loading ? 'Desenhando...' : 'Gerar fluxo'}
            </RingButton>
          </div>
        </>
      )}
    </Modal>
  )
}
