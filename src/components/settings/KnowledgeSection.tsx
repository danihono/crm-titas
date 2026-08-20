import { useState } from 'react'
import {
  addKnowledgeDoc, deleteKnowledgeDoc, updateKnowledgeDoc, useKnowledge,
} from '../../hooks/useLibrary'
import { sx, C } from '../../styles/sx'
import MaterialIcon from '../common/MaterialIcon'
import { EmptyLine, Field, IconAction, PrimaryButton, Row, SettingsCard } from './primitives'

export default function KnowledgeSection({ canEdit }: { canEdit: boolean }) {
  const { docs } = useKnowledge()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const enabledCount = docs.filter((d) => d.enabled).length

  async function add() {
    if (!title.trim() || !content.trim()) return
    await addKnowledgeDoc(title, content)
    setTitle('')
    setContent('')
  }

  async function saveEdit(id: string) {
    await updateKnowledgeDoc(id, { content: draft.trim() })
    setEditing(null)
  }

  return (
    <SettingsCard
      title="Bases de conhecimento"
      subtitle="O material que o Titã IA consulta ao responder: política de trocas, tabela de preços, FAQ."
      action={
        <span style={{ fontSize: 12.5, fontWeight: 700, color: enabledCount ? C.purple : C.faint }}>
          {enabledCount} em uso
        </span>
      }
    >
      {docs.length === 0 && <EmptyLine>Nenhum documento na base.</EmptyLine>}
      {docs.map((d) => (
        <div key={d.id}>
          <Row
            actions={
              canEdit ? (
                <>
                  <IconAction
                    icon={d.enabled ? 'toggle_on' : 'toggle_off'}
                    title={d.enabled ? 'Tirar do contexto do agente' : 'Voltar ao contexto do agente'}
                    color={d.enabled ? C.green : C.faint}
                    onClick={() => updateKnowledgeDoc(d.id, { enabled: !d.enabled })}
                  />
                  <IconAction
                    icon="edit"
                    title="Editar conteúdo"
                    onClick={() => {
                      if (editing === d.id) return setEditing(null)
                      setEditing(d.id)
                      setDraft(d.content)
                    }}
                  />
                  <IconAction icon="delete" title="Excluir" color={C.rose} onClick={() => deleteKnowledgeDoc(d.id)} />
                </>
              ) : undefined
            }
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <MaterialIcon name="menu_book" size={17} color={d.enabled ? C.purple : C.faint} />
              <span style={{ fontSize: 13.5, fontWeight: 600, color: d.enabled ? C.ink : C.faint }}>{d.title}</span>
            </div>
            <div style={{ fontSize: 12, color: C.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {d.content.slice(0, 140)}
            </div>
          </Row>
          {editing === d.id && (
            <div style={{ display: 'grid', gap: 10, padding: '12px 0 14px' }}>
              <textarea
                value={draft}
                rows={8}
                onChange={(e) => setDraft(e.target.value)}
                style={{ ...sx.input, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.55 }}
              />
              <div>
                <PrimaryButton icon="check" onClick={() => saveEdit(d.id)}>Salvar documento</PrimaryButton>
              </div>
            </div>
          )}
        </div>
      ))}

      {canEdit && (
        <div style={{ display: 'grid', gap: 12, marginTop: 18 }}>
          <Field label="Título">
            <input value={title} placeholder="Política de trocas" onChange={(e) => setTitle(e.target.value)} style={sx.input} />
          </Field>
          <Field label="Conteúdo">
            <textarea
              value={content}
              rows={5}
              placeholder="Cole aqui o texto que o agente deve conhecer."
              onChange={(e) => setContent(e.target.value)}
              style={{ ...sx.input, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.55 }}
            />
          </Field>
          <div>
            <PrimaryButton icon="add" onClick={add} disabled={!title.trim() || !content.trim()}>
              Adicionar à base
            </PrimaryButton>
          </div>
        </div>
      )}

      <div style={{ fontSize: 12, color: C.faint, marginTop: 16, lineHeight: 1.6 }}>
        A base entra no contexto de cada pergunta feita ao Titã IA, com um teto de tamanho —
        documentos além do teto ficam de fora daquela chamada, porque cada pergunta é paga
        por token. Mantenha ligado só o que for realmente consultado.
      </div>
    </SettingsCard>
  )
}
