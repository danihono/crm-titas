import express, { type Request, type Response, type NextFunction, type Express } from 'express'
import { FieldValue } from 'firebase-admin/firestore'
import { adminAuth, db } from './firebase.js'
import { logger } from './logger.js'
import { config } from './config.js'
import { startSession, stopSession, sessionCount } from './sessionManager.js'
import { writeStatus } from './status.js'
import { purgeConnection } from './purge.js'

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

// Origem permitida para o frontend chamar o daemon (Cloud Run é outro host).
// Auth é por Bearer token (não cookie), então '*' é aceitável; restrinja em prod se quiser.
const ALLOWED_ORIGIN = process.env.WA_ALLOWED_ORIGIN ?? '*'

export function createHttpServer(): Express {
  const app = express()
  app.use(express.json())

  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', ALLOWED_ORIGIN)
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

  return app
}
