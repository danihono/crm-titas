import { dataGoogle, linhaGoogle, type GoogleRowBruta, type LinhaDiaria } from './normalizar'

/**
 * Cliente mínimo da Google Ads API (REST) — sem a lib oficial, que é pesada e puxa gRPC.
 *
 * Versão numa constante e num env: o Google desliga cada versão um ano depois de lançar,
 * e trocar o número não deveria exigir mudar código.
 */
export const GOOGLE_ADS_VERSAO = process.env.TITA_GOOGLE_ADS_VERSION || 'v26'
const BASE = `https://googleads.googleapis.com/${GOOGLE_ADS_VERSAO}`

export interface CredGoogle {
  developerToken: string
  clientId: string
  clientSecret: string
  refreshToken: string
  /** Conta de anúncio, só dígitos. */
  customerId: string
  /** MCC por onde o acesso passa, quando há. */
  loginCustomerId?: string
}

export class ErroGoogle extends Error {}

export function soDigitos(id: string | undefined): string {
  return String(id ?? '').replace(/\D/g, '')
}

async function accessToken(c: CredGoogle): Promise<string> {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: c.clientId,
      client_secret: c.clientSecret,
      refresh_token: c.refreshToken,
    }),
    signal: AbortSignal.timeout(20_000),
  })
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; error_description?: string; error?: string }
  if (!r.ok || !j.access_token) throw new ErroGoogle(`OAuth: ${j.error_description || j.error || r.status}`)
  return j.access_token
}

async function chamar<T>(c: CredGoogle, caminho: string, body: unknown, token?: string): Promise<T> {
  const at = token ?? (await accessToken(c))
  const headers: Record<string, string> = {
    authorization: `Bearer ${at}`,
    'developer-token': c.developerToken,
    'content-type': 'application/json',
  }
  const login = soDigitos(c.loginCustomerId)
  if (login) headers['login-customer-id'] = login
  const r = await fetch(`${BASE}/${caminho}`, {
    method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000),
  })
  const j = (await r.json().catch(() => ({}))) as unknown
  if (!r.ok) {
    const erro = Array.isArray(j) ? j[0] : j
    const m = (erro as { error?: { message?: string } })?.error?.message
    throw new ErroGoogle(m || `HTTP ${r.status}`)
  }
  return j as T
}

async function gaql<T>(c: CredGoogle, query: string, token?: string): Promise<T[]> {
  const cid = soDigitos(c.customerId)
  const lotes = await chamar<{ results?: T[] }[]>(c, `customers/${cid}/googleAds:searchStream`, { query }, token)
  return (Array.isArray(lotes) ? lotes : []).flatMap((l) => l.results ?? [])
}

// ---------------------------------------------------------------------------

export interface DescobertaGoogle {
  conta: string
  moeda?: string
  conversionActions: { id: string; name: string }[]
}

export async function descobrirGoogle(c: CredGoogle): Promise<DescobertaGoogle> {
  const token = await accessToken(c)
  const [cliente, acoes] = await Promise.all([
    gaql<{ customer?: { descriptiveName?: string; currencyCode?: string; id?: string } }>(
      c, 'SELECT customer.id, customer.descriptive_name, customer.currency_code FROM customer LIMIT 1', token),
    gaql<{ conversionAction?: { id?: string; name?: string } }>(
      c,
      "SELECT conversion_action.id, conversion_action.name FROM conversion_action WHERE conversion_action.type = 'UPLOAD_CLICKS' AND conversion_action.status = 'ENABLED'",
      token,
    ).catch(() => []),
  ])
  const cu = cliente[0]?.customer
  return {
    conta: cu?.descriptiveName || cu?.id || soDigitos(c.customerId),
    moeda: cu?.currencyCode,
    conversionActions: acoes
      .map((a) => ({ id: String(a.conversionAction?.id ?? ''), name: a.conversionAction?.name ?? '' }))
      .filter((a) => a.id),
  }
}

export interface CampanhaGoogle { id: string; name: string; status?: string; objective?: string }

export async function buscarMetricasGoogle(
  c: CredGoogle,
  desde: string,
  ate: string,
): Promise<{ linhas: LinhaDiaria[]; campanhas: CampanhaGoogle[]; moeda?: string }> {
  const token = await accessToken(c)
  const rows = await gaql<GoogleRowBruta & { campaign?: { advertisingChannelType?: string }; customer?: { currencyCode?: string } }>(
    c,
    `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, customer.currency_code,
            segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
       FROM campaign
      WHERE segments.date BETWEEN '${desde}' AND '${ate}'`,
    token,
  )
  const campanhas = new Map<string, CampanhaGoogle>()
  for (const r of rows) {
    const id = String(r.campaign?.id ?? '')
    if (id && !campanhas.has(id)) {
      campanhas.set(id, {
        id,
        name: r.campaign?.name ?? id,
        status: r.campaign?.status,
        objective: r.campaign?.advertisingChannelType,
      })
    }
  }
  return {
    linhas: rows.map(linhaGoogle).filter((l): l is LinhaDiaria => !!l),
    campanhas: [...campanhas.values()],
    moeda: rows[0]?.customer?.currencyCode,
  }
}

export interface ConversaoGoogle {
  conversionActionId: string
  gclid: string
  quando: Date
  valor: number
  moeda: string
  orderId: string
  timeZone?: string
}

/**
 * Conversão offline por gclid. `orderId` = card + etapa: o Google descarta a repetição
 * do mesmo pedido, então um retry nunca vira venda dobrada.
 */
export async function enviarConversaoGoogle(c: CredGoogle, conv: ConversaoGoogle): Promise<void> {
  const cid = soDigitos(c.customerId)
  const r = await chamar<{ partialFailureError?: { message?: string } }>(c, `customers/${cid}:uploadClickConversions`, {
    conversions: [{
      gclid: conv.gclid,
      conversionAction: `customers/${cid}/conversionActions/${soDigitos(conv.conversionActionId)}`,
      conversionDateTime: dataGoogle(conv.quando, conv.timeZone),
      conversionValue: conv.valor,
      currencyCode: conv.moeda,
      orderId: conv.orderId,
    }],
    partialFailure: true,
  })
  if (r.partialFailureError?.message) throw new ErroGoogle(r.partialFailureError.message)
}
