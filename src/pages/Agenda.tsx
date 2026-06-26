import { useUIStore } from '../store/uiStore'
import { useEvents } from '../hooks/useEvents'
import { buildCalendar } from '../hooks/useCalendar'
import { monthName, longDayLabel } from '../lib/format'
import MaterialIcon from '../components/common/MaterialIcon'
import type { EventDoc } from '../types'

const WEEKDAYS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM']

export default function Agenda() {
  const ui = useUIStore()
  const { docs: events } = useEvents(ui.calYear, ui.calMonth)

  const byKey: Record<string, EventDoc[]> = {}
  events.forEach((e) => { (byKey[e.dateKey] ||= []).push(e) })

  const cells = buildCalendar(ui.calYear, ui.calMonth)
  const dayEvents = (byKey[ui.selectedDayKey] || []).slice().sort((a, b) => a.time.localeCompare(b.time))
  const selectedDate = new Date(`${ui.selectedDayKey}T00:00:00`)

  return (
    <div style={{ padding: '24px 30px 40px', display: 'flex', gap: 18 }}>
      {/* Calendário */}
      <div style={{ flex: 1, background: '#ffffff', border: '1px solid #ececf3', borderRadius: 20, padding: '22px 24px', boxShadow: '0 1px 2px rgba(28,20,50,0.04),0 8px 22px rgba(28,20,50,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 26, fontWeight: 600, color: '#1d1726' }}>{monthName(ui.calMonth)} {ui.calYear}</div>
          <div style={{ flex: 1 }} />
          <NavBtn icon="chevron_left" onClick={ui.prevMonth} />
          <NavBtn icon="chevron_right" onClick={ui.nextMonth} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 8, marginBottom: 8 }}>
          {WEEKDAYS.map((d) => (
            <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#9c95a8', padding: '4px 0' }}>{d}</div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 8 }}>
          {cells.map((c) => {
            const sel = c.key === ui.selectedDayKey
            const evs = byKey[c.key] || []
            return (
              <div
                key={c.key}
                onClick={() => ui.selectDay(c.key)}
                style={{
                  minHeight: 84, borderRadius: 11, padding: 8, cursor: 'pointer',
                  border: '1px solid ' + (sel ? 'rgba(122,82,160,0.4)' : '#eeecf4'),
                  background: sel ? 'rgba(150,110,200,0.08)' : (c.inMonth ? '#faf9fc' : 'transparent'),
                  opacity: c.inMonth ? 1 : 0.45,
                }}
              >
                <div style={{
                  fontSize: 13, fontWeight: 700, width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%',
                  ...(c.isToday ? { background: 'linear-gradient(140deg,#9a6fb8,#5a3a7e)', color: '#fff' } : { color: c.inMonth ? '#2a2435' : '#b8b2c4' }),
                }}>{c.day}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 4 }}>
                  {evs.map((e) => (
                    <div key={e.id} style={{ fontSize: 9.5, color: '#3a3346', background: 'rgba(28,20,50,0.05)', borderLeft: `2px solid ${e.color}`, borderRadius: 4, padding: '2px 5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.title}</div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Painel do dia */}
      <div style={{ width: 300, flexShrink: 0, background: '#ffffff', border: '1px solid #ececf3', borderRadius: 20, padding: 22, boxShadow: '0 1px 2px rgba(28,20,50,0.04),0 8px 22px rgba(28,20,50,0.05)' }}>
        <div style={{ fontSize: 12, color: '#9c95a8', marginBottom: 2 }}>{longDayLabel(selectedDate)}</div>
        <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 21, fontWeight: 600, color: '#1d1726', marginBottom: 18 }}>Compromissos</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {dayEvents.map((e) => (
            <div key={e.id} style={{ display: 'flex', gap: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#7a52a0', width: 42, flexShrink: 0, paddingTop: 1 }}>{e.time}</div>
              <div style={{ flex: 1, borderLeft: `2px solid ${e.color}`, padding: '1px 0 12px 12px' }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: '#1d1726' }}>{e.title}</div>
                <div style={{ fontSize: 11.5, color: '#6e6780', marginTop: 2 }}>{e.subtitle}</div>
              </div>
            </div>
          ))}
          {dayEvents.length === 0 && (
            <div style={{ textAlign: 'center', padding: '30px 0', color: '#a39bb0', fontSize: 13 }}>Nenhum compromisso neste dia</div>
          )}
        </div>
      </div>
    </div>
  )
}

function NavBtn({ icon, onClick }: { icon: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ width: 38, height: 38, borderRadius: 10, background: '#f3f1f7', border: '1px solid #e6e3ee', color: '#6e6780', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <MaterialIcon name={icon} size={20} />
    </button>
  )
}
