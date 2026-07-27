import { FieldValue } from 'firebase-admin/firestore'
import { db } from './firebase.js'
import { config } from './config.js'
import { logger } from './logger.js'

/**
 * Sinal de vida do daemon, em `whatsappDaemon/heartbeat`.
 *
 * Com o transporte HTTP, um daemon fora do ar dava erro de conexão na hora e a UI caía no
 * fallback local. Numa fila, o comando simplesmente fica parado — então o front precisa de
 * outro jeito de saber que ninguém está do outro lado.
 *
 * Um doc GLOBAL (não por tenant) de propósito: são ~2.880 writes/dia no total contra 20k
 * do free tier, em vez de multiplicar isso pelo número de tenants. E `whatsappStatus/{uid}`
 * não serviria — ele só muda em transição de estado e nem existe para quem nunca conectou.
 *
 * É legível por qualquer usuário autenticado: NÃO coloque hostname, contagem de sessões
 * nem nada que vaze entre tenants aqui. Diagnóstico fica no log.
 */

const BEAT_MS = 30_000

let timer: NodeJS.Timeout | null = null

async function beat(): Promise<void> {
  await db
    .collection('whatsappDaemon')
    .doc('heartbeat')
    .set({ instanceId: config.instanceId, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
}

export function startHeartbeat(): void {
  if (timer) return
  beat().catch((err) => logger.warn({ err }, 'heartbeat inicial falhou'))
  timer = setInterval(() => {
    beat().catch((err) => logger.warn({ err }, 'heartbeat falhou'))
  }, BEAT_MS)
  // ATENÇÃO: sem .unref() de propósito. Sem o servidor HTTP, é este timer (junto do
  // listener de comandos) que mantém o event loop vivo — com unref() o processo sairia
  // sozinho logo depois do boot.
  logger.info({ beatMs: BEAT_MS }, 'heartbeat iniciado')
}

export function stopHeartbeat(): void {
  if (!timer) return
  clearInterval(timer)
  timer = null
}
