import { useState } from 'react'
import Modal from './Modal'
import MaterialIcon from '../common/MaterialIcon'
import RingButton from '../common/RingButton'
import { C, sx } from '../../styles/sx'
import { t, type Chave } from '../../i18n'

/** Opções de janela da recuperação de histórico. `days: 0` = máximo que der. */
const RANGE_OPTIONS: { days: number; label: Chave; hint: Chave }[] = [
  { days: 7, label: 'modal.hist7', hint: 'modal.hist7Desc' },
  { days: 30, label: 'modal.hist30', hint: 'modal.hist30Desc' },
  { days: 90, label: 'modal.hist90', hint: 'modal.hist90Desc' },
  { days: 365, label: 'modal.hist365', hint: 'modal.hist365Desc' },
  { days: 0, label: 'modal.histMax', hint: 'modal.histMaxDesc' },
]

/**
 * Escolha do período da recuperação de histórico do WhatsApp.
 * `onConfirm(maxDays)` recebe o nº de dias ou undefined para "máximo que der".
 */
export default function HistoryRangeModal({ contactName, onConfirm, onClose }: { contactName: string; onConfirm: (maxDays?: number) => void; onClose: () => void }) {
  const [days, setDays] = useState(0)

  return (
    <Modal width={430} onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ ...sx.serif, fontSize: 23, color: C.ink }}>{t('modal.recuperarHistorico')}</div>
        <MaterialIcon name="close" size={23} color={C.muted} style={{ cursor: 'pointer' }} onClick={onClose} />
      </div>
      <div style={{ fontSize: 12.5, color: C.sub, marginBottom: 16 }}>
        {/* Partida em duas chaves para o nome continuar em negrito no meio da
            frase. Nos três idiomas ele cai no mesmo lugar. */}
        {t('modal.buscaremosAntes')} <b>{contactName}</b> {t('modal.buscaremosDepois')}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 22 }}>
        {RANGE_OPTIONS.map((opt) => {
          const on = days === opt.days
          return (
            <button
              key={opt.days}
              type="button"
              onClick={() => setDays(opt.days)}
              style={{ display: 'flex', alignItems: 'center', gap: 11, textAlign: 'left', padding: '10px 13px', borderRadius: 11, cursor: 'pointer', border: '1px solid ' + (on ? C.purple : C.fieldBorder), background: on ? C.tintPurple : '#fbfafd' }}
            >
              <MaterialIcon name={on ? 'radio_button_checked' : 'radio_button_unchecked'} size={18} color={on ? C.purple : '#c6c0d2'} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: on ? C.purpleDeep : C.ink }}>{t(opt.label)}</div>
                <div style={{ fontSize: 11.5, color: C.sub, marginTop: 1 }}>{t(opt.hint)}</div>
              </div>
            </button>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={{ background: C.raised, border: `1px solid ${C.fieldBorder}`, borderRadius: 11, padding: '10px 18px', color: C.strong, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{t('comum.cancelar')}</button>
        <RingButton radius={11} onClick={() => onConfirm(days || undefined)} style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'linear-gradient(140deg,#7a52a0,#553578)', border: '1px solid rgba(200,160,230,0.3)', padding: '10px 20px', color: '#f4eefa', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          <MaterialIcon name="history" size={16} /> {t('modal.recuperar')}
        </RingButton>
      </div>
    </Modal>
  )
}
