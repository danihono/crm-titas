import { FieldValue } from 'firebase-admin/firestore'
import { db } from './firebase.js'
import { logger } from './logger.js'

/**
 * Nomes da AGENDA do celular do usuário, entregues pelo WhatsApp no sync do pareamento
 * (`messaging-history.set` → `contacts[].name`) e nos eventos vivos `contacts.upsert`/
 * `contacts.update`. Persistidos em `users/{uid}/waAgenda/{digits}` para que contatos
 * espelhados nasçam (e sejam curados) com o nome que o usuário salvou — em vez do nome
 * de perfil do remetente ou do número cru.
 */

/** Forma mínima de um contato vindo do Baileys (Contact ou Partial<Contact>). */
export interface WaAgendaContact {
  id?: string | null
  name?: string | null
}

/** Iniciais a partir do nome — espelha src/lib/format.ts initialsOf. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase()
}

function agendaCol(uid: string) {
  return db.collection('users').doc(uid).collection('waAgenda')
}

/** Dígitos de um JID de telefone; null para @lid/grupos/ids inválidos. */
function digitsOfPnJid(id: string | null | undefined): string | null {
  if (!id || !id.endsWith('@s.whatsapp.net')) return null
  const digits = (id.split('@')[0] ?? '').split(':')[0].replace(/\D/g, '')
  return digits.length >= 8 ? digits : null
}

interface AgendaEntry {
  digits: string
  name: string
}

function entriesOf(contacts: WaAgendaContact[]): AgendaEntry[] {
  const out: AgendaEntry[] = []
  for (const c of contacts) {
    const name = c.name?.trim()
    const digits = digitsOfPnJid(c.id)
    if (name && digits) out.push({ digits, name })
  }
  return out
}

/** Grava os nomes de agenda recebidos (lotes de 450). Retorna quantas entradas úteis havia. */
export async function harvestAgendaNames(uid: string, contacts: WaAgendaContact[]): Promise<number> {
  const entries = entriesOf(contacts)
  if (!entries.length) return 0
  let batch = db.batch()
  let n = 0
  for (const e of entries) {
    batch.set(agendaCol(uid).doc(e.digits), { name: e.name, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    if (++n >= 450) {
      await batch.commit()
      batch = db.batch()
      n = 0
    }
  }
  if (n) await batch.commit()
  logger.info({ uid, count: entries.length }, 'nomes da agenda gravados')
  return entries.length
}

/** Nome salvo na agenda para um número (dígitos), ou null. */
export async function agendaNameFor(uid: string, digits: string): Promise<string | null> {
  if (!digits) return null
  const snap = await agendaCol(uid).doc(digits).get()
  const name = snap.get('name')
  return typeof name === 'string' && name.trim() ? name.trim() : null
}

/**
 * Aplica os nomes da agenda aos contatos já existentes no CRM. Só renomeia quem foi
 * nomeado automaticamente ('phone'/'profile'/'agenda') — nome editado à mão ('manual')
 * é intocável.
 */
export async function applyAgendaToContacts(uid: string): Promise<number> {
  const contacts = await db.collection('users').doc(uid).collection('contacts').get()
  let renamed = 0
  for (const c of contacts.docs) {
    const src = c.get('nameSource')
    if (src !== 'phone' && src !== 'profile' && src !== 'agenda') continue
    const digits = String(c.get('whatsappDigits') ?? '').replace(/\D/g, '')
    if (!digits) continue
    const name = await agendaNameFor(uid, digits)
    if (!name || name === c.get('name')) continue
    await c.ref.set({ name, initials: initialsOf(name) || '?', nameSource: 'agenda' }, { merge: true })
    renamed++
  }
  if (renamed) logger.info({ uid, renamed }, 'contatos renomeados pela agenda')
  return renamed
}

/** Fluxo completo para um lote de contatos vindo de evento: grava e aplica. */
export async function onAgendaContacts(uid: string, contacts: WaAgendaContact[]): Promise<void> {
  const harvested = await harvestAgendaNames(uid, contacts)
  if (harvested > 0) await applyAgendaToContacts(uid)
}
