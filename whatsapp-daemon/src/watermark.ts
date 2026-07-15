import { Timestamp } from 'firebase-admin/firestore'
import { db } from './firebase.js'
import { logger } from './logger.js'

/** Intervalo mínimo entre escritas do watermark por uid (evita 1 write por mensagem). */
const THROTTLE_MS = 60_000

/** Última escrita do watermark por uid (só memória — o throttle pode reiniciar no boot). */
const lastWriteMs = new Map<string, number>()

/**
 * Marca "o espelho viu tudo até agora" em `whatsappSessions/{uid}.lastMirrorAt`.
 * Chamado a cada ingestão ao vivo (throttled) e no fechamento da conexão (`force`).
 * O campo sobrevive ao `clearAuth` (que só apaga creds/keys) — é ele que delimita o
 * buraco a preencher quando o usuário desvincula e reconecta com QR novo.
 */
export async function touchMirrorWatermark(uid: string, opts?: { force?: boolean }): Promise<void> {
  const now = Date.now()
  if (!opts?.force && now - (lastWriteMs.get(uid) ?? 0) < THROTTLE_MS) return
  lastWriteMs.set(uid, now)
  try {
    await db
      .collection('whatsappSessions')
      .doc(uid)
      .set({ lastMirrorAt: Timestamp.fromMillis(now) }, { merge: true })
  } catch (err) {
    logger.warn({ err, uid }, 'falha ao gravar lastMirrorAt')
  }
}

/**
 * Lê o watermark (ms epoch) para o gap-fill. Fallback para sessões anteriores ao campo:
 * o `lastMessageAt` mais novo entre os contatos (subestima com segurança — mensagens já
 * espelhadas depois dele são deduplicadas pelo merge por doc-id). O fallback SÓ vale se a
 * sessão já conectou alguma vez (`phoneNumber` gravado no primeiro 'open' e que sobrevive
 * ao logout): o app também escreve `lastMessageAt` em contatos manuais/mensagens locais,
 * e sem essa guarda uma conta que nunca espelhou importaria histórico pré-espelho.
 * `null` = nunca espelhou nada → NÃO fazer gap-fill (forward-only puro).
 */
export async function readMirrorWatermarkMs(uid: string): Promise<number | null> {
  try {
    const snap = await db.collection('whatsappSessions').doc(uid).get()
    const at = snap.get('lastMirrorAt')
    if (at instanceof Timestamp) return at.toMillis()

    if (!snap.get('phoneNumber')) return null // nunca conectou → forward-only puro

    const newest = await db
      .collection('users')
      .doc(uid)
      .collection('contacts')
      .orderBy('lastMessageAt', 'desc')
      .limit(1)
      .get()
    const lastMessageAt = newest.docs[0]?.get('lastMessageAt')
    return lastMessageAt instanceof Timestamp ? lastMessageAt.toMillis() : null
  } catch (err) {
    logger.warn({ err, uid }, 'falha ao ler watermark do espelho')
    return null
  }
}
