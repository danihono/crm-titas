import { useState } from 'react'
import { addQuickReply, deleteQuickReply, normalizeShortcut, useQuickReplies } from '../../hooks/useSettings'
import { sx, C } from '../../styles/sx'
import { EmptyLine, Field, IconAction, PrimaryButton, Row, SettingsCard } from './primitives'

export default function QuickRepliesSection({ canEdit }: { canEdit: boolean }) {
  const { docs: replies } = useQuickReplies()
  const [shortcut, setShortcut] = useState('')
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')

  const taken = new Set(replies.map((r) => r.shortcut))
  const normalized = normalizeShortcut(shortcut)
  const duplicated = !!normalized && taken.has(normalized)

  async function add() {
    if (!normalized || !text.trim() || duplicated) return
    await addQuickReply(normalized, title.trim() || normalized, text.trim())
    setShortcut('')
    setTitle('')
    setText('')
  }

  return (
    <SettingsCard
      title="Respostas rápidas"
      subtitle="Textos prontos chamados no chat por /atalho. Aceitam {{nome}}, {{empresa}} e {{atendente}}."
    >
      {replies.length === 0 && <EmptyLine>Nenhuma resposta rápida cadastrada.</EmptyLine>}
      {replies.map((r) => (
        <Row
          key={r.id}
          actions={canEdit ? <IconAction icon="delete" title="Excluir" color={C.rose} onClick={() => deleteQuickReply(r.id)} /> : undefined}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: C.purple, background: C.tintPurple, borderRadius: 7, padding: '2px 8px' }}>
              /{r.shortcut}
            </span>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>{r.title}</span>
          </div>
          <div style={{ fontSize: 12, color: C.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.text}</div>
        </Row>
      ))}

      {canEdit && (
        <div style={{ display: 'grid', gap: 12, marginTop: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12 }}>
            <Field label="Atalho">
              <input value={shortcut} placeholder="ola" onChange={(e) => setShortcut(e.target.value)} style={sx.input} />
            </Field>
            <Field label="Título">
              <input value={title} placeholder="Saudação inicial" onChange={(e) => setTitle(e.target.value)} style={sx.input} />
            </Field>
          </div>
          <Field label="Texto">
            <textarea
              value={text}
              rows={3}
              placeholder="Olá {{nome}}! Aqui é {{atendente}}, da Titãs. Como posso ajudar?"
              onChange={(e) => setText(e.target.value)}
              style={{ ...sx.input, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </Field>
          {duplicated && (
            <div style={{ fontSize: 12.5, color: C.rose }}>Já existe uma resposta com o atalho /{normalized}.</div>
          )}
          <div>
            <PrimaryButton icon="add" onClick={add} disabled={!normalized || !text.trim() || duplicated}>
              Adicionar resposta
            </PrimaryButton>
          </div>
        </div>
      )}
    </SettingsCard>
  )
}
