import { useEffect, useMemo, useState } from 'react'
import { useUIStore } from '../../store/uiStore'
import { useContacts } from '../../hooks/useContacts'
import { useTenantStore } from '../../store/tenantStore'
import {
  useBoards, useAllDeals, addBoard, addColumn, addDeal, moveDeal, updateDeal, deleteDeal,
  updateBoard, deleteBoard, updateColumn, deleteColumn, moveColumn, ensureLeadsBoard,
  LEADS_BOARD_ID,
  type DealForm, type BoardForm, type ColumnForm,
} from '../../hooks/useDeals'
import Column from '../kanban/Column'
import { contactOptions, withLegacyNames } from '../common/ClientCombo'
import MaterialIcon from '../common/MaterialIcon'
import RingButton from '../common/RingButton'
import DealModal from '../modals/DealModal'
import BoardModal from './BoardModal'
import ColumnModal from './ColumnModal'
import { chipColors } from '../../lib/color'
import { useIsDark } from '../../store/themeStore'
import { fmtK } from '../../lib/format'
import { C, sx } from '../../styles/sx'
import type { Column as Col, Deal } from '../../types'

export default function KanbanBoard() {
  const dark = useIsDark()
  const { docs: boards } = useBoards()
  const { docs: allDeals } = useAllDeals()
  const { docs: contacts } = useContacts()
  const activeBoard = useUIStore((s) => s.activeBoard)
  const novoLead = useUIStore((s) => s.novoLead)
  const limparNovoLead = useUIStore((s) => s.limparNovoLead)
  const setActiveBoard = useUIStore((s) => s.setActiveBoard)
  const readOnly = useTenantStore((s) => s.readOnly)

  const [dragId, setDragId] = useState<string | null>(null)
  const [newColName, setNewColName] = useState('')
  // Modal de quadro: 'novo' para criar, o Board para editar. Modal de etapa: a coluna.
  const [boardModal, setBoardModal] = useState<'novo' | 'editar' | null>(null)
  const [editingCol, setEditingCol] = useState<Col | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [filterText, setFilterText] = useState('')
  const [filterTag, setFilterTag] = useState('')
  // Negócio aberto no modal: `editing` para editar um existente, `creatingIn`
  // (id da coluna) para criar um novo. Nunca os dois ao mesmo tempo.
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null)
  const [creatingIn, setCreatingIn] = useState<string | null>(null)

  // Garante o quadro LEADS (e traz os leads antigos para dentro dele) na primeira vez que
  // alguém abre o Pipeline. É idempotente; em ambiente só-leitura nem tenta.
  useEffect(() => {
    if (readOnly) return
    ensureLeadsBoard().catch(() => {
      // Sem permissão ou offline: o Kanban segue com os quadros que já existem, e a
      // próxima abertura tenta de novo. Não é erro que valha interromper a tela.
    })
  }, [readOnly])

  // Pedido vindo da agenda ("criar lead com este contato"): abre o card já preenchido na
  // primeira etapa do quadro LEADS e some com o pedido, para não reabrir a cada render.
  useEffect(() => {
    if (!novoLead) return
    const leads = boards.find((b) => b.id === LEADS_BOARD_ID)
    if (!leads) return
    const primeira = [...leads.columns].sort((a, b) => a.order - b.order)[0]
    if (!primeira) return
    setActiveBoard(LEADS_BOARD_ID)
    setCreatingIn(primeira.id)
  }, [novoLead, boards, setActiveBoard])

  const current = boards.find((b) => b.id === activeBoard) ?? boards[0]
  const boardId = current?.id ?? ''
  // Quadro do sistema: nome e etapas são fixos. Os cards não — criar, arrastar, editar e
  // excluir lead continua tudo liberado.
  const fixo = current?.system === 'leads'
  // `deals` (quadro inteiro) alimenta as mutações (cálculo de order);
  // `visibleDeals` é o que as colunas renderizam com os filtros aplicados.
  const deals = allDeals.filter((d) => d.boardId === boardId)
  const columns = current ? [...current.columns].sort((a, b) => a.order - b.order) : []

  // Agenda para o campo Contato do modal, com os nomes que só existem em cards antigos
  // entrando atrás — assim editar um negócio velho não perde o nome que ele já tinha.
  const opcoesContato = useMemo(
    () => withLegacyNames(contactOptions(contacts, 'nome'), allDeals.map((d) => d.contact)),
    [contacts, allDeals],
  )

  const tags = Array.from(new Set(deals.map((d) => d.tag).filter(Boolean))).sort()
  const ft = filterText.trim().toLowerCase()
  const visibleDeals = deals.filter((d) =>
    (!ft || d.company.toLowerCase().includes(ft) || d.contact.toLowerCase().includes(ft))
    && (!filterTag || d.tag === filterTag))
  const filtersActive = (ft ? 1 : 0) + (filterTag ? 1 : 0)

  const boardTotal = visibleDeals.reduce((s, d) => s + (d.value || 0), 0)

  /** Os erros sobem para o BoardModal/ColumnModal, que os mostram na própria caixa. */
  async function saveBoard(form: BoardForm) {
    if (boardModal === 'editar' && current) {
      await updateBoard(current.id, form)
    } else {
      const id = await addBoard(form.name.trim(), form.icon, form.color)
      setActiveBoard(id)
    }
  }

  async function removeBoard() {
    if (!current) return
    await deleteBoard(current.id, allDeals)
    // Cai no primeiro quadro que sobrar; sem nenhum, o estado fica limpo para o próximo.
    setActiveBoard(boards.find((b) => b.id !== current.id)?.id ?? '')
  }

  async function saveColumn(form: ColumnForm) {
    if (!current || !editingCol) return
    await updateColumn(current, editingCol.id, form)
  }

  async function removeColumn() {
    if (!current || !editingCol) return
    await deleteColumn(current, editingCol.id, deals)
  }

  function handleMoveColumn(columnId: string, dir: 'left' | 'right') {
    if (!current) return
    moveColumn(current, columnId, dir).catch((e) => {
      alert(e instanceof Error ? e.message : 'Falha ao mover a etapa.')
    })
  }

  async function handleAddColumn() {
    const n = newColName.trim()
    if (!n || !current) return
    try {
      await addColumn(current, n)
      setNewColName('')
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Falha ao criar a etapa.')
    }
  }

  /** Abre o modal em modo criação já apontando para a coluna escolhida. */
  function handleAddDeal(colId: string) {
    setEditingDeal(null)
    setCreatingIn(colId)
  }

  /** Botão "Novo negócio" do topo: cai na primeira etapa do quadro atual. */
  function handleNewDeal() {
    // Sem quadro (ou sem etapa) o botão antes não fazia nada, em silêncio.
    if (!current) { alert('Crie um quadro primeiro — use o botão "Novo quadro" acima.'); return }
    if (!columns[0]) { alert('Este quadro ainda não tem etapas. Crie uma etapa antes de adicionar negócios.'); return }
    handleAddDeal(columns[0].id)
  }

  function closeDealModal() {
    setEditingDeal(null)
    setCreatingIn(null)
    // Limpa o pedido da agenda ao fechar (salvando ou cancelando), senão a próxima vez que
    // alguém entrasse no Pipeline abriria o mesmo lead de novo.
    limparNovoLead()
  }

  // Os erros sobem para o DealModal, que os mostra na própria caixa.
  async function saveDeal(form: DealForm) {
    if (editingDeal) await updateDeal(editingDeal.id, form)
    else if (creatingIn) await addDeal(boardId, creatingIn, deals, form)
    closeDealModal()
  }

  async function removeDeal() {
    if (!editingDeal) return
    await deleteDeal(editingDeal.id)
    closeDealModal()
  }

  function onDrop(columnId: string) {
    if (readOnly || !dragId) return
    moveDeal(dragId, columnId, deals).catch((e) => {
      alert(e instanceof Error ? e.message : 'Falha ao mover o negócio.')
    })
    setDragId(null)
  }

  return (
    // Antes quem rolava era o container do Outlet; agora que o Kanban é um
    // filho flex da casca com abas, a rolagem precisa ser dele.
    <div style={{ height: '100%', overflowY: 'auto', padding: '24px 30px 40px' }}>
      {/* Seletor de quadros */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.12em', color: C.muted, marginRight: 4 }}>QUADROS</span>
        {boards.map((b) => {
          const on = b.id === boardId
          const count = allDeals.filter((d) => d.boardId === b.id).length
          const chip = chipColors(b.color, dark)
          return (
            <RingButton
              key={b.id}
              radius={11}
              active={on}
              onClick={() => setActiveBoard(b.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px',
                fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                // O quadro selecionado mantém a COR escolhida pelo usuário, mas
                // como tinta — o gradiente cheio destoava do resto agora que
                // "selecionado" é sempre pílula clara.
                ...(on
                  ? { background: chip.bg, color: chip.fg, border: `1px solid ${chip.border}` }
                  : { background: C.surface, color: C.sub, border: `1px solid ${C.fieldBorder}` }),
              }}
            >
              <MaterialIcon name={b.icon} size={16} />
              {b.name} <span style={{ opacity: 0.55, fontWeight: 600 }}>{count}</span>
              {b.system === 'leads' && (
                <span title="Quadro do sistema — etapas fixas" style={{ display: 'flex', opacity: 0.55 }}>
                  <MaterialIcon name="lock" size={13} />
                </span>
              )}
              {on && !readOnly && b.system !== 'leads' && (
                <MaterialIcon
                  name="edit"
                  size={15}
                  style={{ marginLeft: 2, opacity: 0.8 }}
                  onClick={(e) => { e.stopPropagation(); setBoardModal('editar') }}
                />
              )}
            </RingButton>
          )
        })}
        {!readOnly && <>
          <div style={{ width: 1, height: 24, background: C.divider, margin: '0 4px' }} />
          <RingButton radius={11} onClick={() => setBoardModal('novo')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: C.inverse, border: `1px solid ${C.inverse}`, padding: '9px 14px', color: C.onInverse, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <MaterialIcon name="dashboard_customize" size={18} /> Novo quadro
          </RingButton>
        </>}
      </div>

      {/* Stats + ações */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.fieldBorder}`, borderRadius: 11, padding: '8px 15px', fontSize: 13, boxShadow: '0 1px 2px rgba(28,20,50,0.04)' }}>
            <span style={{ color: C.sub }}>Valor total · </span><span style={{ fontWeight: 700, color: C.ink }}>R$ {fmtK(boardTotal)}</span>
          </div>
          <div style={{ background: C.surface, border: `1px solid ${C.fieldBorder}`, borderRadius: 11, padding: '8px 15px', fontSize: 13, boxShadow: '0 1px 2px rgba(28,20,50,0.04)' }}>
            <span style={{ color: C.sub }}>Negócios · </span><span style={{ fontWeight: 700, color: C.ink }}>{visibleDeals.length}{filtersActive > 0 && ` de ${deals.length}`}</span>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowFilters((v) => !v)} style={{ ...sx.btnGhost, ...(filtersActive > 0 ? { color: C.purple, borderColor: 'rgba(150,110,200,0.4)', background: C.tintPurpleWeak } : {}) }}>
            <MaterialIcon name="tune" size={18} /> Filtros{filtersActive > 0 && ` (${filtersActive})`}
          </button>
          {showFilters && (
            <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 260, background: C.surface, border: `1px solid ${C.fieldBorder}`, borderRadius: 13, boxShadow: 'var(--c-shadow-pop)', padding: 14, zIndex: 20 }}>
              <label style={{ fontSize: 12, color: C.sub, fontWeight: 600 }}>Buscar por empresa/contato</label>
              <input
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="Ex.: Atlas, Marina..."
                style={{ width: '100%', margin: '6px 0 12px', background: C.field, border: `1px solid ${C.fieldBorder}`, borderRadius: 10, padding: '9px 11px', color: C.ink, fontSize: 13, outline: 'none' }}
              />
              <label style={{ fontSize: 12, color: C.sub, fontWeight: 600 }}>Etiqueta</label>
              <select
                value={filterTag}
                onChange={(e) => setFilterTag(e.target.value)}
                style={{ width: '100%', margin: '6px 0 12px', background: C.field, border: `1px solid ${C.fieldBorder}`, borderRadius: 10, padding: '9px 11px', color: C.ink, fontSize: 13, outline: 'none' }}
              >
                <option value="">Todas</option>
                {tags.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <button onClick={() => { setFilterText(''); setFilterTag('') }} disabled={filtersActive === 0} style={{ border: 'none', background: 'transparent', color: filtersActive ? C.roseDeep : '#c4bfd0', fontSize: 12.5, fontWeight: 700, cursor: filtersActive ? 'pointer' : 'default', padding: '6px 4px' }}>Limpar filtros</button>
                <button onClick={() => setShowFilters(false)} style={{ border: 'none', background: C.tintPurple, color: C.purple, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', borderRadius: 9, padding: '6px 12px' }}>Fechar</button>
              </div>
            </div>
          )}
        </div>
        {!readOnly && (
          <RingButton
            radius={11}
            onClick={handleNewDeal}
            style={{ ...sx.btnPrimary }}
          >
            <MaterialIcon name="add" size={18} /> Novo negócio
          </RingButton>
        )}
      </div>

      {/* Colunas */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', overflowX: 'auto', paddingBottom: 14 }}>
        {columns.map((col, i) => (
          <Column
            key={col.id}
            column={col}
            cards={visibleDeals.filter((d) => d.columnId === col.id)}
            readOnly={readOnly}
            fixed={fixo}
            canMoveLeft={i > 0}
            canMoveRight={i < columns.length - 1}
            onDragStart={setDragId}
            onDrop={onDrop}
            onAddCard={handleAddDeal}
            onOpenCard={setEditingDeal}
            onEdit={setEditingCol}
            onMove={handleMoveColumn}
          />
        ))}

        {/* Adicionar etapa — no quadro do sistema as etapas são fixas, então some. */}
        {!readOnly && !fixo && (
          <div style={{ width: 230, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 2 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={newColName}
                onChange={(e) => setNewColName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddColumn() }}
                placeholder="Nova etapa..."
                style={{ flex: 1, background: C.surface, border: `1px solid ${C.fieldBorder}`, borderRadius: 11, padding: '10px 12px', color: C.ink, fontSize: 13, outline: 'none' }}
              />
              <RingButton radius={11} onClick={handleAddColumn} style={{ width: 42, alignSelf: 'stretch', background: 'linear-gradient(140deg,#7a52a0,#553578)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <MaterialIcon name="add" size={20} />
              </RingButton>
            </div>
            <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.5, padding: '0 4px' }}>
              Crie suas próprias etapas e arraste os negócios entre elas. O pipeline é 100% seu.
            </div>
          </div>
        )}
      </div>

      {(editingDeal || creatingIn) && (
        <DealModal
          deal={editingDeal}
          preset={!editingDeal && novoLead ? novoLead : undefined}
          contactOptions={opcoesContato}
          onClose={closeDealModal}
          onSave={saveDeal}
          onDelete={editingDeal ? removeDeal : undefined}
        />
      )}

      {boardModal && (
        <BoardModal
          board={boardModal === 'editar' ? current ?? null : null}
          dealCount={boardModal === 'editar' ? deals.length : 0}
          onClose={() => setBoardModal(null)}
          onSave={saveBoard}
          onDelete={boardModal === 'editar' && current ? removeBoard : undefined}
        />
      )}

      {editingCol && (
        <ColumnModal
          column={editingCol}
          dealCount={deals.filter((d) => d.columnId === editingCol.id).length}
          canDelete={columns.length > 1}
          onClose={() => setEditingCol(null)}
          onSave={saveColumn}
          onDelete={removeColumn}
        />
      )}
    </div>
  )
}
