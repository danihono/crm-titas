import { useState } from 'react'
import Modal from './Modal'
import MaterialIcon from '../common/MaterialIcon'
import { sx } from '../../styles/sx'
import { saveActivity, type NewActivityForm } from '../../hooks/useActivities'
import { dateKeyOf } from '../../lib/format'
import type { ActType } from '../../types'

export default function ActivityModal({ types, contactOptions, onClose, onSaved }: {
  types: ActType[]
  contactOptions: string[]
  onClose: () => void
  onSaved: (dayKey: string) => void
}) {
  const [form, setForm] = useState<NewActivityForm>({
    type: types[0]?.id ?? 'call',
    title: '',
    contact: contactOptions[0] ?? '',
    date: dateKeyOf(new Date()),
    time: '09:00',
  })
  const [busy, setBusy] = useState(false)
  const set = (k: keyof NewActivityForm) => (v: string) => setForm((f) => ({ ...f, [k]: v }))

  async function handleSave() {
    if (!form.title.trim() || busy) return
    setBusy(true)
    try {
      const day = await saveActivity(form, types)
      onSaved(day)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal width={480} onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ ...sx.serif, fontSize: 23, fontWeight: 600, color: '#1d1726' }}>Nova atividade</div>
        <MaterialIcon name="close" size={23} color="#9c95a8" style={{ cursor: 'pointer' }} onClick={onClose} />
      </div>

      <label style={sx.label}>Tipo de atividade</label>
      <select value={form.type} onChange={(e) => set('type')(e.target.value)} style={{ ...sx.input, margin: '6px 0 14px' }}>
        {types.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
      </select>

      <label style={sx.label}>Título</label>
      <input value={form.title} onChange={(e) => set('title')(e.target.value)} placeholder="Ex: Follow-up da proposta" style={{ ...sx.input, margin: '6px 0 14px' }} />

      <label style={sx.label}>Quem (cliente / contato)</label>
      <select value={form.contact} onChange={(e) => set('contact')(e.target.value)} style={{ ...sx.input, margin: '6px 0 14px' }}>
        {contactOptions.length === 0 && <option value="">—</option>}
        {contactOptions.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>

      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={sx.label}>Dia</label>
          <input type="date" value={form.date} onChange={(e) => set('date')(e.target.value)} style={{ ...sx.input, margin: '6px 0 18px' }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={sx.label}>Hora</label>
          <input type="time" value={form.time} onChange={(e) => set('time')(e.target.value)} style={{ ...sx.input, margin: '6px 0 18px' }} />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(150,110,200,0.08)', border: '1px solid rgba(150,110,200,0.18)', borderRadius: 11, padding: '10px 13px', marginBottom: 18 }}>
        <MaterialIcon name="event_available" size={18} color="#7a52a0" />
        <span style={{ fontSize: 12, color: '#5a4a6e' }}>A atividade também será criada na sua <b>Agenda</b> no dia e hora escolhidos.</span>
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={{ background: '#f3f1f7', border: '1px solid #e6e3ee', borderRadius: 11, padding: '10px 18px', color: '#4a4458', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
        <button onClick={handleSave} style={{ background: 'linear-gradient(140deg,#7a52a0,#553578)', border: '1px solid rgba(200,160,230,0.3)', borderRadius: 11, padding: '10px 20px', color: '#f4eefa', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.7 : 1 }}>Criar atividade</button>
      </div>
    </Modal>
  )
}
