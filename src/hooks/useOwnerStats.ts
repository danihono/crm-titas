import { useEffect, useState } from 'react'
import { collectionGroup, onSnapshot, type QuerySnapshot } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { dealFromDoc, invoiceFromDoc } from '../lib/converters'
import { invoiceStatus } from './useInvoices'

export interface PerClient {
  pipeline: number
  deals: number
}

export interface OwnerStats {
  pipelineTotal: number
  dealCount: number
  faturado: number
  aReceber: number
  vencido: number
  contactsCount: number
  activitiesCount: number
  perClient: Record<string, PerClient>
  loading: boolean
}

/**
 * Agrega métricas de TODOS os clientes via collectionGroup (somente donos).
 * Usa onSnapshot para ficar ao vivo; os volumes são pequenos.
 */
export function useOwnerStats(): OwnerStats {
  const [deals, setDeals] = useState({ total: 0, count: 0, perClient: {} as Record<string, PerClient> })
  const [inv, setInv] = useState({ faturado: 0, aReceber: 0, vencido: 0 })
  const [contactsCount, setContacts] = useState(0)
  const [activitiesCount, setActs] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubs = [
      onSnapshot(collectionGroup(db, 'deals'), (snap: QuerySnapshot) => {
        let total = 0
        const perClient: Record<string, PerClient> = {}
        snap.forEach((d) => {
          const deal = dealFromDoc(d.id, d.data())
          const t = d.ref.parent.parent?.id ?? ''
          total += deal.value
          const pc = (perClient[t] ||= { pipeline: 0, deals: 0 })
          pc.pipeline += deal.value
          pc.deals += 1
        })
        setDeals({ total, count: snap.size, perClient })
        setLoading(false)
      }, (e) => { console.error('[ownerStats deals]', e); setLoading(false) }),

      onSnapshot(collectionGroup(db, 'invoices'), (snap: QuerySnapshot) => {
        let faturado = 0, aReceber = 0, vencido = 0
        snap.forEach((d) => {
          const iv = invoiceFromDoc(d.id, d.data())
          const st = invoiceStatus(iv)
          if (st === 'Paga') faturado += iv.value
          else if (st === 'Vencida') vencido += iv.value
          else aReceber += iv.value
        })
        setInv({ faturado, aReceber, vencido })
      }, (e) => console.error('[ownerStats invoices]', e)),

      onSnapshot(collectionGroup(db, 'contacts'), (snap) => setContacts(snap.size),
        (e) => console.error('[ownerStats contacts]', e)),

      onSnapshot(collectionGroup(db, 'activities'), (snap) => setActs(snap.size),
        (e) => console.error('[ownerStats activities]', e)),
    ]
    return () => unsubs.forEach((u) => u())
  }, [])

  return {
    pipelineTotal: deals.total,
    dealCount: deals.count,
    faturado: inv.faturado,
    aReceber: inv.aReceber,
    vencido: inv.vencido,
    contactsCount,
    activitiesCount,
    perClient: deals.perClient,
    loading,
  }
}
