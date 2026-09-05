import { useUIStore, type ActFilter } from '../store/uiStore'
import { useNavigate } from 'react-router-dom'
import { useTenantStore } from '../store/tenantStore'
import { useActivities, useActTypes, statusOf, toggleActivity } from '../hooks/useActivities'
import { useContacts } from '../hooks/useContacts'
import { activityBadgeMap } from '../lib/theme'
import { dueInfo } from '../lib/format'
import MaterialIcon from '../components/common/MaterialIcon'
import RingButton from '../components/common/RingButton'
import ActivityModal from '../components/modals/ActivityModal'
import TypeModal from '../components/modals/TypeModal'
import { C, sx } from '../styles/sx'
import type { Activity } from '../types'

const FILTERS: { id: ActFilter; label: string }[] = [
  { id: 'todas', label: 'Todas' },
  { id: 'pendente', label: 'Pendentes' },
  { id: 'atrasada', label: 'Atrasadas' },
  { id: 'concluida', label: 'Concluídas' },
]

export default function Activities() {
  const { docs: activities } = useActivities()
  const { docs: types } = useActTypes()
  const { docs: contacts } = useContacts()
  const ui = useUIStore()
  const readOnly = useTenantStore((s) => s.readOnly)

  const typeMap = Object.fromEntries(types.map((t) => [t.id, t]))
  const counts: Record<ActFilter, number> = { todas: activities.length, pendente: 0, atrasada: 0, concluida: 0 }
  activities.forEach((a) => { counts[statusOf(a)]++ })

  const list = activities.filter((a) => ui.actFilter === 'todas' || statusOf(a) === ui.actFilter)
  // Um cliente por id: a lista de nomes de antes não dizia QUAL contato era,
  // e é o id que liga a atividade à conversa.
  const contactOptions = contacts.map((c) => ({ id: c.id, nome: c.company || c.name }))

  return (
    <div style={{ padding: '18px 30px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 20 }}>
        {FILTERS.map((f) => {
          const on = ui.actFilter === f.id
          return (
            <RingButton
              key={f.id}
              radius={11}
              active={on}
              onClick={() => ui.setActFilter(f.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7, padding: '9px 15px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                // Selecionado = pílula roxa clara, o mesmo padrão do menu e das abas.
                ...(on
                  ? { background: C.sel, border: `1px solid ${C.selBorder}`, color: C.purple }
                  : { background: C.surface, border: `1px solid ${C.fieldBorder}`, color: C.sub }),
              }}
            >
              {f.label} <span style={{ opacity: 0.6 }}>{counts[f.id]}</span>
            </RingButton>
          )
        })}
        <div style={{ flex: 1 }} />
        {!readOnly && <>
          <button onClick={ui.openTypeModal} style={{ ...sx.btnGhost }}><MaterialIcon name="category" size={18} /> Tipos</button>
          <RingButton radius={11} onClick={ui.openActModal} style={{ ...sx.btnPrimary }}><MaterialIcon name="add_task" size={18} /> Nova atividade</RingButton>
        </>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        {list.map((a) => <ActivityRow key={a.id} a={a} type={typeMap[a.type]} />)}
        {list.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: C.faint, fontSize: 13, border: `1px dashed ${C.fieldBorder}`, borderRadius: 14, background: C.surface }}>Nenhuma atividade neste filtro.</div>
        )}
      </div>

      {ui.showActModal && (
        <ActivityModal
          types={types}
          contactOptions={contactOptions}
          onClose={ui.closeActModal}
          onSaved={(day) => { ui.selectDay(day); ui.closeActModal() }}
        />
      )}
      {ui.showTypeModal && <TypeModal existingTypes={types} onClose={ui.closeTypeModal} />}
    </div>
  )
}

function ActivityRow({ a, type }: { a: Activity; type?: { icon: string; color: string; bg: string } }) {
  const readOnly = useTenantStore((s) => s.readOnly)
  const navigate = useNavigate()
  const selectContact = useUIStore((s) => s.selectContact)
  const setContactView = useUIStore((s) => s.setContactView)
  const status = statusOf(a)
  const ic = type ?? { icon: 'event', color: C.purple, bg: 'rgba(150,110,200,0.14)' }
  const di = dueInfo(a.dueAt, a.done)
  const accent = a.done ? '#34c759' : di.overdue ? '#d98aab' : '#9a6fb8'
  const [badgeColor, badgeBg, badgeLabel] = activityBadgeMap[status]

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, background: C.surface, border: `1px solid ${C.line}`, borderLeft: `3px solid ${accent}`, borderRadius: 14, padding: '15px 18px', boxShadow: '0 1px 2px rgba(28,20,50,0.04),0 4px 14px rgba(28,20,50,0.04)' }}>
      <button
        onClick={() => {
          if (readOnly) return
          toggleActivity(a).catch((e) => {
            alert(e instanceof Error ? e.message : 'Falha ao atualizar a atividade.')
          })
        }}
        style={{ width: 24, height: 24, borderRadius: 7, flexShrink: 0, cursor: readOnly ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid ' + (a.done ? '#34c759' : '#d4cfe0'), background: a.done ? '#34c759' : 'transparent' }}
      >
        {a.done && <MaterialIcon name="check" size={17} color="#fff" />}
      </button>
      <MaterialIcon name={ic.icon} size={20} color={ic.color} style={{ background: ic.bg, width: 42, height: 42, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: a.done ? C.faint : C.ink, textDecoration: a.done ? 'line-through' : 'none' }}>{a.title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, fontSize: 12, color: C.sub }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><MaterialIcon name="business" size={14} />{a.contact}</span>
          <span style={{ color: C.faint }}>·</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: di.overdue ? C.rose : C.sub }}><MaterialIcon name="schedule" size={14} />{di.text}</span>
        </div>
      </div>
      {/* Volta para a conversa de onde a tarefa saiu. Só aparece quando existe
          vínculo: atividade antiga guarda o nome do cliente, não o contato. */}
      {a.contactId && (
        <button
          title="Abrir a conversa deste cliente"
          onClick={() => { selectContact(a.contactId!); setContactView('chat'); navigate('/contatos') }}
          style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: 'none', color: C.purple, fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}
        >
          <MaterialIcon name="forum" size={17} /> Conversa
        </button>
      )}
      <span style={{ fontSize: 11, fontWeight: 700, color: badgeColor, background: badgeBg, borderRadius: 20, padding: '4px 12px' }}>{badgeLabel}</span>
    </div>
  )
}
