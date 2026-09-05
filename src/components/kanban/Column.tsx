import { deepMap, avPalette } from '../../lib/theme'
import { fmtK } from '../../lib/format'
import MaterialIcon from '../common/MaterialIcon'
import Card from './Card'
import type { Column as Col, Deal } from '../../types'
import { C } from '../../styles/sx'

interface Props {
  column: Col
  cards: Deal[]
  readOnly?: boolean
  /** Etapa de quadro do sistema: some o mover/editar, mas o card continua livre. */
  fixed?: boolean
  /** Falso na primeira/última etapa — desabilita a seta que não tem para onde ir. */
  canMoveLeft?: boolean
  canMoveRight?: boolean
  onDragStart: (id: string) => void
  onDrop: (columnId: string) => void
  onAddCard: (columnId: string) => void
  onOpenCard: (deal: Deal) => void
  onEdit?: (column: Col) => void
  onMove?: (columnId: string, dir: 'left' | 'right') => void
}

export default function Column({
  column, cards, readOnly, fixed, canMoveLeft, canMoveRight,
  onDragStart, onDrop, onAddCard, onOpenCard, onEdit, onMove,
}: Props) {
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
        background: C.column,
        border: '1px solid #e3e0eb',
        borderTop: `3px solid ${column.color}`,
        borderRadius: 16,
        padding: '14px 12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '2px 6px 4px' }}>
        <span style={{ width: 9, height: 9, borderRadius: 3, background: column.color }} />
        <span style={{ fontWeight: 700, fontSize: 13.5, color: C.ink, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{column.title}</span>
        <span style={{ fontSize: 11, color: C.sub, background: C.tintNeutral, borderRadius: 20, padding: '1px 8px', fontWeight: 700 }}>{cards.length}</span>
        {!readOnly && !fixed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <HeadAction icon="chevron_left" title="Mover para a esquerda" disabled={!canMoveLeft} onClick={() => onMove?.(column.id, 'left')} />
            <HeadAction icon="chevron_right" title="Mover para a direita" disabled={!canMoveRight} onClick={() => onMove?.(column.id, 'right')} />
            <HeadAction icon="edit" title="Editar etapa" onClick={() => onEdit?.(column)} />
          </div>
        )}
      </div>
      <div style={{ display: 'flex', padding: '0 6px 12px' }}>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>R$ {fmtK(sum)}</span>
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
            onOpen={onOpenCard}
          />
        ))}
      </div>

      {!readOnly && (
        <button
          onClick={() => onAddCard(column.id)}
          style={{ width: '100%', marginTop: 10, background: 'transparent', border: '1px dashed #cfc8dd', borderRadius: 11, padding: 9, color: C.muted, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
        >
          <MaterialIcon name="add" size={17} /> Adicionar
        </button>
      )}
    </div>
  )
}

/** Botãozinho das ações no cabeçalho da coluna (mover / editar). */
function HeadAction({ icon, title, onClick, disabled }: { icon: string; title: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: 'none', borderRadius: 7, background: 'transparent',
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.25 : 1, padding: 0,
        // Enquanto a fonte de ícones não carrega, o Material Symbols mostra a ligadura
        // como texto ("chevron_left") — largo o bastante para vazar por cima do botão
        // vizinho e roubar o clique dele. O recorte segura isso.
        overflow: 'hidden', flexShrink: 0,
      }}
    >
      <MaterialIcon name={icon} size={16} color={C.sub} />
    </button>
  )
}
