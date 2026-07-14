import { auth } from './firebase'

// URL base do daemon de WhatsApp (Cloud Run). Configurável por env; vazio = não configurado.
const DAEMON_URL = (import.meta.env.VITE_WHATSAPP_DAEMON_URL || '').replace(/\/$/, '')

export function daemonConfigured(): boolean {
  return !!DAEMON_URL
}

/** Teto (ms) para uma chamada ao daemon — evita ficar preso num spinner se o HTTP não responder. */
const DAEMON_TIMEOUT_MS = 20_000

/** Chama um endpoint autenticado do daemon com o Firebase ID token do usuário. */
async function daemonFetch(path: string, body?: unknown): Promise<Record<string, unknown>> {
  if (!DAEMON_URL) {
    throw new Error('Serviço de WhatsApp não configurado (defina VITE_WHATSAPP_DAEMON_URL).')
  }
  const user = auth.currentUser
  if (!user) throw new Error('Sem usuário autenticado.')
  const token = await user.getIdToken()

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DAEMON_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(`${DAEMON_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error('O serviço de WhatsApp demorou a responder. Tente novamente.')
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
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

/**
 * Dispara a recuperação do histórico antigo de um contato (on-demand, auto-paginado).
 * `maxDays` limita a janela (só os últimos N dias); omitido = máximo que der.
 * Retorna assim que o pedido é aceito — as mensagens chegam de forma assíncrona e
 * aparecem ao vivo pela conversa; o progresso é acompanhado por contact.historyImport.
 */
export function fetchWhatsappHistory(contactId: string, maxDays?: number): Promise<Record<string, unknown>> {
  return daemonFetch('/history/fetch', { contactId, ...(maxDays ? { maxDays } : {}) })
}

/** Puxa (ou re-puxa) a foto de perfil do WhatsApp do contato para o CRM. */
export function refreshWhatsappPhoto(contactId: string): Promise<Record<string, unknown>> {
  return daemonFetch('/contact/photo/refresh', { contactId })
}

/**
 * Expurgo TOTAL de um contato via daemon (Firestore recursivo + Storage por prefixo +
 * marcador anti-replay). `keepContact=true` limpa só a conversa, mantendo o cadastro.
 */
export function purgeWhatsappContact(contactId: string, keepContact = false): Promise<Record<string, unknown>> {
  return daemonFetch('/contact/purge', { contactId, keepContact })
}
