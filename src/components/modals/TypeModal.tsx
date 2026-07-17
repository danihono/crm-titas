import { useState } from 'react'
import Modal from './Modal'
import MaterialIcon from '../common/MaterialIcon'
import RingButton from '../common/RingButton'
import { sx } from '../../styles/sx'
import { typeIcons, typeColors } from '../../lib/theme'
import { createActType } from '../../hooks/useActivities'
import type { ActType } from '../../types'

export default function TypeModal({ existingTypes, onClose }: { existingTypes: ActType[]; onClose: () => void }) {
  const [label, setLabel] = useState('')
  const [icon, setIcon] = useState('event')
  const [colorIdx, setColorIdx] = useState(2)
  const [busy, setBusy] = useState(false)

  async function handleCreate() {
    const n = label.trim()
    if (!n || busy) return
    setBusy(true)
    try {
      const c = typeColors[colorIdx] || typeColors[2]
      await createActType(n, icon, c.color, c.bg, c.ev)
      setLabel('')
      setIcon('event')
      setColorIdx(2)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal width={460} onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ ...sx.serif, fontSize: 23, fontWeight: 600, color: '#1d1726' }}>Tipos de atividade</div>
        <MaterialIcon name="close" size={23} color="#9c95a8" style={{ cursor: 'pointer' }} onClick={onClose} />
      </div>
      <div style={{ fontSize: 12.5, color: '#6e6780', marginBottom: 16 }}>Crie seus próprios tipos — ligação, visita, proposta, o que precisar.</div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 20 }}>
        {existingTypes.map((et) => (
          <span key={et.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: et.color, background: et.bg, borderRadius: 20, padding: '5px 11px' }}>
            <MaterialIcon name={et.icon} size={15} />{et.label}
          </span>
        ))}
      </div>

      <div style={{ height: 1, background: '#eeebf3', marginBottom: 18 }} />

      <label style={sx.label}>Nome do tipo</label>
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex: Visita técnica" style={{ ...sx.input, margin: '6px 0 16px' }} />

      <label style={sx.label}>Ícone</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '8px 0 16px' }}>
        {typeIcons.map((ic) => {
          const on = icon === ic
          return (
            <div key={ic} onClick={() => setIcon(ic)} className="ms" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 20, border: '1px solid ' + (on ? '#7a52a0' : '#e6e3ee'), background: on ? 'rgba(150,110,200,0.12)' : '#f7f5fa', color: on ? '#7a52a0' : '#9c95a8' }}>{ic}</div>
          )
        })}
      </div>

      <label style={sx.label}>Cor</label>
      <div style={{ display: 'flex', gap: 11, margin: '9px 0 22px' }}>
        {typeColors.map((c, i) => {
          const on = colorIdx === i
          return (
            <div key={i} onClick={() => setColorIdx(i)} style={{ width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', background: c.color, border: '3px solid ' + (on ? '#1d1726' : 'transparent'), boxShadow: '0 0 0 2px ' + (on ? '#fff' : 'transparent') + ' inset' }} />
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={{ background: '#f3f1f7', border: '1px solid #e6e3ee', borderRadius: 11, padding: '10px 18px', color: '#4a4458', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Fechar</button>
        <RingButton radius={11} onClick={handleCreate} style={{ background: 'linear-gradient(140deg,#7a52a0,#553578)', border: '1px solid rgba(200,160,230,0.3)', padding: '10px 20px', color: '#f4eefa', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.7 : 1 }}>Adicionar tipo</RingButton>
      </div>
    </Modal>
  )
}
