import { useState } from 'react'
import { addVariable, deleteVariable, normalizeVarKey, useVariables } from '../../hooks/useLibrary'
import { sx, C } from '../../styles/sx'
import { t, type Chave } from '../../i18n'
import { EmptyLine, Field, IconAction, PrimaryButton, Row, SettingsCard } from './primitives'

/** Variáveis do contato, resolvidas no envio — não são cadastráveis aqui. */
// A CHAVE não é traduzida — {{nome}} é o token que o daemon substitui no envio,
// e trocá-lo por idioma quebraria toda resposta rápida já escrita. O que muda é
// só a explicação ao lado.
const BUILT_IN: [string, Chave][] = [
  ['nome', 'variaveis.contatoNome'],
  ['empresa', 'variaveis.contatoEmpresa'],
  ['atendente', 'variaveis.remetente'],
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
      title={t('variaveis.titulo')}
      subtitle={t('variaveis.subtitulo')}
    >
      <div style={{ ...sx.label, marginBottom: 4 }}>{t('variaveis.automaticas')}</div>
      {BUILT_IN.map(([k, desc]) => (
        <Row key={k}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <code style={{ fontSize: 12.5, fontWeight: 700, color: C.purple, background: C.tintPurple, borderRadius: 7, padding: '2px 8px' }}>
              {`{{${k}}}`}
            </code>
            <span style={{ fontSize: 12.5, color: C.sub }}>{t(desc)}</span>
          </div>
        </Row>
      ))}

      <div style={{ ...sx.label, margin: '18px 0 4px' }}>{t('variaveis.suas')}</div>
      {variables.length === 0 && <EmptyLine>{t('variaveis.vazio')}</EmptyLine>}
      {variables.map((v) => (
        <Row
          key={v.id}
          actions={canEdit ? <IconAction icon="delete" title={t('comum.excluir')} color={C.rose} onClick={() => deleteVariable(v.id)} /> : undefined}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <code style={{ fontSize: 12.5, fontWeight: 700, color: C.purple, background: C.tintPurple, borderRadius: 7, padding: '2px 8px' }}>
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
            <Field label={t('variaveis.chave')}>
              <input value={key} placeholder="site" onChange={(e) => setKey(e.target.value)} style={sx.input} />
            </Field>
            <Field label={t('variaveis.valor')}>
              <input value={value} placeholder="titas.com.br" onChange={(e) => setValue(e.target.value)} style={sx.input} />
            </Field>
          </div>
          <Field label={t('variaveis.descricao')}>
            <input value={description} onChange={(e) => setDescription(e.target.value)} style={sx.input} />
          </Field>
          {duplicated && (
            <div style={{ fontSize: 12.5, color: C.rose }}>
              {t('variaveis.jaExiste', { chave: clean })}
            </div>
          )}
          <div>
            <PrimaryButton icon="add" onClick={add} disabled={!clean || !value.trim() || duplicated}>
              {t('variaveis.adicionar')}
            </PrimaryButton>
          </div>
        </div>
      )}
    </SettingsCard>
  )
}
