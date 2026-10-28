import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { msg, normalizarIdioma, type Idioma } from '../idioma'
import { APP_CHECK_EXIGIDO, MAX_INSTANCIAS } from '../cota'
import { cifrar, finalDe, hashChave, novaChaveWebhook } from './cofre'
import { descobrirMeta } from './meta'
import { descobrirGoogle, soDigitos } from './google'
import { COL_SEGREDOS, INTEGRATIONS_KEY, credGoogle, lerConfig, lerSegredos } from './segredos'
import { sincronizarLeadsMetaTenant, sincronizarMetricasTenant } from './sync'
import { limpar, type EtapaConversao } from './normalizar'

const OPCOES = {
  region: 'southamerica-east1',
  maxInstances: MAX_INSTANCIAS,
  enforceAppCheck: APP_CHECK_EXIGIDO,
  cors: true,
  secrets: [INTEGRATIONS_KEY],
}

type Papel = 'dono' | 'gestor'

/**
 * Autorização refeita do zero, como em `revogarAcesso`: titular do ambiente ou membro
 * ativo com o papel exigido. Nada do cliente é confiado além do `tenantUid` pedido.
 */
async function exigirPapel(req: CallableRequest, idioma: Idioma, papeis: Papel[]): Promise<string> {
  if (!req.auth) throw new HttpsError('unauthenticated', msg('facaLoginSimples', idioma))
  const tenant = limpar((req.data || {}).tenantUid, 128)
  if (!tenant) throw new HttpsError('invalid-argument', msg('integracaoInvalida', idioma))
  if (req.auth.uid === tenant) return tenant
  const v = await getFirestore().doc(`users/${tenant}/members/${req.auth.uid}`).get()
  if (!v.exists || v.get('active') === false || !papeis.includes(v.get('role'))) {
    const chave = papeis.includes('gestor') ? 'soGestorSincroniza' : 'soDonoIntegra'
    throw new HttpsError('permission-denied', msg(chave, idioma))
  }
  return tenant
}

function selar(v: string): string {
  return cifrar(v, INTEGRATIONS_KEY.value())
}

function erroPlataforma(err: unknown, idioma: Idioma): HttpsError {
  const erro = String((err as Error)?.message ?? err).slice(0, 300)
  return new HttpsError('failed-precondition', msg('falhaPlataforma', idioma).replace('{erro}', erro))
}

type Dados = Record<string, unknown>

/**
 * Salva (ou desconecta) uma integração. Os campos de segredo só são trocados quando vêm
 * preenchidos — reabrir a tela e salvar o resto não pode apagar o token já guardado,
 * porque a tela nunca recebe o token de volta.
 */
export const salvarIntegracao = onCall(OPCOES, async (req) => {
  const idioma = normalizarIdioma((req.data || {}).idioma)
  const uid = await exigirPapel(req, idioma, ['dono'])
  const { provider, desconectar } = (req.data || {}) as { provider?: string; desconectar?: boolean }
  const config = ((req.data || {}).config ?? {}) as Dados
  const segredos = ((req.data || {}).segredos ?? {}) as Dados
  const db = getFirestore()
  const pub = db.doc(`users/${uid}/integrations/${provider}`)
  const cofre = db.doc(`${COL_SEGREDOS}/${uid}`)

  if (provider === 'meta') {
    if (desconectar) {
      await cofre.set({ meta: FieldValue.delete(), metaAtivo: false }, { merge: true })
      await pub.set({ conectado: false, tokenFim: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() }, { merge: true })
      return { ok: true }
    }
    const token = limpar(segredos.token, 1000)
    const ja = (await cofre.get()).get('meta.token')
    if (!token && !ja) throw new HttpsError('invalid-argument', msg('semTokenSalvo', idioma))
    if (token) await cofre.set({ meta: { token: selar(token) }, metaAtivo: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    else await cofre.set({ metaAtivo: true }, { merge: true })
    const anterior = await lerConfig(uid, 'meta')
    const adAccountId = limpar(config.adAccountId, 40)
    const pageId = limpar(config.pageId, 40)
    await pub.set({
      conectado: true,
      adAccountId,
      adAccountName: limpar(config.adAccountName, 200),
      pageId,
      pageName: limpar(config.pageName, 200),
      pixelId: limpar(config.pixelId, 40),
      pixelName: limpar(config.pixelName, 200),
      importarLeads: config.importarLeads !== false,
      ...(token ? { tokenFim: finalDe(token) } : {}),
      // Trocou de conta/página: o histórico e o cursor de leads da anterior não valem.
      ...(anterior.adAccountId !== adAccountId ? { backfillFeito: false } : {}),
      ...(anterior.pageId !== pageId ? { leadsCursor: FieldValue.delete() } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
    return { ok: true }
  }

  if (provider === 'google') {
    if (desconectar) {
      await cofre.set({ google: FieldValue.delete(), googleAtivo: false }, { merge: true })
      await pub.set({ conectado: false, tokenFim: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() }, { merge: true })
      return { ok: true }
    }
    const customerId = soDigitos(String(config.customerId ?? ''))
    const atual = ((await cofre.get()).get('google') ?? {}) as Dados
    const novo: Dados = { ...atual }
    const dev = limpar(segredos.developerToken, 200)
    const clientId = limpar(segredos.clientId, 300)
    const secret = limpar(segredos.clientSecret, 300)
    const refresh = limpar(segredos.refreshToken, 1000)
    if (dev) novo.developerToken = selar(dev)
    if (clientId) novo.clientId = clientId
    if (secret) novo.clientSecret = selar(secret)
    if (refresh) novo.refreshToken = selar(refresh)
    // Sem as quatro credenciais e a conta a integração só recebe leads do formulário
    // (webhook) — o que já funciona sem nada disto. Métrica e conversão exigem o resto.
    const completo = !!(novo.developerToken && novo.clientId && novo.clientSecret && novo.refreshToken && customerId)
    await cofre.set({ google: novo, googleAtivo: completo, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    const anterior = await lerConfig(uid, 'google')
    await pub.set({
      conectado: completo,
      customerId,
      loginCustomerId: soDigitos(String(config.loginCustomerId ?? '')),
      ...(refresh ? { tokenFim: finalDe(refresh) } : {}),
      ...(anterior.customerId !== customerId ? { backfillFeito: false } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
    return { ok: true, completo }
  }

  if (provider === 'conversoes') {
    const etapasIn = (config.etapas ?? {}) as Record<string, EtapaConversao>
    const etapas: Record<string, EtapaConversao> = {}
    for (const [col, e] of Object.entries(etapasIn).slice(0, 10)) {
      const meta = limpar(e?.meta, 60).replace(/[^A-Za-z0-9_]/g, '')
      const google = soDigitos(e?.google)
      if (meta || google) etapas[limpar(col, 40)] = { ...(meta ? { meta } : {}), ...(google ? { google } : {}) }
    }
    await pub.set({
      ativo: config.ativo === true,
      etapas,
      metaTestCode: limpar(config.metaTestCode, 40),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
    return { ok: true }
  }

  throw new HttpsError('invalid-argument', msg('integracaoInvalida', idioma))
})

/**
 * "Testar conexão": usa o token recém-colado (ou o salvo) e devolve o que ele enxerga —
 * contas, páginas, pixels, ações de conversão — para a tela oferecer em lista em vez de
 * pedir que a pessoa caçe ids no gerenciador de anúncios.
 */
export const testarIntegracao = onCall(OPCOES, async (req) => {
  const idioma = normalizarIdioma((req.data || {}).idioma)
  const uid = await exigirPapel(req, idioma, ['dono'])
  const { provider } = (req.data || {}) as { provider?: string }
  const config = ((req.data || {}).config ?? {}) as Dados
  const segredos = ((req.data || {}).segredos ?? {}) as Dados
  const seg = await lerSegredos(uid)

  if (provider === 'meta') {
    const token = limpar(segredos.token, 1000) || seg.metaToken
    if (!token) throw new HttpsError('invalid-argument', msg('semTokenSalvo', idioma))
    try {
      return await descobrirMeta(token, limpar(config.adAccountId, 40) || undefined)
    } catch (err) {
      throw erroPlataforma(err, idioma)
    }
  }

  if (provider === 'google') {
    const salvo = credGoogle(seg, { customerId: config.customerId, loginCustomerId: config.loginCustomerId })
    const cred = {
      developerToken: limpar(segredos.developerToken, 200) || salvo?.developerToken || '',
      clientId: limpar(segredos.clientId, 300) || salvo?.clientId || seg.google?.clientId || '',
      clientSecret: limpar(segredos.clientSecret, 300) || salvo?.clientSecret || '',
      refreshToken: limpar(segredos.refreshToken, 1000) || salvo?.refreshToken || '',
      customerId: soDigitos(String(config.customerId ?? '')),
      loginCustomerId: soDigitos(String(config.loginCustomerId ?? '')) || undefined,
    }
    if (!cred.developerToken || !cred.clientId || !cred.clientSecret || !cred.refreshToken || !cred.customerId) {
      throw new HttpsError('invalid-argument', msg('integracaoInvalida', idioma))
    }
    try {
      const r = await descobrirGoogle(cred)
      await getFirestore().doc(`users/${uid}/integrations/google`).set({
        contaNome: r.conta,
        conversionActions: r.conversionActions.slice(0, 50),
        ...(r.moeda ? { moeda: r.moeda } : {}),
      }, { merge: true })
      return r
    } catch (err) {
      throw erroPlataforma(err, idioma)
    }
  }

  throw new HttpsError('invalid-argument', msg('integracaoInvalida', idioma))
})

/**
 * Cria (ou troca) a chave do webhook de leads. A antiga para de valer na hora — é o botão
 * para quando a chave vazou e o formulário começou a receber spam.
 */
export const gerarChaveWebhook = onCall(OPCOES, async (req) => {
  const idioma = normalizarIdioma((req.data || {}).idioma)
  const uid = await exigirPapel(req, idioma, ['dono'])
  const db = getFirestore()
  const antigas = await db.collection('leadWebhooks').where('tenantUid', '==', uid).get()
  const chave = novaChaveWebhook()
  const b = db.batch()
  antigas.docs.forEach((d) => b.delete(d.ref))
  b.set(db.doc(`leadWebhooks/${hashChave(chave)}`), { tenantUid: uid, active: true, createdAt: FieldValue.serverTimestamp() })
  // A chave fica legível na config: ela vai no HTML público do site e no painel do Google
  // de qualquer jeito. Quem a lê só consegue mandar lead — e para isso existe o limite.
  b.set(db.doc(`users/${uid}/integrations/site`), { chave, criadaEm: FieldValue.serverTimestamp() }, { merge: true })
  await b.commit()
  return { chave }
})

export const sincronizarAnunciosAgora = onCall({ ...OPCOES, timeoutSeconds: 300 }, async (req) => {
  const idioma = normalizarIdioma((req.data || {}).idioma)
  const uid = await exigirPapel(req, idioma, ['dono', 'gestor'])
  const [metricas, leadsMeta] = await Promise.all([
    sincronizarMetricasTenant(uid),
    sincronizarLeadsMetaTenant(uid),
  ])
  return { ...metricas, leadsMeta }
})
