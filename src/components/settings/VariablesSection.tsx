import { useState } from 'react'
import { addVariable, deleteVariable, normalizeVarKey, useVariables } from '../../hooks/useLibrary'
import { sx, C } from '../../styles/sx'
import { EmptyLine, Field, IconAction, PrimaryButton, Row, SettingsCard } from './primitives'

/** Variáveis do contato, resolvidas no envio — não são cadastráveis aqui. */
const BUILT_IN = [
  ['nome', 'Nome do contato'],
  ['empresa', 'Empresa do contato'],
  ['atendente', 'Quem está enviando'],
]

export default function VariablesSection({ canEdit }: { canEdit: boolean }) {
  const { docs: variables } = useVariables()
  const [key, setKey] = useState('')
  const [value, setValue] = useState('')
  const [description, setDescription] = useState('')

  const clean = normalizeVarKey(key)
  const duplicated = !!clean && (variables.some((v) => v.key === clean) || BUILT_IN.some(([k]) => k === clean))

  async function add() {
    if (!clean || !value.trim() || duplicated) return
    await addVariable(clean, value.trim(), description.trim())
    setKey('')
    setValue('')
    setDescription('')
  }

  return (
    <SettingsCard
      title="Variáveis"
      subtitle="Textos fixos reaproveitados em respostas rápidas e campanhas, escritos como {{chave}}."
    >
      <div style={{ ...sx.label, marginBottom: 4 }}>Do contato (automáticas)</div>
      {BUILT_IN.map(([k, desc]) => (
        <Row key={k}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <code style={{ fontSize: 12.5, fontWeight: 700, color: C.purple, background: 'rgba(150,110,200,0.12)', borderRadius: 7, padding: '2px 8px' }}>
              {`{{${k}}}`}
            </code>
            <span style={{ fontSize: 12.5, color: C.sub }}>{desc}</span>
          </div>
        </Row>
      ))}

      <div style={{ ...sx.label, margin: '18px 0 4px' }}>Suas variáveis</div>
      {variables.length === 0 && <EmptyLine>Nenhuma variável cadastrada.</EmptyLine>}
      {variables.map((v) => (
        <Row
          key={v.id}
          actions={canEdit ? <IconAction icon="delete" title="Excluir" color={C.rose} onClick={() => deleteVariable(v.id)} /> : undefined}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <code style={{ fontSize: 12.5, fontWeight: 700, color: C.purple, background: 'rgba(150,110,200,0.12)', borderRadius: 7, padding: '2px 8px' }}>
              {`{{${v.key}}}`}
            </code>
            <span style={{ fontSize: 13.5, color: C.ink, fontWeight: 600 }}>{v.value}</span>
          </div>
          {v.description && <div style={{ fontSize: 12, color: C.sub }}>{v.description}</div>}
        </Row>
      ))}

      {canEdit && (
        <div style={{ display: 'grid', gap: 12, marginTop: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12 }}>
            <Field label="Chave">
              <input value={key} placeholder="site" onChange={(e) => setKey(e.target.value)} style={sx.input} />
            </Field>
            <Field label="Valor">
              <input value={value} placeholder="titas.com.br" onChange={(e) => setValue(e.target.value)} style={sx.input} />
            </Field>
          </div>
          <Field label="Descrição (opcional)">
            <input value={description} onChange={(e) => setDescription(e.target.value)} style={sx.input} />
          </Field>
          {duplicated && (
            <div style={{ fontSize: 12.5, color: C.rose }}>
              {`Já existe uma variável {{${clean}}}.`}
            </div>
          )}
          <div>
            <PrimaryButton icon="add" onClick={add} disabled={!clean || !value.trim() || duplicated}>
              Adicionar variável
            </PrimaryButton>
          </div>
        </div>
      )}
    </SettingsCard>
  )
}
