import { useAllScheduledMessages } from '../../hooks/useScheduledMessages'
import { deleteScheduledMessage } from '../../hooks/useEvents'
import { dueDateShort } from '../../lib/format'
import { C } from '../../styles/sx'
import MaterialIcon from '../common/MaterialIcon'
import { EmptyLine, IconAction, Row, SettingsCard } from './primitives'
import type { ScheduledMessageStatus } from '../../types'

const STATUS: Record<ScheduledMessageStatus, [string, string, string]> = {
  pending: ['Agendada', '#8a5f12', 'rgba(216,169,96,0.18)'],
  sent: ['Enviada', '#1f8a4c', 'rgba(52,199,89,0.14)'],
  failed: ['Falhou', '#a03257', 'rgba(217,138,171,0.16)'],
  canceled: ['Cancelada', C.sub, '#eeebf3'],
}

/** Lista central dos agendamentos — o que ainda vai sair e o que já saiu. */
export default function SchedulesSection({ canEdit }: { canEdit: boolean }) {
  const { docs: schedules } = useAllScheduledMessages()
  const pending = schedules.filter((s) => s.status === 'pending').length

  return (
    <SettingsCard
      title="Agendamentos"
      subtitle="Mensagens programadas para os contatos, criadas na tela de Contatos."
      action={
        <span style={{ fontSize: 12.5, fontWeight: 700, color: pending ? C.amber : C.faint }}>
          {pending} na fila
        </span>
      }
    >
      {schedules.length === 0 && <EmptyLine>Nenhuma mensagem agendada até agora.</EmptyLine>}
      {schedules.map((s) => {
        const [label, color, bg] = STATUS[s.status]
        return (
          <Row
            key={s.id}
            actions={
              <>
                <span style={{ fontSize: 11, fontWeight: 800, color, background: bg, borderRadius: 999, padding: '3px 10px' }}>
                  {label}
                </span>
                {canEdit && s.status === 'pending' && (
                  <IconAction
                    icon="delete"
                    title="Cancelar agendamento"
                    color={C.rose}
                    onClick={() => deleteScheduledMessage(s.id, s.eventId)}
                  />
                )}
              </>
            }
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <MaterialIcon name="schedule_send" size={16} color={C.muted} />
              <span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>{s.contactName}</span>
              <span style={{ fontSize: 12, color: C.sub }}>· {dueDateShort(s.dueAt)} {s.time}</span>
            </div>
            <div style={{ fontSize: 12, color: C.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {s.text}
            </div>
            {s.status === 'failed' && s.lastError && (
              <div style={{ fontSize: 11.5, color: C.rose, marginTop: 2 }}>Erro: {s.lastError}</div>
            )}
          </Row>
        )
      })}
    </SettingsCard>
  )
}
