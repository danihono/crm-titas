import { defineSecret } from 'firebase-functions/params'
import { getFirestore } from 'firebase-admin/firestore'
import { decifrar } from './cofre'
import type { CredGoogle } from './google'

/**
 * Chave do cofre — Secret Manager, como a do Gemini.
 * Definir com:  firebase functions:secrets:set INTEGRATIONS_KEY   (32+ caracteres aleatórios)
 *
 * Trocar a chave invalida os tokens já salvos: cada cliente precisa colar o token de novo.
 */
export const INTEGRATIONS_KEY = defineSecret('INTEGRATIONS_KEY')

/** Coleção de topo sem regra em firestore.rules → default-deny, só o Admin SDK alcança. */
export const COL_SEGREDOS = 'integrationSecrets'

export interface SegredosTenant {
  metaToken?: string
  google?: Omit<CredGoogle, 'customerId' | 'loginCustomerId'>
}

function abrir(v: unknown): string {
  return typeof v === 'string' && v ? decifrar(v, INTEGRATIONS_KEY.value()) : ''
}

export async function lerSegredos(uid: string): Promise<SegredosTenant> {
  const s = await getFirestore().doc(`${COL_SEGREDOS}/${uid}`).get()
  if (!s.exists) return {}
  const meta = (s.get('meta') ?? {}) as Record<string, unknown>
  const g = (s.get('google') ?? {}) as Record<string, unknown>
  const out: SegredosTenant = {}
  const metaToken = abrir(meta.token)
  if (metaToken) out.metaToken = metaToken
  const refreshToken = abrir(g.refreshToken)
  if (refreshToken) {
    out.google = {
      developerToken: abrir(g.developerToken),
      clientId: String(g.clientId ?? ''),
      clientSecret: abrir(g.clientSecret),
      refreshToken,
    }
  }
  return out
}

/** Config visível de uma integração (users/{uid}/integrations/{id}). */
export async function lerConfig(uid: string, id: string): Promise<Record<string, unknown>> {
  const s = await getFirestore().doc(`users/${uid}/integrations/${id}`).get()
  return (s.data() ?? {}) as Record<string, unknown>
}

export function credGoogle(seg: SegredosTenant, cfg: Record<string, unknown>): CredGoogle | null {
  const customerId = String(cfg.customerId ?? '')
  if (!seg.google || !customerId || !seg.google.developerToken) return null
  return { ...seg.google, customerId, loginCustomerId: String(cfg.loginCustomerId ?? '') || undefined }
}
