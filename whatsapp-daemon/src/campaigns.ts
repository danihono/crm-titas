import { FieldValue, Timestamp, type DocumentData, type QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { db } from './firebase.js'
import { logger } from './logger.js'
import { activeSessionUids, sendTextToPhone } from './sessionManager.js'
import { saveOutgoingTextMessage } from './messages.js'

const INTERVAL_MS = 20_000

/**
 * Teto absoluto de mensagens de campanha por dia, por tenant. Vale mesmo que a campanha
 * peça um ritmo alto: `ratePerHour` é o pedido do usuário, isto é o limite da casa.
 */
const DAILY_HARD_CAP = 150

/**
 * Aquecimento: a cota do dia começa baixa e sobe com o tempo de uso. Número novo que
 * dispara centenas de mensagens no primeiro dia é o caso clássico de banimento; um que
 * cresce aos poucos passa por conta madura.
 */
const WARMUP_START = 30
const WARMUP_STEP_PER_DAY = 30

/**
 * Jitter do intervalo entre envios. Cadência exata (uma mensagem a cada 4 minutos,
 * cravado) é assinatura de robô — sortear entre 60% e 140% do intervalo desmancha o padrão.
 */
const JITTER_MIN = 0.6
const JITTER_SPAN = 0.8

let timer: NodeJS.Timeout | null = null
let running = false

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Troca {{nome}} e {{empresa}} pelos dados do destinatário. */
function applyVariables(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => vars[key.toLowerCase()] ?? '')
}

function hhmmToMinutes(v: string): number {
  const [h, m] = String(v ?? '').split(':')
  return Number(h) * 60 + Number(m)
}

/**
 * Dentro do horário de atendimento do tenant?
 *
 * Diferente da versão do app, aqui o fuso vem do doc (`businessHours.timezone`): o daemon
 * roda em servidor, que costuma estar em UTC, e usar a hora local da máquina mandaria
 * campanha de madrugada para o cliente.
 */
function withinBusinessHours(hours: DocumentData | undefined, now: Date): boolean {
  if (!hours) return true
  const days = Array.isArray(hours.days) ? hours.days : []
  const tz = typeof hours.timezone === 'string' ? hours.timezone : 'America/Sao_Paulo'

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)

  const weekdayName = parts.find((p) => p.type === 'weekday')?.value ?? ''
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0')
  const dayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekdayName)
  if (dayIndex < 0) return true

  const day = days[dayIndex]
  if (!day?.enabled) return false

  const nowMin = hour * 60 + minute
  const open = hhmmToMinutes(day.open)
  const close = hhmmToMinutes(day.close)
  if (close <= open) return nowMin >= open || nowMin < close
  return nowMin >= open && nowMin < close
}

/**
 * Cota do dia já consumida e o teto vigente. O contador vive num doc por dia
 * (users/{uid}/campaignQuota/{AAAA-MM-DD}) — some sozinho da relevância e não exige
 * varrer campanhas para saber quanto já saiu hoje.
 */
async function quotaFor(uid: string, now: Date): Promise<{ used: number; cap: number; ref: FirebaseFirestore.DocumentReference }> {
  const userRef = db.collection('users').doc(uid)
  const ref = userRef.collection('campaignQuota').doc(dayKey(now))
  const [quotaSnap, userSnap] = await Promise.all([ref.get(), userRef.get()])

  const startedAt = userSnap.get('campaignsStartedAt')
  const startMs = startedAt instanceof Timestamp ? startedAt.toMillis() : now.getTime()
  const daysUsing = Math.max(0, Math.floor((now.getTime() - startMs) / 86_400_000))
  const cap = Math.min(DAILY_HARD_CAP, WARMUP_START + daysUsing * WARMUP_STEP_PER_DAY)

  return { used: Number(quotaSnap.get('sent') ?? 0), cap, ref }
}

type Claimed = {
  uid: string
  campaignId: string
  targetId: string
  contactId: string
  phone: string
  text: string
  ratePerHour: number
}

/**
 * Reserva UM destinatário e já agenda o próximo envio.
 *
 * A reserva é transacional e mexe no mesmo doc da campanha que carrega `nextSendAt`:
 * é isso que garante uma mensagem por intervalo mesmo se duas instâncias do daemon
 * subirem por engano — a segunda perde a transação e não dispara em dobro.
 */
async function claimNext(
  uid: string,
  campaign: QueryDocumentSnapshot<DocumentData>,
  target: QueryDocumentSnapshot<DocumentData>,
  now: Date,
): Promise<Claimed | null> {
  return db.runTransaction(async (tx) => {
    const fresh = await tx.get(campaign.ref)
    const data = fresh.data()
    if (!data || data.status !== 'enviando') return null

    const nextSendAt = data.nextSendAt instanceof Timestamp ? data.nextSendAt.toMillis() : 0
    if (nextSendAt > now.getTime()) return null

    const freshTarget = await tx.get(target.ref)
    if (freshTarget.get('status') !== 'pendente') return null

    const ratePerHour = Math.max(1, Number(data.ratePerHour ?? 15))
    const gapMs = (3_600_000 / ratePerHour) * (JITTER_MIN + Math.random() * JITTER_SPAN)

    tx.update(campaign.ref, { nextSendAt: Timestamp.fromMillis(now.getTime() + gapMs) })
    // 'enviando' no destinatário é a marca de reserva: some da próxima varredura de
    // pendentes, então nem esta instância nem outra o pegam duas vezes. `claimedAt`
    // é o que permite destravar a reserva se o daemon morrer antes de enviar.
    tx.update(target.ref, { status: 'enviando', claimedAt: Timestamp.fromMillis(now.getTime()) })

    return {
      uid,
      campaignId: campaign.id,
      targetId: target.id,
      contactId: String(freshTarget.get('contactId') ?? target.id),
      phone: String(freshTarget.get('phone') ?? '').replace(/\D/g, ''),
      text: String(data.text ?? ''),
      ratePerHour,
    }
  })
}

async function finishIfDone(uid: string, campaignId: string): Promise<void> {
  const ref = db.collection('users').doc(uid).collection('campaigns').doc(campaignId)
  // 'enviando' conta como não terminado: uma reserva pendurada ainda pode voltar para a
  // fila (releaseStaleClaims), e concluir aqui deixaria gente sem receber sem sinal nenhum.
  const open = await ref.collection('targets')
    .where('status', 'in', ['pendente', 'enviando'])
    .limit(1)
    .get()
  if (!open.empty) return
  await ref.set({ status: 'concluida', finishedAt: FieldValue.serverTimestamp() }, { merge: true })
  logger.info({ uid, campaignId }, 'campanha concluida')
}

async function dispatch(claimed: Claimed, quotaRef: FirebaseFirestore.DocumentReference): Promise<void> {
  const { uid, campaignId, targetId, contactId, phone } = claimed
  const campaignRef = db.collection('users').doc(uid).collection('campaigns').doc(campaignId)
  const targetRef = campaignRef.collection('targets').doc(targetId)
  const contactRef = db.collection('users').doc(uid).collection('contacts').doc(contactId)

  // Última checagem antes de mandar: o contato pode ter pedido opt-out DEPOIS de a
  // campanha ser montada, e o público foi congelado na criação.
  const contact = await contactRef.get()
  if (!contact.exists || contact.get('optOut') === true) {
    await targetRef.set({ status: 'optout' }, { merge: true })
    await campaignRef.set({ skipped: FieldValue.increment(1) }, { merge: true })
    return
  }

  if (phone.length < 8) {
    await targetRef.set({ status: 'falhou', error: 'invalid_phone' }, { merge: true })
    await campaignRef.set({ failed: FieldValue.increment(1) }, { merge: true })
    return
  }

  const text = applyVariables(claimed.text, {
    nome: String(contact.get('name') ?? ''),
    empresa: String(contact.get('company') ?? '').replace(/^—$/, ''),
  })

  try {
    const sent = await sendTextToPhone(uid, phone, text)
    const remoteJid = sent.key.remoteJid || `${phone}@s.whatsapp.net`
    await saveOutgoingTextMessage(
      uid,
      contactId,
      sent.key.id!,
      text,
      remoteJid,
      Number(sent.messageTimestamp ?? 0) || undefined,
    )
    await targetRef.set({ status: 'enviado', sentAt: FieldValue.serverTimestamp() }, { merge: true })
    await campaignRef.set({ sent: FieldValue.increment(1), lastError: '' }, { merge: true })
    await quotaRef.set({ sent: FieldValue.increment(1) }, { merge: true })
    await db.collection('users').doc(uid).set(
      { campaignsStartedAt: FieldValue.serverTimestamp() },
      { merge: true },
    ).catch(() => {})
  } catch (err) {
    const code = err instanceof Error ? err.message : 'campaign_send_failed'
    // Queda de conexão não é culpa do destinatário: volta para a fila em vez de
    // queimá-lo como falha. Marcar 'falhou' aqui perderia gente da campanha a cada
    // reconexão do WhatsApp, e não há como saber depois quem ficou de fora por quê.
    if (code === 'whatsapp_not_connected') {
      await targetRef.set({ status: 'pendente', claimedAt: FieldValue.delete() }, { merge: true })
      await campaignRef.set({ lastError: code }, { merge: true })
      return
    }
    await targetRef.set({ status: 'falhou', error: code }, { merge: true })
    await campaignRef.set({ failed: FieldValue.increment(1), lastError: code }, { merge: true })
    logger.warn({ uid, campaignId, code }, 'falha ao enviar mensagem de campanha')
  }
}

/**
 * Devolve à fila as reservas que ficaram penduradas (daemon morreu entre reservar e
 * enviar). Sem isto o destinatário fica em 'enviando' para sempre e a campanha nunca
 * conclui — pendentes zeradas, mas com gente que nunca recebeu.
 */
const CLAIM_TIMEOUT_MS = 5 * 60_000

async function releaseStaleClaims(campaignRef: FirebaseFirestore.DocumentReference, now: Date): Promise<void> {
  const cutoff = Timestamp.fromMillis(now.getTime() - CLAIM_TIMEOUT_MS)
  const stale = await campaignRef.collection('targets')
    .where('status', '==', 'enviando')
    .where('claimedAt', '<=', cutoff)
    .limit(20)
    .get()
  if (stale.empty) return

  const batch = db.batch()
  stale.docs.forEach((d) => batch.update(d.ref, { status: 'pendente', claimedAt: FieldValue.delete() }))
  await batch.commit()
  logger.warn({ campaign: campaignRef.id, released: stale.size }, 'reservas de campanha destravadas')
}

async function tick(): Promise<void> {
  if (running) return
  running = true
  const now = new Date()
  try {
    for (const uid of activeSessionUids()) {
      const campaigns = await db
        .collection('users').doc(uid).collection('campaigns')
        .where('status', '==', 'enviando')
        .get()
      if (campaigns.empty) continue

      const { used, cap, ref: quotaRef } = await quotaFor(uid, now)
      if (used >= cap) continue

      const hours = (await db.collection('users').doc(uid).get()).get('businessHours')

      // Uma mensagem por tick e por tenant: mesmo com várias campanhas rodando, o
      // número é um só, e é o número que toma o ban.
      for (const campaign of campaigns.docs) {
        if (campaign.get('respectBusinessHours') !== false && !withinBusinessHours(hours, now)) continue

        await releaseStaleClaims(campaign.ref, now)

        const pending = await campaign.ref.collection('targets')
          .where('status', '==', 'pendente')
          .limit(1)
          .get()
        if (pending.empty) {
          await finishIfDone(uid, campaign.id)
          continue
        }

        const claimed = await claimNext(uid, campaign, pending.docs[0], now)
        if (!claimed) continue
        await dispatch(claimed, quotaRef)
        await finishIfDone(uid, campaign.id)
        break
      }
    }
  } catch (err) {
    logger.error({ err }, 'worker de campanhas falhou')
  } finally {
    running = false
  }
}

export function startCampaignWorker(): void {
  if (timer) return
  timer = setInterval(() => {
    tick().catch((err) => logger.error({ err }, 'tick de campanha falhou'))
  }, INTERVAL_MS)
  timer.unref()
  logger.info({ intervalMs: INTERVAL_MS, dailyHardCap: DAILY_HARD_CAP }, 'worker de campanhas iniciado')
}

export function stopCampaignWorker(): void {
  if (!timer) return
  clearInterval(timer)
  timer = null
}
