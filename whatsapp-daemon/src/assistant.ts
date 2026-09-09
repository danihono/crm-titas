import { FieldValue, Timestamp, type QueryDocumentSnapshot } from 'firebase-admin/firestore'
import type { WAMessage } from '@whiskeysockets/baileys'
import { getAuth } from 'firebase-admin/auth'
import { db } from './firebase.js'
import { config } from './config.js'
import { logger } from './logger.js'
import { hasSession, sendTextToPhone } from './sessionManager.js'
import { isOptOutText } from './optOut.js'
import type { MessagesUpsert } from './messages.js'
import type { LidResolver } from './agenda.js'

/**
 * A ASSISTENTE — o número da plataforma.
 *
 * Não é o WhatsApp de nenhum cliente: é um número só, da Titã, que manda o resumo diário
 * para o dono de cada ambiente e responde as perguntas que ele devolver. Por isso ela reusa
 * toda a maquinaria de sessão do daemon (lease, rehidratação, reconexão) com um id
 * reservado, em vez de ganhar um processo próprio.
 *
 * O daemon aqui é só transporte. Quem monta o texto do resumo e quem chama o Gemini são as
 * Cloud Functions — é lá que a GEMINI_API_KEY vive, e ela não desce para a VPS. O contrato
 * entre os dois são duas coleções no Firestore:
 *
 *   assistantOutbox/{id}                  function enfileira  →  daemon envia
 *   users/{tenant}/agentChat/{id}         daemon escreve      →  function responde
 */

/**
 * Id da sessão da Assistente.
 *
 * NÃO pode ser `__assistente__`: o Firestore recusa ids que casem `__.*__`, são reservados
 * (`INVALID_ARGUMENT: Resource id is invalid because it is reserved`). O underscore único
 * resolve e mantém a garantia que interessa — uid do Firebase Auth é alfanumérico de 28
 * caracteres, então nunca colide com este.
 */
export const ASSISTANT_UID = '_assistente'

export function isAssistantUid(uid: string): boolean {
  return uid === ASSISTANT_UID
}

/**
 * Donos do SISTEMA. A MESMA lista existe em src/lib/owners.ts, firestore.rules,
 * storage.rules e functions/src/index.ts — as cinco andam juntas.
 *
 * Ela precisa existir aqui porque a fila `waCommands/_assistente/queue` não tem como ser
 * reconferida pelo caminho normal: `papelDe()` procura o vínculo em
 * `users/{uid}/members/{by}`, e `users/_assistente` não existe nem terá membros. Sem esta
 * checagem, o único controle sobre conectar e DESCONECTAR o número de que todos os
 * clientes dependem seria a security rule — e o Admin SDK ignora rule.
 */
const EMAILS_DONO_SISTEMA: ReadonlySet<string> = new Set([
  'danielboy200627@gmail.com',
])

/**
 * `by` é um dono do sistema? Exige e-mail VERIFICADO, como `isSuperOwner()` nas rules:
 * o Firebase Auth não pede prova de caixa postal no cadastro, então sem isso bastaria
 * criar uma conta com o e-mail do dono para herdar o que ele pode fazer.
 */
export async function ehDonoDoSistema(by: unknown): Promise<boolean> {
  if (typeof by !== 'string' || !by) return false
  try {
    const user = await getAuth().getUser(by)
    return !!user.emailVerified && EMAILS_DONO_SISTEMA.has((user.email ?? '').toLowerCase())
  } catch (err) {
    logger.warn({ err }, 'não foi possível confirmar o dono do sistema; comando recusado')
    return false
  }
}

// ---------------------------------------------------------------------------
// Fila de saída
// ---------------------------------------------------------------------------

const INTERVAL_MS = 5_000
const LOCK_MS = 120_000
const MAX_ATTEMPTS = 3
const BATCH_LIMIT = 10

/**
 * Intervalo mínimo entre dois envios, com jitter — as mesmas razões de campaigns.ts.
 *
 * Aqui pesa mais: lá é um número falando com os contatos de UMA empresa, aqui é UM número
 * falando com os donos de TODAS. Cadência cravada, em rajada, num número novo, é o retrato
 * do que o WhatsApp bane. Meio minuto entre mensagens faz o lote da manhã levar ~15 minutos
 * com 30 clientes — irrelevante para um resumo diário.
 */
const MIN_GAP_MS = 30_000
const JITTER_MIN = 0.6
const JITTER_SPAN = 0.8

/**
 * Teto de mensagens por dia do número da Assistente.
 *
 * Vive no Firestore, e não em memória, porque um restart no meio da manhã zeraria o
 * contador e o teto deixaria de existir justamente no dia em que algo deu errado.
 * `assistantQuota` não tem regra em firestore.rules — cai no default-deny, só Admin SDK.
 */
const DAILY_CAP = 100

let timer: NodeJS.Timeout | null = null
let running = false
/** Quando o próximo envio pode sair. Espalha o lote em vez de despejá-lo de uma vez. */
let nextSendAtMs = 0

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function phoneDigits(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '')
}

function errCode(err: unknown): string {
  return err instanceof Error ? err.message : 'assistant_send_failed'
}

type ClaimedMessage = {
  id: string
  tenantUid: string
  toDigits: string
  text: string
  attempts: number
}

/**
 * Consome uma unidade da cota do dia, ou recusa.
 *
 * Transacional porque duas instâncias do daemon podem drenar a mesma fila — sem isso o
 * teto seria a soma dos tetos de cada processo, que não é teto nenhum.
 */
async function consomeCotaDiaria(now: Date): Promise<boolean> {
  const ref = db.collection('assistantQuota').doc(dayKey(now))
  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      const usados = Number(snap.get('count') ?? 0)
      if (usados >= DAILY_CAP) return false
      tx.set(ref, { count: usados + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
      return true
    })
  } catch (err) {
    // Falha de infraestrutura no contador não pode travar o envio do dia inteiro, mas
    // também não passa calada — cota que falha em silêncio é cota que não existe.
    logger.error({ err }, 'cota diária da Assistente falhou; seguindo sem contabilizar')
    return true
  }
}

async function claim(snap: QueryDocumentSnapshot): Promise<ClaimedMessage | null> {
  const ref = snap.ref
  return db.runTransaction(async (tx) => {
    const fresh = await tx.get(ref)
    const data = fresh.data()
    if (!data || data.status !== 'pending') return null

    const nowMs = Date.now()
    const dueAt = data.dueAt instanceof Timestamp ? data.dueAt.toMillis() : 0
    const lockUntil = data.lockUntil instanceof Timestamp ? data.lockUntil.toMillis() : 0
    if (!dueAt || dueAt > nowMs) return null
    if (lockUntil && lockUntil > nowMs) return null

    const attempts = Number(data.attempts ?? 0) + 1
    if (attempts > MAX_ATTEMPTS) {
      tx.update(ref, {
        status: 'failed',
        lastError: 'max_attempts_exceeded',
        lockUntil: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      })
      return null
    }

    tx.update(ref, {
      attempts,
      lockUntil: Timestamp.fromMillis(nowMs + LOCK_MS),
      updatedAt: FieldValue.serverTimestamp(),
    })

    return {
      id: fresh.id,
      tenantUid: String(data.tenantUid ?? ''),
      toDigits: phoneDigits(data.toDigits),
      text: String(data.text ?? '').trim(),
      attempts,
    }
  })
}

async function markFailed(id: string, attempts: number, error: string): Promise<void> {
  await db.collection('assistantOutbox').doc(id).set(
    {
      status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
      lastError: error,
      lockUntil: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
}

async function sendClaimed(m: ClaimedMessage): Promise<void> {
  // Falhas permanentes vão direto para MAX_ATTEMPTS: sem isso o status voltaria a
  // 'pending' e a fila re-tentaria para sempre algo que nunca vai resolver.
  if (!m.text || m.toDigits.length < 8) {
    await markFailed(m.id, MAX_ATTEMPTS, 'invalid_assistant_message')
    return
  }

  try {
    let sentId = 'dry-run'
    if (config.dryRun) {
      logger.info({ tenantUid: m.tenantUid, chars: m.text.length }, '[dry-run] resumo NÃO enviado')
    } else {
      const sent = await sendTextToPhone(ASSISTANT_UID, m.toDigits, m.text)
      sentId = sent.key.id ?? ''
    }
    await db.collection('assistantOutbox').doc(m.id).set(
      {
        status: 'sent',
        sentAt: FieldValue.serverTimestamp(),
        sentMessageId: sentId,
        lastError: FieldValue.delete(),
        lockUntil: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )
  } catch (err) {
    await markFailed(m.id, m.attempts, errCode(err))
  }
}

async function tick(): Promise<void> {
  if (running) return
  // Sem sessão viva, NÃO reivindicar: cada tentativa queimaria uma das três e, em pouco
  // mais de um minuto de número desconectado, o resumo do dia estaria 'failed' para todo
  // mundo. Ficar parado na fila é o comportamento certo aqui.
  if (!config.dryRun && !hasSession(ASSISTANT_UID)) return
  if (Date.now() < nextSendAtMs) return

  running = true
  try {
    const snap = await db
      .collection('assistantOutbox')
      .where('status', '==', 'pending')
      .where('dueAt', '<=', Timestamp.now())
      .orderBy('dueAt')
      .limit(BATCH_LIMIT)
      .get()

    for (const doc of snap.docs) {
      if (Date.now() < nextSendAtMs) break
      if (!(await consomeCotaDiaria(new Date()))) {
        logger.warn({ cap: DAILY_CAP }, 'cota diária da Assistente esgotada; o resto fica na fila')
        break
      }
      const claimed = await claim(doc)
      if (!claimed) continue
      await sendClaimed(claimed)
      nextSendAtMs = Date.now() + MIN_GAP_MS * (JITTER_MIN + Math.random() * JITTER_SPAN)
    }
  } catch (err) {
    logger.error({ err }, 'fila de saída da Assistente falhou')
  } finally {
    running = false
  }
}

export function startAssistantOutboxWorker(): void {
  if (timer) return
  timer = setInterval(() => {
    tick().catch((err) => logger.error({ err }, 'tick da Assistente falhou'))
  }, INTERVAL_MS)
  timer.unref()
  logger.info({ intervalMs: INTERVAL_MS, dryRun: config.dryRun }, 'fila de saída da Assistente iniciada')
}

export function stopAssistantOutboxWorker(): void {
  if (!timer) return
  clearInterval(timer)
  timer = null
}

// ---------------------------------------------------------------------------
// Entrada — o dono responde no WhatsApp
// ---------------------------------------------------------------------------

/**
 * Teto de mensagens por número por hora, em memória.
 *
 * Vem ANTES de qualquer escrita: sem ele, quem quisesse era só mandar mensagem em rajada
 * para gerar escrita no Firestore e chamada paga do Gemini, uma por linha. A janela zera a
 * cada restart, e tudo bem — ela protege contra rajada, não é controle de custo (esse é o
 * `consomeCota` da Cloud Function, que vive no Firestore).
 */
const INBOX_MAX_POR_HORA = 20
const INBOX_JANELA_MS = 60 * 60 * 1000
const inbox = new Map<string, number[]>()

function dentroDoLimite(digits: string): boolean {
  const agora = Date.now()
  const janela = (inbox.get(digits) ?? []).filter((t) => agora - t < INBOX_JANELA_MS)
  if (janela.length >= INBOX_MAX_POR_HORA) {
    inbox.set(digits, janela)
    return false
  }
  janela.push(agora)
  inbox.set(digits, janela)
  return true
}

/** Texto puro da mensagem. A Assistente só conversa por texto — mídia é ignorada. */
function textoDe(m: WAMessage): string {
  const msg = m.message?.ephemeralMessage?.message ?? m.message
  return (msg?.conversation || msg?.extendedTextMessage?.text || '').trim()
}

/** Enfileira uma mensagem de saída da Assistente. */
export async function enqueueAssistantMessage(
  tenantUid: string,
  toDigits: string,
  text: string,
  kind: 'daily' | 'reply',
): Promise<void> {
  await db.collection('assistantOutbox').add({
    tenantUid,
    toDigits,
    text,
    kind,
    status: 'pending',
    attempts: 0,
    dueAt: Timestamp.now(),
    createdAt: FieldValue.serverTimestamp(),
  })
}

/**
 * Mensagem recebida no número da Assistente.
 *
 * Este handler substitui TODO o espelhamento nesta sessão: nada de `ingestMessages`,
 * histórico ou agenda. O número da Assistente não é o WhatsApp de nenhum ambiente, então
 * criar contatos e conversas a partir dele encheria `users/_assistente` — um tenant que não
 * existe — de lixo.
 *
 * O daemon aqui não pensa: ele identifica quem falou e grava a pergunta na conversa do
 * ambiente. Quem responde é a Cloud Function, disparada por esse mesmo documento.
 */
export async function onAssistantMessage(
  ev: MessagesUpsert,
  resolveLidToPhone?: LidResolver,
): Promise<void> {
  if (ev.type !== 'notify' && ev.type !== 'append') return

  for (const m of ev.messages) {
    try {
      if (m.key.fromMe) continue

      const remote = m.key.remoteJid ?? ''
      // Grupo não fala com a Assistente: ela é conversa de um dono com o próprio sistema.
      if (remote.endsWith('@g.us') || remote.endsWith('@broadcast')) continue

      // Endereçamento novo do WhatsApp (@lid) precisa voltar a telefone antes da busca —
      // é o socket que guarda esse mapeamento, e a consulta é assíncrona.
      const jid = remote.endsWith('@lid')
        ? ((await resolveLidToPhone?.(remote).catch(() => null)) ?? '')
        : remote
      const digits = phoneDigits(jid.split('@')[0])
      if (digits.length < 8) continue

      const texto = textoDe(m)
      if (!texto) continue

      const sub = await db.collection('assistantSubscribers').doc(digits).get()
      const tenantUid = String(sub.get('tenantUid') ?? '')
      // Número desconhecido: SILÊNCIO. Responder qualquer coisa — inclusive "não te
      // conheço" — transforma o número da plataforma em alvo de sondagem e de spam, e é o
      // número de que todos os clientes dependem.
      if (!sub.exists || !tenantUid || sub.get('enabled') === false) continue

      if (!dentroDoLimite(digits)) {
        logger.warn({ tenantUid }, 'limite por hora do número atingido; mensagem ignorada')
        continue
      }

      if (isOptOutText(texto)) {
        await db.collection('users').doc(tenantUid).set(
          { agent: { whatsapp: { optOut: true, enabled: false } } },
          { merge: true },
        )
        await enqueueAssistantMessage(
          tenantUid,
          digits,
          'Pronto, não te mando mais o resumo diário. Para voltar, é só religar em Assistente, dentro do sistema.',
          'reply',
        )
        continue
      }

      // `channel: 'whatsapp'` é o que faz a Cloud Function responder por aqui — e é
      // exatamente o valor que as security rules proíbem o navegador de escrever.
      await db.collection('users').doc(tenantUid).collection('agentChat').add({
        role: 'user',
        text: texto,
        channel: 'whatsapp',
        createdAt: FieldValue.serverTimestamp(),
      })
    } catch (err) {
      // Sem o texto no log: é conversa de cliente, o mesmo dado que as regras escondem.
      logger.error({ err }, 'falha ao tratar mensagem recebida na Assistente')
    }
  }
}
