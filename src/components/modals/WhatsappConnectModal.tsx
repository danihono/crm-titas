import { useState } from 'react'
import Modal from './Modal'
import MaterialIcon from '../common/MaterialIcon'
import RingButton from '../common/RingButton'
import { sx, C } from '../../styles/sx'
import { t, type Chave } from '../../i18n'
import { useTenantStore, canManage } from '../../store/tenantStore'
import { useWhatsappStatus } from '../../hooks/useWhatsappStatus'
import { useDaemonOnline, useDaemonStorageOk } from '../../hooks/useDaemonOnline'
import { giveConsent, connectWhatsapp, disconnectWhatsapp, heartbeatKnown } from '../../lib/whatsapp'

const RETENTION_OPTIONS: { v: number; label: Chave }[] = [
  { v: 0, label: 'wa.reterSempre' },
  { v: 30, label: 'wa.reter30' },
  { v: 90, label: 'wa.reter90' },
  { v: 180, label: 'wa.reter180' },
]

/**
 * Erros assíncronos vindos do daemon (whatsappStatus.lastError). Só os que dizem algo ao
 * usuário: o campo também recebe códigos de desconexão do WhatsApp (ex.: "515"), que são
 * ruído — os não mapeados ficam de fora de propósito.
 */
const LAST_ERROR_LABEL: Record<string, Chave> = {
  lease_taken: 'wa.outraCopia',
  lease_lost: 'wa.outraAssumiu',
  'connect failed': 'wa.naoConectou',
}

export default function WhatsappConnectModal({ onClose }: { onClose: () => void }) {
  const st = useWhatsappStatus()
  const daemonUp = useDaemonOnline()
  const storage = useDaemonStorageOk()
  const [consented, setConsented] = useState(false)
  const [retention, setRetention] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // Conectar, desconectar e definir a retenção mexem na operação inteira — o número é o da
  // empresa e o expurgo não tem volta. As security rules já recusam vindo de um atendente;
  // isto aqui é para ele ver o MOTIVO, em vez de um "permissão negada" seco depois do clique.
  const role = useTenantStore((s) => s.role)
  const readOnly = useTenantStore((s) => s.readOnly)
  const podeAdministrar = canManage(role, readOnly)

  async function handleConnect() {
    if (busy || !podeAdministrar) return
    setBusy(true)
    setErr(null)
    try {
      await giveConsent(retention)
      await connectWhatsapp()
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('wa.falhaConectar'))
    } finally {
      setBusy(false)
    }
  }

  async function handleDisconnect(purge: boolean) {
    if (busy || !podeAdministrar) return
    if (purge && !confirm(t('wa.confirmarDesconectar'))) return
    setBusy(true)
    setErr(null)
    try {
      await disconnectWhatsapp(purge)
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('wa.falhaDesconectar'))
    } finally {
      setBusy(false)
    }
  }

  const connected = st.status === 'connected'
  const showConsent = !connected && st.status !== 'qr' && st.status !== 'connecting'
  // Só avisa depois de ter lido o heartbeat ao menos uma vez — senão o aviso pisca ao abrir.
  const showOffline = heartbeatKnown() && !daemonUp
  const chaveUltimoErro = st.lastError ? LAST_ERROR_LABEL[st.lastError] : undefined
  const lastErrorLabel = chaveUltimoErro ? t(chaveUltimoErro) : undefined

  return (
    <Modal width={460} onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <MaterialIcon name="chat" size={22} color={C.greenDeep} style={{ background: 'rgba(52,199,89,0.14)', width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }} />
          <div style={{ ...sx.serif, fontSize: 22, color: C.ink }}>{t('wa.conectarTitulo')}</div>
        </div>
        <MaterialIcon name="close" size={22} color={C.muted} style={{ cursor: 'pointer' }} onClick={onClose} />
      </div>

      <StatusLine st={st.status} phone={st.phoneNumber} />

      {!podeAdministrar && (
        <div style={{ marginTop: 10, background: 'rgba(154,111,184,0.10)', border: '1px solid rgba(154,111,184,0.28)', borderRadius: 11, padding: '10px 13px', fontSize: 12.3, color: C.sub, lineHeight: 1.45 }}>
          <b style={{ color: C.ink }}>{t('wa.somenteLeitura')}</b> {t('wa.somenteLeituraTexto')}
        </div>
      )}

      {showOffline && (
        <div style={{ marginTop: 10, background: 'rgba(193,77,119,0.09)', border: '1px solid rgba(193,77,119,0.28)', borderRadius: 11, padding: '10px 13px', fontSize: 12.3, color: C.sub, lineHeight: 1.45 }}>
          <b style={{ color: C.rose }}>{t('wa.servicoOffline')}</b> {t('wa.offlineTexto')}
        </div>
      )}

      {/* Falha de Storage é degradação silenciosa: o texto continua chegando e só a mídia
          some. Sem esta tarja, o sintoma leva dias para ser notado — e já levou. */}
      {storage.ok === false && (
        <div style={{ marginTop: 10, background: 'rgba(216,169,96,0.12)', border: '1px solid rgba(216,169,96,0.36)', borderRadius: 11, padding: '10px 13px', fontSize: 12.3, color: C.sub, lineHeight: 1.45 }}>
          <b style={{ color: C.amberDeep }}>{t('wa.semSalvarArquivos')}</b>{' '}
          {t(storage.code === 'not_found' ? 'wa.bucketNaoEncontrado' : 'wa.faltaPermissao')}{' '}
          {t('wa.storageTexto')}
        </div>
      )}

      {lastErrorLabel && <div style={{ marginTop: 10, fontSize: 12.3, color: C.rose }}>{lastErrorLabel}</div>}

      {/* QR */}
      {st.status === 'qr' && st.qr && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, margin: '14px 0 4px' }}>
          <img src={st.qr} alt={t('wa.qrAlt')} width={240} height={240} style={{ borderRadius: 14, border: '1px solid ' + C.line }} />
          <div style={{ fontSize: 12.5, color: C.sub, textAlign: 'center', maxWidth: 320 }}>
            {t('wa.noCelular')} <b>{t('wa.aparelhosConectados')}</b> → <b>{t('wa.conectarAparelho')}</b> {t('wa.aponteQr')}
          </div>
        </div>
      )}

      {st.status === 'connecting' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, justifyContent: 'center', padding: '22px 0', color: C.sub, fontSize: 13 }}>
          <MaterialIcon name="sync" size={20} color={C.purple} /> {t('wa.conectandoReticencias')}
        </div>
      )}

      {/* Consentimento LGPD + botão conectar */}
      {showConsent && (
        <>
          <div style={{ background: C.panel, border: '1px solid ' + C.lineSoft, borderRadius: 13, padding: '13px 15px', margin: '14px 0', fontSize: 12.5, color: C.sub, lineHeight: 1.5 }}>
            <b style={{ color: C.ink }}>{t('wa.avisoPrivacidade')}</b> {t('wa.avisoTexto1')}
            <b> {t('wa.enviarReceber')}</b> {t('wa.avisoTexto2')} <b>{t('wa.apagarTudo')}</b> {t('wa.avisoTexto3')}
          </div>

          <label style={{ ...sx.label, display: 'block', marginBottom: 6 }}>{t('wa.retencao')}</label>
          <select
            value={retention}
            onChange={(e) => setRetention(Number(e.target.value))}
            style={{ ...sx.input, margin: '0 0 14px', cursor: 'pointer' }}
          >
            {RETENTION_OPTIONS.map((o) => (
              <option key={o.v} value={o.v}>{t(o.label)}</option>
            ))}
          </select>

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, cursor: 'pointer', marginBottom: 16, fontSize: 12.5, color: C.sub }}>
            <input type="checkbox" checked={consented} onChange={(e) => setConsented(e.target.checked)} style={{ marginTop: 2 }} />
            <span>{t('wa.concordo')}</span>
          </label>

          <RingButton
            radius={11}
            block
            onClick={handleConnect}
            disabled={!consented || busy || !podeAdministrar}
            style={{ ...sx.btnPrimary, justifyContent: 'center', opacity: !consented || busy || !podeAdministrar ? 0.55 : 1, cursor: !consented || busy || !podeAdministrar ? 'not-allowed' : 'pointer' }}
          >
            <MaterialIcon name="qr_code_2" size={18} /> {t(busy ? 'wa.gerandoQr' : 'wa.gerarQr')}
          </RingButton>
        </>
      )}

      {/* Conectado */}
      {connected && (
        <div style={{ margin: '14px 0 2px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ background: C.panel, border: '1px solid ' + C.lineSoft, borderRadius: 13, padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: C.ink, fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
              <MaterialIcon name="history" size={17} color={C.purple} /> {t('wa.historicoAntigo')}
            </div>
            <div style={{ color: C.sub, fontSize: 12.3, lineHeight: 1.45 }}>
              {t('wa.historicoTexto1')} <b>{t('wa.porConversa')}</b>{t('wa.abraContato')} <b>{t('wa.recuperarHistoricoAspas')}</b> {t('wa.historicoTexto2')}
            </div>
          </div>
          {podeAdministrar && (
            <>
              <button
                onClick={() => handleDisconnect(false)}
                disabled={busy}
                style={{ ...sx.btnGhost, width: '100%', justifyContent: 'center', opacity: busy ? 0.6 : 1 }}
              >
                <MaterialIcon name="link_off" size={18} /> {t('wa.desconectar')}
              </button>
              <button
                onClick={() => handleDisconnect(true)}
                disabled={busy}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, background: 'rgba(193,77,119,0.1)', border: '1px solid rgba(193,77,119,0.3)', borderRadius: 11, padding: '9px 14px', color: C.rose, fontSize: 13, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1 }}
              >
                <MaterialIcon name="delete_forever" size={18} /> {t('wa.desconectarApagar')}
              </button>
            </>
          )}
        </div>
      )}

      {err && <div style={{ marginTop: 12, fontSize: 12.5, color: C.rose }}>{err}</div>}
    </Modal>
  )
}

function StatusLine({ st, phone }: { st: string; phone: string | null }) {
  const map: Record<string, { label: string; color: string; icon: string }> = {
    disconnected: { label: t('wa.desconectado'), color: C.muted, icon: 'radio_button_unchecked' },
    qr: { label: t('wa.aguardandoQr'), color: C.amber, icon: 'qr_code_2' },
    connecting: { label: t('wa.conectando'), color: C.purple, icon: 'sync' },
    connected: { label: phone ? t('wa.conectadoCom', { numero: phone }) : t('wa.conectado'), color: C.green, icon: 'check_circle' },
    loggedOut: { label: t('wa.desvinculado'), color: C.rose, icon: 'error' },
  }
  const s = map[st] ?? map.disconnected
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: s.color, fontWeight: 600, marginTop: 2 }}>
      <MaterialIcon name={s.icon} size={16} color={s.color} /> {s.label}
    </div>
  )
}
