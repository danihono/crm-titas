import {
  addDoc, arrayRemove, arrayUnion, collection, orderBy, query, serverTimestamp,
  setDoc, updateDoc, where,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { col, ref } from '../lib/paths'
import { conversationFromDoc } from '../lib/converters'
import { useCollection } from './useCollection'
import type { Contact, ConversationRecord, ConvState, ConvStatus } from '../types'

/** Estado de atendimento de um contato que ainda não passou pelos módulos novos. */
export const emptyConv: ConvState = {
  status: 'entrada',
  recordId: '',
  assignedTo: '',
  assignedName: '',
  sectorId: '',
  tagIds: [],
}

export function convOf(c: Contact | undefined): ConvState {
  return c?.conv ?? emptyConv
}

/**
 * Histórico de atendimentos abertos no período (para os Relatórios).
 * Filtra por `openedAt` — o mesmo doc é atualizado ao finalizar, então uma conversa
 * aberta ontem e fechada hoje aparece no dia em que começou, como no Umbler.
 */
export function useConversations(from: Date, to: Date) {
  return useCollection<ConversationRecord>(
    (uid) =>
      query(
        collection(db, `users/${uid}/conversations`),
        where('openedAt', '>=', from),
        where('openedAt', '<=', to),
        orderBy('openedAt', 'desc'),
      ),
    conversationFromDoc,
    [from.getTime(), to.getTime()],
  )
}

/**
 * Abre um ciclo de atendimento para o contato, se ainda não houver um.
 *
 * Devolve o id do doc de histórico. `closedAt: null` (e não campo ausente) é
 * deliberado: é o que permite a consulta de conversas em aberto — o Firestore omite
 * da query todo doc que não tem o campo do filtro.
 */
export async function ensureConversation(contact: Contact): Promise<string> {
  const conv = convOf(contact)
  if (conv.recordId && conv.status !== 'finalizado') return conv.recordId

  const r = await addDoc(col('conversations'), {
    contactId: contact.id,
    contactName: contact.name,
    assignedTo: conv.assignedTo,
    assignedName: conv.assignedName,
    sectorId: conv.sectorId,
    tagIds: conv.tagIds,
    openedAt: serverTimestamp(),
    firstResponseAt: null,
    closedAt: null,
    closedBy: '',
  })
  // O mapa é montado campo a campo, e não espalhando `conv`: um `undefined` vindo de um
  // contato sem histórico faria o Firestore recusar a escrita inteira.
  await setDoc(
    ref(`contacts/${contact.id}`),
    {
      conv: {
        status: 'entrada',
        recordId: r.id,
        assignedTo: conv.assignedTo,
        assignedName: conv.assignedName,
        sectorId: conv.sectorId,
        tagIds: conv.tagIds,
        openedAt: serverTimestamp(),
        firstResponseAt: null,
        closedAt: null,
        closedBy: '',
      },
    },
    { merge: true },
  )
  return r.id
}

/** Aplica um patch no contato e espelha no doc de histórico do ciclo atual. */
async function patchConv(
  contact: Contact,
  patch: Record<string, unknown>,
  recordPatch: Record<string, unknown> = patch,
): Promise<void> {
  const recordId = await ensureConversation(contact)
  const convPatch: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(patch)) convPatch[`conv.${k}`] = v
  await updateDoc(ref(`contacts/${contact.id}`), convPatch)
  if (Object.keys(recordPatch).length) {
    await updateDoc(ref(`conversations/${recordId}`), recordPatch)
  }
}

export async function assignConversation(
  contact: Contact,
  memberUid: string,
  memberName: string,
): Promise<void> {
  await patchConv(contact, { assignedTo: memberUid, assignedName: memberName })
}

export async function setConversationSector(contact: Contact, sectorId: string): Promise<void> {
  await patchConv(contact, { sectorId })
}

export async function setConversationStatus(contact: Contact, status: ConvStatus): Promise<void> {
  if (status === 'finalizado') throw new Error('Use closeConversation para finalizar.')
  await patchConv(contact, { status }, {})
}

export async function toggleConversationTag(contact: Contact, tagId: string): Promise<void> {
  const has = convOf(contact).tagIds.includes(tagId)
  const op = has ? arrayRemove(tagId) : arrayUnion(tagId)
  await patchConv(contact, { tagIds: op })
}

/**
 * Marca a primeira resposta nossa depois que o cliente escreveu — base do tempo de
 * primeira resposta no relatório. Best-effort: é métrica, e falhar aqui não pode
 * impedir a mensagem de sair.
 */
export async function markFirstResponse(contact: Contact): Promise<void> {
  const conv = convOf(contact)
  if (conv.firstResponseAt) return
  try {
    const recordId = await ensureConversation(contact)
    const now = serverTimestamp()
    await updateDoc(ref(`contacts/${contact.id}`), { 'conv.firstResponseAt': now })
    await updateDoc(ref(`conversations/${recordId}`), { firstResponseAt: now })
  } catch (err) {
    console.error('[markFirstResponse]', err)
  }
}

/** Finaliza o atendimento e fecha o ciclo no histórico. */
export async function closeConversation(
  contact: Contact,
  byUid: string,
  byName: string,
): Promise<void> {
  const recordId = await ensureConversation(contact)
  const now = serverTimestamp()
  await updateDoc(ref(`contacts/${contact.id}`), {
    'conv.status': 'finalizado',
    'conv.closedAt': now,
    'conv.closedBy': byUid,
  })
  const conv = convOf(contact)
  await updateDoc(ref(`conversations/${recordId}`), {
    closedAt: now,
    closedBy: byName || byUid,
    assignedTo: conv.assignedTo,
    assignedName: conv.assignedName,
    sectorId: conv.sectorId,
    tagIds: conv.tagIds,
  })
}

/**
 * Reabre: o ciclo anterior fica fechado no histórico e um NOVO é criado.
 * Empilhar reaberturas no mesmo registro estragaria o tempo de finalização.
 */
export async function reopenConversation(contact: Contact): Promise<void> {
  const conv = convOf(contact)
  // Solta o vínculo com o ciclo anterior (que segue fechado no histórico) — com
  // recordId vazio, ensureConversation abre um registro novo.
  const fresh: Contact = { ...contact, conv: { ...conv, recordId: '' } }
  await ensureConversation(fresh)
}
