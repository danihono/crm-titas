import { FieldValue, Timestamp, type QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { db } from './firebase.js'
import { logger } from './logger.js'
import { activeSessionUids, sendTextToPhone } from './sessionManager.js'
import { saveOutgoingTextMessage } from './messages.js'

const INTERVAL_MS = 5_000
const LOCK_MS = 120_000
const MAX_ATTEMPTS = 3
const BATCH_LIMIT_PER_USER = 20

let timer: NodeJS.Timeout | null = null
let running = false

type ClaimedSchedule = {
  id: string
  uid: string
  contactId: string
  text: string
  attempts: number
}

function phoneDigits(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '')
}

function errCode(err: unknown): string {
  return err instanceof Error ? err.message : 'scheduled_send_failed'
}

async function claim(uid: string, snap: QueryDocumentSnapshot): Promise<ClaimedSchedule | null> {
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
      uid,
      contactId: String(data.contactId ?? ''),
      text: String(data.text ?? '').trim(),
      attempts,
    }
  })
}

async function markFailed(uid: string, id: string, attempts: number, error: string): Promise<void> {
  await db
    .collection('users')
    .doc(uid)
    .collection('scheduledMessages')
    .doc(id)
    .set(
      {
        status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
        lastError: error,
        lockUntil: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )
}

async function refreshBeforeSend(s: ClaimedSchedule): Promise<boolean> {
  const snap = await db
    .collection('users')
    .doc(s.uid)
    .collection('scheduledMessages')
    .doc(s.id)
    .get()
  const data = snap.data()
  if (!data || data.status !== 'pending') return false
  const dueAt = data.dueAt instanceof Timestamp ? data.dueAt.toMillis() : 0
  if (!dueAt || dueAt > Date.now()) return false
  s.contactId = String(data.contactId ?? '')
  s.text = String(data.text ?? '').trim()
  return true
}

async function sendClaimed(s: ClaimedSchedule): Promise<void> {
  if (!(await refreshBeforeSend(s))) return

  if (!s.contactId || !s.text) {
    await markFailed(s.uid, s.id, MAX_ATTEMPTS, 'invalid_schedule')
    return
  }

  const contactRef = db.collection('users').doc(s.uid).collection('contacts').doc(s.contactId)
  const contact = await contactRef.get()
  if (!contact.exists) {
    await markFailed(s.uid, s.id, MAX_ATTEMPTS, 'contact_missing')
    return
  }

  const digits =
    phoneDigits(contact.get('whatsappDigits')) ||
    phoneDigits(contact.get('whatsapp')) ||
    phoneDigits(contact.get('phone'))
  if (digits.length < 8) {
    // Falha permanente — sem MAX_ATTEMPTS o status voltaria a 'pending' e o
    // scheduler re-tentaria para sempre um telefone que nunca vai resolver.
    await markFailed(s.uid, s.id, MAX_ATTEMPTS, 'invalid_contact_phone')
    return
  }

  try {
    const sent = await sendTextToPhone(s.uid, digits, s.text)
    const remoteJid = sent.key.remoteJid || `${digits}@s.whatsapp.net`
    await contactRef.set({ whatsappDigits: digits, waJid: remoteJid }, { merge: true })
    await saveOutgoingTextMessage(
      s.uid,
      s.contactId,
      sent.key.id!,
      s.text,
      remoteJid,
      Number(sent.messageTimestamp ?? 0) || undefined,
    )
    await db
      .collection('users')
      .doc(s.uid)
      .collection('scheduledMessages')
      .doc(s.id)
      .set(
        {
          status: 'sent',
          sentAt: FieldValue.serverTimestamp(),
          sentMessageId: sent.key.id,
          lastError: FieldValue.delete(),
          lockUntil: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
  } catch (err) {
    await markFailed(s.uid, s.id, s.attempts, errCode(err))
  }
}

async function tick(): Promise<void> {
  if (running) return
  running = true
  try {
    const now = Timestamp.now()
    for (const uid of activeSessionUids()) {
      const snap = await db
        .collection('users')
        .doc(uid)
        .collection('scheduledMessages')
        .where('status', '==', 'pending')
        .where('dueAt', '<=', now)
        .orderBy('dueAt')
        .limit(BATCH_LIMIT_PER_USER)
        .get()

      for (const doc of snap.docs) {
        const claimed = await claim(uid, doc)
        if (claimed) await sendClaimed(claimed)
      }
    }
  } catch (err) {
    logger.error({ err }, 'scheduler de mensagens agendadas falhou')
  } finally {
    running = false
  }
}

export function startScheduledMessageWorker(): void {
  if (timer) return
  timer = setInterval(() => {
    tick().catch((err) => logger.error({ err }, 'tick agendado falhou'))
  }, INTERVAL_MS)
  timer.unref()
  setTimeout(() => {
    tick().catch((err) => logger.error({ err }, 'tick inicial agendado falhou'))
  }, 1000).unref()
  logger.info({ intervalMs: INTERVAL_MS }, 'scheduler de mensagens agendadas iniciado')
}

export function stopScheduledMessageWorker(): void {
  if (!timer) return
  clearInterval(timer)
  timer = null
}
