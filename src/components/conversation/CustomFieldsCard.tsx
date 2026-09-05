import { useEffect, useState } from 'react'
import { setContactCustomValue } from '../../hooks/useSettings'
import { C } from '../../styles/sx'
import MaterialIcon from '../common/MaterialIcon'
import type { Contact, CustomField } from '../../types'

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: C.field,
  border: `1px solid ${C.fieldBorder}`,
  borderRadius: 10,
  padding: '9px 11px',
  color: C.ink,
  fontSize: 13,
  outline: 'none',
}

/**
 * Campos personalizados do contato, na aba Informações.
 *
 * Salva ao sair do campo (blur), e não a cada tecla: são gravações no Firestore, e uma
 * por caractere digitado seria caro sem nenhum ganho.
 */
export default function CustomFieldsCard({ contact, fields, canEdit }: {
  contact: Contact
  fields: CustomField[]
  canEdit: boolean
}) {
  if (fields.length === 0) return null

  return (
    <div style={{ marginTop: 20, paddingTop: 18, borderTop: '1px solid ' + C.lineSoft }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, color: C.sub, marginBottom: 12 }}>
        <MaterialIcon name="list_alt" size={16} color={C.muted} />
        Campos personalizados
      </div>
      <div style={{ display: 'grid', gap: 12 }}>
        {fields.map((f) => (
          <FieldRow
            key={f.id}
            field={f}
            contactId={contact.id}
            // A chave amarra o estado local ao contato: sem ela, trocar de conversa
            // deixaria o valor do contato anterior no campo.
            value={contact.custom?.[f.id] ?? ''}
            canEdit={canEdit}
          />
        ))}
      </div>
    </div>
  )
}

function FieldRow({ field, contactId, value, canEdit }: {
  field: CustomField
  contactId: string
  value: string
  canEdit: boolean
}) {
  const [draft, setDraft] = useState(value)
  const [saved, setSaved] = useState(false)

  // Acompanha o que vem do banco (troca de contato, edição em outra aba) sem atropelar
  // o que está sendo digitado — o efeito só dispara quando o valor remoto muda.
  useEffect(() => {
    setDraft(value)
    setSaved(false)
  }, [value, contactId])

  async function commit() {
    if (draft === value) return
    try {
      await setContactCustomValue(contactId, field.id, draft)
      setSaved(true)
    } catch (err) {
      console.error('[CustomFieldsCard]', err)
      setDraft(value)
    }
  }

  const common = {
    disabled: !canEdit,
    onBlur: commit,
    style: inputStyle,
  }

  return (
    <label style={{ display: 'grid', gap: 5 }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.sub, fontWeight: 600 }}>
        {field.label}
        {saved && <MaterialIcon name="check" size={14} color={C.green} />}
      </span>

      {field.type === 'lista' ? (
        <select
          {...common}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            // Select não tem "terminou de digitar": grava na hora da escolha.
            if (canEdit) void setContactCustomValue(contactId, field.id, e.target.value).then(() => setSaved(true))
          }}
        >
          <option value="">—</option>
          {field.options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      ) : field.type === 'booleano' ? (
        <select
          {...common}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            if (canEdit) void setContactCustomValue(contactId, field.id, e.target.value).then(() => setSaved(true))
          }}
        >
          <option value="">—</option>
          <option value="sim">Sim</option>
          <option value="nao">Não</option>
        </select>
      ) : (
        <input
          {...common}
          type={field.type === 'numero' ? 'number' : field.type === 'data' ? 'date' : 'text'}
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setSaved(false) }}
        />
      )}
    </label>
  )
}
