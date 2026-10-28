import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

/**
 * Cofre dos tokens de anúncio.
 *
 * Token da Meta ou refresh token do Google mexem no dinheiro do cliente: com eles se lê
 * gasto, se cria anúncio, se baixa lead. Por isso eles NUNCA vão para um documento que o
 * navegador alcance (vivem em `integrationSecrets/{tenant}`, default-deny nas regras) e,
 * mesmo ali, ficam cifrados — um export do Firestore ou um backup vazado não entrega nada
 * sem a `INTEGRATIONS_KEY`, que mora no Secret Manager.
 *
 * Puro (recebe a chave), para o teste de ida e volta rodar sem Firebase.
 */

const VERSAO = 'v1'

function chaveDe(segredo: string): Buffer {
  if (!segredo || segredo.length < 16) throw new Error('INTEGRATIONS_KEY ausente ou curta demais')
  return createHash('sha256').update(segredo).digest()
}

export function cifrar(texto: string, segredo: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', chaveDe(segredo), iv)
  const ct = Buffer.concat([c.update(texto, 'utf8'), c.final()])
  return [VERSAO, iv.toString('base64'), c.getAuthTag().toString('base64'), ct.toString('base64')].join(':')
}

export function decifrar(pacote: string, segredo: string): string {
  const [v, iv, tag, ct] = String(pacote || '').split(':')
  if (v !== VERSAO || !iv || !tag || !ct) throw new Error('segredo em formato desconhecido')
  const d = createDecipheriv('aes-256-gcm', chaveDe(segredo), Buffer.from(iv, 'base64'))
  d.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8')
}

/** Só o final, para a tela mostrar "…a1b2" e a pessoa saber qual token está salvo. */
export function finalDe(token: string): string {
  const t = token.trim()
  return t.length > 8 ? t.slice(-4) : ''
}

/** Chave nova do webhook: aleatória, curta o bastante para colar, longa para não adivinhar. */
export function novaChaveWebhook(): string {
  return randomBytes(18).toString('base64url')
}

export function hashChave(chave: string): string {
  return createHash('sha256').update(chave).digest('hex')
}
