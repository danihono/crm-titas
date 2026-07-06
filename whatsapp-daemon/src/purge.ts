import { db } from './firebase.js'
import { logger } from './logger.js'
import { useFirestoreAuthState } from './authState.js'

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

  for (const c of allContacts.docs) {
    if (c.get('source') === 'whatsapp') {
      await db.recursiveDelete(c.ref) // remove o contato + subcoleções (messages/files)
      deletedContacts++
      continue
    }
    const waMsgs = await c.ref.collection('messages').where('channel', '==', 'whatsapp').get()
    for (let i = 0; i < waMsgs.size; i += 450) {
      const batch = db.batch()
      for (const m of waMsgs.docs.slice(i, i + 450)) batch.delete(m.ref)
      await batch.commit()
    }
    sweptMessages += waMsgs.size
  }

  logger.info({ uid, deletedContacts, sweptMessages }, 'conexão WhatsApp expurgada')
}
