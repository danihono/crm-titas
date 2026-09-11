import { useState } from 'react'
import { addTag, deleteTag, useTags } from '../../hooks/useSettings'
import { sx } from '../../styles/sx'
import { ColorDots, EmptyLine, Field, PrimaryButton, SettingsCard, SETTING_COLORS } from './primitives'
import { t } from '../../i18n'
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
      title={t('etiquetas.titulo')}
      subtitle={t('etiquetas.subtitulo')}
    >
      {tags.length === 0 && <EmptyLine>{t('etiquetas.vazio')}</EmptyLine>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9 }}>
        {tags.map((tag) => (
          <span
            key={tag.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, borderRadius: 20, padding: '6px 12px',
              fontSize: 12.5, fontWeight: 700, color: chipColors(tag.color, dark).fg, background: chipColors(tag.color, dark).bg,
              border: '1px solid ' + chipColors(tag.color, dark).border,
            }}
          >
            {tag.label}
            {canEdit && (
              <button
                onClick={() => deleteTag(tag.id)}
                title={t('etiquetas.excluir')}
                style={{ display: 'flex', border: 'none', background: 'transparent', cursor: 'pointer', color: tag.color, padding: 0 }}
              >
                <MaterialIcon name="close" size={15} />
              </button>
            )}
          </span>
        ))}
      </div>

      {canEdit && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr auto auto', gap: 14, alignItems: 'end', marginTop: 18 }}>
          <Field label={t('etiquetas.nova')}>
            <input
              value={label}
              placeholder={t('etiquetas.exemplo')}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && add()}
              style={sx.input}
            />
          </Field>
          <Field label={t('config.cor')}><ColorDots value={color} onChange={setColor} /></Field>
          <PrimaryButton icon="add" onClick={add} disabled={!label.trim()}>{t('comum.adicionar')}</PrimaryButton>
        </div>
      )}
    </SettingsCard>
  )
}
