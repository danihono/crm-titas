import { collection, query, orderBy, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { col } from '../lib/paths'
import { invoiceFromDoc } from '../lib/converters'
import { parseDateTime } from './useEvents'
import { useCollection } from './useCollection'
import type { Invoice, InvoiceStatus } from '../types'

export function useInvoices() {
  return useCollection<Invoice>(
    (uid) => query(collection(db, `users/${uid}/invoices`), orderBy('num', 'desc')),
    invoiceFromDoc,
    [],
  )
}

/** Status efetivo derivado: não paga + vencida = 'Vencida'. */
export function invoiceStatus(iv: Invoice, now = new Date()): InvoiceStatus {
  if (iv.status === 'Paga') return 'Paga'
  return iv.dueAt.getTime() < now.getTime() ? 'Vencida' : 'Pendente'
}

export interface NewInvoiceForm {
  client: string
  value: number
  due: string // 'YYYY-MM-DD'
}

export async function saveInvoice(form: NewInvoiceForm, invoices: Invoice[]): Promise<void> {
  const max = invoices.reduce((m, iv) => Math.max(m, parseInt(iv.num.replace(/\D/g, ''), 10) || 0), 1048)
  await addDoc(col('invoices'), {
    num: '#' + (max + 1),
    client: form.client,
    value: form.value,
    dueAt: Timestamp.fromDate(parseDateTime(form.due, '12:00')),
    status: 'Pendente',
    createdAt: serverTimestamp(),
  })
}
