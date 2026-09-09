import pLimit from 'p-limit'
import {
  FieldValue,
  Timestamp,
  type DocumentReference,
  type Query,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore'
import { db } from './firebase.js'
import { config } from './config.js'
import { logger } from './logger.js'
import { actions, isWaCommandType, CommandError, type WaCommandType } from './actions.js'
import { ehDonoDoSistema, isAssistantUid } from './assistant.js'

/**
 * Dispatcher da fila de comandos — o canal Frontend → daemon.
 *
 * Substitui o servidor HTTP: o CRM escreve um doc em `waCommands/{uid}/queue/{id}` e o
 * daemon reage por listener. Com isso o processo precisa apenas de INTERNET DE SAÍDA —
 * nenhuma porta aberta, nenhum TLS, nenhum domínio — e roda atrás de qualquer NAT.
 *
 * AUTORIZAÇÃO — duas camadas, e a segunda não é redundante:
 *
 * 1. O TENANT vem do PATH, nunca dos dados do doc. As rules garantem que só um membro
 *    ativo daquele ambiente escreveu ali.
 * 2. O PAPEL de quem pediu é reconferido AQUI, contra o Firestore, para os comandos
 *    destrutivos. Isso não duplica a rule: este processo usa Admin SDK e IGNORA as rules.
 *    Se um dia algo escrever na fila por outro caminho — um script, uma função, uma rule
 *    afrouxada por engano —, purgar e desconectar continuam exigindo gestor.
 *
 * A fila mora numa coleção de TOPO por causa da união permissiva das rules: enquanto
 * ficava em users/{uid}/waCommands, a regra ampla de escrita do tenant a alcançava e
 * nenhuma condição aninhada conseguia impedir um atendente de enfileirar um expurgo.
 */

/** Teto de execução por tipo. Sem isto, uma chamada pendurada do Baileys travaria a fila do uid. */
const CMD_TIMEOUT_MS: Record<WaCommandType, number> = {
  'session.consent': 15_000,
  'session.connect': 45_000,
  'session.disconnect': 300_000, // pode incluir expurgo completo
  'message.send': 45_000,
  'message.sendMedia': 120_000, // baixa do Storage + sobe ao WhatsApp
  'history.fetch': 60_000,
  'contact.purge': 300_000,
  'contact.photoRefresh': 90_000, // busca multi-candidato LID
  'contact.mediaRetry': 60_000, // só enumera e dispara; o download roda em segundo plano
}

/** Folga entre o timeout do comando e a expiração do lock (evita reclaim de algo vivo). */
const LOCK_GRACE_MS = 30_000
const MAX_ATTEMPTS = 2

/** Backstop de polling: stream gRPC morre calado atrás de NAT doméstico. */
const POLL_MS = 60_000
const SWEEP_MS = 600_000
/** Comandos finalizados viram lixo depois disto (o TTL nativo do Firestore é o primário). */
const TERMINAL_TTL_MS = 3_600_000
/** 'running' mais velho que isto, com lock expirado, é órfão de um processo que morreu. */
const RUNNING_ORPHAN_MS = 600_000

const RATE_LIMIT_MAX = 30
const RATE_LIMIT_WINDOW_MS = 60_000

/**
 * Teto de comandos pendentes por ambiente.
 *
 * A janela de rate-limit acima vive em MEMÓRIA: zera a cada restart e não soma entre
 * instâncias — ela protege o daemon de ser afogado, não a conta do Firestore de crescer.
 * Nada impede um cliente de gravar dezenas de milhares de docs pendentes: cada um é uma
 * escrita cobrada, e a fila drena 50 por vez. Aqui a varredura corta o excedente, mantendo
 * os mais antigos (que são os legítimos, por ordem de chegada).
 *
 * Generoso de propósito: o uso normal tem punhados de comandos pendentes, nunca centenas.
 */
const MAX_PENDENTES_POR_AMBIENTE = 200

const LISTEN_RETRY_MIN_MS = 5_000
const LISTEN_RETRY_MAX_MS = 60_000

type Limiter = ReturnType<typeof pLimit>

let unsubscribe: (() => void) | null = null
let pollTimer: NodeJS.Timeout | null = null
let sweepTimer: NodeJS.Timeout | null = null
let retryTimer: NodeJS.Timeout | null = null
let retryDelayMs = LISTEN_RETRY_MIN_MS
let stopped = false

/** Uma fila serial por uid: impede que `connect` e `disconnect` corram no mesmo socket. */
const queues = new Map<string, Limiter>()
/** Paths já em processamento nesta instância (o listener reentrega o mesmo doc). */
const inFlight = new Set<string>()
/** Janela deslizante de rate-limit por uid. */
const rate = new Map<string, number[]>()

function pendingQuery(): Query {
  return db
    .collectionGroup('queue')
    .where('status', '==', 'pending')
    .orderBy('createdAt')
    .limit(50)
}

/**
 * uid derivado do PATH, nunca dos dados do doc. As guardas garantem que estamos mesmo em
 * `waCommands/{uid}/queue/{id}` — uma coleção `queue` em qualquer outro lugar é ignorada.
 */
function uidFromPath(ref: DocumentReference): string | null {
  if (ref.parent.id !== 'queue') return null
  const tenantDoc = ref.parent.parent
  if (!tenantDoc || tenantDoc.parent.id !== 'waCommands') return null
  return tenantDoc.id
}

/**
 * Comandos que não são do atendente: apagam sem volta ou mexem na operação inteira.
 * Espelha `tipoDeGestor()` em firestore.rules — as duas listas andam juntas.
 */
const TIPOS_DE_GESTOR: ReadonlySet<string> = new Set([
  'contact.purge',
  'session.disconnect',
  'session.consent',
])

/**
 * O papel de quem enfileirou, lido do vínculo. Devolve null quando não dá para afirmar
 * (sem `by`, sem vínculo) — e o chamador trata isso como recusa, não como permissão.
 */
async function papelDe(uid: string, by: unknown): Promise<string | null> {
  if (typeof by !== 'string' || !by) return null
  // O titular da conta manda no próprio ambiente mesmo sem doc de vínculo (ele é criado
  // no login, e a ordem entre os dois não é garantida).
  if (by === uid) return 'dono'
  const snap = await db.collection('users').doc(uid).collection('members').doc(by).get()
  if (!snap.exists) return null
  if (snap.get('active') === false) return null
  const role = snap.get('role')
  return typeof role === 'string' ? role : null
}

function queueFor(uid: string): Limiter {
  let q = queues.get(uid)
  if (!q) {
    q = pLimit(1)
    queues.set(uid, q)
  }
  return q
}

function rateLimited(uid: string): boolean {
  const now = Date.now()
  const hits = (rate.get(uid) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS)
  if (hits.length >= RATE_LIMIT_MAX) {
    rate.set(uid, hits)
    return true
  }
  hits.push(now)
  rate.set(uid, hits)
  return false
}

/** Marca o comando como concluído. Ignora falha de escrita: o cliente já pode tê-lo apagado. */
async function finish(ref: DocumentReference, result: Record<string, unknown> | null, err: unknown): Promise<void> {
  const patch: Record<string, unknown> = {
    finishedAt: FieldValue.serverTimestamp(),
    lockUntil: FieldValue.delete(),
  }

  if (!err) {
    patch.status = 'done'
    patch.result = result ?? {}
    patch.error = null
  } else {
    const known = err instanceof CommandError
    if (!known) logger.error({ err, path: ref.path }, 'comando falhou com erro inesperado')
    patch.status = 'error'
    patch.error = {
      code: known ? err.code : 'internal',
      message: known ? err.message : 'Falha interna do serviço de WhatsApp.',
    }
  }

  await ref.update(patch).catch((e) => {
    logger.debug({ err: e, path: ref.path }, 'não foi possível gravar o resultado (doc removido?)')
  })
}

/** Claim transacional: 'pending' → 'running'. Ao virar 'running' o doc SAI da query do listener. */
async function claim(ref: DocumentReference, type: WaCommandType): Promise<boolean> {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const data = snap.data()
    if (!data || data.status !== 'pending') return false

    const now = Date.now()
    const lockUntil = data.lockUntil instanceof Timestamp ? data.lockUntil.toMillis() : 0
    if (lockUntil > now) return false

    const attempts = Number(data.attempts ?? 0) + 1
    if (attempts > MAX_ATTEMPTS) {
      tx.update(ref, {
        status: 'error',
        error: { code: 'max_attempts_exceeded', message: 'O comando falhou repetidamente.' },
        finishedAt: FieldValue.serverTimestamp(),
        lockUntil: FieldValue.delete(),
      })
      return false
    }

    tx.update(ref, {
      status: 'running',
      attempts,
      claimedBy: config.instanceId,
      claimedAt: FieldValue.serverTimestamp(),
      lockUntil: Timestamp.fromMillis(now + CMD_TIMEOUT_MS[type] + LOCK_GRACE_MS),
    })
    return true
  })
}

async function runWithTimeout(
  type: WaCommandType,
  uid: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new CommandError('timeout', 'O serviço demorou demais para concluir a operação.')),
      CMD_TIMEOUT_MS[type],
    )
  })
  try {
    return await Promise.race([actions[type](uid, args), timeout])
  } finally {
    clearTimeout(timer)
  }
}

function dispatch(snap: QueryDocumentSnapshot): void {
  const ref = snap.ref
  const path = ref.path
  if (inFlight.has(path)) return

  const uid = uidFromPath(ref)
  if (!uid) {
    logger.warn({ path }, 'doc de fila fora de waCommands/{uid}/queue — ignorado')
    return
  }

  inFlight.add(path)
  void queueFor(uid)(async () => {
    try {
      const type = snap.get('type') as unknown
      if (!isWaCommandType(type)) {
        await finish(ref, null, new CommandError('unknown_command', 'Comando desconhecido.'))
        return
      }
      // Um tenant enfileirando em massa afogaria o daemon de TODOS. As rules já validam o
      // formato do doc e o papel de quem pede; o VOLUME continua sendo problema daqui —
      // ver também MAX_PENDENTES_POR_AMBIENTE, na varredura.
      if (rateLimited(uid)) {
        await finish(ref, null, new CommandError('rate_limited', 'Muitos pedidos em sequência. Aguarde alguns segundos.'))
        return
      }
      // A fila da ASSISTENTE é o único caso em que o papel não vem de um vínculo: o
      // número é da plataforma, `users/_assistente` não existe e nunca terá members, então
      // `papelDe()` devolveria null para todo mundo. Quem manda nele é o dono do SISTEMA —
      // e desconectá-lo derruba o resumo diário de todos os clientes de uma vez.
      if (isAssistantUid(uid)) {
        if (!(await ehDonoDoSistema(snap.get('by')))) {
          logger.warn({ path, type }, 'comando na fila da Assistente sem dono do sistema — recusado')
          await finish(ref, null, new CommandError(
            'forbidden',
            'O número da Assistente é administrado pelos donos do sistema.',
          ))
          return
        }
      }

      // Segunda camada de autorização — ver o cabeçalho deste arquivo. Roda ANTES do
      // claim para não queimar tentativa de um comando que nunca poderia rodar.
      if (TIPOS_DE_GESTOR.has(type)) {
        const papel = await papelDe(uid, snap.get('by'))
        if (papel !== 'dono' && papel !== 'gestor') {
          logger.warn({ path, type, by: snap.get('by') }, 'comando destrutivo sem papel de gestor — recusado')
          await finish(ref, null, new CommandError(
            'forbidden',
            'Esta ação é restrita a quem administra o ambiente.',
          ))
          return
        }
      }

      if (!(await claim(ref, type))) return

      const args = (snap.get('args') ?? {}) as Record<string, unknown>
      try {
        const result = await runWithTimeout(type, uid, args)
        await finish(ref, result, null)
      } catch (err) {
        await finish(ref, null, err)
      }
    } catch (err) {
      logger.error({ err, path }, 'falha ao processar comando')
    } finally {
      inFlight.delete(path)
    }
  })
}

function scheduleResubscribe(): void {
  if (stopped || retryTimer) return
  retryTimer = setTimeout(() => {
    retryTimer = null
    subscribe()
  }, retryDelayMs)
  retryDelayMs = Math.min(retryDelayMs * 2, LISTEN_RETRY_MAX_MS)
}

function subscribe(): void {
  if (stopped) return
  unsubscribe = pendingQuery().onSnapshot(
    (snap) => {
      retryDelayMs = LISTEN_RETRY_MIN_MS
      for (const doc of snap.docs) dispatch(doc)
    },
    (err) => {
      // Índice composto ausente aparece AQUI (FAILED_PRECONDITION) e mataria o listener
      // em silêncio — por isso o nível 'error'. Ver firestore.indexes.json (queue).
      logger.error({ err }, 'listener da fila de comandos caiu — re-subscrevendo')
      unsubscribe = null
      scheduleResubscribe()
    },
  )
}

/** Rede oscilando / stream morto sem erro: uma varredura barata fecha a lacuna. */
async function pollOnce(): Promise<void> {
  const snap = await pendingQuery().get()
  for (const doc of snap.docs) dispatch(doc)
}

async function sweepOnce(): Promise<void> {
  const now = Date.now()

  // 1) Comandos finalizados antigos (backstop do TTL nativo e do delete feito pelo cliente).
  for (const status of ['done', 'error', 'canceled'] as const) {
    const old = await db
      .collectionGroup('queue')
      .where('status', '==', status)
      .where('createdAt', '<', Timestamp.fromMillis(now - TERMINAL_TTL_MS))
      .limit(200)
      .get()
    if (old.empty) continue
    const batch = db.batch()
    for (const doc of old.docs) batch.delete(doc.ref)
    await batch.commit()
    logger.debug({ status, count: old.size }, 'sweep: comandos antigos removidos')
  }

  // 2) Fila estufada — ver MAX_PENDENTES_POR_AMBIENTE.
  const pendentes = await db
    .collectionGroup('queue')
    .where('status', '==', 'pending')
    .orderBy('createdAt')
    .limit(5000)
    .get()
  const porAmbiente = new Map<string, QueryDocumentSnapshot[]>()
  for (const doc of pendentes.docs) {
    const uid = uidFromPath(doc.ref)
    if (!uid) continue
    const lista = porAmbiente.get(uid) ?? []
    lista.push(doc)
    porAmbiente.set(uid, lista)
  }
  for (const [uid, docs] of porAmbiente) {
    if (docs.length <= MAX_PENDENTES_POR_AMBIENTE) continue
    // `docs` vem ordenado por createdAt: o excedente é o mais NOVO.
    const excedente = docs.slice(MAX_PENDENTES_POR_AMBIENTE)
    const batch = db.batch()
    for (const doc of excedente.slice(0, 400)) batch.delete(doc.ref)
    await batch.commit()
    logger.warn(
      { uid, pendentes: docs.length, removidos: Math.min(excedente.length, 400) },
      'fila acima do teto — excedente descartado',
    )
  }

  // 3) 'running' órfão — o processo que o claimou morreu no meio. Sem isto ficaria preso
  //    para sempre (já saiu da query de 'pending').
  const stuck = await db
    .collectionGroup('queue')
    .where('status', '==', 'running')
    .where('createdAt', '<', Timestamp.fromMillis(now - RUNNING_ORPHAN_MS))
    .limit(100)
    .get()
  for (const doc of stuck.docs) {
    const lockUntil = doc.get('lockUntil')
    if (lockUntil instanceof Timestamp && lockUntil.toMillis() > now) continue
    const attempts = Number(doc.get('attempts') ?? 0)
    await doc.ref
      .update(
        attempts >= MAX_ATTEMPTS
          ? {
              status: 'error',
              error: { code: 'daemon_restarted', message: 'O serviço reiniciou durante a operação.' },
              finishedAt: FieldValue.serverTimestamp(),
              lockUntil: FieldValue.delete(),
            }
          : { status: 'pending', lockUntil: FieldValue.delete() },
      )
      .catch(() => {})
  }

  // 3) Filas ociosas — evita o Map crescer com tenants que já não têm comandos.
  for (const [uid, q] of queues) {
    if (q.activeCount === 0 && q.pendingCount === 0) queues.delete(uid)
  }
}

export function startCommandWorker(): void {
  if (unsubscribe || retryTimer) return
  stopped = false
  retryDelayMs = LISTEN_RETRY_MIN_MS
  subscribe()

  pollTimer = setInterval(() => {
    pollOnce().catch((err) => logger.warn({ err }, 'polling de comandos falhou'))
  }, POLL_MS)

  sweepTimer = setInterval(() => {
    sweepOnce().catch((err) => logger.warn({ err }, 'sweep de comandos falhou'))
  }, SWEEP_MS)

  logger.info({ pollMs: POLL_MS, instanceId: config.instanceId }, 'dispatcher de comandos iniciado')
}

export function stopCommandWorker(): void {
  stopped = true
  if (unsubscribe) {
    unsubscribe()
    unsubscribe = null
  }
  for (const t of [pollTimer, sweepTimer, retryTimer]) if (t) clearInterval(t)
  pollTimer = sweepTimer = retryTimer = null
}
