import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import {
  campaignKeyDe, dealIdDoLead, ehPago, hashesPessoais, type LeadNormalizado,
} from './normalizar'

/** Mesmo id de src/lib/theme.ts (LEADS_BOARD_ID) e a primeira etapa de LEADS_COLUMNS. */
export const LEADS_BOARD_ID = 'leads'
export const COLUNA_ENTRADA = 'novo'

/** Valor de `source` no contato criado a partir de anúncio — nunca 'whatsapp' (expurgo LGPD). */
const ORIGEM_CONTATO: Record<LeadNormalizado['channel'], string> = {
  meta: 'meta_ads',
  google: 'google_ads',
  site: 'site',
}

function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/)
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || '?'
}

/** Tira chaves vazias: o Firestore guarda `undefined` como erro, e string vazia é ruído. */
function semVazios<T extends Record<string, unknown>>(o: T): Partial<T> {
  return Object.fromEntries(
    // Só objeto PLANO vazio sai — o serverTimestamp() também é objeto sem chaves.
    Object.entries(o).filter(([, v]) => v !== undefined && v !== ''
      && !(v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype && Object.keys(v).length === 0)),
  ) as Partial<T>
}

/** O que fica gravado em `deals/{id}.source` — só o Admin SDK escreve (ver firestore.rules). */
export function origemDoLead(lead: LeadNormalizado): Record<string, unknown> {
  return semVazios({
    channel: lead.channel,
    campaignKey: campaignKeyDe(lead),
    campaignId: lead.campaignId,
    campaignName: lead.campaignName ?? lead.utm?.campaign,
    adsetId: lead.adsetId,
    adsetName: lead.adsetName,
    adId: lead.adId,
    adName: lead.adName,
    formId: lead.formId,
    leadId: lead.leadId,
    gclid: lead.gclid,
    fbclid: lead.fbclid,
    utm: lead.utm ? semVazios({ ...lead.utm }) : undefined,
    landingUrl: lead.landingUrl,
    fields: lead.fields,
    // Hash, não o dado: é só o que a conversão de volta precisa, e o contato pode ser
    // editado ou apagado depois sem a conversão perder a referência.
    hashes: semVazios(hashesPessoais(lead.email, lead.phone)),
    test: lead.isTest ? true : undefined,
    receivedAt: FieldValue.serverTimestamp(),
  })
}

/** Contato que já existe com este telefone ou e-mail — o lead entra na conversa dele. */
async function contatoExistente(uid: string, lead: LeadNormalizado): Promise<string | null> {
  const col = getFirestore().collection(`users/${uid}/contacts`)
  if (lead.phone) {
    for (const campo of ['whatsappDigits', 'phone', 'whatsapp']) {
      const s = await col.where(campo, '==', lead.phone).limit(1).get()
      if (!s.empty) return s.docs[0].id
    }
  }
  if (lead.email) {
    const s = await col.where('email', '==', lead.email).limit(1).get()
    if (!s.empty) return s.docs[0].id
  }
  return null
}

export interface ResultadoIngestao {
  created: boolean
  dealId: string
  contactId?: string
}

/**
 * Lead de anúncio → contato + card na coluna "Novo lead" do quadro Leads.
 *
 * Idempotente: o id do card vem do id do lead na origem, então o mesmo lead entregue duas
 * vezes (retry do webhook, poll que se sobrepõe) cai no `exists` e para.
 */
export async function ingerirLead(uid: string, lead: LeadNormalizado): Promise<ResultadoIngestao> {
  const db = getFirestore()
  const dealId = dealIdDoLead(lead)
  const dealRef = db.doc(`users/${uid}/deals/${dealId}`)

  // A busca do contato fica FORA da transação: são até quatro consultas, e transação do
  // Admin SDK trava o que lê. O pior caso de corrida é um contato duplicado, não um card.
  if ((await dealRef.get()).exists) return { created: false, dealId }
  const existente = await contatoExistente(uid, lead)

  const nome = lead.name || (lead.email ? lead.email.split('@')[0] : lead.phone ? `+${lead.phone}` : 'Lead')
  const empresa = lead.company || nome

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(dealRef)
    if (snap.exists) return { created: false, dealId }

    let contactId = existente ?? undefined
    if (!contactId) {
      const cRef = db.collection(`users/${uid}/contacts`).doc(`lead_${dealId}`.slice(0, 140))
      tx.set(cRef, {
        name: nome,
        company: lead.company || '—',
        initials: iniciais(nome),
        online: false,
        role: '—',
        email: lead.email,
        phone: lead.phone,
        whatsapp: lead.phone,
        // Com o mesmo formato que o daemon usa: a primeira mensagem do WhatsApp desse
        // número cai NESTE contato, e não num contato automático novo.
        whatsappDigits: lead.phone,
        status: 'Lead',
        nameSource: 'manual',
        source: ORIGEM_CONTATO[lead.channel],
        lastMessage: '',
        unreadCount: 0,
        tagIds: [],
        createdAt: FieldValue.serverTimestamp(),
      })
      contactId = cRef.id
    }

    tx.set(dealRef, {
      company: empresa,
      contact: nome,
      value: 0,
      initials: iniciais(nome),
      tag: ehPago(lead) ? 'Ads' : 'Inbound',
      contactId,
      boardId: LEADS_BOARD_ID,
      columnId: COLUNA_ENTRADA,
      // Negativo e decrescente no tempo: o lead mais novo nasce no TOPO da coluna, e o
      // `nextOrder` do cliente (máximo + 1) continua funcionando para quem arrasta depois.
      order: -Math.floor(Date.now() / 1000),
      createdAt: FieldValue.serverTimestamp(),
      reachedAt: { [COLUNA_ENTRADA]: FieldValue.serverTimestamp() },
      source: origemDoLead(lead),
    })
    return { created: true, dealId, contactId }
  })
}
