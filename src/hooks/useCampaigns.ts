import {
  addDoc, collection, deleteDoc, getDocs, orderBy, query, serverTimestamp,
  updateDoc, writeBatch,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { col, ref } from '../lib/paths'
import { campaignFromDoc, campaignTargetFromDoc } from '../lib/converters'
import { convOf } from './useConversations'
import { useCollection } from './useCollection'
import type { Campaign, CampaignTarget, Contact } from '../types'

/**
 * Tetos de disparo. Baixos de propósito: a conexão é Baileys (WhatsApp Web, não-oficial),
 * onde volume alto e cadência regular são exatamente o que dispara banimento. O daemon
 * ainda soma a estes limites a cota diária e o aquecimento.
 */
export const RATE_MIN = 5
export const RATE_MAX = 40
export const RATE_DEFAULT = 15

export function useCampaigns() {
  return useCollection<Campaign>(
    (u) => query(collection(db, `users/${u}/campaigns`), orderBy('createdAt', 'desc')),
    campaignFromDoc,
    [],
  )
}

export function useCampaignTargets(campaignId: string | null) {
  return useCollection<CampaignTarget>(
    (u) => (campaignId ? collection(db, `users/${u}/campaigns/${campaignId}/targets`) : null),
    campaignTargetFromDoc,
    [campaignId],
  )
}

function phoneDigits(c: Contact): string {
  return String(c.whatsapp || c.phone || '').replace(/\D/g, '')
}

/**
 * Quem entra no público: contatos com telefone, sem opt-out e com alguma das etiquetas
 * escolhidas (sem etiqueta escolhida = todos). A etiqueta é lida do atendimento — é onde
 * ela é aplicada na tela de Contatos.
 */
export function audienceFor(contacts: Contact[], tagIds: string[]): Contact[] {
  return contacts.filter((c) => {
    if (c.optOut) return false
    if (!phoneDigits(c)) return false
    if (tagIds.length === 0) return true
    const applied = convOf(c).tagIds
    return tagIds.some((t) => applied.includes(t))
  })
}

export interface NewCampaign {
  name: string
  text: string
  tagIds: string[]
  ratePerHour: number
  respectBusinessHours: boolean
}

/**
 * Cria a campanha em RASCUNHO com a lista de destinatários já congelada.
 *
 * Congelar aqui (em vez de resolver o filtro na hora do envio) é o que torna o disparo
 * auditável: dá para ver exatamente quem vai receber antes de apertar o play, e um
 * contato etiquetado no meio do envio não entra numa campanha que já foi revisada.
 */
export async function createCampaign(
  form: NewCampaign,
  audience: Contact[],
  createdBy: string,
): Promise<string> {
  const r = await addDoc(col('campaigns'), {
    name: form.name.trim(),
    text: form.text.trim(),
    tagIds: form.tagIds,
    status: 'rascunho',
    ratePerHour: Math.min(RATE_MAX, Math.max(RATE_MIN, form.ratePerHour)),
    respectBusinessHours: form.respectBusinessHours,
    total: audience.length,
    sent: 0,
    failed: 0,
    skipped: 0,
    createdBy,
    createdAt: serverTimestamp(),
  })

  // O id do destinatário É o id do contato: reprocessar a criação não duplica ninguém.
  for (let i = 0; i < audience.length; i += 450) {
    const batch = writeBatch(db)
    audience.slice(i, i + 450).forEach((c) => {
      batch.set(ref(`campaigns/${r.id}/targets/${c.id}`), {
        contactId: c.id,
        name: c.name,
        phone: phoneDigits(c),
        status: 'pendente',
      })
    })
    await batch.commit()
  }

  return r.id
}

export async function startCampaign(id: string): Promise<void> {
  await updateDoc(ref(`campaigns/${id}`), {
    status: 'enviando',
    startedAt: serverTimestamp(),
    // Zera a espera: o daemon manda o primeiro assim que pegar a campanha.
    nextSendAt: null,
    lastError: '',
  })
}

export async function pauseCampaign(id: string): Promise<void> {
  await updateDoc(ref(`campaigns/${id}`), { status: 'pausada' })
}

export async function deleteCampaign(id: string): Promise<void> {
  const targets = await getDocs(col(`campaigns/${id}/targets`))
  for (let i = 0; i < targets.docs.length; i += 450) {
    const batch = writeBatch(db)
    targets.docs.slice(i, i + 450).forEach((d) => batch.delete(d.ref))
    await batch.commit()
  }
  await deleteDoc(ref(`campaigns/${id}`))
}

/** Marca/desmarca o contato como opt-out (não recebe campanha nenhuma). */
export async function setContactOptOut(contactId: string, optOut: boolean): Promise<void> {
  await updateDoc(ref(`contacts/${contactId}`), { optOut })
}

/**
 * Quanto tempo, no melhor caso, o disparo inteiro leva. Serve para a tela dizer a
 * verdade antes do play: campanha lenta é escolha, não defeito, mas quem aperta o
 * botão precisa saber que são horas e não minutos.
 */
export function estimateHours(total: number, ratePerHour: number): number {
  if (ratePerHour <= 0) return 0
  return total / ratePerHour
}
