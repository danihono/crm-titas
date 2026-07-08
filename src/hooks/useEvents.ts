import { collection, query, where, orderBy, addDoc, serverTimestamp, Timestamp, doc, writeBatch, getDocs, deleteField } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { col } from '../lib/paths'
import { eventFromDoc } from '../lib/converters'
import { dateKeyOf, timeHHMM } from '../lib/format'
import { useCollection } from './useCollection'
import type { EventDoc } from '../types'

/** Eventos de um mes especifico (range em date). */
export function useEvents(year: number, month: number) {
  return useCollection<EventDoc>(
    (uid) => {
      const start = new Date(year, month, 1)
      const end = new Date(year, month + 1, 1)
      return query(
        collection(db, `users/${uid}/events`),
        where('date', '>=', Timestamp.fromDate(start)),
        where('date', '<', Timestamp.fromDate(end)),
        orderBy('date'),
      )
    },
    eventFromDoc,
    [year, month],
  )
}

export interface NewEvent {
  title: string
  date: Date
  color: string
  subtitle: string
  time?: string
  activityId?: string
  scheduledMessageId?: string
}

export async function addEvent(e: NewEvent): Promise<void> {
  const base: Record<string, unknown> = {
    title: e.title,
    date: Timestamp.fromDate(e.date),
    dateKey: dateKeyOf(e.date),
    time: e.time ?? timeHHMM(e.date),
    color: e.color,
    subtitle: e.subtitle,
    createdAt: serverTimestamp(),
  }
  if (e.activityId) base.activityId = e.activityId
  if (e.scheduledMessageId) base.scheduledMessageId = e.scheduledMessageId
  await addDoc(col('events'), base)
}

/** 'YYYY-MM-DD' + 'HH:MM' -> Date local. */
export function parseDateTime(dateStr: string, timeStr: string): Date {
  return new Date(`${dateStr}T${(timeStr || '09:00')}:00`)
}

/** Agenda uma mensagem real de WhatsApp e cria o lembrete visual na Agenda. */
export async function saveScheduledMessage(contactId: string, contactName: string, text: string, dateStr: string, timeStr: string): Promise<void> {
  const t = text.trim()
  if (!t) return
  const dueAt = parseDateTime(dateStr, timeStr)
  const time = timeStr || timeHHMM(dueAt)
  const short = t.length > 26 ? t.slice(0, 26) + '...' : t
  const scheduledRef = doc(col('scheduledMessages'))
  const eventRef = doc(col('events'))
  const batch = writeBatch(db)
  batch.set(scheduledRef, {
    contactId,
    contactName,
    text: t,
    dueAt: Timestamp.fromDate(dueAt),
    dateKey: dateKeyOf(dueAt),
    time,
    eventId: eventRef.id,
    status: 'pending',
    attempts: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  batch.set(eventRef, {
    title: 'Mensagem: ' + short,
    date: Timestamp.fromDate(dueAt),
    dateKey: dateKeyOf(dueAt),
    time,
    color: '#2f9e6f',
    subtitle: contactName + ' - mensagem WhatsApp agendada',
    scheduledMessageId: scheduledRef.id,
    createdAt: serverTimestamp(),
  })
  await batch.commit()
}

async function findScheduledEventRef(scheduleId: string, eventId?: string) {
  if (eventId) return doc(col('events'), eventId)
  const snap = await getDocs(query(col('events'), where('scheduledMessageId', '==', scheduleId)))
  return snap.docs[0]?.ref ?? null
}

/** Atualiza a mensagem agendada e o evento espelhado na Agenda. */
export async function updateScheduledMessage(scheduleId: string, contactName: string, text: string, dateStr: string, timeStr: string, eventId?: string): Promise<void> {
  const t = text.trim()
  if (!t) return
  const dueAt = parseDateTime(dateStr, timeStr)
  const time = timeStr || timeHHMM(dueAt)
  const short = t.length > 26 ? t.slice(0, 26) + '...' : t
  const scheduledRef = doc(col('scheduledMessages'), scheduleId)
  let eventRef = await findScheduledEventRef(scheduleId, eventId)
  const createEvent = !eventRef
  const batch = writeBatch(db)

  if (!eventRef) {
    eventRef = doc(col('events'))
  }

  batch.set(scheduledRef, {
    contactName,
    text: t,
    dueAt: Timestamp.fromDate(dueAt),
    dateKey: dateKeyOf(dueAt),
    time,
    eventId: eventRef.id,
    status: 'pending',
    attempts: 0,
    lastError: deleteField(),
    lockUntil: deleteField(),
    updatedAt: serverTimestamp(),
  }, { merge: true })
  batch.set(eventRef, {
    title: 'Mensagem: ' + short,
    date: Timestamp.fromDate(dueAt),
    dateKey: dateKeyOf(dueAt),
    time,
    color: '#2f9e6f',
    subtitle: contactName + ' - mensagem WhatsApp agendada',
    scheduledMessageId: scheduleId,
    ...(createEvent ? { createdAt: serverTimestamp() } : {}),
    updatedAt: serverTimestamp(),
  }, { merge: true })
  await batch.commit()
}

/** Cancela o envio real e remove o lembrete visual da Agenda. */
export async function deleteScheduledMessage(scheduleId: string, eventId?: string): Promise<void> {
  const scheduledRef = doc(col('scheduledMessages'), scheduleId)
  const eventRef = await findScheduledEventRef(scheduleId, eventId)
  const batch = writeBatch(db)
  batch.set(scheduledRef, {
    status: 'canceled',
    lockUntil: deleteField(),
    updatedAt: serverTimestamp(),
  }, { merge: true })
  if (eventRef) batch.delete(eventRef)
  await batch.commit()
}
