import { useState } from 'react'
import { canManage, useTenantStore } from '../store/tenantStore'
import { sx, C } from '../styles/sx'
import MaterialIcon from '../components/common/MaterialIcon'
import { ReadOnlyNote } from '../components/settings/primitives'
import TeamSection from '../components/settings/TeamSection'
import SectorsSection from '../components/settings/SectorsSection'
import TagsSection from '../components/settings/TagsSection'
import QuickRepliesSection from '../components/settings/QuickRepliesSection'
import CustomFieldsSection from '../components/settings/CustomFieldsSection'
import HoursSection from '../components/settings/HoursSection'
import OrgSection from '../components/settings/OrgSection'

type SectionId = 'equipe' | 'setores' | 'etiquetas' | 'respostas' | 'campos' | 'horarios' | 'org'

interface SectionDef {
  id: SectionId
  label: string
  icon: string
  group: string
}

const SECTIONS: SectionDef[] = [
  { id: 'equipe', label: 'Atendentes', icon: 'badge', group: 'ATENDIMENTO' },
  { id: 'setores', label: 'Setores', icon: 'account_tree', group: 'ATENDIMENTO' },
  { id: 'horarios', label: 'Horários', icon: 'schedule', group: 'ATENDIMENTO' },
  { id: 'etiquetas', label: 'Etiquetas', icon: 'label', group: 'ORGANIZAÇÃO' },
  { id: 'campos', label: 'Campos personalizados', icon: 'list_alt', group: 'ORGANIZAÇÃO' },
  { id: 'respostas', label: 'Respostas rápidas', icon: 'quickreply', group: 'AUTOMAÇÃO' },
  { id: 'org', label: 'Dados e canais', icon: 'apartment', group: 'ORGANIZAÇÃO' },
]

export default function Settings() {
  const [active, setActive] = useState<SectionId>('equipe')
  const readOnly = useTenantStore((s) => s.readOnly)
  const role = useTenantStore((s) => s.role)
  const canEdit = canManage(role, readOnly)

  const groups = SECTIONS.reduce<Record<string, SectionDef[]>>((acc, s) => {
    ;(acc[s.group] ||= []).push(s)
    return acc
  }, {})

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24, padding: '28px 30px 40px' }}>
      <nav style={{ ...sx.card, borderRadius: 20, width: 232, flexShrink: 0, padding: '14px 10px', position: 'sticky', top: 0 }}>
        {Object.entries(groups).map(([group, items]) => (
          <div key={group} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, letterSpacing: '.16em', color: C.faint, fontWeight: 700, padding: '6px 12px 8px' }}>
              {group}
            </div>
            {items.map((s) => {
              const on = s.id === active
              return (
                <button
                  key={s.id}
                  onClick={() => setActive(s.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                    padding: '10px 12px', border: 'none', borderRadius: 11, cursor: 'pointer',
                    textAlign: 'left', fontSize: 13, fontFamily: "'Manrope',sans-serif",
                    fontWeight: on ? 700 : 500,
                    color: on ? C.purple : C.sub,
                    background: on ? 'rgba(150,110,200,0.12)' : 'transparent',
                  }}
                >
                  <MaterialIcon name={s.icon} size={18} />
                  {s.label}
                </button>
              )
            })}
          </div>
        ))}
      </nav>

      <div style={{ flex: 1, minWidth: 0 }}>
        {!canEdit && (
          <ReadOnlyNote>
            {readOnly
              ? 'Você está visualizando o CRM de um cliente — as configurações são somente leitura.'
              : 'Seu papel é Atendente: as configurações da equipe são administradas por um gestor.'}
          </ReadOnlyNote>
        )}

        {active === 'equipe' && <TeamSection canEdit={canEdit} />}
        {active === 'setores' && <SectorsSection canEdit={canEdit} />}
        {active === 'horarios' && <HoursSection canEdit={canEdit} />}
        {active === 'etiquetas' && <TagsSection canEdit={canEdit} />}
        {active === 'campos' && <CustomFieldsSection canEdit={canEdit} />}
        {active === 'respostas' && <QuickRepliesSection canEdit={canEdit} />}
        {active === 'org' && <OrgSection canEdit={canEdit} />}
      </div>
    </div>
  )
}
