import { proto, type BaileysEventMap, type WAMessage } from '@whiskeysockets/baileys'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from './firebase.js'
import { logger } from './logger.js'
import { config } from './config.js'
import {
  ingestGapMessages,
  ingestHistoryMessages,
  oldestStoredAnchor,
  refreshContactPreview,
  type MediaDownloadContext,
} from './messages.js'
import { requestMessageHistory } from './sessionManager.js'

const ON_DEMAND = proto.HistorySync.HistorySyncType.ON_DEMAND

type HistorySetEvent = BaileysEventMap['messaging-history.set']

/**
 * Estado mutável do gap-fill de uma sessão (compartilhado com o sessionManager).
 * `sinceMs` = watermark congelado no início da sessão: só mensagens MAIS NOVAS que ele
 * são ingeridas do sync inicial. `null` desliga o gap-fill (nunca espelhou / janela expirou).
 */
export interface GapFillState {
  sinceMs: number | null
}

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
  /** limite da janela pedida (ms epoch): não ingere nem pagina além dele. 0 = sem janela. */
  cutoffTsMs: number
  /** timer de expiração: se o WhatsApp não responder a tempo, marca 'error' e limpa o inFlight. */
  timer?: NodeJS.Timeout
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
 * (Re)arma o timer de expiração do import. Se a resposta ON_DEMAND não chega em
 * `config.historyResponseTimeoutMs`, marca o contato como 'error' e libera o inFlight —
 * evita o spinner eterno quando o WhatsApp simplesmente não responde ao pedido.
 */
function armTimeout(uid: string, state: InFlight): void {
  if (state.timer) clearTimeout(state.timer)
  const mapKey = mapKeyOf(uid, state.chatJid)
  state.timer = setTimeout(() => {
    // Só age se esta entrada ainda for a corrente (não foi substituída/concluída no meio-tempo).
    if (inFlight.get(mapKey) !== state) return
    inFlight.delete(mapKey)
    logger.warn({ uid, contactId: state.contactId, imported: state.imported }, 'histórico expirou sem resposta do WhatsApp')
    setStatus(uid, state.contactId, { status: 'error', imported: state.imported, error: 'history_timeout' }).catch((err) =>
      logger.error({ err, uid, contactId: state.contactId }, 'falha ao marcar timeout de histórico'),
    )
  }, config.historyResponseTimeoutMs)
  state.timer.unref()
}

/**
 * Inicia a recuperação de histórico on-demand de um contato: ancora na mensagem mais
 * antiga já espelhada e pede as anteriores ao WhatsApp. As respostas chegam assíncronas
 * em `onHistorySet`, que auto-pagina até esgotar/atingir o teto.
 * `maxDays` limita a janela (só mensagens dos últimos N dias); omitido = máximo que der.
 * Lança `no_anchor` (sem mensagem para ancorar) ou `whatsapp_not_connected`.
 */
export async function startHistoryImport(uid: string, contactId: string, maxDays?: number): Promise<void> {
  const anchor = await oldestStoredAnchor(uid, contactId)
  if (!anchor) throw new Error('no_anchor')

  const cutoffTsMs = maxDays && maxDays > 0 ? Date.now() - maxDays * 86_400_000 : 0

  // A mensagem mais antiga já espelhada é anterior à janela pedida → nada novo a buscar.
  if (cutoffTsMs > 0 && anchor.tsMs <= cutoffTsMs) {
    await setStatus(uid, contactId, { status: 'done', imported: 0 })
    logger.info({ uid, contactId, maxDays }, 'histórico já cobre a janela pedida — nada a buscar')
    return
  }

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
    cutoffTsMs,
  }
  inFlight.set(mapKey, state)

  try {
    state.sessionId = await requestMessageHistory(uid, config.historyPageSize, anchor.key, anchor.tsMs)
  } catch (err) {
    inFlight.delete(mapKey) // ex.: whatsapp_not_connected — não deixa status 'loading' órfão
    throw err
  }

  await setStatus(uid, contactId, { status: 'loading', imported: 0 })
  armTimeout(uid, state)
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
 * Gap-fill: aproveita o sync inicial que o WhatsApp envia sozinho após um vínculo novo
 * (QR novo) para preencher o buraco de mensagens do período desconectado. Só ingere
 * mensagens MAIS NOVAS que o watermark congelado no início da sessão — nunca histórico
 * anterior à vida do espelho (a restrição forward-only vale relativa ao espelho).
 * Semântica de mensagem viva (respeita purge markers, dedup idempotente por doc-id).
 */
async function gapFillFromInitialSync(
  uid: string,
  ev: HistorySetEvent,
  mediaCtx: MediaDownloadContext | undefined,
  gapFill: GapFillState | undefined,
): Promise<void> {
  if (!gapFill || gapFill.sinceMs == null) return
  const sinceMs = gapFill.sinceMs

  const messages = (ev.messages ?? []) as WAMessage[]
  const inGap = messages.filter((m) => tsMsOf(m) > sinceMs)
  if (!inGap.length) return

  // Ordem ascendente: o último ingest do lote deixa o preview na mensagem mais nova dele.
  inGap.sort((a, b) => tsMsOf(a) - tsMsOf(b))
  const touched = await ingestGapMessages(uid, inGap, mediaCtx)

  // Lotes do sync inicial podem chegar fora de ordem entre si → recomputa o preview
  // dos contatos afetados a partir da mensagem realmente mais recente gravada.
  for (const contactId of touched) {
    try {
      await refreshContactPreview(uid, contactId)
    } catch (err) {
      logger.warn({ err, uid, contactId }, 'gap-fill: falha ao recomputar preview do contato')
    }
  }

  logger.info(
    { uid, ingested: inGap.length, contacts: touched.size, syncType: ev.syncType },
    'gap-fill: mensagens do período desconectado importadas',
  )
}

/**
 * Handler de `messaging-history.set`.
 * - ON_DEMAND: recuperação explícita pedida pelo usuário — ingere o lote e auto-pagina.
 * - Demais syncTypes (sync inicial pós-vínculo): só o gap-fill filtrado por watermark;
 *   fora da janela de gap-fill continuam ignorados (garantia forward-only).
 */
export async function onHistorySet(
  uid: string,
  ev: HistorySetEvent,
  mediaCtx?: MediaDownloadContext,
  gapFill?: GapFillState,
): Promise<void> {
  if (ev.syncType !== ON_DEMAND) {
    await gapFillFromInitialSync(uid, ev, mediaCtx, gapFill)
    return
  }

  const messages = (ev.messages ?? []) as WAMessage[]

  // Casa o import ANTES de ingerir: com janela por dias, só ingerimos o que está dentro dela.
  const found = findInFlight(uid, ev, messages)
  if (!found) {
    // Sem import correspondente (ex.: expirou) — ingere mesmo assim, as mensagens já vieram.
    if (messages.length) await ingestHistoryMessages(uid, messages, mediaCtx)
    return
  }
  const { state, viaSession } = found
  const mapKey = mapKeyOf(uid, state.chatJid)

  // Chegou resposta → desarma o timer de expiração (re-armado abaixo se houver nova página).
  if (state.timer) clearTimeout(state.timer)

  // Respostas on-demand são por-requisição: casadas por sessionId, todo o lote é desta
  // conversa; no fallback por chatJid, filtramos.
  const chatMsgs = viaSession ? messages : messages.filter((m) => matchesChat(m, state.chatJid))
  const batchOldest = chatMsgs.length ? Math.min(...chatMsgs.map(tsMsOf)) : null
  const gotOlder = batchOldest != null && batchOldest < state.oldestTsMs

  // Janela por dias: descarta o que veio além do corte (o lote pode atravessar a borda).
  const toIngest = state.cutoffTsMs > 0 ? messages.filter((m) => tsMsOf(m) >= state.cutoffTsMs) : messages
  if (toIngest.length) await ingestHistoryMessages(uid, toIngest, mediaCtx)

  const ingestedChatMsgs = state.cutoffTsMs > 0 ? chatMsgs.filter((m) => tsMsOf(m) >= state.cutoffTsMs) : chatMsgs
  state.imported += ingestedChatMsgs.length
  state.pagesLeft -= 1

  // Parou de vir mensagem mais antiga, atingiu o teto, ou o lote já cruzou a borda da janela.
  const reachedCutoff = state.cutoffTsMs > 0 && batchOldest != null && batchOldest <= state.cutoffTsMs
  const complete = ev.progress === 100 || ev.isLatest === true || !gotOlder || state.pagesLeft <= 0 || reachedCutoff

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
    armTimeout(uid, state) // re-arma: aguarda a próxima página não travar
  } catch (err) {
    inFlight.delete(mapKey)
    await setStatus(uid, state.contactId, { status: 'error', imported: state.imported, error: errCode(err) })
    logger.error({ err, uid, contactId: state.contactId }, 'falha ao paginar histórico')
  }
}
