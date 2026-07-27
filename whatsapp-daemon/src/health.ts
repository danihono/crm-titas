import { createServer, type Server } from 'node:http'
import { config } from './config.js'
import { logger } from './logger.js'
import { sessionCount } from './sessionManager.js'

/**
 * `/healthz` opcional — só sobe quando `WA_HTTP_PORT` está definido.
 *
 * O daemon NÃO precisa de porta para funcionar (o canal com o CRM é a fila no Firestore).
 * Isto existe apenas para supervisão local: systemd/NSSM watchdog, Uptime Kuma, ou uma
 * olhada rápida em `curl localhost:8081/healthz` ao depurar no PC.
 *
 * `node:http` puro para não reintroduzir o Express como dependência.
 */

let server: Server | null = null

export function startHealthServer(port: number): void {
  if (server) return
  server = createServer((req, res) => {
    if (req.url?.split('?')[0] !== '/healthz') {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        ok: true,
        sessions: sessionCount(),
        instanceId: config.instanceId,
        uptimeSec: Math.round(process.uptime()),
      }),
    )
  })
  // Só loopback: nada deste processo deve ficar exposto na rede.
  server.listen(port, '127.0.0.1', () => logger.info({ port }, '/healthz ouvindo em 127.0.0.1'))
  server.on('error', (err) => logger.error({ err, port }, 'servidor de health falhou'))
}

export function stopHealthServer(): void {
  if (!server) return
  server.close()
  server = null
}
