import { useMemo } from 'react'
import {
  collection, query, addDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp,
  writeBatch, doc as fsDoc, deleteField,
} from 'firebase/firestore'
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { db, storage } from '../lib/firebase'
import { col, ref, uid } from '../lib/paths'
import { invoiceFromDoc } from '../lib/converters'
import { extToType } from '../lib/format'
import { safeFileName, validarAnexo } from '../lib/upload'
import { parseDateTime } from './useEvents'
import { useCollection } from './useCollection'
import type { Invoice, InvoiceAttachment, InvoiceStatus, PaymentMethod } from '../types'

/** Número da nota como inteiro, para ordenar. '#1049' -> 1049. */
function numOf(iv: Invoice): number {
  return iv.seq ?? (parseInt(iv.num.replace(/\D/g, ''), 10) || 0)
}

export function useInvoices(opts: { enabled?: boolean } = {}) {
  // Sem orderBy no Firestore, e a ordenação sai aqui. Dois motivos: `num` é string, e
  // ordená-la se inverte assim que a numeração passa de #999 para #1000; e um orderBy
  // por createdAt EXCLUIRIA da consulta qualquer nota que não tenha o campo — uma nota
  // sumindo da tela em silêncio é pior do que ordenar em memória, ainda mais num volume
  // que é sempre de dezenas.
  // `enabled: false` não assina. Faturamento é de gestor para cima nas security rules, e
  // assinar mesmo assim renderia só um erro de permissão no console de todo atendente.
  const enabled = opts.enabled !== false
  const { docs, loading } = useCollection<Invoice>(
    (u) => (enabled ? query(collection(db, `users/${u}/invoices`)) : null),
    invoiceFromDoc,
    [enabled],
  )
  const sorted = useMemo(() => [...docs].sort((a, b) => numOf(b) - numOf(a)), [docs])
  return { docs: sorted, loading }
}

/** Status efetivo derivado: não paga + vencida = 'Vencida'. */
export function invoiceStatus(iv: Invoice, now = new Date()): InvoiceStatus {
  if (iv.status === 'Paga') return 'Paga'
  return iv.dueAt.getTime() < now.getTime() ? 'Vencida' : 'Pendente'
}

export const PAYMENT_METHODS: PaymentMethod[] = ['Pix', 'Boleto', 'Cartão', 'Transferência', 'Dinheiro', 'Outro']

/** Como a cobrança se divide no tempo. */
export type Billing =
  | { kind: 'avista' }
  | { kind: 'parcelada'; parcels: number }
  | { kind: 'mensal'; months: number }

export interface InvoiceForm {
  client: string
  contactId?: string
  value: number
  due: string // 'YYYY-MM-DD'
  desc: string
  paymentMethod?: PaymentMethod
  notes: string
  attachments: InvoiceAttachment[]
}

/** Teto de anexos por nota — é registro de cobrança, não pasta de arquivos. */
export const MAX_INVOICE_ATTACHMENTS = 10

/**
 * Sobe um anexo de nota ao Storage e devolve os metadados a gravar no doc.
 *
 * Pasta plana por tenant, não por nota: na emissão a nota ainda não tem id, e numa série
 * parcelada/mensal o MESMO arquivo é referenciado pelas N notas — sobe uma vez só.
 */
export async function uploadInvoiceAttachment(file: File): Promise<InvoiceAttachment> {
  const contentType = validarAnexo(file)
  const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  const path = `users/${uid()}/invoices/${stamp}_${safeFileName(file.name)}`
  const sref = storageRef(storage, path)
  await uploadBytes(sref, file, { contentType })
  return {
    name: file.name,
    type: extToType(file.name),
    sizeBytes: file.size,
    storagePath: path,
    downloadURL: await getDownloadURL(sref),
    uploadedAt: new Date(),
  }
}

/** Apaga do Storage, sem derrubar o fluxo se falhar — o registro já foi salvo. */
export async function deleteInvoiceFiles(paths: string[]): Promise<void> {
  await Promise.all(paths.map((p) => deleteObject(storageRef(storage, p)).catch((err) => {
    console.warn('[useInvoices] anexo não apagado do Storage', p, err)
  })))
}

/**
 * Apaga só o arquivo que NENHUMA outra nota ainda usa. Numa série todas as parcelas apontam
 * para o mesmo objeto: tirar o anexo de uma parcela não pode sumir com ele das outras.
 */
async function removeOrphanFiles(paths: string[], invoices: Invoice[], ignoreIds: string[]): Promise<void> {
  const ignore = new Set(ignoreIds)
  const inUse = new Set(
    invoices
      .filter((iv) => !ignore.has(iv.id))
      .flatMap((iv) => (iv.attachments ?? []).map((a) => a.storagePath)),
  )
  await deleteInvoiceFiles(paths.filter((p) => !inUse.has(p)))
}

function pathsOf(list: Invoice[]): string[] {
  return [...new Set(list.flatMap((iv) => (iv.attachments ?? []).map((a) => a.storagePath)))]
}

/** Próximo número da sequência. Base 1049 para continuar de onde o seed parou. */
function nextSeq(invoices: Invoice[]): number {
  return invoices.reduce(
    (m, iv) => Math.max(m, iv.seq ?? (parseInt(iv.num.replace(/\D/g, ''), 10) || 0)),
    1048,
  ) + 1
}

/**
 * Soma `months` meses preservando o dia sempre que ele existir no mês de destino.
 * Sem isto, vencimento dia 31 vira dia 3 de março ao cair em fevereiro — o
 * `setMonth` do JS transborda em silêncio.
 */
export function addMonthsKeepingDay(base: Date, months: number): Date {
  const d = new Date(base)
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + months)
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(day, lastDay))
  return d
}

/**
 * Divide o total em N parcelas SEM perder centavo: todas recebem o piso e a
 * primeira absorve o resto. `10000 / 3` vira 3334 + 3333 + 3333, e não 3×3333.
 */
export function splitValue(total: number, parts: number): number[] {
  const base = Math.floor(total / parts)
  const rest = total - base * parts
  return Array.from({ length: parts }, (_, i) => base + (i === 0 ? rest : 0))
}

/**
 * Vencimento cai no FIM do dia. Com o meio-dia que se usava antes, uma nota emitida hoje
 * para vencer hoje já nascia "Vencida" depois das 12h — o dia do vencimento é o último dia
 * em que a nota ainda está em dia, não meio dia dele.
 */
const DUE_TIME = '23:59'

/** Quantas notas a cobrança gera, e o valor de cada uma. */
export function billingPreview(form: { value: number; due: string }, billing: Billing): { dueAt: Date; value: number }[] {
  const first = parseDateTime(form.due, DUE_TIME)
  if (billing.kind === 'avista') return [{ dueAt: first, value: form.value }]
  if (billing.kind === 'parcelada') {
    return splitValue(form.value, billing.parcels)
      .map((v, i) => ({ dueAt: addMonthsKeepingDay(first, i), value: v }))
  }
  // Mensal: o valor NÃO se divide — é o mesmo todo mês.
  return Array.from({ length: billing.months }, (_, i) => ({
    dueAt: addMonthsKeepingDay(first, i),
    value: form.value,
  }))
}

function baseFields(form: InvoiceForm) {
  return {
    client: form.client.trim(),
    contactId: form.contactId ?? '',
    desc: form.desc.trim(),
    paymentMethod: form.paymentMethod ?? '',
    notes: form.notes.trim(),
    attachments: form.attachments.map((a) => ({
      name: a.name,
      type: a.type,
      sizeBytes: a.sizeBytes,
      storagePath: a.storagePath,
      downloadURL: a.downloadURL,
      uploadedAt: Timestamp.fromDate(a.uploadedAt ?? new Date()),
    })),
  }
}

/**
 * Emite a nota — ou a série inteira, quando a cobrança é parcelada/recorrente.
 *
 * Recorrência aqui é GERAÇÃO ANTECIPADA: as N notas nascem agora, com os vencimentos já
 * distribuídos. Não há agendador rodando no servidor para criá-las mês a mês.
 */
export async function saveInvoice(form: InvoiceForm, invoices: Invoice[], billing: Billing = { kind: 'avista' }): Promise<void> {
  const parts = billingPreview(form, billing)
  const seq0 = nextSeq(invoices)

  if (parts.length === 1) {
    await addDoc(col('invoices'), {
      ...baseFields(form),
      num: '#' + seq0,
      seq: seq0,
      value: parts[0].value,
      dueAt: Timestamp.fromDate(parts[0].dueAt),
      status: 'Pendente',
      createdAt: serverTimestamp(),
    })
    return
  }

  const seriesId = `s${Date.now()}`
  const batch = writeBatch(db)
  parts.forEach((p, i) => {
    batch.set(fsDoc(collection(db, `users/${uid()}/invoices`)), {
      ...baseFields(form),
      num: '#' + (seq0 + i),
      seq: seq0 + i,
      value: p.value,
      dueAt: Timestamp.fromDate(p.dueAt),
      status: 'Pendente',
      seriesId,
      installment: { n: i + 1, of: parts.length },
      ...(billing.kind === 'mensal' ? { recurrence: 'mensal' } : null),
      createdAt: serverTimestamp(),
    })
  })
  await batch.commit()
}

/** Edita os dados da nota. Número, série e baixa não se mexem por aqui. */
export async function updateInvoice(id: string, form: InvoiceForm, invoices: Invoice[] = []): Promise<void> {
  await updateDoc(ref(`invoices/${id}`), {
    ...baseFields(form),
    value: form.value,
    dueAt: Timestamp.fromDate(parseDateTime(form.due, DUE_TIME)),
  })
  const before = invoices.find((iv) => iv.id === id)
  if (before) {
    const kept = new Set(form.attachments.map((a) => a.storagePath))
    await removeOrphanFiles(pathsOf([before]).filter((p) => !kept.has(p)), invoices, [id])
  }
}

export async function deleteInvoice(id: string, invoices: Invoice[] = []): Promise<void> {
  await deleteDoc(ref(`invoices/${id}`))
  await removeOrphanFiles(pathsOf(invoices.filter((iv) => iv.id === id)), invoices, [id])
}

/** Apaga a série inteira (a assinatura que foi cancelada, por exemplo). */
export async function deleteInvoiceSeries(seriesId: string, invoices: Invoice[]): Promise<void> {
  const ids = invoices.filter((iv) => iv.seriesId === seriesId).map((iv) => iv.id)
  const base = `users/${uid()}/invoices`
  for (let i = 0; i < ids.length; i += 400) {
    const batch = writeBatch(db)
    ids.slice(i, i + 400).forEach((id) => batch.delete(fsDoc(db, `${base}/${id}`)))
    await batch.commit()
  }
  await removeOrphanFiles(pathsOf(invoices.filter((iv) => iv.seriesId === seriesId)), invoices, ids)
}

/**
 * Dá baixa na nota. É o que faltava no módulo: sem isto nada nunca chegava a 'Paga',
 * então o total "Faturado" ficava preso em zero e o gráfico de receita do Dashboard —
 * que só soma nota paga — nascia vazio.
 */
export async function markPaid(id: string, paidAt: Date = new Date()): Promise<void> {
  await updateDoc(ref(`invoices/${id}`), { status: 'Paga', paidAt: Timestamp.fromDate(paidAt) })
}

/** Desfaz a baixa — o status volta a ser derivado do vencimento. */
export async function markUnpaid(id: string): Promise<void> {
  await updateDoc(ref(`invoices/${id}`), { status: 'Pendente', paidAt: deleteField() })
}
