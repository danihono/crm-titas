import { config } from './config.js'
import { logger } from './logger.js'
import { createHttpServer } from './http.js'
import { rehydrateAll } from './boot.js'
import { endAllSessions } from './sessionManager.js'

const app = createHttpServer()

const server = app.listen(config.port, () => {
  logger.info(
    { port: config.port, instanceId: config.instanceId, region: config.region },
    'whatsapp-daemon ouvindo',
  )
  // Rehidrata DEPOIS do HTTP subir, para o probe de startup do Cloud Run passar primeiro.
  rehydrateAll().catch((err) => logger.error({ err }, 'rehydrateAll falhou'))
})

let shuttingDown = false
function shutdown(signal: string): void {
  if (shuttingDown) return
  shuttingDown = true
  logger.info({ signal }, 'encerrando')
  server.close()
  // sock.end() fecha o WebSocket MAS mantém o device vinculado — nunca deslogar no shutdown.
  endAllSessions()
  // Dá um instante para os writes em voo do Firestore concluírem, então sai limpo.
  setTimeout(() => process.exit(0), 2000)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
