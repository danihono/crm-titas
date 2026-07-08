import { collection, orderBy, query, Timestamp, where } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { scheduledMessageFromDoc } from '../lib/converters'
import { useCollection } from './useCollection'
import type { ScheduledMessage } from '../types'

/** Agendamentos pendentes futuros; com contactId, limita a um contato. */
export function useScheduledMessages(contactId?: string | null) {
  const since = Timestamp.fromDate(new Date())
  return useCollection<ScheduledMessage>(
    (uid) => {
      const c = collection(db, `users/${uid}/scheduledMessages`)
      return contactId
        ? query(c, where('contactId', '==', contactId), where('status', '==', 'pending'), where('dueAt', '>=', since), orderBy('dueAt'))
        : query(c, where('status', '==', 'pending'), where('dueAt', '>=', since), orderBy('dueAt'))
    },
    scheduledMessageFromDoc,
    [contactId],
  )
}
