import pLimit from 'p-limit'
import { db } from './firebase.js'
import { logger } from './logger.js'
import { config } from './config.js'
import { startSession } from './sessionManager.js'

/**
 * Rehidratação no boot: recria silenciosamente (sem QR) cada sessão que estava
 * conectada antes do restart. Concorrência limitada + jitter evitam thundering-herd
 * de handshakes (e rate-limit do WhatsApp) quando há dezenas de números.
 * Sessões cuja lease está com outra instância são puladas (ver lease.ts).
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
          // Outra instância já segura esta sessão — situação esperada (não é falha).
          if (err instanceof Error && err.message === 'session_lease_taken') {
            logger.info({ uid: doc.id }, 'rehidratação pulada: sessão detida por outra instância')
            return
          }
          logger.error({ err, uid: doc.id }, 'rehidratação falhou')
        }
      }),
    ),
  )
}
