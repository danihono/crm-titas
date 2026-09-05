import { convOf } from '../../hooks/useConversations'
import type { Contact, ConvStatus } from '../../types'
import { C } from '../../styles/sx'

export const INBOX_TABS: { id: ConvStatus; label: string }[] = [
  { id: 'entrada', label: 'Entrada' },
  { id: 'esperando', label: 'Esperando' },
  { id: 'finalizado', label: 'Finalizados' },
]

/** Contatos de uma aba do atendimento. Sem `conv`, o contato cai em Entrada. */
export function filterByInbox(contacts: Contact[], tab: ConvStatus): Contact[] {
  return contacts.filter((c) => convOf(c).status === tab)
}

/**
 * Abas Entrada · Esperando · Finalizados, no lugar onde o Umbler as coloca —
 * acima da lista, que aqui é a mesma lista de contatos.
 */
export default function InboxTabs({ contacts, active, onChange }: {
  contacts: Contact[]
  active: ConvStatus
  onChange: (t: ConvStatus) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
      {INBOX_TABS.map((t) => {
        const on = t.id === active
        const count = filterByInbox(contacts, t.id).length
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              border: 'none', borderRadius: 999, padding: '7px 6px', cursor: 'pointer',
              fontSize: 12, fontWeight: 700,
              color: on ? C.purple : C.sub,
              background: on ? C.sel : C.raised,
            }}
          >
            {t.label}
            {count > 0 && (
              <span style={{
                minWidth: 17, height: 17, padding: '0 5px', borderRadius: 999, fontSize: 10.5, fontWeight: 800,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: on ? C.tintPurpleStrong : C.fieldBorder,
                color: on ? C.purple : C.sub,
              }}>
                {count > 99 ? '99+' : count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
