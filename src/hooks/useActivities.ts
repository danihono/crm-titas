import {
  collection, query, orderBy, doc, updateDoc, addDoc, writeBatch, serverTimestamp, Timestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { col, ref } from '../lib/paths'
import { activityFromDoc, actTypeFromDoc } from '../lib/converters'
import { dateKeyOf, dueInfo } from '../lib/format'
import { parseDateTime } from './useEvents'
import { useCollection } from './useCollection'
import type { Activity, ActType, ActivityStatus } from '../types'

export function useActivities() {
  return useCollection<Activity>(
    (uid) => query(collection(db, `users/${uid}/activities`), orderBy('createdAt', 'desc')),
    activityFromDoc,
    [],
  )
}

export function useActTypes() {
  return useCollection<ActType>(
    (uid) => query(collection(db, `users/${uid}/actTypes`)),
    actTypeFromDoc,
    [],
  )
}

/** Status derivado (não persistido): atrasada = vencida e não concluída. */
export function statusOf(a: Activity): ActivityStatus {
  if (a.done) return 'concluida'
  return dueInfo(a.dueAt, a.done).overdue ? 'atrasada' : 'pendente'
}

export async function toggleActivity(a: Activity): Promise<void> {
  await updateDoc(ref(`activities/${a.id}`), { done: !a.done })
}

export async function createActType(label: string, icon: string, color: string, bg: string, evColor: string): Promise<void> {
  await addDoc(col('actTypes'), { label, icon, color, bg, evColor })
}

export interface NewActivityForm {
  type: string
  title: string
  contact: string
  date: string
  time: string
}

/** Cria a atividade E o evento correspondente na Agenda — atômico (writeBatch). */
export async function saveActivity(form: NewActivityForm, types: ActType[]): Promise<string> {
  const due = parseDateTime(form.date, form.time)
  const t = types.find((x) => x.id === form.type)
  const batch = writeBatch(db)

  const actRef = doc(col('activities'))
  batch.set(actRef, {
    type: form.type,
    title: form.title.trim(),
    contact: form.contact,
    dueAt: Timestamp.fromDate(due),
    done: false,
    createdAt: serverTimestamp(),
  })

  const evRef = doc(col('events'))
  batch.set(evRef, {
    title: form.title.trim(),
    date: Timestamp.fromDate(due),
    dateKey: dateKeyOf(due),
    time: form.time,
    color: t?.evColor ?? '#9a6fb8',
    subtitle: form.contact + ' · ' + (t?.label ?? 'Atividade'),
    activityId: actRef.id,
    createdAt: serverTimestamp(),
  })

  await batch.commit()
  return form.date
}
