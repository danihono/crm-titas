import { FieldValue } from 'firebase-admin/firestore'
import { bucket, db } from './firebase.js'
import { logger } from './logger.js'
import { useFirestoreAuthState } from './authState.js'
import { evictContactCache } from './messages.js'
import { setPurgeMarker } from './purgeMarkers.js'

/**
 * LGPD — expurga TODOS os dados espelhados de uma conexão em uma operação.
 * 1. limpa o auth persistido (creds + chaves do Signal);
 * 2. apaga os contatos auto-criados pelo WhatsApp (source == 'whatsapp') e suas mensagens;
 * 3. em contatos criados manualmente, apaga só as mensagens espelhadas (channel == 'whatsapp'),
 *    preservando o contato e suas mensagens não-WhatsApp.
 *
 * Nota: iteramos todos os contatos (em vez de `source != 'whatsapp'`) porque o '!=' do
 * Firestore não casa documentos SEM o campo `source` (o caso dos contatos manuais).
 */
export async function purgeConnection(uid: string): Promise<void> {
  const { clearAuth } = await useFirestoreAuthState(db, uid)
  await clearAuth()

  const contactsCol = db.collection('users').doc(uid).collection('contacts')
  const allContacts = await contactsCol.get()

  let deletedContacts = 0
  let sweptMessages = 0
  let deletedFiles = 0

  for (const c of allContacts.docs) {
    if (c.get('source') === 'whatsapp') {
      await bucket
        .deleteFiles({ prefix: `users/${uid}/contacts/${c.id}/`, force: true })
        .catch((err) => logger.warn({ err, uid, contactId: c.id }, 'falha ao apagar arquivos do contato WhatsApp'))
      await db.recursiveDelete(c.ref) // remove o contato + subcoleções (messages/files)
      deletedContacts++
      continue
    }
    const waMsgs = await c.ref.collection('messages').where('channel', '==', 'whatsapp').get()
    const mediaPaths = waMsgs.docs
      .map((m) => m.get('mediaPath'))
      .filter((path): path is string => typeof path === 'string' && path.length > 0)
    for (const mediaPath of mediaPaths) {
      await bucket
        .file(mediaPath)
        .delete({ ignoreNotFound: true })
        .then(() => {
          deletedFiles++
        })
        .catch((err) => logger.warn({ err, uid, mediaPath }, 'falha ao apagar mídia WhatsApp'))
    }
    for (let i = 0; i < waMsgs.size; i += 450) {
      const batch = db.batch()
      for (const m of waMsgs.docs.slice(i, i + 450)) batch.delete(m.ref)
      await batch.commit()
    }
    sweptMessages += waMsgs.size

    // Foto migrada do WhatsApp num contato manual: remove o arquivo e limpa os campos.
    if (c.get('photoSource') === 'whatsapp') {
      const photoPath = c.get('photoPath')
      if (typeof photoPath === 'string' && photoPath) {
        await bucket
          .file(photoPath)
          .delete({ ignoreNotFound: true })
          .then(() => {
            deletedFiles++
          })
          .catch((err) => logger.warn({ err, uid, photoPath }, 'falha ao apagar foto WhatsApp'))
      }
      await c.ref.set(
        { photoUrl: FieldValue.delete(), photoPath: FieldValue.delete(), photoSource: FieldValue.delete() },
        { merge: true },
      )
    }
  }

  logger.info({ uid, deletedContacts, sweptMessages, deletedFiles }, 'conexão WhatsApp expurgada')
}

/**
 * Expurgo TOTAL de um contato (ou só da conversa dele, com keepContact=true):
 * 1. grava o marcador de expurgo (replays antigos não ressuscitam a conversa);
 * 2. evita o contactCache (senão a próxima mensagem gravaria no doc apagado);
 * 3. Storage: varre por prefixo `users/{uid}/contacts/{id}/` — pega inclusive arquivos
 *    órfãos que nenhum doc referencia (keepContact preserva `profile/`, a foto);
 * 4. Firestore: recursiveDelete do contato inteiro, ou só das subcoleções
 *    messages/files + limpeza do preview quando keepContact.
 * Lança 'contact_not_found' se o contato não existe.
 */
export async function purgeContact(uid: string, contactId: string, keepContact: boolean): Promise<void> {
  const contactRef = db.collection('users').doc(uid).collection('contacts').doc(contactId)
  const snap = await contactRef.get()
  if (!snap.exists) throw new Error('contact_not_found')

  // Marcador por interlocutor (mesmo esquema de chave do contactCache). Contato sem
  // WhatsApp vinculado não tem o que marcar — o expurgo segue só para dados locais.
  const digits = String(snap.get('whatsappDigits') ?? '').replace(/\D/g, '')
  const waJid = typeof snap.get('waJid') === 'string' ? (snap.get('waJid') as string) : ''
  const digitsKey = digits || (waJid.endsWith('@lid') ? `lid:${waJid.split('@')[0]}` : '')
  if (digitsKey) await setPurgeMarker(uid, digitsKey, contactId)
  evictContactCache(uid, contactId)

  const prefix = `users/${uid}/contacts/${contactId}/`
  if (keepContact) {
    // Apaga tudo do contato no Storage MENOS a foto de perfil.
    const [files] = await bucket.getFiles({ prefix })
    for (const f of files) {
      if (f.name.startsWith(`${prefix}profile/`)) continue
      await f.delete({ ignoreNotFound: true }).catch((err) => logger.warn({ err, uid, file: f.name }, 'falha ao apagar arquivo da conversa'))
    }
    await db.recursiveDelete(contactRef.collection('messages'))
    await db.recursiveDelete(contactRef.collection('files'))
    await contactRef.set(
      {
        lastMessage: '',
        lastMessageAt: FieldValue.serverTimestamp(),
        historyImport: FieldValue.delete(),
      },
      { merge: true },
    )
    logger.info({ uid, contactId }, 'conversa do contato expurgada (contato mantido)')
    return
  }

  await bucket
    .deleteFiles({ prefix, force: true })
    .catch((err) => logger.warn({ err, uid, contactId }, 'falha ao apagar arquivos do contato'))
  await db.recursiveDelete(contactRef)
  logger.info({ uid, contactId }, 'contato expurgado por completo')
}
