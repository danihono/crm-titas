import { useState } from 'react'
import { addSector, deleteSector, updateSector, useSectors } from '../../hooks/useSettings'
import { sx, C } from '../../styles/sx'
import { ColorDots, EmptyLine, Field, IconAction, PrimaryButton, Row, SettingsCard, SETTING_COLORS } from './primitives'

export default function SectorsSection({ canEdit }: { canEdit: boolean }) {
  const { docs: sectors } = useSectors()
  const [name, setName] = useState('')
  const [color, setColor] = useState(SETTING_COLORS[0])
  const [editing, setEditing] = useState<string | null>(null)
  const [greeting, setGreeting] = useState('')

  async function add() {
    const v = name.trim()
    if (!v) return
    await addSector(v, color, sectors.length)
    setName('')
  }

  function startEdit(id: string, current: string) {
    setEditing(id)
    setGreeting(current)
  }

  async function saveGreeting(id: string) {
    await updateSector(id, { greeting: greeting.trim() })
    setEditing(null)
  }

  return (
    <SettingsCard
      title="Setores"
      subtitle="Filas de atendimento — Comercial, Suporte, Financeiro. A conversa pode ser transferida entre elas."
    >
      {sectors.length === 0 && <EmptyLine>Nenhum setor criado ainda.</EmptyLine>}
      {sectors.map((s) => (
        <div key={s.id}>
          <Row
            color={s.color}
            actions={
              canEdit ? (
                <>
                  <IconAction
                    icon="chat_bubble"
                    title="Mensagem de boas-vindas do setor"
                    color={s.greeting ? C.purple : C.muted}
                    onClick={() => (editing === s.id ? setEditing(null) : startEdit(s.id, s.greeting))}
                  />
                  <IconAction icon="delete" title="Excluir setor" color={C.rose} onClick={() => deleteSector(s.id)} />
                </>
              ) : undefined
            }
          >
            <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>{s.name}</div>
            {s.greeting && (
              <div style={{ fontSize: 12, color: C.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {s.greeting}
              </div>
            )}
          </Row>
          {editing === s.id && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'end', padding: '12px 0 14px' }}>
              <Field label="Mensagem enviada ao transferir para este setor" style={{ flex: 1 }}>
                <textarea
                  value={greeting}
                  onChange={(e) => setGreeting(e.target.value)}
                  rows={2}
                  placeholder="Olá! Você foi transferido para o time Comercial."
                  style={{ ...sx.input, resize: 'vertical', fontFamily: 'inherit' }}
                />
              </Field>
              <PrimaryButton icon="check" onClick={() => saveGreeting(s.id)}>Salvar</PrimaryButton>
            </div>
          )}
        </div>
      ))}

      {canEdit && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr auto auto', gap: 14, alignItems: 'end', marginTop: 18 }}>
          <Field label="Novo setor">
            <input
              value={name}
              placeholder="Comercial"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && add()}
              style={sx.input}
            />
          </Field>
          <Field label="Cor"><ColorDots value={color} onChange={setColor} /></Field>
          <PrimaryButton icon="add" onClick={add} disabled={!name.trim()}>Adicionar</PrimaryButton>
        </div>
      )}
    </SettingsCard>
  )
}
