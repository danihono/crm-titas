import { tagMap } from '../../lib/theme'
import { fmtBRL } from '../../lib/format'
import MaterialIcon from '../common/MaterialIcon'
import type { Deal } from '../../types'

interface Props {
  deal: Deal
  avBg: string
  valColor: string
  readOnly?: boolean
  onDragStart: (id: string) => void
}

export default function Card({ deal, avBg, valColor, readOnly, onDragStart }: Props) {
  const [tagColor, tagBg] = tagMap[deal.tag] || tagMap.Novo

  return (
    <div
      draggable={!readOnly}
      onDragStart={(e) => {
        if (readOnly) return
        onDragStart(deal.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      style={{
        background: '#ffffff',
        border: '1px solid #e8e5f0',
        borderRadius: 13,
        padding: 14,
        cursor: readOnly ? 'default' : 'grab',
        boxShadow: '0 1px 2px rgba(28,20,50,0.05),0 3px 10px rgba(28,20,50,0.05)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: tagColor, background: tagBg, borderRadius: 6, padding: '2px 8px' }}>{deal.tag}</span>
        <MaterialIcon name="drag_indicator" size={16} color="#c4bfd0" />
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#1d1726', marginBottom: 3 }}>{deal.company}</div>
      <div style={{ fontSize: 12, color: '#6e6780', marginBottom: 12 }}>{deal.contact}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: valColor }}>{fmtBRL(deal.value)}</div>
        <div style={{ width: 26, height: 26, borderRadius: '50%', background: avBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff' }}>{deal.initials}</div>
      </div>
    </div>
  )
}
