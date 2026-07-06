import { useState } from 'react'
import Modal from './Modal'
import MaterialIcon from '../common/MaterialIcon'
import { sx, C } from '../../styles/sx'
import { useWhatsappStatus } from '../../hooks/useWhatsappStatus'
import { giveConsent, connectWhatsapp, disconnectWhatsapp } from '../../lib/whatsapp'

const RETENTION_OPTIONS = [
  { v: 0, label: 'Guardar para sempre' },
  { v: 30, label: 'Apagar após 30 dias' },
  { v: 90, label: 'Apagar após 90 dias' },
  { v: 180, label: 'Apagar após 180 dias' },
]

export default function WhatsappConnectModal({ onClose }: { onClose: () => void }) {
  const st = useWhatsappStatus()
  const [consented, setConsented] = useState(false)
  const [retention, setRetention] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handleConnect() {
    if (busy) return
    setBusy(true)
    setErr(null)
    try {
      await giveConsent(retention)
      await connectWhatsapp()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Falha ao conectar.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDisconnect(purge: boolean) {
    if (busy) return
    if (purge && !confirm('Isso vai DESCONECTAR e APAGAR todas as mensagens espelhadas do WhatsApp. Continuar?')) return
    setBusy(true)
    setErr(null)
    try {
      await disconnectWhatsapp(purge)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Falha ao desconectar.')
    } finally {
      setBusy(false)
    }
  }

  const connected = st.status === 'connected'
  const showConsent = !connected && st.status !== 'qr' && st.status !== 'connecting'

  return (
    <Modal width={460} onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <MaterialIcon name="chat" size={22} color="#1f8a4c" style={{ background: 'rgba(52,199,89,0.14)', width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }} />
          <div style={{ ...sx.serif, fontSize: 22, fontWeight: 600, color: C.ink }}>Conectar WhatsApp</div>
        </div>
        <MaterialIcon name="close" size={22} color={C.muted} style={{ cursor: 'pointer' }} onClick={onClose} />
      </div>

      <StatusLine st={st.status} phone={st.phoneNumber} />

      {/* QR */}
      {st.status === 'qr' && st.qr && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, margin: '14px 0 4px' }}>
          <img src={st.qr} alt="QR do WhatsApp" width={240} height={240} style={{ borderRadius: 14, border: '1px solid ' + C.line }} />
          <div style={{ fontSize: 12.5, color: C.sub, textAlign: 'center', maxWidth: 320 }}>
            No celular: WhatsApp → <b>Aparelhos conectados</b> → <b>Conectar um aparelho</b> e aponte para o QR.
          </div>
        </div>
      )}

      {st.status === 'connecting' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, justifyContent: 'center', padding: '22px 0', color: C.sub, fontSize: 13 }}>
          <MaterialIcon name="sync" size={20} color={C.purple} /> Conectando…
        </div>
      )}

      {/* Consentimento LGPD + botão conectar */}
      {showConsent && (
        <>
          <div style={{ background: C.panel, border: '1px solid ' + C.lineSoft, borderRadius: 13, padding: '13px 15px', margin: '14px 0', fontSize: 12.5, color: C.sub, lineHeight: 1.5 }}>
            <b style={{ color: C.ink }}>Aviso de privacidade (LGPD).</b> Ao conectar, as mensagens que você
            <b> enviar e receber</b> — inclusive de terceiros — passam a ser espelhadas neste CRM. Você é
            responsável por informar seus contatos. É possível desconectar e <b>apagar tudo</b> a qualquer momento.
          </div>

          <label style={{ ...sx.label, display: 'block', marginBottom: 6 }}>Retenção das mensagens</label>
          <select
            value={retention}
            onChange={(e) => setRetention(Number(e.target.value))}
            style={{ ...sx.input, margin: '0 0 14px', cursor: 'pointer' }}
          >
            {RETENTION_OPTIONS.map((o) => (
              <option key={o.v} value={o.v}>{o.label}</option>
            ))}
          </select>

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, cursor: 'pointer', marginBottom: 16, fontSize: 12.5, color: C.sub }}>
            <input type="checkbox" checked={consented} onChange={(e) => setConsented(e.target.checked)} style={{ marginTop: 2 }} />
            <span>Li e concordo com o aviso acima e confirmo ter base legal para espelhar estas conversas.</span>
          </label>

          <button
            onClick={handleConnect}
            disabled={!consented || busy}
            style={{ ...sx.btnPrimary, width: '100%', justifyContent: 'center', opacity: !consented || busy ? 0.55 : 1, cursor: !consented || busy ? 'not-allowed' : 'pointer' }}
          >
            <MaterialIcon name="qr_code_2" size={18} /> {busy ? 'Gerando QR…' : 'Gerar QR e conectar'}
          </button>
        </>
      )}

      {/* Conectado */}
      {connected && (
        <div style={{ margin: '14px 0 2px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={() => handleDisconnect(false)}
            disabled={busy}
            style={{ ...sx.btnGhost, width: '100%', justifyContent: 'center', opacity: busy ? 0.6 : 1 }}
          >
            <MaterialIcon name="link_off" size={18} /> Desconectar
          </button>
          <button
            onClick={() => handleDisconnect(true)}
            disabled={busy}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, background: 'rgba(193,77,119,0.1)', border: '1px solid rgba(193,77,119,0.3)', borderRadius: 11, padding: '9px 14px', color: C.rose, fontSize: 13, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1 }}
          >
            <MaterialIcon name="delete_forever" size={18} /> Desconectar e apagar tudo
          </button>
        </div>
      )}

      {err && <div style={{ marginTop: 12, fontSize: 12.5, color: C.rose }}>{err}</div>}
    </Modal>
  )
}

function StatusLine({ st, phone }: { st: string; phone: string | null }) {
  const map: Record<string, { label: string; color: string; icon: string }> = {
    disconnected: { label: 'Desconectado', color: C.muted, icon: 'radio_button_unchecked' },
    qr: { label: 'Aguardando leitura do QR', color: C.amber, icon: 'qr_code_2' },
    connecting: { label: 'Conectando', color: C.purple, icon: 'sync' },
    connected: { label: phone ? `Conectado · +${phone}` : 'Conectado', color: C.green, icon: 'check_circle' },
    loggedOut: { label: 'Aparelho desvinculado — conecte de novo', color: C.rose, icon: 'error' },
  }
  const s = map[st] ?? map.disconnected
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: s.color, fontWeight: 600, marginTop: 2 }}>
      <MaterialIcon name={s.icon} size={16} color={s.color} /> {s.label}
    </div>
  )
}
