import { useState } from 'react'
import Modal from './Modal'
import MaterialIcon from '../common/MaterialIcon'
import RingButton from '../common/RingButton'
import { C, sx } from '../../styles/sx'
import { saveActivity, type NewActivityForm } from '../../hooks/useActivities'
import { dateKeyOf } from '../../lib/format'
import type { ActType } from '../../types'

export default function ActivityModal({ types, contactOptions, contatoFixo, inicial, nota, onClose, onSaved }: {
  types: ActType[]
  /**
   * Clientes para escolher. Carrega o id junto porque é ele que amarra a
   * atividade à conversa — escolher só o nome deixaria o vínculo pela metade.
   */
  contactOptions: { id: string; nome: string }[]
  /**
   * Quando a atividade nasce DENTRO de uma conversa, o cliente não é escolha —
   * é o dono da conversa. O select vira uma linha fixa e o vínculo por id vai
   * junto, que é o que liga a agenda ao atendimento.
   */
  contatoFixo?: { id: string; nome: string }
  /** Campos já preenchidos (a sugestão do Titã IA cai aqui). */
  inicial?: Partial<NewActivityForm>
  /** Uma linha explicando de onde veio o preenchimento. */
  nota?: string
  onClose: () => void
  onSaved: (dayKey: string) => void
}) {
  const [form, setForm] = useState<NewActivityForm>({
    type: types[0]?.id ?? 'call',
    title: '',
    contact: contatoFixo?.nome ?? contactOptions[0]?.nome ?? '',
    contactId: contatoFixo?.id ?? contactOptions[0]?.id,
    date: dateKeyOf(new Date()),
    time: '09:00',
    ...inicial,
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
        <div style={{ ...sx.serif, fontSize: 23, fontWeight: 600, color: C.ink }}>Nova atividade</div>
        <MaterialIcon name="close" size={23} color={C.muted} style={{ cursor: 'pointer' }} onClick={onClose} />
      </div>

      {nota && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: C.tintPurple, border: `1px solid ${C.selBorder}`, borderRadius: 11, padding: '10px 12px', marginBottom: 16 }}>
          <MaterialIcon name="auto_awesome" size={17} color={C.purple} />
          <span style={{ fontSize: 12, color: C.sub, lineHeight: 1.45 }}>{nota}</span>
        </div>
      )}

      <label style={sx.label}>Tipo de atividade</label>
      <select value={form.type} onChange={(e) => set('type')(e.target.value)} style={{ ...sx.input, margin: '6px 0 14px' }}>
        {types.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
      </select>

      <label style={sx.label}>Título</label>
      <input value={form.title} onChange={(e) => set('title')(e.target.value)} placeholder="Ex: Follow-up da proposta" style={{ ...sx.input, margin: '6px 0 14px' }} />

      <label style={sx.label}>Quem (cliente / contato)</label>
      {contatoFixo ? (
        <div style={{ ...sx.input, margin: '6px 0 14px', display: 'flex', alignItems: 'center', gap: 8, color: C.sub }}>
          <MaterialIcon name="link" size={16} color={C.purple} />
          <span style={{ color: C.ink, fontWeight: 600 }}>{contatoFixo.nome}</span>
          <span style={{ fontSize: 11.5 }}>· vinculado a esta conversa</span>
        </div>
      ) : (
        <select
          value={form.contactId ?? ''}
          onChange={(e) => {
            const c = contactOptions.find((x) => x.id === e.target.value)
            setForm((f) => ({ ...f, contactId: c?.id, contact: c?.nome ?? '' }))
          }}
          style={{ ...sx.input, margin: '6px 0 14px' }}
        >
          {contactOptions.length === 0 && <option value="">—</option>}
          {contactOptions.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      )}

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

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.tintPurpleWeak, border: '1px solid rgba(150,110,200,0.18)', borderRadius: 11, padding: '10px 13px', marginBottom: 18 }}>
        <MaterialIcon name="event_available" size={18} color={C.purple} />
        <span style={{ fontSize: 12, color: C.sub }}>A atividade também será criada na sua <b>Agenda</b> no dia e hora escolhidos.</span>
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={{ background: C.raised, border: `1px solid ${C.fieldBorder}`, borderRadius: 11, padding: '10px 18px', color: C.strong, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
        <RingButton radius={11} onClick={handleSave} style={{ background: 'linear-gradient(140deg,#7a52a0,#553578)', border: '1px solid rgba(200,160,230,0.3)', padding: '10px 20px', color: '#f4eefa', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.7 : 1 }}>Criar atividade</RingButton>
      </div>
    </Modal>
  )
}
