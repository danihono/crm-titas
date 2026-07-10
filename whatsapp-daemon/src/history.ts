import { proto, type BaileysEventMap, type WAMessage } from '@whiskeysockets/baileys'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from './firebase.js'
import { logger } from './logger.js'
import { config } from './config.js'
import {
  ingestHistoryMessages,
  oldestStoredAnchor,
  type MediaDownloadContext,
} from './messages.js'
import { requestMessageHistory } from './sessionManager.js'

const ON_DEMAND = proto.HistorySync.HistorySyncType.ON_DEMAND

type HistorySetEvent = BaileysEventMap['messaging-history.set']

interface InFlight {
  contactId: string
  /** JID da conversa âncora (id de conversa estável usado como chave do Map). */
  chatJid: string
  /** id da sessão de peer-data devolvido pelo último fetchMessageHistory (correlação exata). */
  sessionId: string | null
  /** páginas restantes antes do teto de segurança. */
  pagesLeft: number
  /** timestamp (ms) da mensagem mais antiga já puxada — próxima página busca mais velhas. */
  oldestTsMs: number
  /** total de mensagens deste chat vistas nas respostas on-demand. */
  imported: number
}

/** Importações em andamento, chave `${uid}:${chatJid}`. Efêmero (daemon é instância única). */
const inFlight = new Map<string, InFlight>()

function mapKeyOf(uid: string, chatJid: string): string {
  return `${uid}:${chatJid}`
}

function errCode(err: unknown): string {
  return err instanceof Error ? err.message : 'history_failed'
}

/** messageTimestamp da WA vem em SEGUNDOS (number ou Long). Retorna ms. */
function tsMsOf(m: WAMessage): number {
  const t = m.messageTimestamp as unknown
  let seconds = 0
  if (typeof t === 'number') seconds = t
  else if (t && typeof (t as { toNumber?: () => number }).toNumber === 'function') seconds = (t as { toNumber: () => number }).toNumber()
  else {
    const n = Number(t)
    seconds = Number.isFinite(n) ? n : 0
  }
  return seconds * 1000
}

function matchesChat(m: WAMessage, chatJid: string): boolean {
  const key = m.key ?? {}
  return key.remoteJid === chatJid || (key as { remoteJidAlt?: string }).remoteJidAlt === chatJid
}

async function setStatus(
  uid: string,
  contactId: string,
  patch: { status: 'loading' | 'done' | 'error'; imported: number; error?: string },
): Promise<void> {
  await db
    .collection('users')
    .doc(uid)
    .collection('contacts')
    .doc(contactId)
    .set(
      {
        historyImport: {
          status: patch.status,
          imported: patch.imported,
          at: FieldValue.serverTimestamp(),
          error: patch.error ?? FieldValue.delete(),
        },
      },
      { merge: true },
    )
}

/**
 * Inicia a recuperação de histórico on-demand de um contato: ancora na mensagem mais
 * antiga já espelhada e pede as anteriores ao WhatsApp. As respostas chegam assíncronas
 * em `onHistorySet`, que auto-pagina até esgotar/atingir o teto.
 * Lança `no_anchor` (sem mensagem para ancorar) ou `whatsapp_not_connected`.
 */
export async function startHistoryImport(uid: string, contactId: string): Promise<void> {
  const anchor = await oldestStoredAnchor(uid, contactId)
  if (!anchor) throw new Error('no_anchor')

  const chatJid = anchor.key.remoteJid!
  const mapKey = mapKeyOf(uid, chatJid)
  if (inFlight.has(mapKey)) return // já em andamento — idempotente

  const state: InFlight = {
    contactId,
    chatJid,
    sessionId: null,
    pagesLeft: config.historyMaxPages,
    oldestTsMs: anchor.tsMs,
    imported: 0,
  }
  inFlight.set(mapKey, state)

  try {
    state.sessionId = await requestMessageHistory(uid, config.historyPageSize, anchor.key, anchor.tsMs)
  } catch (err) {
    inFlight.delete(mapKey) // ex.: whatsapp_not_connected — não deixa status 'loading' órfão
    throw err
  }

  await setStatus(uid, contactId, { status: 'loading', imported: 0 })
  logger.info({ uid, contactId, chatJid }, 'importação de histórico iniciada')
}

/** Localiza o import correspondente à resposta: por sessionId (exato) → senão por chatJid. */
function findInFlight(uid: string, ev: HistorySetEvent, messages: WAMessage[]): { state: InFlight; viaSession: boolean } | null {
  const prefix = `${uid}:`
  const sessionId = ev.peerDataRequestSessionId
  if (sessionId) {
    for (const [key, state] of inFlight) {
      if (key.startsWith(prefix) && state.sessionId === sessionId) return { state, viaSession: true }
    }
  }
  for (const [key, state] of inFlight) {
    if (!key.startsWith(prefix)) continue
    if (messages.some((m) => matchesChat(m, state.chatJid))) return { state, viaSession: false }
  }
  return null
}

/**
 * Handler de `messaging-history.set`. Só age sobre respostas ON_DEMAND (recuperação
 * explícita pedida pelo usuário) — ignora qualquer sync automático, preservando a
 * garantia "forward-only por padrão". Ingere o lote e auto-pagina para trás.
 */
export async function onHistorySet(uid: string, ev: HistorySetEvent, mediaCtx?: MediaDownloadContext): Promise<void> {
  if (ev.syncType !== ON_DEMAND) return

  const messages = (ev.messages ?? []) as WAMessage[]
  if (messages.length) await ingestHistoryMessages(uid, messages, mediaCtx)

  const found = findInFlight(uid, ev, messages)
  if (!found) return
  const { state, viaSession } = found
  const mapKey = mapKeyOf(uid, state.chatJid)

  // Respostas on-demand são por-requisição: casadas por sessionId, todo o lote é desta
  // conversa; no fallback por chatJid, filtramos.
  const chatMsgs = viaSession ? messages : messages.filter((m) => matchesChat(m, state.chatJid))
  const batchOldest = chatMsgs.length ? Math.min(...chatMsgs.map(tsMsOf)) : null
  const gotOlder = batchOldest != null && batchOldest < state.oldestTsMs

  state.imported += chatMsgs.length
  state.pagesLeft -= 1

  const complete = ev.progress === 100 || ev.isLatest === true || !gotOlder || state.pagesLeft <= 0

  if (complete) {
    inFlight.delete(mapKey)
    await setStatus(uid, state.contactId, { status: 'done', imported: state.imported })
    logger.info(
      { uid, contactId: state.contactId, imported: state.imported, progress: ev.progress, isLatest: ev.isLatest },
      'importação de histórico concluída',
    )
    return
  }

  // Pagina de novo a partir da nova mensagem mais antiga.
  state.oldestTsMs = batchOldest!
  const anchorMsg = chatMsgs.reduce((a, b) => (tsMsOf(b) < tsMsOf(a) ? b : a))
  try {
    state.sessionId = await requestMessageHistory(uid, config.historyPageSize, anchorMsg.key, state.oldestTsMs)
    await setStatus(uid, state.contactId, { status: 'loading', imported: state.imported })
  } catch (err) {
    inFlight.delete(mapKey)
    await setStatus(uid, state.contactId, { status: 'error', imported: state.imported, error: errCode(err) })
    logger.error({ err, uid, contactId: state.contactId }, 'falha ao paginar histórico')
  }
}
