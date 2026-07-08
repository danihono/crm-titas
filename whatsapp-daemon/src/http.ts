import express, { type Request, type Response, type NextFunction, type Express } from 'express'
import { FieldValue } from 'firebase-admin/firestore'
import { adminAuth, db } from './firebase.js'
import { logger } from './logger.js'
import { config } from './config.js'
import { sendTextToPhone, startSession, stopSession, sessionCount } from './sessionManager.js'
import { writeStatus } from './status.js'
import { purgeConnection } from './purge.js'
import { saveOutgoingTextMessage } from './messages.js'

interface AuthedRequest extends Request {
  uid?: string
}

/**
 * Middleware: exige um Firebase ID token válido e resolve o uid.
 * O daemon usa Admin SDK (ignora rules), então TODO endpoint de controle age
 * exclusivamente sobre o uid do token — um tenant nunca toca no de outro.
 */
async function requireUid(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const m = /^Bearer (.+)$/.exec(req.header('authorization') ?? '')
    if (!m) {
      res.status(401).json({ error: 'missing bearer token' })
      return
    }
    const decoded = await adminAuth.verifyIdToken(m[1])
    req.uid = decoded.uid
    next()
  } catch (err) {
    logger.warn({ err }, 'verificação de token falhou')
    res.status(401).json({ error: 'invalid token' })
  }
}

function asyncH(fn: (req: AuthedRequest, res: Response) => Promise<void>) {
  return (req: AuthedRequest, res: Response): void => {
    fn(req, res).catch((err) => {
      logger.error({ err, path: req.path }, 'erro no endpoint')
      if (!res.headersSent) res.status(500).json({ error: 'internal' })
    })
  }
}

function phoneDigits(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '')
}

// Origem permitida para o frontend chamar o daemon (Cloud Run é outro host).
// Pode ser '*' ou uma lista separada por vírgula. O header CORS precisa ter uma origem só.
const ALLOWED_ORIGIN = process.env.WA_ALLOWED_ORIGIN ?? '*'
const ALLOWED_ORIGINS = ALLOWED_ORIGIN
  .split(/[,\s]+/)
  .map((s) => s.trim())
  .filter((s) => s === '*' || /^https?:\/\//.test(s))

function corsOriginFor(req: Request): string | null {
  if (ALLOWED_ORIGINS.includes('*')) return '*'
  const origin = req.header('origin')
  if (origin && ALLOWED_ORIGINS.includes(origin)) return origin
  return ALLOWED_ORIGINS[0] ?? null
}

export function createHttpServer(): Express {
  const app = express()
  app.use(express.json())

  app.use((req, res, next) => {
    const origin = corsOriginFor(req)
    if (origin) res.header('Access-Control-Allow-Origin', origin)
    res.header('Vary', 'Origin')
    res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    if (req.method === 'OPTIONS') {
      res.sendStatus(204)
      return
    }
    next()
  })

  // Cloud Run: probe de startup/liveness. Precisa ouvir em $PORT.
  app.get('/healthz', (_req, res) => {
    res.status(200).json({ ok: true, sessions: sessionCount(), instanceId: config.instanceId })
  })

  // Registra o consentimento LGPD (obrigatório antes de abrir qualquer socket).
  app.post(
    '/session/consent',
    requireUid,
    asyncH(async (req, res) => {
      const retentionDays = Number(req.body?.retentionDays ?? config.defaultRetentionDays) || 0
      await db
        .collection('whatsappSessions')
        .doc(req.uid!)
        .set({ consentAt: FieldValue.serverTimestamp(), retentionDays }, { merge: true })
      res.json({ ok: true, retentionDays })
    }),
  )

  // Inicia (ou retoma) a sessão do próprio uid. Exige consentimento prévio.
  app.post(
    '/session/connect',
    requireUid,
    asyncH(async (req, res) => {
      const uid = req.uid!
      const sessionDoc = await db.collection('whatsappSessions').doc(uid).get()
      if (!sessionDoc.get('consentAt')) {
        res.status(412).json({ error: 'consent required' })
        return
      }
      await db.collection('whatsappSessions').doc(uid).set({ desiredState: 'connected' }, { merge: true })
      await writeStatus(db, uid, { status: 'connecting', qr: null, lastError: null })
      try {
        await startSession(uid)
        res.json({ ok: true })
      } catch (err) {
        logger.error({ err, uid }, 'connect falhou')
        await writeStatus(db, uid, { status: 'disconnected', lastError: 'connect failed' })
        res.status(500).json({ error: 'connect failed' })
      }
    }),
  )

  // Desconecta e, opcionalmente (?purge=1), expurga todos os dados espelhados (LGPD).
  app.post(
    '/session/disconnect',
    requireUid,
    asyncH(async (req, res) => {
      const uid = req.uid!
      const purge = req.query.purge === '1' || req.body?.purge === true
      await stopSession(uid, purge ? 'logout' : 'end')
      if (purge) await purgeConnection(uid)
      res.json({ ok: true, purged: purge })
    }),
  )

  app.post(
    '/message/send',
    requireUid,
    asyncH(async (req, res) => {
      const uid = req.uid!
      const contactId = String(req.body?.contactId ?? '').trim()
      const text = String(req.body?.text ?? '').trim()
      if (!contactId || !text) {
        res.status(400).json({ error: 'contactId and text required' })
        return
      }

      const contactRef = db.collection('users').doc(uid).collection('contacts').doc(contactId)
      const contact = await contactRef.get()
      if (!contact.exists) {
        res.status(404).json({ error: 'contact not found' })
        return
      }

      const digits = phoneDigits(contact.get('whatsapp')) || phoneDigits(contact.get('phone'))
      if (digits.length < 8) {
        res.status(400).json({ error: 'contact has no valid WhatsApp number' })
        return
      }

      await contactRef.set({ whatsappDigits: digits, waJid: `${digits}@s.whatsapp.net` }, { merge: true })

      try {
        const sent = await sendTextToPhone(uid, digits, text)
        const remoteJid = sent.key.remoteJid || `${digits}@s.whatsapp.net`
        await contactRef.set({ whatsappDigits: digits, waJid: remoteJid }, { merge: true })
        await saveOutgoingTextMessage(
          uid,
          contactId,
          sent.key.id!,
          text,
          remoteJid,
          Number(sent.messageTimestamp ?? 0) || undefined,
        )
        res.json({ ok: true, id: sent.key.id, remoteJid })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'whatsapp_send_failed'
        if (msg === 'whatsapp_not_connected') {
          res.status(409).json({ error: 'WhatsApp não está conectado.' })
          return
        }
        if (msg === 'whatsapp_recipient_not_found') {
          res.status(400).json({ error: 'Este número não foi encontrado no WhatsApp.' })
          return
        }
        logger.warn({ err, uid, contactId }, 'envio WhatsApp falhou')
        res.status(500).json({ error: 'Falha ao enviar pelo WhatsApp.' })
      }
    }),
  )

  return app
}
