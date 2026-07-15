import {
  downloadMediaMessage,
  isJidGroup,
  isJidBroadcast,
  isJidNewsletter,
  jidNormalizedUser,
  type WAMessage,
  type WAMessageKey,
  type proto,
} from '@whiskeysockets/baileys'
import { randomUUID } from 'node:crypto'
import { getDownloadURL } from 'firebase-admin/storage'
import {
  FieldValue,
  Timestamp,
  type CollectionReference,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore'
import { bucket, db } from './firebase.js'
import { logger, waLogger } from './logger.js'
import { fetchAndStoreContactPhoto, type ProfilePhotoFetcher } from './photo.js'
import { isPurgedAt } from './purgeMarkers.js'
import { touchMirrorWatermark } from './watermark.js'

export type MessagesUpsert = {
  messages: WAMessage[]
  type: 'notify' | 'append'
}

type MediaType = 'image' | 'video' | 'audio' | 'document' | 'sticker'

export type MediaDownloadContext = {
  reuploadRequest: (msg: WAMessage) => Promise<WAMessage>
  /** Busca a URL da foto de perfil de um JID — usada para migrar a foto do contato. */
  fetchProfilePhoto?: ProfilePhotoFetcher
}

type MediaMessageKey = 'imageMessage' | 'videoMessage' | 'audioMessage' | 'documentMessage' | 'stickerMessage'

const MEDIA_META: Record<MediaMessageKey, { mediaType: MediaType; label: string; fallbackExt: string }> = {
  imageMessage: { mediaType: 'image', label: '[imagem]', fallbackExt: 'jpg' },
  videoMessage: { mediaType: 'video', label: '[vídeo]', fallbackExt: 'mp4' },
  audioMessage: { mediaType: 'audio', label: '[áudio]', fallbackExt: 'ogg' },
  documentMessage: { mediaType: 'document', label: '[documento]', fallbackExt: 'bin' },
  stickerMessage: { mediaType: 'sticker', label: '[figurinha]', fallbackExt: 'webp' },
}

const STUB_LABELS: Record<string, string> = {
  contactMessage: '[contato]',
  contactsArrayMessage: '[contatos]',
  locationMessage: '[localização]',
  liveLocationMessage: '[localização]',
  productMessage: '[produto]',
}

/** Iniciais a partir do nome — espelha src/lib/format.ts initialsOf. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase()
}

/** WA id -> doc-id seguro do Firestore (WA ids podem conter '/'). */
function sanitizeId(id: string): string {
  return id.replace(/[/\\]/g, '_')
}

function sanitizeFileName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120) || 'arquivo'
}

function extensionFromMime(mimeType: string | null | undefined, fallback: string): string {
  const clean = mimeType?.split(';')[0]?.trim().toLowerCase()
  if (!clean) return fallback
  if (clean === 'image/jpeg') return 'jpg'
  if (clean === 'audio/ogg' || clean === 'audio/opus') return 'ogg'
  if (clean === 'application/pdf') return 'pdf'
  const [, subtype] = clean.split('/')
  return sanitizeFileName(subtype || fallback).replace(/^x-/, '') || fallback
}

function numberFromLongish(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
  if (typeof v === 'string') {
    const n = Number(v)
    return Number.isFinite(n) ? n : undefined
  }
  if (v && typeof v === 'object' && 'toNumber' in v && typeof v.toNumber === 'function') {
    const n = v.toNumber()
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

/** Cache em memória: `${uid}:${phone}` -> contactId (evita lookups repetidos). */
const contactCache = new Map<string, string>()

/**
 * Remove do cache toda entrada deste uid apontando para o contato — usado pelo expurgo,
 * senão a próxima mensagem gravaria no doc apagado sem passar pelo resolveContact.
 */
export function evictContactCache(uid: string, contactId: string): void {
  const prefix = `${uid}:`
  for (const [key, id] of contactCache) {
    if (key.startsWith(prefix) && id === contactId) contactCache.delete(key)
  }
}

type ContactDoc = QueryDocumentSnapshot<DocumentData>

function phoneDigits(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '')
}

function isAutoWhatsappContact(doc: { get(fieldPath: string): unknown }): boolean {
  return doc.get('source') === 'whatsapp'
}

async function rememberContact(
  contactsCol: CollectionReference<DocumentData>,
  cacheKey: string,
  id: string,
  peer: Peer,
): Promise<string> {
  contactCache.set(cacheKey, id)
  await contactsCol.doc(id).set(
    {
      waJid: peer.jid,
      ...(peer.phone ? { whatsappDigits: peer.phone } : {}),
    },
    { merge: true },
  )
  return id
}

async function maybeRenameOwnNameAutoContact(
  contactsCol: CollectionReference<DocumentData>,
  id: string,
  peer: Peer,
  fromMe: boolean,
  pushName?: string | null,
): Promise<void> {
  const ownName = pushName?.trim()
  if (!fromMe || !peer.phone || !ownName) return

  const ref = contactsCol.doc(id)
  const snap = await ref.get()
  if (!snap.exists || !isAutoWhatsappContact(snap)) return

  const currentName = String(snap.get('name') ?? '').trim()
  if (currentName !== ownName) return

  const name = `+${peer.phone}`
  await ref.set({ name, initials: initialsOf(name) || '?' }, { merge: true })
}

async function moveAutoContactMessages(
  uid: string,
  contactsCol: CollectionReference<DocumentData>,
  autoId: string,
  manualId: string,
): Promise<void> {
  if (autoId === manualId) return

  const autoRef = contactsCol.doc(autoId)
  const autoSnap = await autoRef.get()
  if (!autoSnap.exists || !isAutoWhatsappContact(autoSnap)) return

  const manualRef = contactsCol.doc(manualId)
  const messages = await autoRef.collection('messages').get()
  let batch = db.batch()
  let ops = 0

  for (const msg of messages.docs) {
    batch.set(manualRef.collection('messages').doc(msg.id), msg.data(), { merge: true })
    batch.delete(msg.ref)
    ops += 2
    if (ops >= 450) {
      await batch.commit()
      batch = db.batch()
      ops = 0
    }
  }

  batch.delete(autoRef)
  await batch.commit()

  const autoCacheKey =
    autoId.startsWith('wa_') ? autoId.slice(3) : autoId.startsWith('lid_') ? `lid:${autoId.slice(4)}` : autoId
  contactCache.delete(`${uid}:${autoCacheKey}`)
  logger.info(
    { uid, fromContactId: autoId, toContactId: manualId, movedMessages: messages.size },
    'contato WhatsApp automatico unido ao contato manual',
  )
}

function firstManual(docs: ContactDoc[]): ContactDoc | null {
  return docs.find((doc) => !isAutoWhatsappContact(doc)) ?? null
}

async function queryContactField(
  contactsCol: CollectionReference<DocumentData>,
  field: string,
  value: string,
): Promise<{ manual: ContactDoc | null; fallback: ContactDoc | null }> {
  const snap = await contactsCol.where(field, '==', value).limit(10).get()
  return { manual: firstManual(snap.docs), fallback: snap.docs[0] ?? null }
}

async function findManualContactByNormalizedPhone(
  contactsCol: CollectionReference<DocumentData>,
  phone: string,
): Promise<ContactDoc | null> {
  const snap = await contactsCol.get()
  return (
    snap.docs.find((doc) => {
      if (isAutoWhatsappContact(doc)) return false
      return (
        phoneDigits(doc.get('whatsappDigits')) === phone ||
        phoneDigits(doc.get('whatsapp')) === phone ||
        phoneDigits(doc.get('phone')) === phone
      )
    }) ?? null
  )
}

async function useManualContact(
  uid: string,
  contactsCol: CollectionReference<DocumentData>,
  cacheKey: string,
  manual: ContactDoc,
  peer: Peer,
  autoId: string,
): Promise<string> {
  await moveAutoContactMessages(uid, contactsCol, autoId, manual.id)
  return rememberContact(contactsCol, cacheKey, manual.id, peer)
}

interface Peer {
  /** JID normalizado do interlocutor. */
  jid: string
  /** Só dígitos (ex.: '5511999998888'), ou null quando só temos o @lid. */
  phone: string | null
}

/**
 * Resolve o interlocutor a partir da key. Filtra grupos/broadcast/newsletter/status
 * (DM-only no v1). Atenção ao LID do v7: o número pode estar em `remoteJidAlt`,
 * não em `remoteJid`.
 */
function resolvePeer(key: WAMessageKey): Peer | null {
  const remote = key.remoteJid ?? ''
  if (!remote) return null
  if (isJidGroup(remote) || isJidBroadcast(remote) || isJidNewsletter(remote)) return null
  if (remote === 'status@broadcast') return null

  const remoteAlt = (key as { remoteJidAlt?: string }).remoteJidAlt
  const candidates = [remote, remoteAlt].filter(Boolean) as string[]
  const pnJid = candidates.find((j) => j.endsWith('@s.whatsapp.net'))
  const jid = jidNormalizedUser(pnJid ?? remote)
  const phone = pnJid ? jid.split('@')[0].replace(/\D/g, '') : null
  return { jid, phone }
}

interface Extracted {
  text: string
  pending: boolean
  media?: {
    mediaType: MediaType
    label: string
    caption?: string
    mimeType?: string
    fileName?: string
    sizeBytes?: number
    viewOnce: boolean
  }
  mediaError?: string
}

function unwrapContent(message: WAMessage['message']): { msg: proto.IMessage; viewOnce: boolean } | null {
  let msg: proto.IMessage | null | undefined = message
  let viewOnce = false

  msg = msg?.ephemeralMessage?.message ?? msg

  const viewOnceMessage =
    msg?.viewOnceMessageV2?.message ??
    msg?.viewOnceMessageV2Extension?.message ??
    msg?.viewOnceMessage?.message
  if (viewOnceMessage) {
    viewOnce = true
    msg = viewOnceMessage
  }

  msg = msg?.documentWithCaptionMessage?.message ?? msg
  return msg ? { msg, viewOnce } : null
}

function mediaNode(msg: proto.IMessage): { key: MediaMessageKey; node: Record<string, unknown> } | null {
  for (const key of Object.keys(MEDIA_META) as MediaMessageKey[]) {
    const node = msg[key]
    if (node) return { key, node: node as Record<string, unknown> }
  }
  return null
}

/** Desembrulha ephemeral/viewOnce e extrai texto, placeholder ou metadados de mídia. */
function extractContent(message: WAMessage['message']): Extracted | null {
  const unwrapped = unwrapContent(message)
  if (!unwrapped) return null
  const { msg, viewOnce } = unwrapped

  // Eventos de controle não são conteúdo de conversa.
  if (msg.protocolMessage || msg.reactionMessage || msg.pollUpdateMessage) return null

  if (msg.conversation) return { text: msg.conversation, pending: false }
  if (msg.extendedTextMessage?.text) return { text: msg.extendedTextMessage.text, pending: false }

  const media = mediaNode(msg)
  if (media) {
    const meta = MEDIA_META[media.key]
    const caption = typeof media.node.caption === 'string' ? media.node.caption : undefined
    const fileName = typeof media.node.fileName === 'string' ? media.node.fileName : undefined
    const mimeType = typeof media.node.mimetype === 'string' ? media.node.mimetype : undefined
    const sizeBytes = numberFromLongish(media.node.fileLength)
    return {
      text: caption || meta.label,
      pending: viewOnce,
      media: {
        mediaType: meta.mediaType,
        label: meta.label,
        caption,
        mimeType,
        fileName,
        sizeBytes,
        viewOnce,
      },
      ...(viewOnce ? { mediaError: 'view_once_unsupported' } : {}),
    }
  }

  for (const key of Object.keys(STUB_LABELS)) {
    const node = (msg as Record<string, unknown>)[key]
    if (node) {
      return { text: STUB_LABELS[key], pending: true }
    }
  }
  return null
}

/**
 * Resolve (ou auto-cria) o contato do interlocutor sob users/{uid}/contacts.
 * - match por whatsapp==phone em contato existente (cadastrado à mão);
 * - senão auto-cria com id determinístico `wa_<phone>` (idempotente/race-free),
 *   marcado com source:'whatsapp' para expurgo LGPD fácil.
 */
async function resolveContact(
  uid: string,
  peer: Peer,
  pushName?: string | null,
  fromMe = false,
  fetchProfilePhoto?: ProfilePhotoFetcher,
): Promise<string> {
  const contactsCol = db.collection('users').doc(uid).collection('contacts')

  const digitsKey = peer.phone ?? `lid:${peer.jid.split('@')[0]}`
  const cacheKey = `${uid}:${digitsKey}`
  const detId = peer.phone ? `wa_${peer.phone}` : `lid_${peer.jid.split('@')[0]}`
  const cached = contactCache.get(cacheKey)
  if (cached) {
    if (peer.phone && cached === detId) {
      const manual = await findManualContactByNormalizedPhone(contactsCol, peer.phone)
      if (manual) return useManualContact(uid, contactsCol, cacheKey, manual, peer, detId)
    }
    return cached
  }

  let fallback: ContactDoc | null = null

  const waJidMatch = await queryContactField(contactsCol, 'waJid', peer.jid)
  if (waJidMatch.manual) return useManualContact(uid, contactsCol, cacheKey, waJidMatch.manual, peer, detId)
  fallback = waJidMatch.fallback

  if (peer.phone) {
    const digitsMatch = await queryContactField(contactsCol, 'whatsappDigits', peer.phone)
    if (digitsMatch.manual) return useManualContact(uid, contactsCol, cacheKey, digitsMatch.manual, peer, detId)
    fallback ??= digitsMatch.fallback
  }

  // Vincula a um contato criado manualmente cujo whatsapp bate com o número.
  if (peer.phone) {
    const q = await queryContactField(contactsCol, 'whatsapp', peer.phone)
    if (q.manual) return useManualContact(uid, contactsCol, cacheKey, q.manual, peer, detId)
    fallback ??= q.fallback

    const manual = await findManualContactByNormalizedPhone(contactsCol, peer.phone)
    if (manual) return useManualContact(uid, contactsCol, cacheKey, manual, peer, detId)
  }

  if (fallback) {
    await maybeRenameOwnNameAutoContact(contactsCol, fallback.id, peer, fromMe, pushName)
    return rememberContact(contactsCol, cacheKey, fallback.id, peer)
  }

  const det = await contactsCol.doc(detId).get()
  if (det.exists) {
    await maybeRenameOwnNameAutoContact(contactsCol, detId, peer, fromMe, pushName)
    return rememberContact(contactsCol, cacheKey, detId, peer)
  }

  const remotePushName = fromMe ? '' : pushName?.trim()
  const name = (remotePushName || (peer.phone ? `+${peer.phone}` : 'Contato WhatsApp')).trim()
  const nameSource = remotePushName ? 'profile' : 'phone'
  await contactsCol.doc(detId).set(
    {
      name,
      company: '—',
      initials: initialsOf(name) || '?',
      online: false,
      role: '—',
      email: '',
      phone: peer.phone ?? '',
      whatsapp: peer.phone ?? '',
      whatsappDigits: peer.phone ?? '',
      waJid: peer.jid,
      status: 'WhatsApp',
      nameSource,
      source: 'whatsapp', // marca auto-criado → expurgo LGPD em uma operação
      lastMessage: '',
      // lastMessageAt fica de fora de propósito: quem preenche é a própria mensagem
      // (ingestOne ao vivo / refreshContactPreview no histórico). Um serverTimestamp aqui
      // mostraria hora errada na lista até a primeira mensagem ser gravada.
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
  contactCache.set(cacheKey, detId)
  // Migra a foto de perfil do WhatsApp para o contato recém-criado (não bloqueia a ingestão).
  if (fetchProfilePhoto && peer.jid) {
    void fetchAndStoreContactPhoto(uid, detId, peer.jid, fetchProfilePhoto).catch(() => {})
  }
  return detId
}

async function downloadAndStoreMedia(
  uid: string,
  contactId: string,
  messageId: string,
  m: WAMessage,
  media: NonNullable<Extracted['media']>,
  mediaCtx: MediaDownloadContext | undefined,
): Promise<Record<string, unknown>> {
  if (media.viewOnce) {
    return { pending: true, mediaError: 'view_once_unsupported' }
  }

  try {
    const buffer = await downloadMediaMessage(
      m,
      'buffer',
      {},
      mediaCtx ? { logger: waLogger, reuploadRequest: mediaCtx.reuploadRequest } : undefined,
    )
    const meta = MEDIA_META[
      media.mediaType === 'image'
        ? 'imageMessage'
        : media.mediaType === 'video'
          ? 'videoMessage'
          : media.mediaType === 'audio'
            ? 'audioMessage'
            : media.mediaType === 'sticker'
              ? 'stickerMessage'
              : 'documentMessage'
    ]
    const ext = extensionFromMime(media.mimeType, meta.fallbackExt)
    const rawName = media.fileName || `${media.mediaType}.${ext}`
    const safeName = sanitizeFileName(rawName.includes('.') ? rawName : `${rawName}.${ext}`)
    const safeMsgId = sanitizeId(messageId)
    const mediaPath = `users/${uid}/contacts/${contactId}/whatsapp/${safeMsgId}_${safeName}`
    const file = bucket.file(mediaPath)
    const token = randomUUID()

    await file.save(buffer, {
      resumable: false,
      metadata: {
        contentType: media.mimeType || 'application/octet-stream',
        metadata: {
          firebaseStorageDownloadTokens: token,
        },
      },
    })

    return {
      pending: false,
      mediaUrl: await getDownloadURL(file),
      mediaPath,
      sizeBytes: buffer.byteLength,
      mediaError: FieldValue.delete(),
    }
  } catch (err) {
    logger.warn({ err, uid, mediaType: media.mediaType }, 'falha ao baixar mídia WhatsApp')
    return { pending: true, mediaError: 'download_failed' }
  }
}

type IngestOptions = {
  /** true quando a mensagem veio de histórico (on-demand ou sync inicial), não do fluxo ao vivo. */
  importedFromHistory?: boolean
  /**
   * true = descarta mensagens anteriores a um expurgo (sync AUTOMÁTICO do pareamento:
   * conversa apagada não pode ressuscitar sozinha). O on-demand omite — é pedido
   * explícito do usuário e pode trazer de volta o que ele quiser.
   */
  respectPurgeMarkers?: boolean
}

/** Grava uma mensagem espelhada + atualiza o preview do contato (idempotente).
 *  Retorna o contactId afetado (ou undefined quando a mensagem foi descartada). */
async function ingestOne(uid: string, m: WAMessage, mediaCtx?: MediaDownloadContext, opts?: IngestOptions): Promise<string | undefined> {
  if (!m.message || !m.key?.id) return
  const peer = resolvePeer(m.key)
  if (!peer) return
  const content = extractContent(m.message)
  if (!content) return

  // Conversa expurgada: replay/append de mensagem anterior ao expurgo não ressuscita nada.
  // A recuperação de histórico explícita (importedFromHistory sem respectPurgeMarkers)
  // ignora o marcador — é pedido consciente do usuário. Mensagem NOVA (timestamp > expurgo)
  // passa e recria o contato.
  if (!opts?.importedFromHistory || opts?.respectPurgeMarkers) {
    const digitsKey = peer.phone ?? `lid:${peer.jid.split('@')[0]}`
    const msgTsMs = Number(m.messageTimestamp ?? 0) * 1000
    if (msgTsMs > 0 && (await isPurgedAt(uid, digitsKey, msgTsMs))) return
  }

  const contactId = await resolveContact(uid, peer, m.pushName, !!m.key.fromMe, mediaCtx?.fetchProfilePhoto)

  const tsSeconds = Number(m.messageTimestamp ?? 0)
  const sentAt = tsSeconds > 0 ? Timestamp.fromMillis(tsSeconds * 1000) : Timestamp.now()

  const contactRef = db.collection('users').doc(uid).collection('contacts').doc(contactId)
  const msgRef = contactRef.collection('messages').doc(sanitizeId(m.key.id))
  const existingMsg = content.media ? await msgRef.get() : null
  const mediaFields = content.media
    ? existingMsg?.get('mediaUrl')
      ? { pending: false, mediaError: FieldValue.delete() }
      : await downloadAndStoreMedia(uid, contactId, m.key.id, m, content.media, mediaCtx)
    : {}

  const batch = db.batch()
  batch.set(
    msgRef,
    {
      fromMe: !!m.key.fromMe,
      text: content.text,
      sentAt,
      channel: 'whatsapp', // marca origem → permite expurgo seletivo mesmo em contato manual
      waMessageId: m.key.id, // id cru da WA (o doc-id é sanitizado) → âncora exata p/ histórico on-demand
      ...(opts?.importedFromHistory ? { importedFromHistory: true } : {}),
      ...(content.pending ? { pending: true } : { pending: false }),
      ...(content.media
        ? {
            mediaType: content.media.mediaType,
            ...(content.media.caption ? { caption: content.media.caption } : {}),
            ...(content.media.mimeType ? { mimeType: content.media.mimeType } : {}),
            ...(content.media.fileName ? { fileName: content.media.fileName } : {}),
            ...(content.media.sizeBytes ? { sizeBytes: content.media.sizeBytes } : {}),
          }
        : {}),
      ...(content.mediaError ? { mediaError: content.mediaError } : {}),
      ...mediaFields,
    },
    { merge: true }, // idempotente em redelivery / reconexão
  )
  batch.set(
    contactRef,
    {
      // Fluxo ao vivo: a mensagem que chegou É a mais recente → preview direto.
      // Histórico chega fora de ordem → o chamador recomputa via refreshContactPreview.
      ...(opts?.importedFromHistory ? {} : { lastMessage: content.text, lastMessageAt: sentAt }),
      waJid: peer.jid,
      ...(peer.phone ? { whatsappDigits: peer.phone } : {}),
    },
    { merge: true },
  )
  await batch.commit()
  return contactId
}

export async function saveOutgoingTextMessage(
  uid: string,
  contactId: string,
  messageId: string,
  text: string,
  remoteJid: string,
  timestampSeconds?: number,
): Promise<void> {
  const sentAt =
    timestampSeconds && timestampSeconds > 0
      ? Timestamp.fromMillis(timestampSeconds * 1000)
      : Timestamp.now()
  const contactRef = db.collection('users').doc(uid).collection('contacts').doc(contactId)
  const msgRef = contactRef.collection('messages').doc(sanitizeId(messageId))
  const batch = db.batch()
  batch.set(
    msgRef,
    {
      fromMe: true,
      text,
      sentAt,
      channel: 'whatsapp',
      pending: false,
      waMessageId: messageId,
      waRemoteJid: remoteJid,
      sentByCrm: true,
    },
    { merge: true },
  )
  batch.set(contactRef, { lastMessage: text, lastMessageAt: sentAt, waJid: remoteJid }, { merge: true })
  await batch.commit()
}

/**
 * Ingere um lote de mensagens vindas de histórico (`messaging-history.set`): tanto a
 * recuperação on-demand quanto o snapshot inicial do pareamento. Reutiliza `ingestOne` —
 * mesmo roteamento de contato, dedup por `key.id` (merge) e `sentAt` real — marcando
 * `importedFromHistory: true`. NUNCA loga conteúdo.
 */
export async function ingestHistoryMessages(
  uid: string,
  messages: WAMessage[],
  mediaCtx?: MediaDownloadContext,
  opts?: Pick<IngestOptions, 'respectPurgeMarkers'>,
): Promise<Set<string>> {
  const touched = new Set<string>()
  for (const m of messages) {
    try {
      const contactId = await ingestOne(uid, m, mediaCtx, { importedFromHistory: true, ...opts })
      if (contactId) touched.add(contactId)
    } catch (err) {
      logger.error({ err, uid }, 'falha ao ingerir mensagem de histórico') // sem m.message
    }
  }
  return touched
}

/**
 * Ingere mensagens do gap-fill (buraco entre desvincular e reconectar com QR novo).
 * Semântica de mensagem VIVA: sem `importedFromHistory`, então respeita purge markers e
 * atualiza o preview do contato. Retorna os contactIds afetados para o recompute de preview.
 * NUNCA loga conteúdo.
 */
export async function ingestGapMessages(uid: string, messages: WAMessage[], mediaCtx?: MediaDownloadContext): Promise<Set<string>> {
  const touched = new Set<string>()
  for (const m of messages) {
    try {
      const contactId = await ingestOne(uid, m, mediaCtx)
      if (contactId) touched.add(contactId)
    } catch (err) {
      logger.error({ err, uid }, 'falha ao ingerir mensagem de gap-fill') // sem m.message
    }
  }
  return touched
}

/**
 * Recomputa o preview (lastMessage/lastMessageAt) a partir da mensagem mais nova gravada.
 * Necessário após o gap-fill: os lotes do sync inicial podem chegar fora de ordem, e o
 * último `ingestOne` a rodar não é necessariamente a mensagem mais recente.
 */
export async function refreshContactPreview(uid: string, contactId: string): Promise<void> {
  const contactRef = db.collection('users').doc(uid).collection('contacts').doc(contactId)
  const newest = await contactRef.collection('messages').orderBy('sentAt', 'desc').limit(1).get()
  const doc = newest.docs[0]
  if (!doc) return
  const sentAt = doc.get('sentAt')
  if (!(sentAt instanceof Timestamp)) return
  await contactRef.set({ lastMessage: String(doc.get('text') ?? ''), lastMessageAt: sentAt }, { merge: true })
}

export interface HistoryAnchor {
  key: WAMessageKey
  /** Timestamp da mensagem-âncora em MILISSEGUNDOS (campo oldestMsgTimestampMs do Baileys). */
  tsMs: number
}

/**
 * Âncora para paginar histórico on-demand: a mensagem MAIS ANTIGA já espelhada deste
 * contato. On-demand pede mensagens mais velhas que ela. Retorna null quando não há
 * nenhuma mensagem (sem âncora possível → o chamador orienta o usuário).
 */
export async function oldestStoredAnchor(uid: string, contactId: string): Promise<HistoryAnchor | null> {
  const contactRef = db.collection('users').doc(uid).collection('contacts').doc(contactId)
  const contactSnap = await contactRef.get()
  if (!contactSnap.exists) return null

  const oldest = await contactRef.collection('messages').orderBy('sentAt', 'asc').limit(1).get()
  if (oldest.empty) return null
  const doc = oldest.docs[0]

  const sentAt = doc.get('sentAt')
  const tsMs = sentAt instanceof Timestamp ? sentAt.toMillis() : 0
  if (!tsMs) return null

  const digits = phoneDigits(contactSnap.get('whatsappDigits')) || phoneDigits(contactSnap.get('whatsapp'))
  const remoteJid =
    (typeof contactSnap.get('waJid') === 'string' && contactSnap.get('waJid')) ||
    (digits ? `${digits}@s.whatsapp.net` : '')
  if (!remoteJid) return null

  // waMessageId é o id cru; docs legados podem não tê-lo → cai pro doc-id (sanitizado, mas
  // WA ids raramente contêm '/'), preservando a compatibilidade.
  const id = (typeof doc.get('waMessageId') === 'string' && doc.get('waMessageId')) || doc.id
  const fromMe = !!doc.get('fromMe')

  return { key: { remoteJid, id, fromMe }, tsMs }
}

/**
 * Handler de `messages.upsert`. Processa `notify` e também `append` idempotente, porque
 * respostas recebidas durante reconexão podem chegar como replay/offline recente. Como
 * `syncFullHistory:false`, isso não ativa importação geral de histórico. NUNCA loga conteúdo.
 */
export async function ingestMessages(uid: string, ev: MessagesUpsert, mediaCtx?: MediaDownloadContext): Promise<void> {
  if (ev.type !== 'notify' && ev.type !== 'append') return
  for (const m of ev.messages) {
    try {
      await ingestOne(uid, m, mediaCtx)
    } catch (err) {
      logger.error({ err, uid }, 'falha ao ingerir mensagem') // sem m.message
    }
  }
  // Espelho vivo até aqui — avança o watermark do gap-fill (throttled).
  await touchMirrorWatermark(uid)
}
