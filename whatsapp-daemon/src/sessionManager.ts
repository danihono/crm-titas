import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  jidNormalizedUser,
  type ConnectionState,
  type WAMessage,
  type WAMessageKey,
  type WASocket,
  type WAVersion,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import QRCode from 'qrcode'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from './firebase.js'
import { logger, waLogger } from './logger.js'
import { config } from './config.js'
import { useFirestoreAuthState } from './authState.js'
import { writeStatus } from './status.js'
import { ingestMessages } from './messages.js'
import { onHistorySet, type GapFillState } from './history.js'
import { touchMirrorWatermark, readMirrorWatermarkMs } from './watermark.js'

interface Session {
  sock: WASocket
  saveCreds: () => Promise<void>
  clearAuth: () => Promise<void>
  /** true quando o encerramento é intencional (SIGTERM / stopSession 'end') — não reconecta. */
  closing: boolean
  /** true depois do primeiro 'open' — só então o watermark pode avançar no fechamento. */
  wasOpen: boolean
  /**
   * Snapshot do watermark no início da sessão (objeto mutável compartilhado com o gap-fill).
   * `sinceMs: null` = sem gap-fill (nunca espelhou, ou a janela pós-conexão expirou).
   */
  gapFill: GapFillState
}

/** Registro em memória das conexões vivas. Efêmero — reconstruído no boot. */
const sessions = new Map<string, Session>()

/** Contador de tentativas de reconexão por uid (backoff). Resetado no 'open'. */
const backoff = new Map<string, number>()

export function sessionCount(): number {
  return sessions.size
}

export function hasSession(uid: string): boolean {
  return sessions.has(uid)
}

export function activeSessionUids(): string[] {
  return [...sessions.keys()]
}

export async function sendTextToPhone(uid: string, phoneDigits: string, text: string) {
  const s = sessions.get(uid)
  if (!s) throw new Error('whatsapp_not_connected')

  const fallbackJid = `${phoneDigits}@s.whatsapp.net`
  const matches = await s.sock.onWhatsApp(fallbackJid).catch(() => [])
  const match = matches?.[0]
  if (match && !match.exists) throw new Error('whatsapp_recipient_not_found')

  const jid = match?.jid || fallbackJid
  const sent = await s.sock.sendMessage(jid, { text })
  if (!sent?.key?.id) throw new Error('whatsapp_send_failed')
  return sent
}

/**
 * Pede ao WhatsApp mensagens mais antigas de uma conversa (recuperação de histórico
 * on-demand). A resposta chega assíncrona via evento `messaging-history.set`
 * (`syncType: ON_DEMAND`) → tratada em `onHistorySet`. Mantém o `Map sessions` privado.
 */
export async function requestMessageHistory(
  uid: string,
  count: number,
  oldestMsgKey: WAMessageKey,
  oldestMsgTimestampMs: number,
): Promise<string> {
  const s = sessions.get(uid)
  if (!s) throw new Error('whatsapp_not_connected')
  return s.sock.fetchMessageHistory(count, oldestMsgKey, oldestMsgTimestampMs)
}

/** Busca a URL da foto de perfil de um JID pela sessão do uid (para migrar foto do contato). */
export async function fetchProfilePhoto(uid: string, jid: string): Promise<string | undefined> {
  const s = sessions.get(uid)
  if (!s) throw new Error('whatsapp_not_connected')
  return s.sock.profilePictureUrl(jid, 'image')
}

/**
 * Cria (ou retoma) o socket Baileys para um uid. Idempotente: um socket vivo por uid.
 * Carrega o auth persistido — silencioso (sem QR) quando já existe sessão salva.
 */
export async function startSession(uid: string): Promise<void> {
  if (sessions.has(uid)) return // um socket por uid

  const { state, saveCreds, clearAuth } = await useFirestoreAuthState(db, uid)

  // Snapshot do watermark ANTES de abrir o socket: mensagens ao vivo pós-conexão avançam o
  // watermark persistido e esconderiam o buraco — o gap-fill filtra por este valor congelado.
  const gapFillSinceMs = await readMirrorWatermarkMs(uid)

  let version: WAVersion | undefined
  try {
    ;({ version } = await fetchLatestBaileysVersion())
  } catch (err) {
    logger.warn({ err, uid }, 'fetchLatestBaileysVersion falhou; usando versão embutida')
  }

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, waLogger),
    },
    logger: waLogger,
    browser: ['Titas CRM', 'Chrome', '1.0.0'],
    syncFullHistory: false, // RESTRIÇÃO DURA: só espelha dali pra frente
    // NÃO usar shouldSyncHistoryMessage:()=>false no v7 — desliga o sync inicial de LID
    // mappings e causa instabilidade/erros de sessão (aviso explícito do Baileys v7).
    markOnlineOnConnect: false, // espelho passivo: não mexe na presença do usuário
    generateHighQualityLinkPreview: false,
    getMessage: async () => undefined, // v7 exige a opção; no-op é ok num espelho passivo
    // printQRInTerminal OMITIDO de propósito (deprecado no v7) — QR vai pro Firestore.
  })

  const session: Session = {
    sock,
    saveCreds,
    clearAuth,
    closing: false,
    wasOpen: false,
    gapFill: { sinceMs: gapFillSinceMs },
  }
  sessions.set(uid, session)

  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', (u) => {
    onConnectionUpdate(uid, u).catch((err) =>
      logger.error({ err, uid }, 'handler connection.update falhou'),
    )
  })
  const mediaCtx = {
    reuploadRequest: async (msg: WAMessage) => sock.updateMediaMessage(msg),
    fetchProfilePhoto: (jid: string) => sock.profilePictureUrl(jid, 'image'),
  }
  sock.ev.on('messages.upsert', (ev) => {
    ingestMessages(uid, ev, mediaCtx).catch((err) =>
      logger.error({ err, uid }, 'handler messages.upsert falhou'),
    )
  })
  sock.ev.on('messaging-history.set', (ev) => {
    onHistorySet(uid, ev, mediaCtx, session.gapFill).catch((err) =>
      logger.error({ err, uid }, 'handler messaging-history.set falhou'),
    )
  })
}

async function onConnectionUpdate(uid: string, u: Partial<ConnectionState>): Promise<void> {
  const s = sessions.get(uid)
  if (!s) return
  const { connection, lastDisconnect, qr } = u

  // QR só ocorre na primeira conexão ou após logout. connection/lastDisconnect vêm vazios aqui.
  // Renderizamos o QR como data URL (PNG) aqui, no daemon, para o frontend só fazer <img src>.
  if (qr) {
    const qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 320 }).catch((err) => {
      logger.warn({ err, uid }, 'falha ao renderizar QR')
      return null
    })
    await writeStatus(db, uid, { status: 'qr', qr: qrDataUrl, lastError: null })
    return
  }

  if (connection === 'connecting') {
    await writeStatus(db, uid, { status: 'connecting' })
    return
  }

  if (connection === 'open') {
    backoff.delete(uid)
    s.wasOpen = true
    // Janela de gap-fill: o sync inicial chega logo após o vínculo. Expirada a janela,
    // qualquer messaging-history.set automático volta a ser ignorado (forward-only).
    if (s.gapFill.sinceMs != null) {
      const gapFill = s.gapFill
      setTimeout(() => {
        gapFill.sinceMs = null
      }, config.gapFillWindowMs).unref()
    }
    const phone = jidNormalizedUser(s.sock.user?.id ?? '').split('@')[0] || null
    await writeStatus(db, uid, {
      status: 'connected',
      qr: null,
      lastError: null,
      phoneNumber: phone,
      connectedAt: FieldValue.serverTimestamp(),
    })
    await db
      .collection('whatsappSessions')
      .doc(uid)
      .set({ desiredState: 'connected', phoneNumber: phone }, { merge: true })
    return
  }

  if (connection === 'close') {
    const code = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode
    const wasClosing = s.closing
    sessions.delete(uid)

    // O espelho estava vivo até agora → persiste o watermark que delimita um gap-fill futuro.
    // Só quando a conexão chegou a abrir: um close durante o pareamento (ex.: 515 pós-QR)
    // não espelhou nada, e gravar aqui esconderia o buraco antes do gap-fill rodar.
    if (s.wasOpen) await touchMirrorWatermark(uid, { force: true })

    if (code === DisconnectReason.loggedOut) {
      // 401: dispositivo desvinculado no celular. Sessão MORREU.
      // Limpa o auth, exige QR novo e NÃO reconecta (reconectar = loop infinito + risco de ban).
      backoff.delete(uid)
      await s.clearAuth()
      await db
        .collection('whatsappSessions')
        .doc(uid)
        .set({ desiredState: 'disconnected' }, { merge: true })
      await writeStatus(db, uid, { status: 'loggedOut', qr: null })
      return
    }

    if (wasClosing) return // encerramento intencional — não reconecta

    // Qualquer outro código (queda de rede, 515 restart-required, conflito) é recuperável.
    const attempt = (backoff.get(uid) ?? 0) + 1
    backoff.set(uid, attempt)
    const delay = Math.min(1000 * 2 ** attempt, 60_000) + Math.floor(Math.random() * 1000)
    await writeStatus(db, uid, { status: 'connecting', lastError: String(code ?? 'unknown') })
    setTimeout(() => {
      startSession(uid).catch((err) => logger.error({ err, uid }, 'reconexão falhou'))
    }, delay)
  }
}

/**
 * Encerra a sessão de um uid.
 * - 'end': fecha o WebSocket MANTENDO o dispositivo vinculado (deploy/shutdown).
 * - 'logout': DESVINCULA o dispositivo e limpa o auth (desconexão a pedido do usuário).
 */
export async function stopSession(uid: string, mode: 'end' | 'logout'): Promise<void> {
  const s = sessions.get(uid)

  if (!s) {
    // Sem socket vivo — ainda assim, em 'logout', limpe o auth persistido.
    if (mode === 'logout') {
      const { clearAuth } = await useFirestoreAuthState(db, uid)
      await clearAuth()
      await writeStatus(db, uid, { status: 'disconnected', qr: null })
    }
    return
  }

  s.closing = true
  backoff.delete(uid)
  sessions.delete(uid)

  // O handler de 'close' não roda mais para esta sessão (já saiu do Map) — grava o
  // watermark aqui: espelhava até este instante, e é ele que delimita o gap-fill futuro.
  if (s.wasOpen) await touchMirrorWatermark(uid, { force: true })

  if (mode === 'logout') {
    await s.sock.logout().catch(() => {})
    await s.clearAuth()
    await db
      .collection('whatsappSessions')
      .doc(uid)
      .set({ desiredState: 'disconnected' }, { merge: true })
    await writeStatus(db, uid, { status: 'disconnected', qr: null })
  } else {
    s.sock.end(undefined) // fecha WS, mantém o device
  }
}

/** SIGTERM: fecha todos os sockets SEM deslogar (mantém os devices vinculados). */
export function endAllSessions(): void {
  for (const [uid, s] of sessions) {
    s.closing = true
    // Best-effort: o shutdown dá ~2s de graça para os writes em voo concluírem.
    if (s.wasOpen) void touchMirrorWatermark(uid, { force: true })
    try {
      s.sock.end(undefined)
    } catch {
      /* ignore */
    }
  }
}
