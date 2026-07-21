import { useUIStore, type ActFilter } from '../store/uiStore'
import { useTenantStore } from '../store/tenantStore'
import { useActivities, useActTypes, statusOf, toggleActivity } from '../hooks/useActivities'
import { useContacts } from '../hooks/useContacts'
import { activityBadgeMap } from '../lib/theme'
import { dueInfo } from '../lib/format'
import MaterialIcon from '../components/common/MaterialIcon'
import RingButton from '../components/common/RingButton'
import ActivityModal from '../components/modals/ActivityModal'
import TypeModal from '../components/modals/TypeModal'
import { sx } from '../styles/sx'
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
  const contactOptions = Array.from(new Set(contacts.map((c) => c.company)))

  return (
    <div style={{ padding: '24px 30px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 20 }}>
        {FILTERS.map((f) => {
          const on = ui.actFilter === f.id
          return (
            <RingButton
              key={f.id}
              radius={11}
              active={on}
              quiet
              onClick={() => ui.setActFilter(f.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7, padding: '9px 15px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                ...(on
                  ? { background: 'linear-gradient(140deg,#7a52a0,#553578)', border: '1px solid rgba(200,160,230,0.3)', color: '#f4eefa', boxShadow: '0 4px 12px rgba(110,65,150,0.2)' }
                  : { background: '#ffffff', border: '1px solid #e6e3ee', color: '#6e6780' }),
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
          <div style={{ textAlign: 'center', padding: 40, color: '#a39bb0', fontSize: 13, border: '1px dashed #d8d3e2', borderRadius: 14, background: '#fff' }}>Nenhuma atividade neste filtro.</div>
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
  const status = statusOf(a)
  const ic = type ?? { icon: 'event', color: '#7a52a0', bg: 'rgba(150,110,200,0.14)' }
  const di = dueInfo(a.dueAt, a.done)
  const accent = a.done ? '#34c759' : di.overdue ? '#d98aab' : '#9a6fb8'
  const [badgeColor, badgeBg, badgeLabel] = activityBadgeMap[status]

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, background: '#ffffff', border: '1px solid #ececf3', borderLeft: `3px solid ${accent}`, borderRadius: 14, padding: '15px 18px', boxShadow: '0 1px 2px rgba(28,20,50,0.04),0 4px 14px rgba(28,20,50,0.04)' }}>
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
        <div style={{ fontSize: 14, fontWeight: 600, color: a.done ? '#a39bb0' : '#1d1726', textDecoration: a.done ? 'line-through' : 'none' }}>{a.title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, fontSize: 12, color: '#6e6780' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><MaterialIcon name="business" size={14} />{a.contact}</span>
          <span style={{ color: '#cfc8dd' }}>·</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: di.overdue ? '#c14d77' : '#6e6780' }}><MaterialIcon name="schedule" size={14} />{di.text}</span>
        </div>
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color: badgeColor, background: badgeBg, borderRadius: 20, padding: '4px 12px' }}>{badgeLabel}</span>
    </div>
  )
}
