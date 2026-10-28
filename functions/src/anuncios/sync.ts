import { onSchedule } from 'firebase-functions/v2/scheduler'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { ingerirLead } from './ingestao'
import { buscarLeadsMeta, buscarMetricasMeta } from './meta'
import { buscarMetricasGoogle } from './google'
import { COL_SEGREDOS, INTEGRATIONS_KEY, credGoogle, lerConfig, lerSegredos } from './segredos'
import type { LinhaDiaria } from './normalizar'

/** Janela normal: a Meta e o Google reatribuem conversão por alguns dias depois do clique. */
const DIAS_JANELA = 3
/** Primeira sincronização de uma conta: o bastante para a aba ter história. */
const DIAS_BACKFILL = 30
/** Primeiro poll de leads: não importar o histórico inteiro da página como "Novo lead". */
const DIAS_LEADS_INICIAL = 3

function dia(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function janela(dias: number): { desde: string; ate: string } {
  const ate = new Date()
  const desde = new Date(ate.getTime() - (dias - 1) * 86_400_000)
  return { desde: dia(desde), ate: dia(ate) }
}

function mensagemDe(err: unknown): string {
  return String((err as Error)?.message ?? err).slice(0, 300)
}

interface Campanha { id: string; name: string; status?: string; objective?: string }

/**
 * Grava as linhas diárias e o resumo de cada campanha.
 *
 * `adDaily` é PLANO (um doc por campanha × dia, com a data como campo) e não uma
 * subcoleção: a aba precisa de "todos os dias do período, de todas as campanhas", e numa
 * subcoleção isso seria um collectionGroup — que exigiria regra própria cruzando tenants.
 */
async function gravarMetricas(
  uid: string,
  provider: 'meta' | 'google',
  linhas: LinhaDiaria[],
  campanhas: Campanha[],
  moeda?: string,
): Promise<void> {
  const db = getFirestore()
  const base = db.doc(`users/${uid}`)
  const ops: ((b: FirebaseFirestore.WriteBatch) => void)[] = []

  const nomes = new Map(linhas.map((l) => [l.campaignId, l.campaignName]))
  const vistas = new Map<string, Campanha>()
  for (const c of campanhas) vistas.set(c.id, c)
  for (const l of linhas) if (!vistas.has(l.campaignId)) vistas.set(l.campaignId, { id: l.campaignId, name: l.campaignName })

  for (const c of vistas.values()) {
    const key = `${provider}_${c.id.replace(/[^A-Za-z0-9_-]/g, '_')}`
    ops.push((b) => b.set(base.collection('adCampaigns').doc(key), {
      provider,
      campaignId: c.id,
      name: c.name || nomes.get(c.id) || c.id,
      ...(c.status ? { status: c.status } : {}),
      ...(c.objective ? { objective: c.objective } : {}),
      ...(moeda ? { currency: moeda } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true }))
  }
  for (const l of linhas) {
    ops.push((b) => b.set(base.collection('adDaily').doc(`${l.campaignKey}_${l.date}`), {
      ...l,
      updatedAt: FieldValue.serverTimestamp(),
    }))
  }
  for (let i = 0; i < ops.length; i += 450) {
    const b = db.batch()
    ops.slice(i, i + 450).forEach((op) => op(b))
    await b.commit()
  }
}

/** Métricas de UM tenant, nas duas plataformas. Erro de uma não impede a outra. */
export async function sincronizarMetricasTenant(uid: string): Promise<{ meta?: string; google?: string }> {
  const db = getFirestore()
  const seg = await lerSegredos(uid)
  const out: { meta?: string; google?: string } = {}

  const meta = await lerConfig(uid, 'meta')
  if (seg.metaToken && meta.adAccountId) {
    const ref = db.doc(`users/${uid}/integrations/meta`)
    try {
      const { desde, ate } = janela(meta.backfillFeito ? DIAS_JANELA : DIAS_BACKFILL)
      const r = await buscarMetricasMeta(seg.metaToken, String(meta.adAccountId), desde, ate)
      await gravarMetricas(uid, 'meta', r.linhas, r.campanhas, r.moeda)
      await ref.set({ lastSyncAt: FieldValue.serverTimestamp(), backfillFeito: true, lastError: FieldValue.delete(), ...(r.moeda ? { moeda: r.moeda } : {}) }, { merge: true })
      out.meta = 'ok'
    } catch (err) {
      out.meta = mensagemDe(err)
      await ref.set({ lastError: out.meta, lastErrorAt: FieldValue.serverTimestamp() }, { merge: true })
    }
  }

  const gcfg = await lerConfig(uid, 'google')
  const cred = credGoogle(seg, gcfg)
  if (cred) {
    const ref = db.doc(`users/${uid}/integrations/google`)
    try {
      const { desde, ate } = janela(gcfg.backfillFeito ? DIAS_JANELA : DIAS_BACKFILL)
      const r = await buscarMetricasGoogle(cred, desde, ate)
      await gravarMetricas(uid, 'google', r.linhas, r.campanhas, r.moeda)
      await ref.set({ lastSyncAt: FieldValue.serverTimestamp(), backfillFeito: true, lastError: FieldValue.delete(), ...(r.moeda ? { moeda: r.moeda } : {}) }, { merge: true })
      out.google = 'ok'
    } catch (err) {
      out.google = mensagemDe(err)
      await ref.set({ lastError: out.google, lastErrorAt: FieldValue.serverTimestamp() }, { merge: true })
    }
  }
  return out
}

/** Leads novos dos formulários da Meta. O cursor só avança depois de gravar. */
export async function sincronizarLeadsMetaTenant(uid: string): Promise<number> {
  const seg = await lerSegredos(uid)
  const meta = await lerConfig(uid, 'meta')
  if (!seg.metaToken || !meta.pageId || meta.importarLeads === false) return 0
  const ref = getFirestore().doc(`users/${uid}/integrations/meta`)
  const cursor = Number(meta.leadsCursor) || Math.floor(Date.now() / 1000) - DIAS_LEADS_INICIAL * 86_400
  try {
    const { leads, maisRecente } = await buscarLeadsMeta(seg.metaToken, String(meta.pageId), cursor)
    let novos = 0
    for (const l of leads) {
      const r = await ingerirLead(uid, l)
      if (r.created) novos++
    }
    await ref.set({
      leadsCursor: maisRecente,
      lastLeadsSyncAt: FieldValue.serverTimestamp(),
      leadsError: FieldValue.delete(),
      ...(novos ? { totalLeads: FieldValue.increment(novos), lastLeadAt: FieldValue.serverTimestamp() } : {}),
    }, { merge: true })
    return novos
  } catch (err) {
    await ref.set({ leadsError: mensagemDe(err), lastErrorAt: FieldValue.serverTimestamp() }, { merge: true })
    return 0
  }
}

async function tenants(flag: 'metaAtivo' | 'googleAtivo' | null): Promise<string[]> {
  const col = getFirestore().collection(COL_SEGREDOS)
  const snap = flag ? await col.where(flag, '==', true).get() : await col.get()
  return snap.docs.map((d) => d.id)
}

/** Um tenant por vez, cada um isolado: token vencido de um não derruba os outros. */
async function paraCada(uids: string[], fn: (uid: string) => Promise<unknown>, rotulo: string): Promise<void> {
  for (const uid of uids) {
    try {
      await fn(uid)
    } catch (err) {
      console.error(`[${rotulo}] ${uid}:`, err)
    }
  }
}

export const sincronizarAnuncios = onSchedule(
  {
    schedule: 'every 60 minutes',
    timeZone: 'America/Sao_Paulo',
    region: 'southamerica-east1',
    secrets: [INTEGRATIONS_KEY],
    maxInstances: 1,
    timeoutSeconds: 540,
  },
  async () => {
    const uids = [...new Set([...(await tenants('metaAtivo')), ...(await tenants('googleAtivo'))])]
    await paraCada(uids, sincronizarMetricasTenant, 'sincronizarAnuncios')
  },
)

export const sincronizarLeadsMeta = onSchedule(
  {
    schedule: 'every 5 minutes',
    timeZone: 'America/Sao_Paulo',
    region: 'southamerica-east1',
    secrets: [INTEGRATIONS_KEY],
    maxInstances: 1,
    timeoutSeconds: 240,
  },
  async () => {
    await paraCada(await tenants('metaAtivo'), sincronizarLeadsMetaTenant, 'sincronizarLeadsMeta')
  },
)
