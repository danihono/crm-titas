import pLimit from 'p-limit'
import { db } from './firebase.js'
import { logger } from './logger.js'
import { config } from './config.js'
import { startSession } from './sessionManager.js'

/**
 * Rehidratação no boot: recria silenciosamente (sem QR) cada sessão que estava
 * conectada antes do restart. Concorrência limitada + jitter evitam thundering-herd
 * de handshakes (e rate-limit do WhatsApp) quando há dezenas de números.
 * Chamar SÓ depois que o servidor HTTP já estiver ouvindo em $PORT.
 */
export async function rehydrateAll(): Promise<void> {
  const snap = await db
    .collection('whatsappSessions')
    .where('desiredState', '==', 'connected')
    .get()

  if (snap.empty) {
    logger.info('rehidratação: nenhuma sessão conectada')
    return
  }

  logger.info({ count: snap.size }, 'rehidratando sessões')
  const limit = pLimit(config.rehydrateConcurrency)
  await Promise.all(
    snap.docs.map((doc) =>
      limit(async () => {
        await new Promise((r) => setTimeout(r, Math.random() * 500)) // stagger + jitter
        try {
          await startSession(doc.id)
        } catch (err) {
          logger.error({ err, uid: doc.id }, 'rehidratação falhou')
        }
      }),
    ),
  )
}
