import { useEffect, useRef, useState } from 'react'
import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react'
import MaterialIcon from '../common/MaterialIcon'
import { useTenantStore } from '../../store/tenantStore'
import { kindMeta, NODE_W, type TitasNode } from '../../lib/flow'

const handleStyle = {
  width: 10,
  height: 10,
  background: '#ffffff',
  border: '2px solid #b6aec6',
  borderRadius: '50%',
}

/** A "caixinha" do quadro de fluxos. Duplo clique no título edita na hora. */
export default function FlowNodeCard({ id, data, selected }: NodeProps<TitasNode>) {
  const { updateNodeData } = useReactFlow()
  const readOnly = useTenantStore((s) => s.readOnly)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(data.title)
  const inputRef = useRef<HTMLInputElement>(null)
  const meta = kindMeta(data.kind)

  // Mantém o rascunho alinhado quando o título muda pelo inspetor.
  useEffect(() => { setDraft(data.title) }, [data.title])
  useEffect(() => { if (editing) inputRef.current?.select() }, [editing])

  function commit() {
    setEditing(false)
    const t = draft.trim()
    if (t && t !== data.title) updateNodeData(id, { title: t })
    else setDraft(data.title)
  }

  return (
    <div
      onDoubleClick={() => { if (!readOnly) setEditing(true) }}
      style={{
        width: NODE_W,
        background: '#ffffff',
        // Lados declarados um a um de propósito: misturar `border` com
        // `borderLeft` faz o React avisar sobre shorthand conflitante.
        borderTop: '1px solid ' + (selected ? '#9a6fb8' : '#e6e3ee'),
        borderRight: '1px solid ' + (selected ? '#9a6fb8' : '#e6e3ee'),
        borderBottom: '1px solid ' + (selected ? '#9a6fb8' : '#e6e3ee'),
        borderLeft: '4px solid ' + meta.color,
        borderRadius: 14,
        padding: '11px 14px',
        boxShadow: selected
          ? '0 6px 20px rgba(110,65,150,0.22)'
          : '0 1px 2px rgba(28,20,50,0.04),0 6px 16px rgba(28,20,50,0.05)',
        fontFamily: "'Manrope',sans-serif",
      }}
    >
      <Handle type="target" position={Position.Top} style={handleStyle} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
        <MaterialIcon name={meta.icon} size={13} color={meta.color} />
        <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.1em', color: meta.color, textTransform: 'uppercase' }}>
          {meta.label}
        </span>
      </div>

      {editing ? (
        <input
          ref={inputRef}
          className="nodrag"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') { setDraft(data.title); setEditing(false) }
          }}
          style={{
            width: '100%', background: '#f7f5fa', border: '1px solid #d9d2e6', borderRadius: 8,
            padding: '4px 7px', color: '#1d1726', fontSize: 13.5, fontWeight: 700,
            outline: 'none', fontFamily: "'Manrope',sans-serif",
          }}
        />
      ) : (
        <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1d1726', lineHeight: 1.3, wordBreak: 'break-word' }}>
          {data.title || 'Sem título'}
        </div>
      )}

      {data.subtitle && (
        <div style={{ fontSize: 11.5, color: '#9c95a8', lineHeight: 1.4, marginTop: 3, wordBreak: 'break-word' }}>
          {data.subtitle}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} style={handleStyle} />
    </div>
  )
}
