import type { CSSProperties, ReactNode } from 'react'
import { C } from '../../styles/sx'
import MaterialIcon from '../common/MaterialIcon'
import type { DashboardWidget } from '../../types'
import type { WidgetDef } from '../../lib/dashboardWidgets'

/**
 * A moldura de card do painel — a mesma dos gráficos de antes.
 *
 * `overflow:hidden` + `minHeight:0` são o que mantém o painel numa tela só: se o
 * conteúdo crescer, ele rola DENTRO do card em vez de empurrar a página.
 */
export function ChartCard({ title, sub, right, children, style }: {
  title?: string
  sub?: string
  right?: ReactNode
  children: ReactNode
  style?: CSSProperties
}) {
  return (
    <div
      className="beam-card widget"
      style={{
        background: C.surface, border: `1px solid ${C.line}`, borderRadius: 18,
        padding: '16px 18px', overflow: 'hidden', minHeight: 0, height: '100%',
        display: 'flex', flexDirection: 'column', ...style,
      }}
    >
      {title && (
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
            {sub && <div className="widget-sub" style={{ fontSize: 11.5, color: C.muted, marginTop: 1 }}>{sub}</div>}
          </div>
          {right}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', marginTop: title ? 12 : 0 }}>
        {children}
      </div>
    </div>
  )
}

/**
 * Posiciona o widget na grade e, em modo de edição, veste os controles.
 *
 * O arraste é o HTML5 puro do Kanban (`draggable` + `onDragOver`/`preventDefault`
 * + `onDrop`), com uma diferença: soltar A sobre B faz os dois TROCAREM de lugar.
 * Troca, e não inserção, porque numa grade ela resolve o mesmo problema sem
 * precisar calcular índice de destino por `getBoundingClientRect` — muito menos
 * peça para dar errado.
 */
export default function WidgetShell({
  w, def, editando, selecionado, arrastando, onSelect, onDragStart, onDrop, children,
}: {
  w: DashboardWidget
  def: WidgetDef
  editando: boolean
  selecionado: boolean
  arrastando: boolean
  onSelect: () => void
  onDragStart: () => void
  onDrop: () => void
  children: ReactNode
}) {
  const style: CSSProperties = {
    gridColumn: `span ${w.cols}`,
    gridRow: `span ${w.rows}`,
    minWidth: 0,
    minHeight: 0,
    position: 'relative',
  }

  if (!editando) return <div style={style}>{children}</div>

  return (
    <div
      style={{ ...style, cursor: 'grab', opacity: arrastando ? 0.4 : 1 }}
      draggable
      onDragStart={(e) => { onDragStart(); e.dataTransfer.effectAllowed = 'move' }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); onDrop() }}
      onClick={onSelect}
    >
      {/* O conteúdo continua desenhado, mas inerte e apagado: em edição a pessoa
          arruma o bloco, não lê o número dele — e a etiqueta com nome e tamanho
          precisa vencer o título do card, que está logo atrás. */}
      <div style={{ pointerEvents: 'none', height: '100%', opacity: 0.45 }}>{children}</div>

      <div
        style={{
          position: 'absolute', inset: 0, borderRadius: 18, pointerEvents: 'none',
          border: selecionado ? `2px solid ${C.purple}` : `2px dashed ${C.selBorder}`,
          background: selecionado ? 'var(--c-tint-purple-weak)' : 'transparent',
        }}
      />
      <div
        style={{
          position: 'absolute', top: 8, left: 8, display: 'flex', alignItems: 'center', gap: 5,
          background: C.inverse, color: C.onInverse, borderRadius: 8, padding: '3px 8px 3px 5px',
          fontSize: 10.5, fontWeight: 700, pointerEvents: 'none', maxWidth: 'calc(100% - 16px)',
        }}
      >
        <MaterialIcon name="drag_indicator" size={14} />
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{def.nome}</span>
        <span style={{ opacity: 0.6 }}>{w.cols}×{w.rows}</span>
      </div>
    </div>
  )
}
