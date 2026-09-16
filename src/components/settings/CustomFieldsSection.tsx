import { useState } from 'react'
import { addCustomField, deleteCustomField, useCustomFields } from '../../hooks/useSettings'
import { sx, C } from '../../styles/sx'
import { t, type Chave } from '../../i18n'
import { EmptyLine, Field, IconAction, PrimaryButton, Row, SettingsCard } from './primitives'
import type { CustomFieldType } from '../../types'

// A chave do Record é o valor gravado no Firestore; aqui só se decide como ele
// aparece na tela.
const TYPE_LABEL: Record<CustomFieldType, Chave> = {
  texto: 'campos.tipoTexto',
  numero: 'campos.tipoNumero',
  data: 'campos.tipoData',
  lista: 'campos.tipoLista',
  booleano: 'campos.tipoBool',
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
      title={t('campos.titulo')}
      subtitle={t('campos.subtitulo')}
    >
      {fields.length === 0 && <EmptyLine>{t('campos.vazio')}</EmptyLine>}
      {fields.map((f) => (
        <Row
          key={f.id}
          actions={canEdit ? <IconAction icon="delete" title={t('campos.excluir')} color={C.rose} onClick={() => deleteCustomField(f.id)} /> : undefined}
        >
          <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>{f.label}</div>
          <div style={{ fontSize: 12, color: C.sub }}>
            {t(TYPE_LABEL[f.type])}
            {f.type === 'lista' && f.options.length > 0 && ` · ${f.options.join(', ')}`}
          </div>
        </Row>
      ))}

      {canEdit && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr auto', gap: 12, alignItems: 'end', marginTop: 18 }}>
          <Field label={t('campos.nome')}>
            <input value={label} placeholder={t('campos.nomeExemplo')} onChange={(e) => setLabel(e.target.value)} style={sx.input} />
          </Field>
          <Field label={t('campos.tipo')}>
            <select value={type} onChange={(e) => setType(e.target.value as CustomFieldType)} style={sx.input}>
              {(Object.keys(TYPE_LABEL) as CustomFieldType[]).map((tipo) => (
                <option key={tipo} value={tipo}>{t(TYPE_LABEL[tipo])}</option>
              ))}
            </select>
          </Field>
          <PrimaryButton icon="add" onClick={add} disabled={!label.trim()}>{t('comum.adicionar')}</PrimaryButton>
          {type === 'lista' && (
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label={t('campos.opcoes')}>
                <input value={options} placeholder={t('campos.opcoesExemplo')} onChange={(e) => setOptions(e.target.value)} style={sx.input} />
              </Field>
            </div>
          )}
        </div>
      )}
    </SettingsCard>
  )
}
