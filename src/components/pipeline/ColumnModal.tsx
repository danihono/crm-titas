import { useState } from 'react'
import Modal from '../modals/Modal'
import MaterialIcon from '../common/MaterialIcon'
import RingButton from '../common/RingButton'
import { ColorDots, Field } from '../settings/primitives'
import { sx, C } from '../../styles/sx'
import { plural, t } from '../../i18n'
import type { ColumnForm } from '../../hooks/useDeals'
import type { Column } from '../../types'

/**
 * Editar uma etapa do quadro: título, cor e exclusão. A confirmação diz quantos negócios
 * vão junto — mesma regra do quadro, pelo mesmo motivo (não há desfazer).
 */
export default function ColumnModal({ column, dealCount, canDelete, onClose, onSave, onDelete }: {
  column: Column
  dealCount: number
  /** Falso quando é a última etapa do quadro — um quadro sem etapa não recebe negócio. */
  canDelete: boolean
  onClose: () => void
  onSave: (form: ColumnForm) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [title, setTitle] = useState(column.title)
  const [color, setColor] = useState(column.color)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)

  async function run(fn: () => Promise<void>, fallback: string) {
    setBusy(true)
    setError('')
    try {
      await fn()
      onClose()
    } catch (err) {
      console.error('[ColumnModal]', err)
      setError(err instanceof Error ? err.message : fallback)
      setBusy(false)
    }
  }

  return (
    <Modal width={420} onClose={() => !busy && onClose()}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <span style={{ width: 12, height: 12, borderRadius: 4, background: color }} />
        <div style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>{t('etapa.editar')}</div>
      </div>

      <div style={{ display: 'grid', gap: 16 }}>
        <Field label={t('etapa.titulo')}>
          <input
            value={title}
            autoFocus
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && title.trim()) void run(() => onSave({ title, color }), t('etapa.falhaSalvar')) }}
            placeholder={t('etapa.tituloExemplo')}
            style={sx.input}
          />
        </Field>

        <Field label={t('config.cor')}>
          <ColorDots value={color} onChange={setColor} />
        </Field>

        {error && <div style={{ fontSize: 12.5, color: C.rose, fontWeight: 600 }}>{error}</div>}

        {confirming && (
          <div style={{ background: 'rgba(193,77,119,0.08)', border: '1px solid rgba(193,77,119,0.25)', borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ fontSize: 13, color: C.ink, fontWeight: 700, marginBottom: 4 }}>{t('quadro.confirmarTitulo', { nome: column.title })}</div>
            <div style={{ fontSize: 12.5, color: C.sub, lineHeight: 1.5 }}>
              {dealCount > 0
                ? plural(dealCount, 'etapa.confirmarComNegocios_1', 'etapa.confirmarComNegocios_n')
                : t('etapa.confirmarVazia')}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                onClick={() => void run(onDelete, t('etapa.falhaExcluir'))}
                disabled={busy}
                style={{ border: 'none', borderRadius: 10, padding: '8px 14px', background: '#c14d77', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: busy ? 'wait' : 'pointer' }}
              >
                {t(busy ? 'nota.excluindo' : 'nota.simExcluir')}
              </button>
              <button onClick={() => setConfirming(false)} disabled={busy} style={{ ...sx.btnGhost, padding: '8px 14px', fontSize: 12.5 }}>
                {t('nota.manter')}
              </button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {!confirming && (
            canDelete ? (
              <button
                onClick={() => setConfirming(true)}
                disabled={busy}
                style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'transparent', color: C.roseDeep, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', padding: '8px 2px' }}
              >
                <MaterialIcon name="delete" size={18} /> {t('etapa.excluirEtapa')}
              </button>
            ) : (
              <span style={{ fontSize: 11.5, color: C.faint }}>{t('etapa.ultima')}</span>
            )
          )}
          <div style={{ flex: 1 }} />
          <button onClick={onClose} disabled={busy} style={sx.btnGhost}>{t('comum.cancelar')}</button>
          <RingButton
            radius={11}
            disabled={busy || !title.trim()}
            onClick={() => void run(() => onSave({ title, color }), t('etapa.falhaSalvar'))}
            wrapStyle={{ opacity: busy || !title.trim() ? 0.5 : 1 }}
            style={{ ...sx.btnPrimary }}
          >
            <MaterialIcon name="check" size={18} /> {t('comum.salvar')}
          </RingButton>
        </div>
      </div>
    </Modal>
  )
}
