import pLimit from 'p-limit'
import { downloadMediaMessage, type WAMessage } from '@whiskeysockets/baileys'
import { FieldValue, Timestamp, type QueryDocumentSnapshot, type DocumentData } from 'firebase-admin/firestore'
import { db } from './firebase.js'
import { config } from './config.js'
import { logger } from './logger.js'
import { storeMediaBuffer, isExpiredMediaError, type MediaDownloadContext } from './messages.js'
import { StorageWriteError } from './storage.js'
import { mediaContextFor } from './sessionManager.js'

/**
 * Recuperação de mídias que ficaram sem arquivo.
 *
 * Existe porque uma falha de mídia era perda DEFINITIVA: o `WAMessage` cru é descartado logo
 * após a ingestão, então não sobrava nada de onde tentar de novo — e recuperar pelo histórico
 * on-demand não funciona, porque ele só sabe pedir mensagens ANTERIORES à mais antiga já
 * espelhada, enquanto as mídias quebradas estão sempre numa janela recente.
 *
 * A partir do descritor `mediaRetry` gravado na falha (ver `mediaRetryDescriptor` em
 * messages.ts) dá para remontar o mínimo que o Baileys precisa e rebaixar o arquivo.
 * NUNCA loga conteúdo.
 */

/** Códigos de `mediaError` que uma nova tentativa pode resolver. Fora: `view_once_unsupported`. */
const RETRYABLE_MEDIA_ERRORS = ['download_failed', 'wa_media_expired', 'storage_denied', 'storage_failed']

/** Tentativas por mensagem antes de parar de insistir. */
const MAX_ATTEMPTS = 3

/** Rodadas em andamento, por `uid:contactId`. Efêmero — o daemon é instância única. */
const running = new Set<string>()

export interface MediaRetryStart {
  /** Mensagens elegíveis COM descritor — as que esta rodada vai tentar. */
  eligible: number
  /**
   * Mensagens quebradas SEM descritor: falharam antes deste recurso existir e não têm
   * `mediaKey` guardado. São irrecuperáveis — reportadas para a UI poder dizer isso.
   */
  legacy: number
}

interface RetryDescriptor {
  node: string
  mediaKey: Buffer
  directPath: string
  url: string
  mimetype?: string
  waRemoteJid: string
  waParticipant?: string
  attempts: number
}

/** O Firestore devolve bytes como Buffer, mas emulador/REST podem entregar Uint8Array. */
function toMediaKey(v: unknown): Buffer | null {
  if (Buffer.isBuffer(v)) return v
  if (v instanceof Uint8Array) return Buffer.from(v)
  return null
}

function readDescriptor(doc: QueryDocumentSnapshot<DocumentData>): RetryDescriptor | null {
  const raw = doc.get('mediaRetry')
  if (!raw || typeof raw !== 'object') return null
  const d = raw as Record<string, unknown>

  const mediaKey = toMediaKey(d.mediaKey)
  const node = typeof d.node === 'string' ? d.node : ''
  const directPath = typeof d.directPath === 'string' ? d.directPath : ''
  const url = typeof d.url === 'string' ? d.url : ''
  if (!mediaKey || !node || (!directPath && !url)) return null

  return {
    node,
    mediaKey,
    directPath,
    url,
    mimetype: typeof d.mimetype === 'string' ? d.mimetype : undefined,
    waRemoteJid: typeof d.waRemoteJid === 'string' ? d.waRemoteJid : '',
    waParticipant: typeof d.waParticipant === 'string' ? d.waParticipant : undefined,
    attempts: typeof d.attempts === 'number' ? d.attempts : 0,
  }
}

/**
 * Remonta o mínimo de WAMessage que o Baileys precisa.
 *
 * ATENÇÃO à chave `url`: `downloadMediaMessage` recusa o nó com "is not a media message"
 * quando `url` não EXISTE — string vazia passa, ausente não. E um nó com
 * `thumbnailDirectPath` sem `url` desvia para o caminho de miniatura. É a pegadinha que
 * quebra isto silenciosamente.
 */
function rebuildWaMessage(waMessageId: string, fromMe: boolean, d: RetryDescriptor): WAMessage {
  return {
    key: {
      remoteJid: d.waRemoteJid,
      id: waMessageId,
      fromMe,
      ...(d.waParticipant ? { participant: d.waParticipant } : {}),
    },
    message: {
      [d.node]: {
        mediaKey: d.mediaKey,
        ...(d.directPath ? { directPath: d.directPath } : {}),
        url: d.url,
        ...(d.mimetype ? { mimetype: d.mimetype } : {}),
      },
    },
  } as WAMessage
}

/** Progresso no doc do contato — mesmo desenho do `historyImport`, lido por onSnapshot. */
async function setStatus(
  uid: string,
  contactId: string,
  patch: { status: 'loading' | 'done' | 'error'; total: number; recovered: number; failed: number; error?: string },
): Promise<void> {
  await db
    .collection('users')
    .doc(uid)
    .collection('contacts')
    .doc(contactId)
    .set(
      {
        mediaRecovery: {
          status: patch.status,
          total: patch.total,
          recovered: patch.recovered,
          failed: patch.failed,
          at: FieldValue.serverTimestamp(),
          error: patch.error ?? FieldValue.delete(),
        },
      },
      { merge: true },
    )
}

/** Baixa (pedindo reenvio quando o blob expirou) e grava. Devolve o directPath renovado, se houve. */
async function recoverOne(
  uid: string,
  contactId: string,
  doc: QueryDocumentSnapshot<DocumentData>,
  d: RetryDescriptor,
  mediaCtx: MediaDownloadContext,
): Promise<void> {
  const waMessageId = (typeof doc.get('waMessageId') === 'string' && doc.get('waMessageId')) || doc.id
  const fromMe = !!doc.get('fromMe')
  const msg = rebuildWaMessage(waMessageId, fromMe, d)

  let buffer: Buffer
  let refreshedDirectPath: string | undefined
  try {
    buffer = await downloadMediaMessage(msg, 'buffer', {}, undefined)
  } catch (err) {
    if (!isExpiredMediaError(err)) throw err
    // Blob fora da CDN: só o aparelho de origem pode reenviá-lo. `updateMediaMessage` muta o
    // nó no lugar, então o directPath novo serve para a próxima tentativa se esta falhar.
    // Reenvio recusado/estourado propaga o erro ORIGINAL — a causa é a mídia expirada, e
    // trocá-la pelo timeout esconderia isso do usuário e do log.
    let refreshed: WAMessage
    try {
      refreshed = await mediaCtx.reuploadRequest(msg)
    } catch (reuploadErr) {
      logger.info({ err: reuploadErr, uid, contactId }, 'pedido de reenvio de mídia não foi atendido')
      throw err
    }
    const node = (refreshed.message as Record<string, { directPath?: string }> | undefined)?.[d.node]
    refreshedDirectPath = typeof node?.directPath === 'string' ? node.directPath : undefined
    buffer = await downloadMediaMessage(refreshed, 'buffer', {}, undefined)
  }

  const mediaType = d.node.replace('Message', '') as 'image' | 'video' | 'audio' | 'document' | 'sticker'
  try {
    const stored = await storeMediaBuffer(uid, contactId, waMessageId, buffer, {
      mediaType,
      mimeType: d.mimetype,
      fileName: typeof doc.get('fileName') === 'string' ? (doc.get('fileName') as string) : undefined,
    })
    await doc.ref.set(
      { pending: false, ...stored, mediaError: FieldValue.delete(), mediaRetry: FieldValue.delete() },
      { merge: true },
    )
  } catch (err) {
    // O download deu certo e a gravação não: preserva o directPath renovado para a próxima.
    if (refreshedDirectPath) {
      await doc.ref
        .set({ mediaRetry: { directPath: refreshedDirectPath, url: '' } }, { merge: true })
        .catch(() => {})
    }
    throw err
  }
}

/** Marca a tentativa que falhou, para a rodada seguinte não insistir para sempre. */
async function noteFailure(doc: QueryDocumentSnapshot<DocumentData>, attempts: number, code: string): Promise<void> {
  await doc.ref
    .set(
      { mediaError: code, mediaRetry: { attempts: attempts + 1, lastAttemptAt: Timestamp.now() } },
      { merge: true },
    )
    .catch(() => {})
}

/**
 * Enumera as mídias quebradas do contato e dispara a recuperação em segundo plano.
 *
 * Devolve na hora (a fila de comandos é serial por uid — segurar aqui travaria o envio de
 * mensagens do tenant). O andamento vai para `mediaRecovery` no doc do contato.
 */
export async function startMediaRetry(uid: string, contactId: string, max?: number): Promise<MediaRetryStart> {
  const runKey = `${uid}:${contactId}`
  if (running.has(runKey)) throw new Error('media_retry_running')

  const mediaCtx = mediaContextFor(uid) // lança whatsapp_not_connected
  const cap = max && max > 0 ? max : config.mediaRetryMaxDocs

  const snap = await db
    .collection('users')
    .doc(uid)
    .collection('contacts')
    .doc(contactId)
    .collection('messages')
    .where('mediaError', 'in', RETRYABLE_MEDIA_ERRORS)
    .limit(cap * 4) // folga para separar com/sem descritor sem precisar de outra query
    .get()

  const eligible: { doc: QueryDocumentSnapshot<DocumentData>; d: RetryDescriptor }[] = []
  let legacy = 0
  for (const doc of snap.docs) {
    const d = readDescriptor(doc)
    if (!d) {
      legacy += 1 // falhou antes de o descritor existir — sem mediaKey, não há o que tentar
      continue
    }
    if (d.attempts >= MAX_ATTEMPTS) continue
    if (eligible.length < cap) eligible.push({ doc, d })
  }

  if (!eligible.length) {
    await setStatus(uid, contactId, { status: 'done', total: 0, recovered: 0, failed: 0 })
    return { eligible: 0, legacy }
  }

  running.add(runKey)
  void runRecovery(uid, contactId, eligible, mediaCtx)
    .catch((err) => logger.error({ err, uid, contactId }, 'recuperação de mídia falhou'))
    .finally(() => running.delete(runKey))

  return { eligible: eligible.length, legacy }
}

async function runRecovery(
  uid: string,
  contactId: string,
  items: { doc: QueryDocumentSnapshot<DocumentData>; d: RetryDescriptor }[],
  mediaCtx: MediaDownloadContext,
): Promise<void> {
  const total = items.length
  let recovered = 0
  let failed = 0
  /** Código dominante da falha — é o que diz à UI se adianta tentar de novo. */
  let lastError: string | undefined

  await setStatus(uid, contactId, { status: 'loading', total, recovered: 0, failed: 0 })

  const limit = pLimit(Math.max(1, config.mediaRetryConcurrency))
  await Promise.all(
    items.map(({ doc, d }) =>
      limit(async () => {
        try {
          await recoverOne(uid, contactId, doc, d, mediaCtx)
          recovered += 1
        } catch (err) {
          failed += 1
          // Só o StorageWriteError fala pelo Storage. Classificar um erro do Baileys por
          // status HTTP rotularia um 403 da CDN do WhatsApp como falta de permissão — a
          // mesma confusão que este código existe para acabar.
          const code = err instanceof StorageWriteError
            ? err.code
            : isExpiredMediaError(err)
              ? 'wa_media_expired'
              : 'download_failed'
          lastError = code
          logger.warn({ err, uid, contactId, code }, 'não foi possível recuperar uma mídia') // sem conteúdo
          await noteFailure(doc, d.attempts, code)
        }
        if ((recovered + failed) % 5 === 0) {
          await setStatus(uid, contactId, { status: 'loading', total, recovered, failed }).catch(() => {})
        }
      }),
    ),
  )

  await setStatus(uid, contactId, {
    status: 'done',
    total,
    recovered,
    failed,
    ...(failed > 0 && lastError ? { error: lastError } : {}),
  })
  logger.info({ uid, contactId, total, recovered, failed }, 'recuperação de mídia concluída')
}
