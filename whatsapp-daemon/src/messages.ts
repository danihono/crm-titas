import {
  isJidGroup,
  isJidBroadcast,
  isJidNewsletter,
  jidNormalizedUser,
  type WAMessage,
  type WAMessageKey,
  type proto,
} from '@whiskeysockets/baileys'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { db } from './firebase.js'
import { logger } from './logger.js'

export type MessagesUpsert = {
  messages: WAMessage[]
  type: 'notify' | 'append'
}

/** Rótulos placeholder para mídia (stub no v1 — não baixamos o conteúdo ainda). */
const MEDIA_LABELS: Record<string, string> = {
  imageMessage: '[imagem]',
  videoMessage: '[vídeo]',
  audioMessage: '[áudio]',
  documentMessage: '[documento]',
  documentWithCaptionMessage: '[documento]',
  stickerMessage: '[figurinha]',
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

/** Cache em memória: `${uid}:${phone}` -> contactId (evita lookups repetidos). */
const contactCache = new Map<string, string>()

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
  /** true quando é mídia (stub) e o conteúdo real ainda não foi baixado. */
  pending: boolean
}

/** Desembrulha ephemeral/viewOnce e extrai texto ou placeholder de mídia. */
function extractContent(message: WAMessage['message']): Extracted | null {
  let msg: proto.IMessage | null | undefined = message
  msg = msg?.ephemeralMessage?.message ?? msg
  msg = msg?.viewOnceMessageV2?.message ?? msg?.viewOnceMessageV2Extension?.message ?? msg?.viewOnceMessage?.message ?? msg
  if (!msg) return null

  // Eventos de controle — não são conteúdo de conversa.
  if (msg.protocolMessage || msg.reactionMessage || msg.pollUpdateMessage) return null

  if (msg.conversation) return { text: msg.conversation, pending: false }
  if (msg.extendedTextMessage?.text) return { text: msg.extendedTextMessage.text, pending: false }

  for (const key of Object.keys(MEDIA_LABELS)) {
    const node = (msg as Record<string, unknown>)[key]
    if (node) {
      const caption = (node as { caption?: string }).caption
      const label = MEDIA_LABELS[key]
      return { text: caption ? `${label} ${caption}` : label, pending: true }
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
async function resolveContact(uid: string, peer: Peer, pushName?: string | null): Promise<string> {
  const contactsCol = db.collection('users').doc(uid).collection('contacts')

  const digitsKey = peer.phone ?? `lid:${peer.jid.split('@')[0]}`
  const cacheKey = `${uid}:${digitsKey}`
  const cached = contactCache.get(cacheKey)
  if (cached) return cached

  const detId = peer.phone ? `wa_${peer.phone}` : `lid_${peer.jid.split('@')[0]}`

  const det = await contactsCol.doc(detId).get()
  if (det.exists) {
    contactCache.set(cacheKey, detId)
    return detId
  }

  // Vincula a um contato criado manualmente cujo whatsapp bate com o número.
  if (peer.phone) {
    const q = await contactsCol.where('whatsapp', '==', peer.phone).limit(1).get()
    if (!q.empty) {
      const id = q.docs[0].id
      contactCache.set(cacheKey, id)
      return id
    }
  }

  const name = (pushName || (peer.phone ? `+${peer.phone}` : 'Contato WhatsApp')).trim()
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
      status: 'WhatsApp',
      source: 'whatsapp', // marca auto-criado → expurgo LGPD em uma operação
      lastMessage: '',
      lastMessageAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
  contactCache.set(cacheKey, detId)
  return detId
}

/** Grava uma mensagem espelhada + atualiza o preview do contato (idempotente). */
async function ingestOne(uid: string, m: WAMessage): Promise<void> {
  if (!m.message || !m.key?.id) return
  const peer = resolvePeer(m.key)
  if (!peer) return
  const content = extractContent(m.message)
  if (!content) return

  const contactId = await resolveContact(uid, peer, m.pushName)

  const tsSeconds = Number(m.messageTimestamp ?? 0)
  const sentAt = tsSeconds > 0 ? Timestamp.fromMillis(tsSeconds * 1000) : Timestamp.now()

  const contactRef = db.collection('users').doc(uid).collection('contacts').doc(contactId)
  const msgRef = contactRef.collection('messages').doc(sanitizeId(m.key.id))

  const batch = db.batch()
  batch.set(
    msgRef,
    {
      fromMe: !!m.key.fromMe,
      text: content.text,
      sentAt,
      channel: 'whatsapp', // marca origem → permite expurgo seletivo mesmo em contato manual
      ...(content.pending ? { pending: true } : {}),
    },
    { merge: true }, // idempotente em redelivery / reconexão
  )
  batch.set(contactRef, { lastMessage: content.text, lastMessageAt: sentAt }, { merge: true })
  await batch.commit()
}

/**
 * Handler de `messages.upsert`. Só processa `type:'notify'` (mensagens novas ao vivo);
 * ignora `append` (replay de histórico/offline) — com syncFullHistory:false não puxamos
 * histórico. NUNCA loga o conteúdo da mensagem.
 */
export async function ingestMessages(uid: string, ev: MessagesUpsert): Promise<void> {
  if (ev.type !== 'notify') return
  for (const m of ev.messages) {
    try {
      await ingestOne(uid, m)
    } catch (err) {
      logger.error({ err, uid }, 'falha ao ingerir mensagem') // sem m.message
    }
  }
}
