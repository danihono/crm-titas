import { useEffect, useMemo, useState } from 'react'
import { canEditSettings, canSeeSettings, useTenantStore } from '../store/tenantStore'
import { sx, C } from '../styles/sx'
import { t, type Chave } from '../i18n'
import MaterialIcon from '../components/common/MaterialIcon'
import { ReadOnlyNote } from '../components/settings/primitives'
import TeamSection from '../components/settings/TeamSection'
import SectorsSection from '../components/settings/SectorsSection'
import TagsSection from '../components/settings/TagsSection'
import QuickRepliesSection from '../components/settings/QuickRepliesSection'
import CustomFieldsSection from '../components/settings/CustomFieldsSection'
import HoursSection from '../components/settings/HoursSection'
import OrgSection from '../components/settings/OrgSection'
import ProfileSection from '../components/settings/ProfileSection'
import PrefsSection from '../components/settings/PrefsSection'
import VariablesSection from '../components/settings/VariablesSection'
import LibrarySection from '../components/settings/LibrarySection'
import KnowledgeSection from '../components/settings/KnowledgeSection'
import SchedulesSection from '../components/settings/SchedulesSection'

type SectionId =
  | 'perfil' | 'preferencias'
  | 'equipe' | 'setores' | 'horarios'
  | 'etiquetas' | 'campos' | 'biblioteca'
  | 'respostas' | 'variaveis' | 'conhecimento' | 'agendamentos'
  | 'org'

/**
 * O grupo é um ID, e não o texto do cabeçalho, porque ele decide PERMISSÃO:
 * `visiveis` compara com 'conta' para dar ao atendente só as seções da conta
 * dele. Amarrar essa comparação a uma chave de tradução misturaria o que se lê
 * com o que se pode ver.
 */
type GroupId = 'conta' | 'atendimento' | 'organizacao' | 'automacao'

const GRUPO_LABEL: Record<GroupId, Chave> = {
  conta: 'config.grupoConta',
  atendimento: 'config.grupoAtendimento',
  organizacao: 'config.grupoOrganizacao',
  automacao: 'config.grupoAutomacao',
}

interface SectionDef {
  id: SectionId
  label: Chave
  icon: string
  group: GroupId
}

const SECTIONS: SectionDef[] = [
  { id: 'perfil', label: 'config.perfil', icon: 'person', group: 'conta' },
  { id: 'preferencias', label: 'prefs.titulo', icon: 'tune', group: 'conta' },
  { id: 'equipe', label: 'config.atendentes', icon: 'badge', group: 'atendimento' },
  { id: 'setores', label: 'config.setores', icon: 'account_tree', group: 'atendimento' },
  { id: 'horarios', label: 'config.horarios', icon: 'schedule', group: 'atendimento' },
  { id: 'etiquetas', label: 'config.etiquetas', icon: 'label', group: 'organizacao' },
  { id: 'campos', label: 'config.campos', icon: 'list_alt', group: 'organizacao' },
  { id: 'biblioteca', label: 'config.biblioteca', icon: 'perm_media', group: 'organizacao' },
  { id: 'org', label: 'config.dadosCanais', icon: 'apartment', group: 'organizacao' },
  { id: 'respostas', label: 'config.respostas', icon: 'quickreply', group: 'automacao' },
  { id: 'variaveis', label: 'config.variaveis', icon: 'data_object', group: 'automacao' },
  { id: 'conhecimento', label: 'config.conhecimento', icon: 'menu_book', group: 'automacao' },
  { id: 'agendamentos', label: 'config.agendamentos', icon: 'schedule_send', group: 'automacao' },
]

export default function Settings() {
  const [active, setActive] = useState<SectionId>('perfil')
  const readOnly = useTenantStore((s) => s.readOnly)
  const role = useTenantStore((s) => s.role)
  const canEdit = canEditSettings(role, readOnly)
  const verTenant = canSeeSettings(role)

  // Atendente fica só com CONTA — as seções da operação nem entram no menu, em vez de
  // aparecerem travadas prometendo um acesso que ele não tem.
  const visiveis = useMemo(
    () => SECTIONS.filter((s) => s.group === 'conta' || verTenant),
    [verTenant],
  )

  // Papel pode mudar durante a sessão (troca de equipe): sem isto a tela ficaria em
  // branco, presa numa seção que deixou de existir para este usuário.
  useEffect(() => {
    if (!visiveis.some((s) => s.id === active)) setActive('perfil')
  }, [visiveis, active])

  // Ordem fixa, declarada — antes ela vinha da ordem de inserção do reduce, o que
  // deixava a barra dependendo de como SECTIONS estava escrito lá em cima.
  const ORDEM: GroupId[] = ['conta', 'atendimento', 'organizacao', 'automacao']
  const groups = ORDEM
    .map((g) => ({ group: g, items: visiveis.filter((s) => s.group === g) }))
    .filter((g) => g.items.length > 0)

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24, padding: '18px 30px 40px' }}>
      <nav style={{ ...sx.card, borderRadius: 20, width: 232, flexShrink: 0, padding: '14px 10px', position: 'sticky', top: 0 }}>
        {groups.map(({ group, items }) => (
          <div key={group} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, letterSpacing: '.16em', color: C.faint, fontWeight: 700, padding: '6px 12px 8px' }}>
              {t(GRUPO_LABEL[group])}
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
                    textAlign: 'left', fontSize: 13,
                    fontWeight: on ? 700 : 500,
                    color: on ? C.purple : C.sub,
                    background: on ? C.tintPurple : 'transparent',
                  }}
                >
                  <MaterialIcon name={s.icon} size={18} />
                  {t(s.label)}
                </button>
              )
            })}
          </div>
        ))}

        {/* Versão publicada. Serve para saber, num relance, se o que está no ar é o que
            está no git — sem precisar caçar diferença de tela para descobrir isso. */}
        <div style={{ fontSize: 10.5, color: C.faint, padding: '10px 12px 2px', borderTop: '1px solid ' + C.lineSoft, marginTop: 4 }}>
          {t('config.versao', { build: __BUILD_ID__ })}
        </div>
      </nav>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Perfil e preferências são da CONTA, não do tenant — seguem editáveis mesmo
            para quem só visualiza a operação de outra pessoa. */}
        {!canEdit && active !== 'perfil' && active !== 'preferencias' && (
          <ReadOnlyNote>
            {t(readOnly ? 'config.somenteLeituraCliente' : 'config.somenteLeituraPapel')}
          </ReadOnlyNote>
        )}

        {active === 'perfil' && <ProfileSection />}
        {active === 'preferencias' && <PrefsSection />}
        {active === 'equipe' && <TeamSection canEdit={canEdit} />}
        {active === 'setores' && <SectorsSection canEdit={canEdit} />}
        {active === 'horarios' && <HoursSection canEdit={canEdit} />}
        {active === 'etiquetas' && <TagsSection canEdit={canEdit} />}
        {active === 'campos' && <CustomFieldsSection canEdit={canEdit} />}
        {active === 'respostas' && <QuickRepliesSection canEdit={canEdit} />}
        {active === 'biblioteca' && <LibrarySection canEdit={canEdit} />}
        {active === 'variaveis' && <VariablesSection canEdit={canEdit} />}
        {active === 'conhecimento' && <KnowledgeSection canEdit={canEdit} />}
        {active === 'agendamentos' && <SchedulesSection canEdit={canEdit} />}
        {active === 'org' && <OrgSection canEdit={canEdit} />}
      </div>
    </div>
  )
}
