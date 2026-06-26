import { useState } from 'react'
import Modal from './Modal'
import MaterialIcon from '../common/MaterialIcon'
import { sx } from '../../styles/sx'
import { saveScheduledMessage } from '../../hooks/useEvents'
import { dateKeyOf } from '../../lib/format'

export default function SchedMessageModal({ contactName, onClose, onSaved }: { contactName: string; onClose: () => void; onSaved: (dayKey: string) => void }) {
  const [text, setText] = useState('')
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const [date, setDate] = useState(dateKeyOf(tomorrow))
  const [time, setTime] = useState('09:00')
  const [busy, setBusy] = useState(false)

  async function handleSave() {
    if (!text.trim() || busy) return
    setBusy(true)
    try {
      await saveScheduledMessage(contactName, text, date, time)
      onSaved(date)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal width={470} onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 6 }}>
        <MaterialIcon name="schedule_send" size={24} color="#1f8a4c" style={{ background: 'rgba(52,199,89,0.14)', width: 42, height: 42, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }} />
        <div style={{ flex: 1 }}>
          <div style={{ ...sx.serif, fontSize: 22, fontWeight: 600, color: '#1d1726' }}>Agendar mensagem</div>
          <div style={{ fontSize: 12, color: '#6e6780' }}>Para {contactName} · WhatsApp</div>
        </div>
        <MaterialIcon name="close" size={23} color="#9c95a8" style={{ cursor: 'pointer' }} onClick={onClose} />
      </div>

      <label style={{ ...sx.label, display: 'block', marginTop: 16 }}>Mensagem</label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="Ex: Oi! Passando para saber se você teve tempo de ver a proposta 🙂"
        style={{ ...sx.input, margin: '6px 0 14px', resize: 'vertical', lineHeight: 1.5 }}
      />

      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={sx.label}>Dia do envio</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...sx.input, margin: '6px 0 18px' }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={sx.label}>Hora</label>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ ...sx.input, margin: '6px 0 18px' }} />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(52,199,89,0.1)', border: '1px solid rgba(52,199,89,0.2)', borderRadius: 11, padding: '10px 13px', marginBottom: 18 }}>
        <MaterialIcon name="event_available" size={18} color="#1f8a4c" />
        <span style={{ fontSize: 12, color: '#1f6e3e' }}>O envio também aparecerá como lembrete na sua <b>Agenda</b>.</span>
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={{ background: '#f3f1f7', border: '1px solid #e6e3ee', borderRadius: 11, padding: '10px 18px', color: '#4a4458', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
        <button onClick={handleSave} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'linear-gradient(140deg,#34c759,#1f9c46)', border: '1px solid rgba(52,199,89,0.4)', borderRadius: 11, padding: '10px 20px', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.7 : 1 }}>
          <MaterialIcon name="send" size={17} /> Agendar envio
        </button>
      </div>
    </Modal>
  )
}
