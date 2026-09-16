import { useState } from 'react'
import Modal from '../modals/Modal'
import MaterialIcon from '../common/MaterialIcon'
import RingButton from '../common/RingButton'
import { ColorDots, Field } from '../settings/primitives'
import { colorGradient } from '../../lib/color'
import { sx, C } from '../../styles/sx'
import { plural, t } from '../../i18n'
import type { BoardForm } from '../../hooks/useDeals'
import type { Board } from '../../types'

/** Ícones oferecidos para o quadro — o suficiente para separar funis sem virar catálogo. */
const BOARD_ICONS = [
  'dashboard', 'view_kanban', 'handshake', 'trending_up', 'storefront', 'campaign',
  'support_agent', 'engineering', 'inventory_2', 'school', 'favorite', 'rocket_launch',
]

/**
 * Criar e editar quadro no mesmo lugar. Em edição também exclui — e a confirmação diz
 * quantos negócios vão junto, porque não há como desfazer.
 */
export default function BoardModal({ board, dealCount, onClose, onSave, onDelete }: {
  board: Board | null
  dealCount: number
  onClose: () => void
  onSave: (form: BoardForm) => Promise<void>
  onDelete?: () => Promise<void>
}) {
  const [name, setName] = useState(board?.name ?? '')
  const [icon, setIcon] = useState(board?.icon ?? 'dashboard')
  const [color, setColor] = useState(board?.color ?? '#7a52a0')
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
      console.error('[BoardModal]', err)
      setError(err instanceof Error ? err.message : fallback)
      setBusy(false)
    }
  }

  return (
    <Modal width={460} onClose={() => !busy && onClose()}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ width: 42, height: 42, borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', background: colorGradient(color) }}>
          <MaterialIcon name={icon} size={22} color="#fff" />
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>
          {t(board ? 'quadro.editar' : 'quadro.novo')}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 16 }}>
        <Field label={t('quadro.nome')}>
          <input
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) void run(() => onSave({ name, icon, color }), t('quadro.falhaSalvar')) }}
            placeholder={t('quadro.nomeExemplo')}
            style={sx.input}
          />
        </Field>

        <Field label={t('modal.icone')}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {BOARD_ICONS.map((ic) => (
              <button
                key={ic}
                type="button"
                onClick={() => setIcon(ic)}
                title={ic}
                style={{
                  width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 10, cursor: 'pointer',
                  background: ic === icon ? C.tintPurpleStrong : C.field,
                  border: '1px solid ' + (ic === icon ? C.purple : C.fieldBorder),
                }}
              >
                <MaterialIcon name={ic} size={19} color={ic === icon ? C.purple : C.sub} />
              </button>
            ))}
          </div>
        </Field>

        <Field label={t('config.cor')}>
          <ColorDots value={color} onChange={setColor} />
        </Field>

        {error && (
          <div style={{ fontSize: 12.5, color: C.rose, fontWeight: 600 }}>{error}</div>
        )}

        {confirming && onDelete && (
          <div style={{ background: 'rgba(193,77,119,0.08)', border: '1px solid rgba(193,77,119,0.25)', borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ fontSize: 13, color: C.ink, fontWeight: 700, marginBottom: 4 }}>{t('quadro.confirmarTitulo', { nome: board?.name ?? '' })}</div>
            <div style={{ fontSize: 12.5, color: C.sub, lineHeight: 1.5 }}>
              {dealCount > 0
                ? plural(dealCount, 'quadro.confirmarComNegocios_1', 'quadro.confirmarComNegocios_n')
                : t('quadro.confirmarVazio')}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                onClick={() => void run(onDelete, t('quadro.falhaExcluir'))}
                disabled={busy}
                style={{ border: 'none', borderRadius: 10, padding: '8px 14px', background: '#c14d77', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: busy ? 'wait' : 'pointer' }}
              >
                {t(busy ? 'nota.excluindo' : 'nota.simExcluir')}
              </button>
              <button
                onClick={() => setConfirming(false)}
                disabled={busy}
                style={{ ...sx.btnGhost, padding: '8px 14px', fontSize: 12.5 }}
              >
                {t('nota.manter')}
              </button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {board && onDelete && !confirming && (
            <button
              onClick={() => setConfirming(true)}
              disabled={busy}
              style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'transparent', color: C.roseDeep, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', padding: '8px 2px' }}
            >
              <MaterialIcon name="delete" size={18} /> {t('quadro.excluirQuadro')}
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={onClose} disabled={busy} style={sx.btnGhost}>{t('comum.cancelar')}</button>
          <RingButton
            radius={11}
            disabled={busy || !name.trim()}
            onClick={() => void run(() => onSave({ name, icon, color }), t('quadro.falhaSalvar'))}
            wrapStyle={{ opacity: busy || !name.trim() ? 0.5 : 1 }}
            style={{ ...sx.btnPrimary, background: colorGradient(color, 140) }}
          >
            <MaterialIcon name="check" size={18} /> {t(board ? 'comum.salvar' : 'quadro.criar')}
          </RingButton>
        </div>
      </div>
    </Modal>
  )
}
