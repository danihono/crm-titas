import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { db } from './firebase.js'
import { config } from './config.js'
import { logger } from './logger.js'

/**
 * Lease por sessão — a garantia de instância única.
 *
 * Dois processos segurando o MESMO auth fazem o WhatsApp deslogar os dois (e exigir QR
 * novo). No Cloud Run isso era coberto por `max-instances=1`; rodando self-hosted essa
 * garantia some, então ela passa a ser explícita: quem não detém a lease não abre socket.
 *
 * Guardada em `whatsappSessions/{uid}.lock` (mesmo doc do auth, subtree admin-only).
 */

/** Validade da lease. Uma instância que morrer sem soltar bloqueia por, no máximo, este tempo. */
const LEASE_TTL_MS = 90_000

/** Intervalo de renovação — 3× de folga dentro do TTL, para tolerar uma renovação falha. */
const RENEW_MS = 30_000

/**
 * uids cuja lease ESTA instância detém.
 *
 * Deliberadamente separado do `Map sessions` do sessionManager: um `close` recuperável
 * remove a sessão do Map mas a lease precisa ser MANTIDA durante o backoff (até 60s),
 * senão outra instância assumiria a sessão no meio de uma reconexão nossa.
 */
const held = new Set<string>()

let renewTimer: NodeJS.Timeout | null = null

function sessionRef(uid: string) {
  return db.collection('whatsappSessions').doc(uid)
}

function holderOf(snap: FirebaseFirestore.DocumentSnapshot): { holder?: string; until?: unknown } {
  return (snap.get('lock') ?? {}) as { holder?: string; until?: unknown }
}

/**
 * Tenta tomar (ou reafirmar) a lease do uid. `false` = outra instância a detém e ela
 * ainda não expirou — o chamador NÃO pode abrir o socket.
 *
 * Reafirmar a própria lease é sempre permitido: a reconexão pós-backoff volta a passar
 * por aqui e não pode ser barrada por si mesma.
 */
export async function acquireSessionLease(uid: string): Promise<boolean> {
  const ref = sessionRef(uid)
  const ok = await db.runTransaction(async (tx) => {
    const lock = holderOf(await tx.get(ref))
    const untilMs = lock.until instanceof Timestamp ? lock.until.toMillis() : 0
    if (lock.holder && lock.holder !== config.instanceId && untilMs > Date.now()) return false

    tx.set(
      ref,
      { lock: { holder: config.instanceId, until: Timestamp.fromMillis(Date.now() + LEASE_TTL_MS) } },
      { merge: true },
    )
    return true
  })

  if (ok) held.add(uid)
  else logger.info({ uid }, 'lease detida por outra instância — sessão não será aberta aqui')
  return ok
}

/** Estende a lease. `false` = perdemos o posto (outra instância assumiu). */
async function renewSessionLease(uid: string): Promise<boolean> {
  const ref = sessionRef(uid)
  return db.runTransaction(async (tx) => {
    const lock = holderOf(await tx.get(ref))
    if (lock.holder !== config.instanceId) return false
    tx.set(
      ref,
      { lock: { holder: config.instanceId, until: Timestamp.fromMillis(Date.now() + LEASE_TTL_MS) } },
      { merge: true },
    )
    return true
  })
}

/**
 * Solta a lease do uid. Só apaga se ainda formos o holder — nunca rouba a de outro.
 * Soltar no shutdown é o que permite reiniciar (ou trocar de máquina) sem esperar o TTL.
 */
export async function releaseSessionLease(uid: string): Promise<void> {
  held.delete(uid)
  try {
    await db.runTransaction(async (tx) => {
      const ref = sessionRef(uid)
      const lock = holderOf(await tx.get(ref))
      if (lock.holder !== config.instanceId) return
      tx.set(ref, { lock: FieldValue.delete() }, { merge: true })
    })
  } catch (err) {
    // Best-effort: se falhar, o TTL expira sozinho em LEASE_TTL_MS.
    logger.warn({ err, uid }, 'falha ao soltar a lease (expira pelo TTL)')
  }
}

export async function releaseAllLeases(): Promise<void> {
  await Promise.all([...held].map((uid) => releaseSessionLease(uid)))
}

/**
 * Renova em background todas as leases detidas. `onLost(uid)` é chamado quando a lease
 * foi tomada por outra instância — o chamador DEVE fechar o socket local (com `end`,
 * nunca `logout`) para não virar duplo-holder.
 *
 * `onLost` é injetado para este módulo não importar o sessionManager (evita ciclo).
 */
export function startLeaseRenewer(onLost: (uid: string) => void): void {
  if (renewTimer) return
  renewTimer = setInterval(() => {
    void (async () => {
      for (const uid of [...held]) {
        try {
          if (await renewSessionLease(uid)) continue
          held.delete(uid)
          logger.error({ uid }, 'lease perdida — outra instância assumiu esta sessão')
          onLost(uid)
        } catch (err) {
          // Falha transitória de rede: mantém a lease e tenta de novo no próximo ciclo
          // (o TTL dá 3 ciclos de folga antes de outra instância poder assumir).
          logger.warn({ err, uid }, 'renovação de lease falhou; nova tentativa no próximo ciclo')
        }
      }
    })()
  }, RENEW_MS)
  logger.info({ ttlMs: LEASE_TTL_MS, renewMs: RENEW_MS, instanceId: config.instanceId }, 'renovador de leases iniciado')
}

export function stopLeaseRenewer(): void {
  if (!renewTimer) return
  clearInterval(renewTimer)
  renewTimer = null
}
