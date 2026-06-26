import { deepMap, avPalette } from '../../lib/theme'
import { fmtK } from '../../lib/format'
import MaterialIcon from '../common/MaterialIcon'
import Card from './Card'
import type { Column as Col, Deal } from '../../types'

interface Props {
  column: Col
  cards: Deal[]
  readOnly?: boolean
  onDragStart: (id: string) => void
  onDrop: (columnId: string) => void
  onAddCard: (columnId: string) => void
}

export default function Column({ column, cards, readOnly, onDragStart, onDrop, onAddCard }: Props) {
  const sum = cards.reduce((s, c) => s + (c.value || 0), 0)
  const valColor = deepMap[column.color] || column.color

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        onDrop(column.id)
      }}
      style={{
        width: 286,
        flexShrink: 0,
        background: '#edebf3',
        border: '1px solid #e3e0eb',
        borderTop: `3px solid ${column.color}`,
        borderRadius: 16,
        padding: '14px 12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '2px 6px 14px' }}>
        <span style={{ width: 9, height: 9, borderRadius: 3, background: column.color }} />
        <span style={{ fontWeight: 700, fontSize: 13.5, color: '#1d1726' }}>{column.title}</span>
        <span style={{ fontSize: 11, color: '#6e6780', background: 'rgba(28,20,50,0.06)', borderRadius: 20, padding: '1px 8px', fontWeight: 700 }}>{cards.length}</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: '#9c95a8', fontWeight: 600 }}>R$ {fmtK(sum)}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 60 }}>
        {cards.map((deal, i) => (
          <Card
            key={deal.id}
            deal={deal}
            avBg={avPalette[i % avPalette.length]}
            valColor={valColor}
            readOnly={readOnly}
            onDragStart={onDragStart}
          />
        ))}
      </div>

      {!readOnly && (
        <button
          onClick={() => onAddCard(column.id)}
          style={{ width: '100%', marginTop: 10, background: 'transparent', border: '1px dashed #cfc8dd', borderRadius: 11, padding: 9, color: '#9c95a8', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
        >
          <MaterialIcon name="add" size={17} /> Adicionar
        </button>
      )}
    </div>
  )
}
