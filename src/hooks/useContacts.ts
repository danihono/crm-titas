import { addDoc, updateDoc, collection, query, orderBy, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { col, ref } from '../lib/paths'
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

/** Cria um contato e retorna o id do novo doc. */
export async function saveContact(form: NewContactForm): Promise<string> {
  const name = form.name.trim()
  const r = await addDoc(col('contacts'), {
    name,
    company: form.company || '—',
    initials: initialsOf(name) || '?',
    online: false,
    role: form.role || '—',
    email: form.email || '',
    phone: form.phone || '',
    whatsapp: form.whats || form.phone || '',
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
  await updateDoc(ref(`contacts/${id}`), {
    name,
    company: form.company || '—',
    initials: initialsOf(name) || '?',
    role: form.role || '—',
    email: form.email || '',
    phone: form.phone || '',
    whatsapp: form.whats || form.phone || '',
    nameSource: 'manual',
  })
}
