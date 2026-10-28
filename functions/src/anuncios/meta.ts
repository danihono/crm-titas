import {
  fbcDe, linhaMeta, normalizarMeta, type LinhaDiaria, type MetaInsightBruto,
  type MetaLeadBruto, type LeadNormalizado,
} from './normalizar'

/**
 * Cliente mínimo da Graph/Marketing API da Meta — `fetch` puro, sem SDK.
 *
 * A versão fica numa constante (e num env para trocar sem deploy de código): na Marketing
 * API, chamada para versão expirada FALHA, ela não cai para a seguinte como na Graph.
 */
export const META_VERSAO = process.env.TITA_META_GRAPH_VERSION || 'v25.0'
const BASE = `https://graph.facebook.com/${META_VERSAO}`

export class ErroMeta extends Error {
  constructor(msg: string, readonly code?: number) { super(msg) }
}

type Params = Record<string, string | number | undefined>

async function chamar<T>(caminho: string, token: string, params: Params = {}, init?: RequestInit): Promise<T> {
  const url = caminho.startsWith('https://') ? new URL(caminho) : new URL(`${BASE}/${caminho.replace(/^\//, '')}`)
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v))
  if (!url.searchParams.has('access_token')) url.searchParams.set('access_token', token)
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(25_000) })
  const json = (await r.json().catch(() => ({}))) as { error?: { message?: string; code?: number } } & T
  if (!r.ok || json.error) {
    throw new ErroMeta(json.error?.message || `HTTP ${r.status}`, json.error?.code)
  }
  return json
}

interface Pagina<T> { data?: T[]; paging?: { next?: string } }

/** Segue `paging.next` até o teto — teto existe para um loop da API não virar timeout. */
async function todas<T>(caminho: string, token: string, params: Params, maxPaginas = 20): Promise<T[]> {
  const out: T[] = []
  let p = await chamar<Pagina<T>>(caminho, token, params)
  out.push(...(p.data ?? []))
  for (let i = 1; i < maxPaginas && p.paging?.next; i++) {
    p = await chamar<Pagina<T>>(p.paging.next, token)
    out.push(...(p.data ?? []))
  }
  return out
}

export function actId(adAccountId: string): string {
  const id = adAccountId.trim().replace(/^act_/, '')
  return `act_${id}`
}

// ---------------------------------------------------------------------------
// Descoberta (botão "Testar conexão")
// ---------------------------------------------------------------------------

export interface DescobertaMeta {
  usuario: string
  adAccounts: { id: string; name: string; currency?: string }[]
  pages: { id: string; name: string }[]
  pixels: { id: string; name: string }[]
}

export async function descobrirMeta(token: string, adAccountId?: string): Promise<DescobertaMeta> {
  const me = await chamar<{ id: string; name?: string }>('me', token, { fields: 'id,name' })
  const [contas, paginas] = await Promise.all([
    todas<{ id: string; name?: string; currency?: string }>('me/adaccounts', token, { fields: 'id,name,currency', limit: 100 }, 3)
      .catch(() => []),
    todas<{ id: string; name?: string }>('me/accounts', token, { fields: 'id,name', limit: 100 }, 3)
      .catch(() => []),
  ])
  const conta = adAccountId || contas[0]?.id
  const pixels = conta
    ? await todas<{ id: string; name?: string }>(`${actId(conta)}/adspixels`, token, { fields: 'id,name', limit: 50 }, 2).catch(() => [])
    : []
  return {
    usuario: me.name || me.id,
    adAccounts: contas.map((c) => ({ id: c.id, name: c.name || c.id, currency: c.currency })),
    pages: paginas.map((p) => ({ id: p.id, name: p.name || p.id })),
    pixels: pixels.map((p) => ({ id: p.id, name: p.name || p.id })),
  }
}

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

/**
 * Leads da página por formulário, criados depois de `desdeUnix`.
 *
 * Os endpoints de lead pedem token DE PÁGINA. Com o token de usuário do sistema dá para
 * pedir o da página em `/me/accounts`; se a página não aparecer ali (token de página
 * colado direto), usa o próprio token.
 */
export async function buscarLeadsMeta(
  token: string,
  pageId: string,
  desdeUnix: number,
): Promise<{ leads: LeadNormalizado[]; maisRecente: number }> {
  let tokenPagina = token
  try {
    const pags = await todas<{ id: string; access_token?: string }>('me/accounts', token, { fields: 'id,access_token', limit: 100 }, 3)
    tokenPagina = pags.find((p) => p.id === pageId)?.access_token || token
  } catch {
    // token já é de página
  }

  const forms = await todas<{ id: string; status?: string }>(`${pageId}/leadgen_forms`, tokenPagina, { fields: 'id,status', limit: 100 }, 5)
  const filtro = JSON.stringify([{ field: 'time_created', operator: 'GREATER_THAN', value: desdeUnix }])
  const campos = 'id,created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,is_organic'

  const leads: LeadNormalizado[] = []
  let maisRecente = desdeUnix
  for (const f of forms) {
    const brutos = await todas<MetaLeadBruto>(`${f.id}/leads`, tokenPagina, { fields: campos, filtering: filtro, limit: 100 }, 10)
    for (const b of brutos) {
      const l = normalizarMeta({ ...b, form_id: b.form_id || f.id })
      if (!l) continue
      leads.push(l)
      const t = l.createdAt ? Math.floor(l.createdAt.getTime() / 1000) : 0
      if (t > maisRecente) maisRecente = t
    }
  }
  return { leads, maisRecente }
}

// ---------------------------------------------------------------------------
// Métricas
// ---------------------------------------------------------------------------

export interface CampanhaMeta { id: string; name: string; status?: string; objective?: string }

export async function buscarMetricasMeta(
  token: string,
  adAccountId: string,
  desde: string,
  ate: string,
): Promise<{ linhas: LinhaDiaria[]; campanhas: CampanhaMeta[]; moeda?: string }> {
  const act = actId(adAccountId)
  const [brutas, campanhas, conta] = await Promise.all([
    todas<MetaInsightBruto>(`${act}/insights`, token, {
      level: 'campaign',
      time_increment: 1,
      time_range: JSON.stringify({ since: desde, until: ate }),
      fields: 'campaign_id,campaign_name,impressions,clicks,spend,actions',
      limit: 500,
    }, 20),
    todas<{ id: string; name: string; effective_status?: string; objective?: string }>(
      `${act}/campaigns`, token, { fields: 'id,name,effective_status,objective', limit: 200 }, 5,
    ).catch(() => []),
    chamar<{ currency?: string }>(act, token, { fields: 'currency' }).catch(() => ({} as { currency?: string })),
  ])
  return {
    linhas: brutas.map(linhaMeta).filter((l): l is LinhaDiaria => !!l),
    campanhas: campanhas.map((c) => ({ id: c.id, name: c.name, status: c.effective_status, objective: c.objective })),
    moeda: conta.currency,
  }
}

// ---------------------------------------------------------------------------
// Conversions API
// ---------------------------------------------------------------------------

export interface EventoCapi {
  pixelId: string
  eventName: string
  eventId: string
  eventTime: Date
  value: number
  currency: string
  leadId?: string
  fbclid?: string
  fbclidEm?: number
  hashes?: { em?: string; ph?: string }
  testCode?: string
}

/**
 * Evento de CRM para a Meta. `action_source: system_generated` + `lead_id` é o formato da
 * integração "Conversion Leads": diz à Meta que aquele lead do formulário virou
 * qualificado/venda, e o algoritmo passa a procurar mais gente parecida com quem COMPRA.
 */
export async function enviarCapi(token: string, ev: EventoCapi): Promise<void> {
  const userData: Record<string, unknown> = {}
  if (ev.leadId) userData.lead_id = ev.leadId
  if (ev.hashes?.em) userData.em = [ev.hashes.em]
  if (ev.hashes?.ph) userData.ph = [ev.hashes.ph]
  if (ev.fbclid) userData.fbc = fbcDe(ev.fbclid, ev.fbclidEm ?? ev.eventTime.getTime())
  const body = {
    data: [{
      event_name: ev.eventName,
      event_time: Math.floor(ev.eventTime.getTime() / 1000),
      event_id: ev.eventId,
      action_source: 'system_generated',
      user_data: userData,
      custom_data: {
        value: ev.value,
        currency: ev.currency,
        event_source: 'crm',
        lead_event_source: 'Titas CRM',
      },
    }],
    ...(ev.testCode ? { test_event_code: ev.testCode } : {}),
  }
  await chamar(`${ev.pixelId}/events`, token, {}, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}
