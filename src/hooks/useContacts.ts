import { addDoc, updateDoc, collection, query, orderBy, serverTimestamp, getDocs, writeBatch } from 'firebase/firestore'
import { deleteObject, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../lib/firebase'
import { col, ref, uid } from '../lib/paths'
import { contactFromDoc } from '../lib/converters'
import { initialsOf } from '../lib/format'
import { useCollection } from './useCollection'
import type { Contact } from '../types'

export function useContacts() {
  return useCollection<Contact>(
    (uid) => query(collection(db, `users/${uid}/contacts`), orderBy('createdAt', 'desc')),
    contactFromDoc,
    [],
  )
}

export interface NewContactForm {
  name: string
  role: string
  company: string
  email: string
  phone: string
  whats: string
}

function phoneDigits(v: string): string {
  return v.replace(/\D/g, '')
}

/** Cria um contato e retorna o id do novo doc. */
export async function saveContact(form: NewContactForm): Promise<string> {
  const name = form.name.trim()
  const whatsapp = form.whats || form.phone || ''
  const r = await addDoc(col('contacts'), {
    name,
    company: form.company || '—',
    initials: initialsOf(name) || '?',
    online: false,
    role: form.role || '—',
    email: form.email || '',
    phone: form.phone || '',
    whatsapp,
    whatsappDigits: phoneDigits(whatsapp),
    status: 'contato novo',
    nameSource: 'manual',
    lastMessage: 'Contato criado',
    lastMessageAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  })
  return r.id
}

/** Atualiza os dados editáveis de um contato existente. */
export async function updateContact(id: string, form: NewContactForm): Promise<void> {
  const name = form.name.trim()
  const whatsapp = form.whats || form.phone || ''
  await updateDoc(ref(`contacts/${id}`), {
    name,
    company: form.company || '—',
    initials: initialsOf(name) || '?',
    role: form.role || '—',
    email: form.email || '',
    phone: form.phone || '',
    whatsapp,
    whatsappDigits: phoneDigits(whatsapp),
    nameSource: 'manual',
  })
}

async function deleteStoragePath(path: string): Promise<void> {
  await deleteObject(storageRef(storage, path)).catch((err) => {
    if ((err as { code?: string }).code !== 'storage/object-not-found') throw err
  })
}

/** Envia uma foto do disco como avatar do contato (marca 'manual' → o daemon não sobrescreve). */
export async function uploadContactPhoto(contactId: string, file: File, oldPath?: string): Promise<void> {
  const path = `users/${uid()}/contacts/${contactId}/profile/${Date.now()}_${file.name}`
  await uploadBytes(storageRef(storage, path), file)
  const photoUrl = await getDownloadURL(storageRef(storage, path))
  await updateDoc(ref(`contacts/${contactId}`), { photoUrl, photoPath: path, photoSource: 'manual' })
  if (oldPath && oldPath !== path) await deleteStoragePath(oldPath)
}

/** Remove o avatar do contato (volta às iniciais) e marca 'removed' → o daemon não re-adiciona. */
export async function removeContactPhoto(contactId: string, oldPath?: string): Promise<void> {
  await updateDoc(ref(`contacts/${contactId}`), { photoUrl: '', photoPath: '', photoSource: 'removed' })
  if (oldPath) await deleteStoragePath(oldPath)
}

/** Apaga docs de mensagens/arquivos do contato + mídias do Storage referenciadas por eles. */
async function purgeConversationDocs(id: string, extraStoragePath?: string): Promise<void> {
  const [messages, files] = await Promise.all([
    getDocs(col(`contacts/${id}/messages`)),
    getDocs(col(`contacts/${id}/files`)),
  ])

  const storagePaths = new Set<string>()
  if (extraStoragePath) storagePaths.add(extraStoragePath)
  messages.docs.forEach((d) => {
    const p = d.get('mediaPath')
    if (typeof p === 'string' && p) storagePaths.add(p)
  })
  files.docs.forEach((d) => {
    const p = d.get('storagePath')
    if (typeof p === 'string' && p) storagePaths.add(p)
  })

  await Promise.all([...storagePaths].map(deleteStoragePath))

  const refs = [...messages.docs.map((d) => d.ref), ...files.docs.map((d) => d.ref)]
  for (let i = 0; i < refs.length; i += 450) {
    const batch = writeBatch(db)
    refs.slice(i, i + 450).forEach((r) => batch.delete(r))
    await batch.commit()
  }
}

/**
 * Fallback local de "Limpar conversa" (daemon indisponível): apaga mensagens, arquivos e
 * mídias, mantendo o contato e a foto. Sem daemon não há marcador anti-replay.
 */
export async function clearConversationLocal(id: string): Promise<void> {
  await purgeConversationDocs(id)
  await updateDoc(ref(`contacts/${id}`), { lastMessage: '', lastMessageAt: serverTimestamp() })
}

/** Apaga o contato e limpa subcoleções locais conhecidas (mensagens/arquivos) + foto. */
export async function deleteContact(id: string, photoPath?: string): Promise<void> {
  await purgeConversationDocs(id, photoPath)
  const batch = writeBatch(db)
  batch.delete(ref(`contacts/${id}`))
  await batch.commit()
}
