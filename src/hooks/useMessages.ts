import { collection, query, orderBy, limitToLast, doc, writeBatch, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { col, ref } from '../lib/paths'
import { messageFromDoc } from '../lib/converters'
import { useCollection } from './useCollection'
import type { Message } from '../types'

/** Teto do listener da conversa — históricos importados podem ter milhares de docs. */
const MESSAGES_WINDOW = 500

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
