import { useEffect, useState } from 'react'
import { saveSelfPrefs, useSelfProfile } from '../../hooks/useProfile'
import { requestNotificationPermission } from '../../hooks/useMessageNotifications'
import { C } from '../../styles/sx'
import { useThemeStore, type ThemeMode } from '../../store/themeStore'
import MaterialIcon from '../common/MaterialIcon'
import { SettingsCard } from './primitives'

type Permission = 'default' | 'granted' | 'denied' | 'unsupported'

function currentPermission(): Permission {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission
}

/** Preferências da conta logada — avisos de mensagem nova. */
const TEMAS: { id: ThemeMode; label: string; icon: string }[] = [
  { id: 'light', label: 'Claro', icon: 'light_mode' },
  { id: 'dark', label: 'Escuro', icon: 'dark_mode' },
  { id: 'system', label: 'Sistema', icon: 'contrast' },
]

export default function PrefsSection() {
  const { prefs } = useSelfProfile()
  const mode = useThemeStore((s) => s.mode)
  const setMode = useThemeStore((s) => s.setMode)
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
    <SettingsCard
      title="Preferências pessoais"
      subtitle="Valem só para a sua conta, em qualquer equipe que você atenda."
    >
      {/* O tema é aplicado na hora e gravado neste dispositivo; o doc da conta
          guarda uma cópia só para um computador novo já abrir do jeito certo. */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>Tema da interface</div>
        <div style={{ fontSize: 12, color: C.sub, marginTop: 2, marginBottom: 9 }}>
          "Sistema" acompanha o que o seu computador estiver usando.
        </div>
        <div style={{ display: 'inline-flex', gap: 3, background: C.raised, borderRadius: 12, padding: 3 }}>
          {TEMAS.map((t) => {
            const on = mode === t.id
            return (
              <button
                key={t.id}
                onClick={() => { setMode(t.id); void saveSelfPrefs({ theme: t.id }) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, border: 'none', borderRadius: 9,
                  padding: '7px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                  color: on ? C.purple : C.sub,
                  background: on ? C.sel : 'transparent',
                }}
              >
                <MaterialIcon name={t.icon} size={17} /> {t.label}
              </button>
            )
          })}
        </div>
      </div>

      <Toggle
        label="Aviso na área de trabalho"
        hint="Notificação do sistema quando chega mensagem com o CRM em segundo plano."
        checked={prefs.notifyDesktop}
        onChange={(v) => saveSelfPrefs({ notifyDesktop: v })}
      />
      <Toggle
        label="Som ao receber mensagem"
        hint="Um toque curto junto do aviso."
        checked={prefs.notifySound}
        onChange={(v) => saveSelfPrefs({ notifySound: v })}
      />

      <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
        {permission === 'granted' && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.green, fontWeight: 700 }}>
            <MaterialIcon name="check_circle" size={17} /> Navegador autorizado a notificar.
          </span>
        )}
        {permission === 'default' && (
          <>
            <span style={{ color: C.sub }}>O navegador ainda não autorizou as notificações.</span>
            <button
              onClick={askPermission}
              style={{ border: 'none', borderRadius: 9, padding: '7px 12px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', color: C.purple, background: C.tintPurple }}
            >
              Autorizar
            </button>
          </>
        )}
        {permission === 'denied' && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.rose, fontWeight: 600 }}>
            <MaterialIcon name="block" size={17} />
            Notificações bloqueadas para este site — a liberação é no cadeado da barra de endereço.
          </span>
        )}
        {permission === 'unsupported' && (
          <span style={{ color: C.faint }}>Este navegador não suporta notificações do sistema.</span>
        )}
      </div>

      <div style={{ fontSize: 12, color: C.faint, marginTop: 14, lineHeight: 1.6 }}>
        Os avisos só funcionam com o CRM aberto em alguma aba. Notificação com o CRM
        fechado exigiria push do servidor, que ainda não existe aqui.
      </div>
    </SettingsCard>
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
