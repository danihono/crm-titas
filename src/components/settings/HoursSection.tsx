import { useEffect, useState } from 'react'
import {
  diasDaSemana, isWithinBusinessHours, saveBusinessHours, useBusinessHours,
} from '../../hooks/useSettings'
import { t } from '../../i18n'
import { sx, C } from '../../styles/sx'
import MaterialIcon from '../common/MaterialIcon'
import { Field, PrimaryButton, SettingsCard } from './primitives'
import type { BusinessHours } from '../../types'

export default function HoursSection({ canEdit }: { canEdit: boolean }) {
  const dias = diasDaSemana()
  const saved = useBusinessHours()
  const [draft, setDraft] = useState<BusinessHours>(saved)
  const [savedAt, setSavedAt] = useState(0)

  // O rascunho acompanha o que vem do Firestore até o usuário mexer; a chave é o
  // conteúdo salvo, então uma edição de outra aba chega, mas o que ele está digitando
  // não é sobrescrito a cada tecla.
  const savedKey = JSON.stringify(saved)
  useEffect(() => {
    setDraft(saved)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey])

  const open = isWithinBusinessHours(saved)
  const dirty = JSON.stringify(draft) !== savedKey

  function patchDay(i: number, patch: Partial<BusinessHours['days'][number]>) {
    setDraft((d) => ({ ...d, days: d.days.map((day, j) => (j === i ? { ...day, ...patch } : day)) }))
  }

  async function save() {
    await saveBusinessHours(draft)
    setSavedAt(Date.now())
  }

  return (
    <SettingsCard
      title={t('horarios.titulo')}
      subtitle={t('horarios.subtitulo')}
      action={
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 700, color: open ? C.green : C.faint }}>
          <MaterialIcon name={open ? 'schedule' : 'bedtime'} size={17} />
          {t(open ? 'horarios.atendendoAgora' : 'horarios.foraDoHorario')}
        </span>
      }
    >
      {draft.days.map((day, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 14, alignItems: 'center', padding: '9px 2px', borderBottom: `1px solid ${C.lineHair}` }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: canEdit ? 'pointer' : 'default' }}>
            <input
              type="checkbox"
              checked={day.enabled}
              disabled={!canEdit}
              onChange={(e) => patchDay(i, { enabled: e.target.checked })}
              style={{ accentColor: C.purple, width: 16, height: 16 }}
            />
            <span style={{ fontSize: 13.5, fontWeight: 600, color: day.enabled ? C.ink : C.faint }}>{dias[i]}</span>
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: day.enabled ? 1 : 0.45 }}>
            <input
              type="time"
              value={day.open}
              disabled={!canEdit || !day.enabled}
              onChange={(e) => patchDay(i, { open: e.target.value })}
              style={{ ...sx.input, width: 128, padding: '8px 11px' }}
            />
            <span style={{ color: C.faint, fontSize: 13 }}>{t('horarios.as')}</span>
            <input
              type="time"
              value={day.close}
              disabled={!canEdit || !day.enabled}
              onChange={(e) => patchDay(i, { close: e.target.value })}
              style={{ ...sx.input, width: 128, padding: '8px 11px' }}
            />
          </div>
        </div>
      ))}

      <div style={{ marginTop: 18 }}>
        <Field label={t('horarios.ausencia')}>
          <textarea
            value={draft.awayMessage}
            rows={2}
            disabled={!canEdit}
            placeholder={t('horarios.ausenciaExemplo')}
            onChange={(e) => setDraft((d) => ({ ...d, awayMessage: e.target.value }))}
            style={{ ...sx.input, resize: 'vertical', fontFamily: 'inherit' }}
          />
        </Field>
      </div>

      {canEdit && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
          <PrimaryButton icon="save" onClick={save} disabled={!dirty}>{t('horarios.salvar')}</PrimaryButton>
          {!dirty && savedAt > 0 && (
            <span style={{ fontSize: 12.5, color: C.green, fontWeight: 600 }}>{t('horarios.salvo')}</span>
          )}
        </div>
      )}
    </SettingsCard>
  )
}
