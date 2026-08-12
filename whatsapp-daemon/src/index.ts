import { config } from './config.js'
import { logger } from './logger.js'
import { db } from './firebase.js'
import { rehydrateAll } from './boot.js'
import { endAllSessions, stopSession } from './sessionManager.js'
import { writeStatus } from './status.js'
import { startScheduledMessageWorker, stopScheduledMessageWorker } from './scheduler.js'
import { startCommandWorker, stopCommandWorker } from './commands.js'
import { startHeartbeat, stopHeartbeat } from './heartbeat.js'
import { startLeaseRenewer, stopLeaseRenewer, releaseAllLeases } from './lease.js'
import { startHealthServer, stopHealthServer } from './health.js'
import { probeStorageWrite } from './storage.js'

logger.info(
  { instanceId: config.instanceId, region: config.region, healthPort: config.httpPort || null },
  'whatsapp-daemon iniciando',
)

// Lease perdida = outra instância assumiu esta sessão. Fecha o socket local mantendo o
// aparelho vinculado (`end`, NUNCA `logout`): dois processos no mesmo auth fazem o
// WhatsApp deslogar os dois e exigir QR novo.
startLeaseRenewer((uid) => {
  stopSession(uid, 'end').catch((err) => logger.error({ err, uid }, 'falha ao fechar sessão com lease perdida'))
  writeStatus(db, uid, { status: 'disconnected', lastError: 'lease_lost' }).catch(() => {})
})

startCommandWorker()
startHeartbeat()
startScheduledMessageWorker()
if (config.httpPort) startHealthServer(config.httpPort)

// Sonda o Storage logo no boot. Sem isto a falha é MUDA: o daemon sobe, o texto continua
// chegando (Firestore é outra permissão) e só a mídia some — o sintoma aparece dias depois
// parecendo problema do WhatsApp. Não bloqueia a subida; o veredito vai para o heartbeat.
probeStorageWrite().catch((err) => logger.error({ err }, 'preflight do Storage não pôde rodar'))

// Reabre as sessões que estavam conectadas antes do restart — silencioso, sem QR.
rehydrateAll().catch((err) => logger.error({ err }, 'rehydrateAll falhou'))

let shuttingDown = false

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  logger.info({ signal }, 'encerrando')

  stopCommandWorker()
  stopHeartbeat()
  stopScheduledMessageWorker()
  stopLeaseRenewer()
  stopHealthServer()

  // sock.end() fecha o WebSocket MAS mantém o device vinculado — nunca deslogar no shutdown.
  endAllSessions()

  // Soltar as leases é o que permite reiniciar (ou trocar de máquina) sem esperar o TTL
  // de 90s. Com teto de 3s para não pendurar o shutdown se o Firestore estiver lento.
  await Promise.race([releaseAllLeases(), new Promise((r) => setTimeout(r, 3000))])
  process.exit(0)
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
