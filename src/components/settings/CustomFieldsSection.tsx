import { useState } from 'react'
import { addCustomField, deleteCustomField, useCustomFields } from '../../hooks/useSettings'
import { sx, C } from '../../styles/sx'
import { EmptyLine, Field, IconAction, PrimaryButton, Row, SettingsCard } from './primitives'
import type { CustomFieldType } from '../../types'

const TYPE_LABEL: Record<CustomFieldType, string> = {
  texto: 'Texto',
  numero: 'Número',
  data: 'Data',
  lista: 'Lista de opções',
  booleano: 'Sim / Não',
}

export default function CustomFieldsSection({ canEdit }: { canEdit: boolean }) {
  const { docs: fields } = useCustomFields()
  const [label, setLabel] = useState('')
  const [type, setType] = useState<CustomFieldType>('texto')
  const [options, setOptions] = useState('')

  async function add() {
    const v = label.trim()
    if (!v) return
    const opts = type === 'lista'
      ? options.split(',').map((o) => o.trim()).filter(Boolean)
      : []
    await addCustomField(v, type, opts, fields.length)
    setLabel('')
    setOptions('')
  }

  return (
    <SettingsCard
      title="Campos personalizados"
      subtitle="Informações extras no cadastro do contato — CNPJ, plano contratado, origem."
    >
      {fields.length === 0 && <EmptyLine>Nenhum campo personalizado criado.</EmptyLine>}
      {fields.map((f) => (
        <Row
          key={f.id}
          actions={canEdit ? <IconAction icon="delete" title="Excluir campo" color={C.rose} onClick={() => deleteCustomField(f.id)} /> : undefined}
        >
          <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>{f.label}</div>
          <div style={{ fontSize: 12, color: C.sub }}>
            {TYPE_LABEL[f.type]}
            {f.type === 'lista' && f.options.length > 0 && ` · ${f.options.join(', ')}`}
          </div>
        </Row>
      ))}

      {canEdit && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr auto', gap: 12, alignItems: 'end', marginTop: 18 }}>
          <Field label="Nome do campo">
            <input value={label} placeholder="CNPJ" onChange={(e) => setLabel(e.target.value)} style={sx.input} />
          </Field>
          <Field label="Tipo">
            <select value={type} onChange={(e) => setType(e.target.value as CustomFieldType)} style={sx.input}>
              {(Object.keys(TYPE_LABEL) as CustomFieldType[]).map((t) => (
                <option key={t} value={t}>{TYPE_LABEL[t]}</option>
              ))}
            </select>
          </Field>
          <PrimaryButton icon="add" onClick={add} disabled={!label.trim()}>Adicionar</PrimaryButton>
          {type === 'lista' && (
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="Opções (separadas por vírgula)">
                <input value={options} placeholder="Bronze, Prata, Ouro" onChange={(e) => setOptions(e.target.value)} style={sx.input} />
              </Field>
            </div>
          )}
        </div>
      )}
    </SettingsCard>
  )
}
