import { auth } from './firebase'

// URL base do daemon de WhatsApp (Cloud Run). Configurável por env; vazio = não configurado.
const DAEMON_URL = (import.meta.env.VITE_WHATSAPP_DAEMON_URL || '').replace(/\/$/, '')

export function daemonConfigured(): boolean {
  return !!DAEMON_URL
}

/** Chama um endpoint autenticado do daemon com o Firebase ID token do usuário. */
async function daemonFetch(path: string, body?: unknown): Promise<Record<string, unknown>> {
  if (!DAEMON_URL) {
    throw new Error('Serviço de WhatsApp não configurado (defina VITE_WHATSAPP_DAEMON_URL).')
  }
  const user = auth.currentUser
  if (!user) throw new Error('Sem usuário autenticado.')
  const token = await user.getIdToken()

  const res = await fetch(`${DAEMON_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    throw new Error((data.error as string) || `Falha na chamada ao daemon (${res.status})`)
  }
  return data
}

/** Registra o consentimento LGPD + retenção (obrigatório antes de conectar). */
export function giveConsent(retentionDays = 0): Promise<Record<string, unknown>> {
  return daemonFetch('/session/consent', { retentionDays })
}

/** Inicia (ou retoma) a sessão de WhatsApp do usuário. */
export function connectWhatsapp(): Promise<Record<string, unknown>> {
  return daemonFetch('/session/connect')
}

/** Desconecta; com purge=true, expurga todos os dados espelhados (LGPD). */
export function disconnectWhatsapp(purge = false): Promise<Record<string, unknown>> {
  return daemonFetch(`/session/disconnect${purge ? '?purge=1' : ''}`, { purge })
}

/** Envia uma mensagem real pelo WhatsApp conectado ao daemon. */
export function sendWhatsappMessage(contactId: string, text: string): Promise<Record<string, unknown>> {
  return daemonFetch('/message/send', { contactId, text })
}
