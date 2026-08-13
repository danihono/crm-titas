import { collection, query, orderBy, limitToLast, doc, writeBatch, serverTimestamp } from 'firebase/firestore'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../lib/firebase'
import { col, ref, uid } from '../lib/paths'
import { messageFromDoc } from '../lib/converters'
import { mediaLabel } from '../lib/format'
import { useCollection } from './useCollection'
import type { OutgoingMedia } from '../lib/whatsapp'
import type { Message } from '../types'

/** Teto do listener da conversa — históricos importados podem ter milhares de docs. */
const MESSAGES_WINDOW = 500

/**
 * Teto de upload do anexo. Casado com `storage.rules`, que recusa `request.resource.size >=
 * 10 MB` — passar disso não daria erro de app, daria "permission denied" do Storage, que é
 * ilegível para quem só quis mandar um vídeo.
 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

export type OutgoingMediaType = 'image' | 'video' | 'audio' | 'document'

export function useMessages(contactId: string | null) {
  return useCollection<Message>(
    (uid) => (contactId ? query(collection(db, `users/${uid}/contacts/${contactId}/messages`), orderBy('sentAt'), limitToLast(MESSAGES_WINDOW)) : null),
    messageFromDoc,
    [contactId],
  )
}

/** Envia mensagem (fromMe) e atualiza o lastMessage do contato — atômico. */
export async function sendMessage(contactId: string, text: string): Promise<void> {
  const t = text.trim()
  if (!t) return
  const batch = writeBatch(db)
  const msgRef = doc(col(`contacts/${contactId}/messages`))
  batch.set(msgRef, { fromMe: true, text: t, sentAt: serverTimestamp() })
  batch.update(ref(`contacts/${contactId}`), { lastMessage: t, lastMessageAt: serverTimestamp() })
  await batch.commit()
}

/** Categoria da mídia a partir do MIME do arquivo — o resto vira documento. */
export function mediaTypeOf(file: File): OutgoingMediaType {
  const mime = file.type.toLowerCase()
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  return 'document'
}

function safeFileName(name: string): string {
  return (
    name
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w.-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 120) || 'arquivo'
  )
}

/**
 * Sobe o anexo para o Storage e devolve o descritor que os dois caminhos de envio usam.
 *
 * O arquivo vai para `outgoing/` (irmão de `whatsapp/`, onde o daemon guarda o que CHEGA),
 * e é essa mesma URL que fica na mensagem — nem o daemon nem o CRM regravam o arquivo.
 */
export async function uploadOutgoingMedia(contactId: string, file: File, caption?: string): Promise<OutgoingMedia> {
  if (file.size >= MAX_UPLOAD_BYTES) {
    throw new Error('Arquivo grande demais: o limite é 10 MB.')
  }
  const fileName = safeFileName(file.name)
  const mediaPath = `users/${uid()}/contacts/${contactId}/outgoing/${Date.now()}_${fileName}`
  const sref = storageRef(storage, mediaPath)
  await uploadBytes(sref, file, { contentType: file.type || 'application/octet-stream' })
  const mediaUrl = await getDownloadURL(sref)
  return {
    mediaType: mediaTypeOf(file),
    mediaPath,
    mediaUrl,
    mimeType: file.type || 'application/octet-stream',
    fileName: file.name,
    sizeBytes: file.size,
    ...(caption?.trim() ? { caption: caption.trim() } : {}),
  }
}

/**
 * Grava o anexo como mensagem só no CRM — o caminho de quando não há WhatsApp conectado
 * (ou o daemon está fora do ar), espelhando o que `sendMessage` já faz com texto.
 */
export async function sendLocalMediaMessage(contactId: string, media: OutgoingMedia): Promise<void> {
  const preview = media.caption?.trim() || mediaLabel(media.mediaType)
  const batch = writeBatch(db)
  const msgRef = doc(col(`contacts/${contactId}/messages`))
  batch.set(msgRef, {
    fromMe: true,
    text: preview,
    sentAt: serverTimestamp(),
    pending: false,
    mediaType: media.mediaType,
    mediaUrl: media.mediaUrl,
    mediaPath: media.mediaPath,
    mimeType: media.mimeType,
    fileName: media.fileName,
    ...(media.sizeBytes ? { sizeBytes: media.sizeBytes } : {}),
    ...(media.caption?.trim() ? { caption: media.caption.trim() } : {}),
  })
  batch.update(ref(`contacts/${contactId}`), { lastMessage: preview, lastMessageAt: serverTimestamp() })
  await batch.commit()
}
