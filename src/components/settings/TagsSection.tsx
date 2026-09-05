import { useState } from 'react'
import { addTag, deleteTag, useTags } from '../../hooks/useSettings'
import { sx } from '../../styles/sx'
import { ColorDots, EmptyLine, Field, PrimaryButton, SettingsCard, SETTING_COLORS } from './primitives'
import MaterialIcon from '../common/MaterialIcon'
import { chipColors } from '../../lib/color'
import { useIsDark } from '../../store/themeStore'

export default function TagsSection({ canEdit }: { canEdit: boolean }) {
  const dark = useIsDark()
  const { docs: tags } = useTags()
  const [label, setLabel] = useState('')
  const [color, setColor] = useState(SETTING_COLORS[0])

  async function add() {
    const v = label.trim()
    if (!v) return
    await addTag(v, color, tags.length)
    setLabel('')
  }

  return (
    <SettingsCard
      title="Etiquetas"
      subtitle="Classificam contatos e conversas. Viram recorte nos relatórios e público nas campanhas."
    >
      {tags.length === 0 && <EmptyLine>Nenhuma etiqueta criada ainda.</EmptyLine>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9 }}>
        {tags.map((t) => (
          <span
            key={t.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, borderRadius: 20, padding: '6px 12px',
              fontSize: 12.5, fontWeight: 700, color: chipColors(t.color, dark).fg, background: chipColors(t.color, dark).bg,
              border: '1px solid ' + chipColors(t.color, dark).border,
            }}
          >
            {t.label}
            {canEdit && (
              <button
                onClick={() => deleteTag(t.id)}
                title="Excluir etiqueta"
                style={{ display: 'flex', border: 'none', background: 'transparent', cursor: 'pointer', color: t.color, padding: 0 }}
              >
                <MaterialIcon name="close" size={15} />
              </button>
            )}
          </span>
        ))}
      </div>

      {canEdit && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr auto auto', gap: 14, alignItems: 'end', marginTop: 18 }}>
          <Field label="Nova etiqueta">
            <input
              value={label}
              placeholder="Cliente VIP"
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && add()}
              style={sx.input}
            />
          </Field>
          <Field label="Cor"><ColorDots value={color} onChange={setColor} /></Field>
          <PrimaryButton icon="add" onClick={add} disabled={!label.trim()}>Adicionar</PrimaryButton>
        </div>
      )}
    </SettingsCard>
  )
}
