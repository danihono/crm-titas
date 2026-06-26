import { collection, query, where, orderBy, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { col } from '../lib/paths'
import { eventFromDoc } from '../lib/converters'
import { dateKeyOf, timeHHMM } from '../lib/format'
import { useCollection } from './useCollection'
import type { EventDoc } from '../types'

/** Eventos de um mês específico (range em date). */
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
  await addDoc(col('events'), base)
}

/** 'YYYY-MM-DD' + 'HH:MM' -> Date local. */
export function parseDateTime(dateStr: string, timeStr: string): Date {
  return new Date(`${dateStr}T${(timeStr || '09:00')}:00`)
}

/** Agenda uma mensagem de WhatsApp como evento na Agenda. */
export async function saveScheduledMessage(contactName: string, text: string, dateStr: string, timeStr: string): Promise<void> {
  const t = text.trim()
  if (!t) return
  const short = t.length > 26 ? t.slice(0, 26) + '…' : t
  await addEvent({
    title: '💬 ' + short,
    date: parseDateTime(dateStr, timeStr),
    time: timeStr,
    color: '#2f9e6f',
    subtitle: contactName + ' · mensagem WhatsApp agendada',
  })
}
