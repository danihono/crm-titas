import { useState } from 'react'
import Modal from './Modal'
import MaterialIcon from '../common/MaterialIcon'
import { sx } from '../../styles/sx'

/** Opções de janela da recuperação de histórico. `days: 0` = máximo que der. */
const RANGE_OPTIONS: { days: number; label: string; hint: string }[] = [
  { days: 7, label: 'Últimos 7 dias', hint: 'Só a última semana de conversa.' },
  { days: 30, label: 'Últimos 30 dias', hint: 'O último mês.' },
  { days: 90, label: 'Últimos 90 dias', hint: 'O último trimestre.' },
  { days: 365, label: 'Último ano', hint: 'Os últimos 12 meses.' },
  { days: 0, label: 'Máximo que der', hint: 'Tudo que o WhatsApp ainda tiver desta conversa.' },
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
        <div style={{ ...sx.serif, fontSize: 23, fontWeight: 600, color: '#1d1726' }}>Recuperar histórico</div>
        <MaterialIcon name="close" size={23} color="#9c95a8" style={{ cursor: 'pointer' }} onClick={onClose} />
      </div>
      <div style={{ fontSize: 12.5, color: '#6e6780', marginBottom: 16 }}>
        Buscaremos as conversas antigas com <b>{contactName}</b> no WhatsApp — pode não vir tudo.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 22 }}>
        {RANGE_OPTIONS.map((opt) => {
          const on = days === opt.days
          return (
            <button
              key={opt.days}
              type="button"
              onClick={() => setDays(opt.days)}
              style={{ display: 'flex', alignItems: 'center', gap: 11, textAlign: 'left', padding: '10px 13px', borderRadius: 11, cursor: 'pointer', border: '1px solid ' + (on ? '#7a52a0' : '#e6e3ee'), background: on ? 'rgba(150,110,200,0.1)' : '#fbfafd' }}
            >
              <MaterialIcon name={on ? 'radio_button_checked' : 'radio_button_unchecked'} size={18} color={on ? '#7a52a0' : '#c6c0d2'} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: on ? '#553578' : '#1d1726' }}>{opt.label}</div>
                <div style={{ fontSize: 11.5, color: '#7a6f86', marginTop: 1 }}>{opt.hint}</div>
              </div>
            </button>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={{ background: '#f3f1f7', border: '1px solid #e6e3ee', borderRadius: 11, padding: '10px 18px', color: '#4a4458', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
        <button onClick={() => onConfirm(days || undefined)} style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'linear-gradient(140deg,#7a52a0,#553578)', border: '1px solid rgba(200,160,230,0.3)', borderRadius: 11, padding: '10px 20px', color: '#f4eefa', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          <MaterialIcon name="history" size={16} /> Recuperar
        </button>
      </div>
    </Modal>
  )
}
