import { FieldValue, Timestamp, type DocumentReference, type WriteBatch } from 'firebase-admin/firestore'
import { db } from './firebase.js'
import { logger } from './logger.js'

/**
 * Reabre (ou abre) o ciclo de atendimento de um contato quando chega mensagem NOVA dele.
 *
 * É o espelho, no servidor, do que a tela de Contatos faz: manter `conv` no doc do
 * contato e um registro em users/{uid}/conversations para os relatórios. Precisa
 * acontecer aqui — se dependesse de alguém abrir o app, uma conversa reaberta durante a
 * madrugada só apareceria na fila quando alguém entrasse, e nunca no relatório do dia.
 *
 * Custa UMA leitura do contato por mensagem recebida, e é isso que compramos com ela:
 * um estado de fila que não depende de haver um navegador aberto.
 */
export async function reopenConversationOnIncoming(
  uid: string,
  contactRef: DocumentReference,
  fallbackName: string,
  sentAt: Timestamp,
  batch: WriteBatch,
): Promise<void> {
  try {
    const snap = await contactRef.get()
    const conv = (snap.get('conv') ?? null) as Record<string, unknown> | null
    const contactName = String(snap.get('name') ?? '') || fallbackName
    const status = typeof conv?.status === 'string' ? conv.status : null
    const recordId = typeof conv?.recordId === 'string' ? conv.recordId : ''

    // Já existe ciclo aberto: só volta de "esperando" para "entrada" — o cliente
    // respondeu, então a conversa deixou de estar parada aguardando ele.
    if (recordId && status && status !== 'finalizado') {
      if (status === 'esperando') batch.set(contactRef, { conv: { status: 'entrada' } }, { merge: true })
      return
    }

    // O responsável e o setor do ciclo anterior são herdados de propósito: quem já
    // atendeu esse cliente costuma ser quem continua, e cair na fila sem dono a cada
    // retorno faria o time perder o histórico de quem estava com ele.
    const assignedTo = typeof conv?.assignedTo === 'string' ? conv.assignedTo : ''
    const assignedName = typeof conv?.assignedName === 'string' ? conv.assignedName : ''
    const sectorId = typeof conv?.sectorId === 'string' ? conv.sectorId : ''

    const recordRef = db.collection('users').doc(uid).collection('conversations').doc()
    batch.set(recordRef, {
      contactId: contactRef.id,
      contactName,
      assignedTo,
      assignedName,
      sectorId,
      // Etiquetas NÃO são herdadas: elas classificam o atendimento que terminou.
      tagIds: [],
      openedAt: sentAt,
      firstResponseAt: null,
      closedAt: null,
      closedBy: '',
      reopened: !!recordId,
    })
    batch.set(
      contactRef,
      {
        conv: {
          status: 'entrada',
          recordId: recordRef.id,
          assignedTo,
          assignedName,
          sectorId,
          tagIds: [],
          openedAt: sentAt,
          firstResponseAt: null,
          closedAt: null,
          closedBy: '',
        },
      },
      { merge: true },
    )
  } catch (err) {
    // Métrica de atendimento não pode derrubar o espelhamento da mensagem.
    logger.warn({ err, uid, contactId: contactRef.id }, 'falha ao reabrir atendimento')
  }
}

/** Marca a primeira resposta da equipe no ciclo aberto, se ainda não houver uma. */
export async function markFirstResponseOnOutgoing(
  uid: string,
  contactRef: DocumentReference,
  sentAt: Timestamp,
): Promise<void> {
  try {
    const snap = await contactRef.get()
    const conv = (snap.get('conv') ?? null) as Record<string, unknown> | null
    const recordId = typeof conv?.recordId === 'string' ? conv.recordId : ''
    if (!recordId || conv?.firstResponseAt) return
    if (conv?.status === 'finalizado') return

    const batch = db.batch()
    batch.set(contactRef, { conv: { firstResponseAt: sentAt } }, { merge: true })
    batch.set(
      db.collection('users').doc(uid).collection('conversations').doc(recordId),
      { firstResponseAt: sentAt },
      { merge: true },
    )
    await batch.commit()
  } catch (err) {
    logger.warn({ err, uid, contactId: contactRef.id }, 'falha ao marcar primeira resposta')
  }
}

/**
 * Apaga o atendimento de um contato: o estado corrente e o histórico de ciclos.
 *
 * Faz parte do expurgo (LGPD) — apagar as mensagens e deixar para trás quem atendeu,
 * quando e com que etiquetas continuaria sendo dado sobre a pessoa.
 * `keepContact` diz se o doc do contato sobrevive e só precisa perder o mapa `conv`.
 */
export async function purgeConversationData(
  uid: string,
  contactId: string,
  keepContact: boolean,
): Promise<void> {
  try {
    const records = await db
      .collection('users').doc(uid).collection('conversations')
      .where('contactId', '==', contactId)
      .get()

    for (let i = 0; i < records.docs.length; i += 450) {
      const batch = db.batch()
      records.docs.slice(i, i + 450).forEach((d) => batch.delete(d.ref))
      await batch.commit()
    }

    if (keepContact) {
      const contactRef = db.collection('users').doc(uid).collection('contacts').doc(contactId)
      await contactRef.set({ conv: FieldValue.delete() }, { merge: true })
    }
  } catch (err) {
    logger.warn({ err, uid, contactId }, 'falha ao expurgar dados de atendimento')
  }
}
