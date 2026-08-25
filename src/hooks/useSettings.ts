import { useEffect, useState } from 'react'
import {
  addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp,
  setDoc, updateDoc,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { col, ref, userRef } from '../lib/paths'
import { useAuth } from '../contexts/AuthContext'
import { useTenantStore } from '../store/tenantStore'
import {
  sectorFromDoc, tagFromDoc, quickReplyFromDoc, customFieldFromDoc, businessHoursFromDoc,
} from '../lib/converters'
import { useCollection } from './useCollection'
import type {
  BusinessHours, CustomField, CustomFieldType, QuickReply, Sector, Tag,
} from '../types'

// ---------------------------------------------------------------- Setores

export function useSectors() {
  return useCollection<Sector>(
    (uid) => query(collection(db, `users/${uid}/sectors`), orderBy('order')),
    sectorFromDoc,
    [],
  )
}

export async function addSector(name: string, color: string, order: number): Promise<string> {
  const r = await addDoc(col('sectors'), { name, color, greeting: '', order, createdAt: serverTimestamp() })
  return r.id
}

export async function updateSector(id: string, patch: Partial<Omit<Sector, 'id'>>): Promise<void> {
  await updateDoc(ref(`sectors/${id}`), patch)
}

export async function deleteSector(id: string): Promise<void> {
  await deleteDoc(ref(`sectors/${id}`))
}

// --------------------------------------------------------------- Etiquetas

export function useTags() {
  return useCollection<Tag>(
    (uid) => query(collection(db, `users/${uid}/tags`), orderBy('order')),
    tagFromDoc,
    [],
  )
}

export async function addTag(label: string, color: string, order: number): Promise<string> {
  const r = await addDoc(col('tags'), { label, color, order, createdAt: serverTimestamp() })
  return r.id
}

export async function updateTag(id: string, patch: Partial<Omit<Tag, 'id'>>): Promise<void> {
  await updateDoc(ref(`tags/${id}`), patch)
}

export async function deleteTag(id: string): Promise<void> {
  await deleteDoc(ref(`tags/${id}`))
}

// -------------------------------------------------------- Respostas rápidas

export function useQuickReplies() {
  return useCollection<QuickReply>(
    (uid) => query(collection(db, `users/${uid}/quickReplies`), orderBy('shortcut')),
    quickReplyFromDoc,
    [],
  )
}

/** Normaliza o atalho: minúsculo, sem espaço e sem a barra que o usuário costuma digitar. */
export function normalizeShortcut(v: string): string {
  return v.trim().toLowerCase().replace(/^\/+/, '').replace(/\s+/g, '-')
}

export async function addQuickReply(shortcut: string, title: string, text: string): Promise<string> {
  const r = await addDoc(col('quickReplies'), {
    shortcut: normalizeShortcut(shortcut),
    title,
    text,
    sectorId: '',
    createdAt: serverTimestamp(),
  })
  return r.id
}

export async function updateQuickReply(id: string, patch: Partial<Omit<QuickReply, 'id'>>): Promise<void> {
  const clean = patch.shortcut === undefined ? patch : { ...patch, shortcut: normalizeShortcut(patch.shortcut) }
  await updateDoc(ref(`quickReplies/${id}`), clean)
}

export async function deleteQuickReply(id: string): Promise<void> {
  await deleteDoc(ref(`quickReplies/${id}`))
}

/**
 * Troca {{nome}}, {{empresa}}, {{atendente}} pelo valor real.
 * Placeholder sem valor vira string vazia — melhor um espaço em branco do que
 * mandar "{{nome}}" cru para o cliente.
 */
export function applyVariables(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => vars[key.toLowerCase()] ?? '')
}

// ---------------------------------------------------- Campos personalizados

export function useCustomFields() {
  return useCollection<CustomField>(
    (uid) => query(collection(db, `users/${uid}/customFields`), orderBy('order')),
    customFieldFromDoc,
    [],
  )
}

export async function addCustomField(
  label: string,
  type: CustomFieldType,
  options: string[],
  order: number,
): Promise<string> {
  const r = await addDoc(col('customFields'), { label, type, options, order, createdAt: serverTimestamp() })
  return r.id
}

export async function updateCustomField(id: string, patch: Partial<Omit<CustomField, 'id'>>): Promise<void> {
  await updateDoc(ref(`customFields/${id}`), patch)
}

export async function deleteCustomField(id: string): Promise<void> {
  await deleteDoc(ref(`customFields/${id}`))
}

/** Grava o valor de um campo personalizado no contato (mapa `custom`). */
export async function setContactCustomValue(contactId: string, fieldId: string, value: string): Promise<void> {
  await setDoc(ref(`contacts/${contactId}`), { custom: { [fieldId]: value } }, { merge: true })
}

// ---------------------------------------------------- Horários / dados da org

export const DAY_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

export const defaultBusinessHours: BusinessHours = {
  days: Array.from({ length: 7 }, (_, i) => ({
    enabled: i >= 1 && i <= 5,
    open: '09:00',
    close: '18:00',
  })),
  awayMessage: '',
  timezone: 'America/Sao_Paulo',
}

/** Horários de atendimento do tenant ativo, em tempo real. */
export function useBusinessHours(): BusinessHours {
  const { user } = useAuth()
  const tenantUid = useTenantStore((s) => s.tenantUid)
  const [hours, setHours] = useState<BusinessHours>(defaultBusinessHours)

  useEffect(() => {
    const uid = tenantUid ?? user?.uid
    if (!uid) return
    setHours(defaultBusinessHours)
    return onSnapshot(doc(db, 'users', uid), (snap) => {
      const raw = snap.data()?.businessHours
      setHours(raw ? businessHoursFromDoc(raw) : defaultBusinessHours)
    })
  }, [user?.uid, tenantUid])

  return hours
}

export async function saveBusinessHours(hours: BusinessHours): Promise<void> {
  await setDoc(userRef(), { businessHours: hours }, { merge: true })
}

export async function saveOrgName(orgName: string): Promise<void> {
  await setDoc(userRef(), { orgName }, { merge: true })
}

function hhmmToMinutes(v: string): number {
  const [h, m] = v.split(':')
  return Number(h) * 60 + Number(m)
}

/**
 * Estamos dentro da janela de atendimento? Usado para avisar o atendente e (na Fase 5)
 * disparar a resposta de ausência. Compara no fuso do NAVEGADOR de propósito: o campo
 * `timezone` existe para o daemon, que roda em servidor e não pode assumir o fuso local.
 */
export function isWithinBusinessHours(hours: BusinessHours, at: Date = new Date()): boolean {
  const day = hours.days[at.getDay()]
  if (!day?.enabled) return false
  const now = at.getHours() * 60 + at.getMinutes()
  const open = hhmmToMinutes(day.open)
  const close = hhmmToMinutes(day.close)
  // Janela que vira a meia-noite (ex.: 18:00–02:00) — vale antes do fecha OU depois do abre.
  if (close <= open) return now >= open || now < close
  return now >= open && now < close
}

/**
 * Nome da organização do tenant ativo (Configurações › Dados e canais).
 *
 * Lê o doc do TENANT, não o da conta logada — quem exporta um relatório de uma equipe
 * precisa ver o nome da equipe no cabeçalho, não o próprio nome.
 */
export function useOrgName(): string {
  const { user } = useAuth()
  const tenantUid = useTenantStore((s) => s.tenantUid)
  const [orgName, setOrgName] = useState('')

  useEffect(() => {
    const uid = tenantUid ?? user?.uid
    if (!uid) {
      setOrgName('')
      return
    }
    return onSnapshot(doc(db, 'users', uid), (snap) => {
      setOrgName((snap.data()?.orgName ?? '') as string)
    })
  }, [user?.uid, tenantUid])

  return orgName
}
