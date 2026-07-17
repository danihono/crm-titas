import { useState } from 'react'
import { useUIStore } from '../store/uiStore'
import { useTenantStore } from '../store/tenantStore'
import { useBoards, useAllDeals, addBoard, addColumn, addDeal, moveDeal } from '../hooks/useDeals'
import Column from '../components/kanban/Column'
import MaterialIcon from '../components/common/MaterialIcon'
import RingButton from '../components/common/RingButton'
import { fmtK } from '../lib/format'
import { sx } from '../styles/sx'

export default function Pipeline() {
  const { docs: boards } = useBoards()
  const { docs: allDeals } = useAllDeals()
  const activeBoard = useUIStore((s) => s.activeBoard)
  const setActiveBoard = useUIStore((s) => s.setActiveBoard)
  const readOnly = useTenantStore((s) => s.readOnly)

  const [dragId, setDragId] = useState<string | null>(null)
  const [newColName, setNewColName] = useState('')
  const [newBoardName, setNewBoardName] = useState('')

  const current = boards.find((b) => b.id === activeBoard) ?? boards[0]
  const boardId = current?.id ?? ''
  const deals = allDeals.filter((d) => d.boardId === boardId)
  const columns = current ? [...current.columns].sort((a, b) => a.order - b.order) : []

  const boardTotal = deals.reduce((s, d) => s + (d.value || 0), 0)

  async function handleAddBoard() {
    const n = newBoardName.trim()
    if (!n) return
    const id = await addBoard(n)
    setActiveBoard(id)
    setNewBoardName('')
  }

  async function handleAddColumn() {
    const n = newColName.trim()
    if (!n || !current) return
    await addColumn(current, n)
    setNewColName('')
  }

  function onDrop(columnId: string) {
    if (readOnly || !dragId) return
    moveDeal(dragId, columnId, deals)
    setDragId(null)
  }

  return (
    <div style={{ padding: '24px 30px 40px' }}>
      {/* Seletor de quadros */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.12em', color: '#9c95a8', marginRight: 4 }}>QUADROS</span>
        {boards.map((b) => {
          const on = b.id === boardId
          const count = allDeals.filter((d) => d.boardId === b.id).length
          return (
            <RingButton
              key={b.id}
              radius={11}
              active={on}
              quiet
              onClick={() => setActiveBoard(b.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px',
                fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                ...(on
                  ? { background: 'linear-gradient(140deg,#7a52a0,#553578)', color: '#f4eefa', border: '1px solid rgba(200,160,230,0.3)', boxShadow: '0 4px 12px rgba(110,65,150,0.22)' }
                  : { background: '#ffffff', color: '#6e6780', border: '1px solid #e6e3ee' }),
              }}
            >
              <MaterialIcon name={b.icon} size={16} />
              {b.name} <span style={{ opacity: 0.55, fontWeight: 600 }}>{count}</span>
            </RingButton>
          )
        })}
        {!readOnly && <>
          <div style={{ width: 1, height: 24, background: '#e0dcea', margin: '0 4px' }} />
          <input
            value={newBoardName}
            onChange={(e) => setNewBoardName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddBoard() }}
            placeholder="Nome do quadro..."
            style={{ width: 160, background: '#ffffff', border: '1px solid #e6e3ee', borderRadius: 11, padding: '9px 12px', color: '#1d1726', fontSize: 13, outline: 'none' }}
          />
          <RingButton radius={11} onClick={handleAddBoard} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#1d1726', border: '1px solid #1d1726', padding: '9px 14px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <MaterialIcon name="dashboard_customize" size={18} /> Novo quadro
          </RingButton>
        </>}
      </div>

      {/* Stats + ações */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ background: '#ffffff', border: '1px solid #e6e3ee', borderRadius: 11, padding: '8px 15px', fontSize: 13, boxShadow: '0 1px 2px rgba(28,20,50,0.04)' }}>
            <span style={{ color: '#6e6780' }}>Valor total · </span><span style={{ fontWeight: 700, color: '#1d1726' }}>R$ {fmtK(boardTotal)}</span>
          </div>
          <div style={{ background: '#ffffff', border: '1px solid #e6e3ee', borderRadius: 11, padding: '8px 15px', fontSize: 13, boxShadow: '0 1px 2px rgba(28,20,50,0.04)' }}>
            <span style={{ color: '#6e6780' }}>Negócios · </span><span style={{ fontWeight: 700, color: '#1d1726' }}>{deals.length}</span>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <button style={{ ...sx.btnGhost }}><MaterialIcon name="tune" size={18} /> Filtros</button>
        {!readOnly && (
          <RingButton
            radius={11}
            onClick={() => { if (columns[0]) addDeal(boardId, columns[0].id, deals) }}
            style={{ ...sx.btnPrimary }}
          >
            <MaterialIcon name="add" size={18} /> Novo negócio
          </RingButton>
        )}
      </div>

      {/* Colunas */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', overflowX: 'auto', paddingBottom: 14 }}>
        {columns.map((col) => (
          <Column
            key={col.id}
            column={col}
            cards={deals.filter((d) => d.columnId === col.id)}
            readOnly={readOnly}
            onDragStart={setDragId}
            onDrop={onDrop}
            onAddCard={(colId) => addDeal(boardId, colId, deals)}
          />
        ))}

        {/* Adicionar etapa */}
        {!readOnly && (
          <div style={{ width: 230, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 2 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={newColName}
                onChange={(e) => setNewColName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddColumn() }}
                placeholder="Nova etapa..."
                style={{ flex: 1, background: '#ffffff', border: '1px solid #e6e3ee', borderRadius: 11, padding: '10px 12px', color: '#1d1726', fontSize: 13, outline: 'none' }}
              />
              <RingButton radius={11} onClick={handleAddColumn} style={{ width: 42, alignSelf: 'stretch', background: 'linear-gradient(140deg,#7a52a0,#553578)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <MaterialIcon name="add" size={20} />
              </RingButton>
            </div>
            <div style={{ fontSize: 11.5, color: '#9c95a8', lineHeight: 1.5, padding: '0 4px' }}>
              Crie suas próprias etapas e arraste os negócios entre elas. O pipeline é 100% seu.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
