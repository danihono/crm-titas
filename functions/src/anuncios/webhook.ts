import { onRequest } from 'firebase-functions/v2/https'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { hashChave } from './cofre'
import { ingerirLead } from './ingestao'
import {
  ehGoogleLeadForm, leadUtil, limpar, normalizarGoogle, normalizarSite, type LeadNormalizado,
} from './normalizar'

/** Acima disso não é formulário, é abuso. */
const MAX_CORPO = 32 * 1024
/** Leads por chave por hora — campanha boa não chega perto; robô em laço chega. */
const MAX_POR_HORA = 600
const JANELA_MS = 60 * 60 * 1000

/** Janela por chave no Firestore — cada instância é um processo novo (ver cota.ts). */
async function dentroDoLimite(hash: string): Promise<boolean> {
  const db = getFirestore()
  const ref = db.doc(`leadWebhookUsage/${hash}`)
  const agora = Date.now()
  return db.runTransaction(async (tx) => {
    const s = await tx.get(ref)
    const inicio = Number(s.get('windowStart') ?? 0)
    const usados = Number(s.get('count') ?? 0)
    const viva = agora - inicio < JANELA_MS
    if (viva && usados >= MAX_POR_HORA) return false
    tx.set(ref, { windowStart: viva ? inicio : agora, count: viva ? usados + 1 : 1 })
    return true
  })
}

/** `_redirect` só para http(s) — senão vira open redirect para `javascript:`. */
function redirectValido(v: unknown): string | null {
  const s = limpar(v, 500)
  try {
    const u = new URL(s)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null
  } catch {
    return null
  }
}

/**
 * Entrada de leads por HTTP: formulários do site (snippet) e o webhook do formulário de
 * lead do Google Ads. A MESMA URL serve aos dois; o formato do corpo diz quem é.
 *
 * A chave vai na query (`?k=`), no header `x-titas-key` ou, no caso do Google, no campo
 * `google_key` do corpo — é ali que o Google manda a "chave" que a pessoa cola no painel
 * dele. Ela não é segredo forte (fica no HTML do site); o que ela faz é apontar o tenant
 * sem expor o uid, e poder ser trocada quando vazar para spam.
 */
export const receberLead = onRequest(
  {
    region: 'southamerica-east1',
    cors: true,
    maxInstances: 10,
    memory: '256MiB',
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'method' })
      return
    }
    if ((req.rawBody?.length ?? 0) > MAX_CORPO) {
      res.status(413).json({ ok: false, error: 'too_large' })
      return
    }
    // O snippet do site manda JSON como text/plain: é o que o sendBeacon consegue, e evita
    // o preflight de CORS. O Functions entrega esse corpo como string.
    let bruto: unknown = req.body
    if (typeof bruto === 'string' || Buffer.isBuffer(bruto)) {
      try { bruto = JSON.parse(bruto.toString()) } catch { bruto = {} }
    }
    const body = (bruto && typeof bruto === 'object' && !Array.isArray(bruto) ? bruto : {}) as Record<string, unknown>
    const chave = limpar(req.query.k ?? req.get('x-titas-key') ?? body.google_key ?? body.k, 100)
    if (!chave) {
      res.status(401).json({ ok: false, error: 'key' })
      return
    }

    const hash = hashChave(chave)
    const db = getFirestore()
    const idx = await db.doc(`leadWebhooks/${hash}`).get()
    const tenantUid = idx.get('tenantUid') as string | undefined
    if (!idx.exists || !tenantUid || idx.get('active') === false) {
      res.status(401).json({ ok: false, error: 'key' })
      return
    }

    const redirect = redirectValido(body._redirect)
    const responder = (status: number, payload: Record<string, unknown>) => {
      if (redirect && status < 400) res.redirect(303, redirect)
      else res.status(status).json(payload)
    }

    // Honeypot: campo escondido que humano não preenche. Responde OK para o robô não
    // aprender que foi pego.
    if (limpar(body._hp)) {
      responder(200, { ok: true })
      return
    }

    if (!(await dentroDoLimite(hash))) {
      res.status(429).json({ ok: false, error: 'rate_limited' })
      return
    }

    let lead: LeadNormalizado | null
    const doGoogle = ehGoogleLeadForm(body)
    if (doGoogle) lead = normalizarGoogle(body)
    else lead = normalizarSite(body)
    if (!lead || !leadUtil(lead)) {
      res.status(400).json({ ok: false, error: 'empty_lead' })
      return
    }

    try {
      const r = await ingerirLead(tenantUid, lead)
      const integ = doGoogle ? 'google' : 'site'
      await db.doc(`users/${tenantUid}/integrations/${integ}`).set({
        lastLeadAt: FieldValue.serverTimestamp(),
        ...(r.created ? { totalLeads: FieldValue.increment(1) } : {}),
      }, { merge: true })
      responder(200, { ok: true, created: r.created })
    } catch (err) {
      console.error('[receberLead]', tenantUid, err)
      // 500 faz o Google reenviar depois — e reenviar é seguro, a ingestão é idempotente.
      res.status(500).json({ ok: false, error: 'internal' })
    }
  },
)
