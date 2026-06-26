import { collection, query, orderBy, doc, writeBatch, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { col, ref } from '../lib/paths'
import { leadFromDoc } from '../lib/converters'
import { nextOrder } from './useDeals'
import { useCollection } from './useCollection'
import type { Lead, Deal } from '../types'

export function useLeads() {
  return useCollection<Lead>(
    (uid) => query(collection(db, `users/${uid}/leads`), orderBy('createdAt', 'desc')),
    leadFromDoc,
    [],
  )
}

/** Move um lead para o pipeline (cria deal na 1ª coluna) e remove o lead — atômico. */
export async function addLeadToPipeline(lead: Lead, boardId: string, columnId: string, deals: Deal[]): Promise<void> {
  const batch = writeBatch(db)
  batch.set(doc(col('deals')), {
    company: lead.company,
    contact: lead.name,
    value: lead.value,
    initials: lead.initials,
    tag: 'Novo',
    boardId,
    columnId,
    order: nextOrder(deals, columnId),
    createdAt: serverTimestamp(),
  })
  batch.delete(ref(`leads/${lead.id}`))
  await batch.commit()
}
