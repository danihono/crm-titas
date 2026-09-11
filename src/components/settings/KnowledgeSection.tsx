import { useState } from 'react'
import {
  addKnowledgeDoc, deleteKnowledgeDoc, updateKnowledgeDoc, useKnowledge,
} from '../../hooks/useLibrary'
import { sx, C } from '../../styles/sx'
import { t } from '../../i18n'
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
      title={t('conhecimento.titulo')}
      subtitle={t('conhecimento.subtitulo')}
      action={
        <span style={{ fontSize: 12.5, fontWeight: 700, color: enabledCount ? C.purple : C.faint }}>
          {t('conhecimento.emUso', { n: enabledCount })}
        </span>
      }
    >
      {docs.length === 0 && <EmptyLine>{t('conhecimento.vazio')}</EmptyLine>}
      {docs.map((d) => (
        <div key={d.id}>
          <Row
            actions={
              canEdit ? (
                <>
                  <IconAction
                    icon={d.enabled ? 'toggle_on' : 'toggle_off'}
                    title={t(d.enabled ? 'conhecimento.tirarContexto' : 'conhecimento.voltarContexto')}
                    color={d.enabled ? C.green : C.faint}
                    onClick={() => updateKnowledgeDoc(d.id, { enabled: !d.enabled })}
                  />
                  <IconAction
                    icon="edit"
                    title={t('conhecimento.editar')}
                    onClick={() => {
                      if (editing === d.id) return setEditing(null)
                      setEditing(d.id)
                      setDraft(d.content)
                    }}
                  />
                  <IconAction icon="delete" title={t('comum.excluir')} color={C.rose} onClick={() => deleteKnowledgeDoc(d.id)} />
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
                <PrimaryButton icon="check" onClick={() => saveEdit(d.id)}>{t('conhecimento.salvar')}</PrimaryButton>
              </div>
            </div>
          )}
        </div>
      ))}

      {canEdit && (
        <div style={{ display: 'grid', gap: 12, marginTop: 18 }}>
          <Field label={t('conhecimento.tituloCampo')}>
            <input value={title} placeholder={t('conhecimento.tituloExemplo')} onChange={(e) => setTitle(e.target.value)} style={sx.input} />
          </Field>
          <Field label={t('conhecimento.conteudo')}>
            <textarea
              value={content}
              rows={5}
              placeholder={t('conhecimento.conteudoExemplo')}
              onChange={(e) => setContent(e.target.value)}
              style={{ ...sx.input, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.55 }}
            />
          </Field>
          <div>
            <PrimaryButton icon="add" onClick={add} disabled={!title.trim() || !content.trim()}>
              {t('conhecimento.adicionarBase')}
            </PrimaryButton>
          </div>
        </div>
      )}

      <div style={{ fontSize: 12, color: C.faint, marginTop: 16, lineHeight: 1.6 }}>
        {t('conhecimento.rodape')}
      </div>
    </SettingsCard>
  )
}
