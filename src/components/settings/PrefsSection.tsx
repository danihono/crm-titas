import { useEffect, useState, type ReactNode } from 'react'
import { saveSelfPrefs, useSelfProfile } from '../../hooks/useProfile'
import { requestNotificationPermission } from '../../hooks/useMessageNotifications'
import { C } from '../../styles/sx'
import { t } from '../../i18n'
import { useThemeStore, type ThemeMode } from '../../store/themeStore'
import { useLocaleStore, type Idioma } from '../../store/localeStore'
import MaterialIcon from '../common/MaterialIcon'
import { SettingsCard } from './primitives'

type Permission = 'default' | 'granted' | 'denied' | 'unsupported'

function currentPermission(): Permission {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission
}

/** Preferências da conta logada — tema, idioma e avisos de mensagem nova. */
const TEMAS: { id: ThemeMode; chave: 'prefs.temaClaro' | 'prefs.temaEscuro' | 'prefs.temaSistema'; icon: string }[] = [
  { id: 'light', chave: 'prefs.temaClaro', icon: 'light_mode' },
  { id: 'dark', chave: 'prefs.temaEscuro', icon: 'dark_mode' },
  { id: 'system', chave: 'prefs.temaSistema', icon: 'contrast' },
]

/**
 * Os nomes dos idiomas ficam CADA UM NO SEU IDIOMA, e não traduzidos.
 * Quem abriu o CRM em inglês por engano procura "Português", não "Portuguese":
 * o rótulo é o que tira a pessoa de um idioma que ela não lê.
 */
const IDIOMAS: { id: Idioma; label: string }[] = [
  { id: 'pt', label: 'Português' },
  { id: 'es', label: 'Español' },
  { id: 'en', label: 'English' },
]

export default function PrefsSection() {
  const { prefs } = useSelfProfile()
  const mode = useThemeStore((s) => s.mode)
  const setMode = useThemeStore((s) => s.setMode)
  const idioma = useLocaleStore((s) => s.idioma)
  const setIdioma = useLocaleStore((s) => s.setIdioma)
  const [permission, setPermission] = useState<Permission>(currentPermission)

  // A permissão pode ter sido concedida noutra aba; reler ao focar evita o painel
  // dizer "não autorizado" para quem já autorizou.
  useEffect(() => {
    const sync = () => setPermission(currentPermission())
    window.addEventListener('focus', sync)
    return () => window.removeEventListener('focus', sync)
  }, [])

  async function askPermission() {
    // O pedido tem de sair de um clique: navegador bloqueia pedido espontâneo.
    setPermission((await requestNotificationPermission()) as Permission)
  }

  return (
    <SettingsCard title={t('prefs.titulo')} subtitle={t('prefs.subtitulo')}>
      {/* O tema é aplicado na hora e gravado neste dispositivo; o doc da conta
          guarda uma cópia só para um computador novo já abrir do jeito certo. */}
      <Grupo titulo={t('prefs.tema')} dica={t('prefs.temaDica')}>
        {TEMAS.map((tema) => (
          <Opcao
            key={tema.id}
            ativo={mode === tema.id}
            icon={tema.icon}
            label={t(tema.chave)}
            onClick={() => { setMode(tema.id); void saveSelfPrefs({ theme: tema.id }) }}
          />
        ))}
      </Grupo>

      {/* Mesma mecânica do tema, e pelo mesmo motivo: vale já, neste aparelho, e
          o doc da conta guarda o espelho para o próximo computador. */}
      <Grupo titulo={t('prefs.idioma')} dica={t('prefs.idiomaDica')}>
        {IDIOMAS.map((op) => (
          <Opcao
            key={op.id}
            ativo={idioma === op.id}
            icon="language"
            label={op.label}
            onClick={() => { setIdioma(op.id); void saveSelfPrefs({ idioma: op.id }) }}
          />
        ))}
      </Grupo>

      <Toggle
        label={t('prefs.avisoDesktop')}
        hint={t('prefs.avisoDesktopDica')}
        checked={prefs.notifyDesktop}
        onChange={(v) => saveSelfPrefs({ notifyDesktop: v })}
      />
      <Toggle
        label={t('prefs.som')}
        hint={t('prefs.somDica')}
        checked={prefs.notifySound}
        onChange={(v) => saveSelfPrefs({ notifySound: v })}
      />

      <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
        {permission === 'granted' && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.green, fontWeight: 700 }}>
            <MaterialIcon name="check_circle" size={17} /> {t('prefs.permitido')}
          </span>
        )}
        {permission === 'default' && (
          <>
            <span style={{ color: C.sub }}>{t('prefs.permissaoPendente')}</span>
            <button
              onClick={askPermission}
              style={{ border: 'none', borderRadius: 9, padding: '7px 12px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', color: C.purple, background: C.tintPurple }}
            >
              {t('prefs.autorizar')}
            </button>
          </>
        )}
        {permission === 'denied' && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.rose, fontWeight: 600 }}>
            <MaterialIcon name="block" size={17} />
            {t('prefs.bloqueado')}
          </span>
        )}
        {permission === 'unsupported' && (
          <span style={{ color: C.faint }}>{t('prefs.semSuporte')}</span>
        )}
      </div>

      <div style={{ fontSize: 12, color: C.faint, marginTop: 14, lineHeight: 1.6 }}>
        {t('prefs.rodape')}
      </div>
    </SettingsCard>
  )
}

/** Título, explicação e a fileira de botões — o desenho que o tema já tinha. */
function Grupo({ titulo, dica, children }: {
  titulo: string
  dica: string
  children: ReactNode
}) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>{titulo}</div>
      <div style={{ fontSize: 12, color: C.sub, marginTop: 2, marginBottom: 9, maxWidth: 560, lineHeight: 1.5 }}>
        {dica}
      </div>
      <div style={{ display: 'inline-flex', gap: 3, background: C.raised, borderRadius: 12, padding: 3 }}>
        {children}
      </div>
    </div>
  )
}

function Opcao({ ativo, icon, label, onClick }: {
  ativo: boolean
  icon: string
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, border: 'none', borderRadius: 9,
        padding: '7px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
        color: ativo ? C.purple : C.sub,
        background: ativo ? C.sel : 'transparent',
      }}
    >
      <MaterialIcon name={icon} size={17} /> {label}
    </button>
  )
}

function Toggle({ label, hint, checked, onChange }: {
  label: string
  hint: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: '11px 2px', borderBottom: `1px solid ${C.lineHair}`, cursor: 'pointer' }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: C.purple, width: 16, height: 16, marginTop: 2 }}
      />
      <span>
        <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: C.ink }}>{label}</span>
        <span style={{ display: 'block', fontSize: 12, color: C.sub, marginTop: 2 }}>{hint}</span>
      </span>
    </label>
  )
}
