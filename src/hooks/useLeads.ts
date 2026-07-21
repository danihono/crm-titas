import { collection, query, orderBy } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { leadFromDoc } from '../lib/converters'
import { useCollection } from './useCollection'
import type { Lead } from '../types'

export function useLeads() {
  return useCollection<Lead>(
    (uid) => query(collection(db, `users/${uid}/leads`), orderBy('createdAt', 'desc')),
    leadFromDoc,
    [],
  )
}
