import { useState } from 'react'
import SuperShell from './SuperShell'
import { t, type Chave } from '../../i18n'
import { useAssistantStatus, useAssistantOutbox } from '../../hooks/useAssistantSession'
import { useDaemonOnline } from '../../hooks/useDaemonOnline'
import { connectAssistant, disconnectAssistant, giveAssistantConsent } from '../../lib/whatsapp'
import MaterialIcon from '../../components/common/MaterialIcon'
import { FONT_DISPLAY } from '../../styles/sx'

const ROTULO: Record<string, Chave> = {
  disconnected: 'wa.desconectado',
  qr: 'wa.aguardandoQr',
  connecting: 'wa.conectandoReticencias',
  connected: 'wa.conectado',
  loggedOut: 'super.sessaoEncerrada',
}

const COR: Record<string, string> = {
  connected: '#5fc98a',
  qr: '#d8a960',
  connecting: '#d8a960',
  disconnected: '#c98aab',
  loggedOut: '#c98aab',
}

/**
 * O número da Assistente — a tela onde ele é pareado.
 *
 * Fica no SUPER TITAN, e não nas configurações de um cliente, porque o número é UM só para
 * toda a plataforma: é dele que sai o resumo diário de todos os ambientes. Por isso também
 * o aviso antes de desconectar — o botão derruba o resumo de todo mundo de uma vez.
 */
export default function AssistantSession() {
  const st = useAssistantStatus()
  const envios = useAssistantOutbox()
  const daemonOn = useDaemonOnline()
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function conectar() {
    setOcupado(true)
    setErro(null)
    try {
      // O consentimento é pré-requisito do `session.connect` no daemon. Aqui ele é
      // formalidade — a Assistente não espelha conversa de ninguém —, mas o caminho é o
      // mesmo de qualquer sessão, e desviar dele seria criar um segundo caminho para testar.
      await giveAssistantConsent()
      await connectAssistant()
    } catch (e) {
      setErro(e instanceof Error ? e.message : t('super.falhaConectarAssistente'))
    } finally {
      setOcupado(false)
    }
  }

  async function desconectar() {
    if (!window.confirm(t('super.confirmarDesconectarAssistente'))) return
    setOcupado(true)
    setErro(null)
    try {
      await disconnectAssistant()
    } catch (e) {
      setErro(e instanceof Error ? e.message : t('wa.falhaDesconectar'))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <SuperShell title={t('assistente.titulo')} back>
      <div className="flex items-center gap-3 mb-4">
        <h1 style={{ fontFamily: FONT_DISPLAY }} className="text-[31px] font-normal text-[#f3eef6]">{t('super.numeroAssistente')}</h1>
        <div className="flex-1" />
        <span className="flex items-center gap-2 text-[12.5px] font-semibold" style={{ color: COR[st.status] ?? '#c98aab' }}>
          <span className="w-2 h-2 rounded-full" style={{ background: COR[st.status] ?? '#c98aab' }} />
          {ROTULO[st.status] ? t(ROTULO[st.status]) : st.status}
        </span>
      </div>

      <div className="flex items-start gap-2 rounded-xl px-4 py-3 mb-6 bg-[rgba(150,110,200,0.10)] border border-[rgba(150,110,200,0.22)] text-[12.5px] text-[#c3aad6]">
        <MaterialIcon name="smartphone" size={17} color="#c9a6e0" />
        <span>
          {t('super.chipAviso1')} <b>{t('super.chipSoAssistente')}</b> {t('super.chipAviso2')}
        </span>
      </div>

      {!daemonOn && (
        <div className="rounded-xl px-4 py-3 mb-6 bg-[rgba(201,138,171,0.12)] border border-[rgba(201,138,171,0.3)] text-[12.5px] text-[#e3b9cc]">
          {t('super.daemonForaDoAr')}
        </div>
      )}

      {erro && (
        <div className="rounded-xl px-4 py-3 mb-6 bg-[rgba(201,138,171,0.12)] border border-[rgba(201,138,171,0.3)] text-[12.5px] text-[#e3b9cc]">{erro}</div>
      )}

      <div className="grid lg:grid-cols-2 gap-4 mb-8">
        <div className="rounded-2xl p-6 border border-[rgba(176,148,210,0.12)] bg-[rgba(255,255,255,0.03)]">
          {st.qr ? (
            <>
              <div className="text-[13px] text-[#c3aad6] mb-3">
                {t('super.abraWhatsappChip')} <b>{t('wa.aparelhosConectados')}</b> → <b>{t('wa.conectarAparelho')}</b>.
              </div>
              <img src={st.qr} alt={t('super.qrAlt')} className="w-full max-w-[280px] rounded-xl bg-white p-2" />
            </>
          ) : (
            <div className="text-[13px] text-[#8a7d97] py-6">
              {st.status === 'connected'
                ? (st.phoneNumber ? t('super.numeroPareadoCom', { numero: st.phoneNumber }) : t('super.numeroPareadoSimples'))
                : t('super.semQr')}
            </div>
          )}

          {st.lastError && (
            <div className="mt-4 text-[12px] text-[#c98aab]">{t('campanhas.ultimoErro')} {st.lastError}</div>
          )}

          <div className="flex gap-2 mt-5">
            <button
              onClick={conectar}
              disabled={ocupado || st.status === 'connected'}
              className="h-10 px-4 rounded-xl text-[13px] font-semibold text-[#f4eefa] disabled:opacity-40"
              style={{ background: 'linear-gradient(140deg,#7a52a0,#553578)' }}
            >
              {t(ocupado ? 'super.aguarde' : 'super.conectarNumero')}
            </button>
            <button
              onClick={desconectar}
              disabled={ocupado || st.status === 'disconnected'}
              className="h-10 px-4 rounded-xl text-[13px] font-semibold bg-[rgba(255,255,255,0.04)] border border-[rgba(176,148,210,0.14)] text-[#b9aec6] disabled:opacity-40"
            >
              {t('wa.desconectar')}
            </button>
          </div>
        </div>

        <div className="rounded-2xl p-6 border border-[rgba(176,148,210,0.12)] bg-[rgba(255,255,255,0.03)]">
          <div className="text-[13px] font-semibold text-[#e8e2ee] mb-3">{t('super.ultimasSaidas')}</div>
          {envios.length === 0 && <div className="text-[12.5px] text-[#8a7d97]">{t('super.nadaEnviado')}</div>}
          <div className="flex flex-col gap-2">
            {envios.map((e) => (
              <div key={e.id} className="flex items-center gap-3 text-[12px]">
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: e.status === 'sent' ? '#5fc98a' : e.status === 'failed' ? '#c98aab' : '#d8a960' }}
                />
                {/* Só o id do ambiente: o conteúdo do resumo é dado do cliente, e o dono do
                    sistema não entra no ambiente dele nem por aqui. */}
                <span className="text-[#b9aec6] truncate flex-1">{e.tenantUid}</span>
                <span className="text-[#7d7388]">{e.kind}</span>
                <span className="text-[#7d7388]">{e.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </SuperShell>
  )
}
