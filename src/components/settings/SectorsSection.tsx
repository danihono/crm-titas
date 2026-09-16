import { useState } from 'react'
import { addSector, deleteSector, updateSector, useSectors } from '../../hooks/useSettings'
import { sx, C } from '../../styles/sx'
import { t } from '../../i18n'
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
      title={t('setores.titulo')}
      subtitle={t('setores.subtitulo')}
    >
      {sectors.length === 0 && <EmptyLine>{t('setores.vazio')}</EmptyLine>}
      {sectors.map((s) => (
        <div key={s.id}>
          <Row
            color={s.color}
            actions={
              canEdit ? (
                <>
                  <IconAction
                    icon="chat_bubble"
                    title={t('setores.boasVindas')}
                    color={s.greeting ? C.purple : C.muted}
                    onClick={() => (editing === s.id ? setEditing(null) : startEdit(s.id, s.greeting))}
                  />
                  <IconAction icon="delete" title={t('setores.excluir')} color={C.rose} onClick={() => deleteSector(s.id)} />
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
              <Field label={t('setores.boasVindasDica')} style={{ flex: 1 }}>
                <textarea
                  value={greeting}
                  onChange={(e) => setGreeting(e.target.value)}
                  rows={2}
                  placeholder={t('setores.boasVindasExemplo')}
                  style={{ ...sx.input, resize: 'vertical', fontFamily: 'inherit' }}
                />
              </Field>
              <PrimaryButton icon="check" onClick={() => saveGreeting(s.id)}>{t('comum.salvar')}</PrimaryButton>
            </div>
          )}
        </div>
      ))}

      {canEdit && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr auto auto', gap: 14, alignItems: 'end', marginTop: 18 }}>
          <Field label={t('setores.novo')}>
            <input
              value={name}
              placeholder={t('setores.exemplo')}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && add()}
              style={sx.input}
            />
          </Field>
          <Field label={t('config.cor')}><ColorDots value={color} onChange={setColor} /></Field>
          <PrimaryButton icon="add" onClick={add} disabled={!name.trim()}>{t('comum.adicionar')}</PrimaryButton>
        </div>
      )}
    </SettingsCard>
  )
}
