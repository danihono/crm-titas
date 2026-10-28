import { createHash } from 'node:crypto'

/**
 * Tradução de tudo que chega das plataformas de anúncio para UM formato só.
 *
 * Funções puras de propósito: é aqui que um campo com nome inesperado vira lead sem
 * telefone, e isso erra calado — o card nasce, só que sem como responder. Puro, dá para
 * testar cada formato sem emulador (tests/unit/anuncios.test.ts).
 */

export type Canal = 'meta' | 'google' | 'site'

export interface Utm {
  source?: string
  medium?: string
  campaign?: string
  term?: string
  content?: string
}

/** O lead já traduzido, pronto para virar contato + card. */
export interface LeadNormalizado {
  channel: Canal
  /** Id estável na origem — vira o id do card, e é isso que impede duplicar. */
  externalId: string
  name: string
  email: string
  /** Só dígitos, com DDI (55 quando parece número brasileiro sem DDI). */
  phone: string
  company: string
  /** Respostas que não são nome/e-mail/telefone/empresa — perguntas do formulário etc. */
  fields: Record<string, string>
  campaignId?: string
  campaignName?: string
  adsetId?: string
  adsetName?: string
  adId?: string
  adName?: string
  formId?: string
  leadId?: string
  gclid?: string
  fbclid?: string
  utm?: Utm
  landingUrl?: string
  isTest?: boolean
  createdAt?: Date
}

/** Tetos de tamanho: o webhook é público, então nenhum campo cresce sem limite. */
export const MAX_CAMPO = 500
export const MAX_CAMPOS_EXTRAS = 30

export function limpar(v: unknown, max = MAX_CAMPO): string {
  if (v === null || v === undefined) return ''
  const s = Array.isArray(v) ? v.map((x) => String(x)).join(', ') : String(v)
  // Sem caracteres de controle: o texto vai para a tela e para o WhatsApp.
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max)
}

/**
 * Telefone em dígitos com DDI. 10 ou 11 dígitos sem DDI é o formato brasileiro de quem
 * digita "(11) 99999-8888" no formulário — sem o 55 o daemon do WhatsApp nunca casaria a
 * conversa com este contato.
 */
export function normalizarTelefone(v: unknown): string {
  const bruto = limpar(v, 40)
  // "+" ou "00" na frente: a pessoa já disse o país — não se adivinha 55 por cima.
  const internacional = /^\s*(\+|00)/.test(bruto)
  let d = bruto.replace(/\D/g, '')
  d = d.replace(/^00/, '')
  if (!internacional) {
    d = d.replace(/^0(?=\d{10,11}$)/, '')
    if (d.length === 10 || d.length === 11) d = `55${d}`
  }
  return d.length >= 8 && d.length <= 15 ? d : ''
}

export function normalizarEmail(v: unknown): string {
  const e = limpar(v, 200).toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : ''
}

/** SHA-256 em hex — o formato que a Meta (CAPI) e o Google pedem para dado pessoal. */
export function sha256(v: string): string {
  return createHash('sha256').update(v).digest('hex')
}

/** Hashes de e-mail e telefone já no formato da Conversions API. */
export function hashesPessoais(email: string, phone: string): { em?: string; ph?: string } {
  return {
    ...(email ? { em: sha256(email.trim().toLowerCase()) } : {}),
    ...(phone ? { ph: sha256(phone.replace(/\D/g, '')) } : {}),
  }
}

/** Id de documento do Firestore a partir de um id externo qualquer. */
export function idSeguro(v: string): string {
  return v.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120) || 'x'
}

/** Id do card: determinístico, para reentrega e poll repetido não duplicarem. */
export function dealIdDoLead(lead: Pick<LeadNormalizado, 'channel' | 'externalId'>): string {
  return `${lead.channel}_${idSeguro(lead.externalId)}`
}

/** Chave da campanha que liga card, métricas e linha da tabela. */
export function campaignKeyDe(lead: Pick<LeadNormalizado, 'channel' | 'campaignId' | 'utm'>): string {
  if (lead.campaignId) return `${lead.channel}_${idSeguro(lead.campaignId)}`
  const c = lead.utm?.campaign
  if (c) {
    // Lead do site vindo de anúncio: a utm diz de qual plataforma.
    const src = (lead.utm?.source ?? '').toLowerCase()
    const canal = /facebook|instagram|^fb$|^ig$|meta/.test(src) ? 'meta' : /google|adwords/.test(src) ? 'google' : 'site'
    return `${canal}_utm_${idSeguro(c.toLowerCase())}`
  }
  return ''
}

// ---------------------------------------------------------------------------
// Reconhecimento dos campos
// ---------------------------------------------------------------------------

type Papel = 'name' | 'first' | 'last' | 'email' | 'phone' | 'company'

/** Nomes de campo que cada plataforma (e cada site) usa para a mesma coisa. */
const SINONIMOS: Record<string, Papel> = {
  full_name: 'name', name: 'name', nome: 'name', nome_completo: 'name', fullname: 'name', your_name: 'name',
  first_name: 'first', primeiro_nome: 'first', firstname: 'first',
  last_name: 'last', sobrenome: 'last', lastname: 'last',
  email: 'email', e_mail: 'email', work_email: 'email', email_address: 'email', mail: 'email',
  phone_number: 'phone', phone: 'phone', telefone: 'phone', celular: 'phone', whatsapp: 'phone',
  work_phone: 'phone', tel: 'phone', fone: 'phone', mobile: 'phone',
  company_name: 'company', company: 'company', empresa: 'company', nome_da_empresa: 'company',
}

function chaveCampo(nome: string): string {
  return nome
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

interface Pares { nome: string; valor: string }

/** Monta os campos conhecidos e guarda o resto como extras. */
function montar(pares: Pares[]): Pick<LeadNormalizado, 'name' | 'email' | 'phone' | 'company' | 'fields'> {
  let name = ''
  let first = ''
  let last = ''
  let email = ''
  let phone = ''
  let company = ''
  const fields: Record<string, string> = {}
  for (const { nome, valor } of pares) {
    if (!valor) continue
    const papel = SINONIMOS[chaveCampo(nome)]
    if (papel === 'name' && !name) name = valor
    else if (papel === 'first' && !first) first = valor
    else if (papel === 'last' && !last) last = valor
    else if (papel === 'email' && !email) email = normalizarEmail(valor) || email
    else if (papel === 'phone' && !phone) phone = normalizarTelefone(valor) || phone
    else if (papel === 'company' && !company) company = valor
    else if (Object.keys(fields).length < MAX_CAMPOS_EXTRAS) {
      fields[limpar(nome, 80) || 'campo'] = valor
    }
  }
  if (!name) name = [first, last].filter(Boolean).join(' ')
  return { name: limpar(name, 120), email, phone, company: limpar(company, 120), fields }
}

/** Há como falar com essa pessoa? Sem nome, e-mail nem telefone o card não serve. */
export function leadUtil(l: Pick<LeadNormalizado, 'name' | 'email' | 'phone'>): boolean {
  return !!(l.name || l.email || l.phone)
}

// ---------------------------------------------------------------------------
// Meta Lead Ads (Graph API: /{form-id}/leads)
// ---------------------------------------------------------------------------

export interface MetaLeadBruto {
  id?: string
  created_time?: string
  field_data?: { name?: string; values?: unknown[] }[]
  ad_id?: string
  ad_name?: string
  adset_id?: string
  adset_name?: string
  campaign_id?: string
  campaign_name?: string
  form_id?: string
  is_organic?: boolean
}

export function normalizarMeta(raw: MetaLeadBruto): LeadNormalizado | null {
  const leadId = limpar(raw.id, 64)
  if (!leadId) return null
  const pares = (raw.field_data ?? []).map((f) => ({
    nome: limpar(f.name, 80),
    valor: limpar(f.values),
  }))
  const criado = raw.created_time ? new Date(raw.created_time) : undefined
  return {
    channel: 'meta',
    externalId: leadId,
    leadId,
    ...montar(pares),
    campaignId: limpar(raw.campaign_id, 64) || undefined,
    campaignName: limpar(raw.campaign_name, 200) || undefined,
    adsetId: limpar(raw.adset_id, 64) || undefined,
    adsetName: limpar(raw.adset_name, 200) || undefined,
    adId: limpar(raw.ad_id, 64) || undefined,
    adName: limpar(raw.ad_name, 200) || undefined,
    formId: limpar(raw.form_id, 64) || undefined,
    createdAt: criado && !isNaN(criado.getTime()) ? criado : undefined,
  }
}

// ---------------------------------------------------------------------------
// Google Ads — webhook do formulário de lead
// ---------------------------------------------------------------------------

export interface GoogleLeadBruto {
  lead_id?: string
  user_column_data?: { column_id?: string; column_name?: string; string_value?: string }[]
  form_id?: string | number
  campaign_id?: string | number
  adgroup_id?: string | number
  creative_id?: string | number
  gcl_id?: string
  google_key?: string
  is_test?: boolean
}

export function ehGoogleLeadForm(body: unknown): body is GoogleLeadBruto {
  return !!body && typeof body === 'object' && Array.isArray((body as GoogleLeadBruto).user_column_data)
}

export function normalizarGoogle(raw: GoogleLeadBruto): LeadNormalizado | null {
  const leadId = limpar(raw.lead_id, 128)
  if (!leadId) return null
  const pares = (raw.user_column_data ?? []).slice(0, 60).map((c) => ({
    // column_id é o padrão (FULL_NAME, EMAIL…); perguntas próprias só têm column_name.
    nome: limpar(c.column_id && !/^\d+$/.test(c.column_id) ? c.column_id : c.column_name, 80),
    valor: limpar(c.string_value),
  }))
  return {
    channel: 'google',
    externalId: leadId,
    leadId,
    ...montar(pares),
    campaignId: limpar(raw.campaign_id, 64) || undefined,
    adsetId: limpar(raw.adgroup_id, 64) || undefined,
    adId: limpar(raw.creative_id, 64) || undefined,
    formId: limpar(raw.form_id, 64) || undefined,
    gclid: limpar(raw.gcl_id, 200) || undefined,
    isTest: raw.is_test === true,
  }
}

// ---------------------------------------------------------------------------
// Formulário do site / landing page
// ---------------------------------------------------------------------------

/** Campos de controle do snippet — não são respostas do formulário. */
const CONTROLE = new Set([
  'k', 'key', 'chave', '_hp', '_redirect', '_event_id', 'event_id', 'idioma',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'gclid', 'fbclid', 'wbraid', 'gbraid', 'page', 'landing_url', 'landingurl', 'referrer',
])

/**
 * Formulário do site: objeto plano (JSON ou form-urlencoded). O id externo vem do snippet
 * (`_event_id`); sem ele, é derivado do contato + janela de 10 minutos, para o duplo
 * clique no "Enviar" não virar dois cards.
 */
export function normalizarSite(body: Record<string, unknown>, agora = Date.now()): LeadNormalizado {
  const pares: Pares[] = []
  for (const [k, v] of Object.entries(body).slice(0, 80)) {
    if (CONTROLE.has(k.toLowerCase())) continue
    pares.push({ nome: limpar(k, 80), valor: limpar(v) })
  }
  const base = montar(pares)
  const utm: Utm = {}
  for (const k of ['source', 'medium', 'campaign', 'term', 'content'] as const) {
    const v = limpar(body[`utm_${k}`], 200)
    if (v) utm[k] = v
  }
  const evento = limpar(body._event_id ?? body.event_id, 80)
  const janela = Math.floor(agora / (10 * 60 * 1000))
  const externalId = evento || sha256(`${base.email}|${base.phone}|${base.name}|${janela}`).slice(0, 32)
  return {
    channel: 'site',
    externalId,
    ...base,
    gclid: limpar(body.gclid ?? body.gbraid ?? body.wbraid, 200) || undefined,
    fbclid: limpar(body.fbclid, 300) || undefined,
    utm: Object.keys(utm).length ? utm : undefined,
    landingUrl: limpar(body.landing_url ?? body.page, 500) || undefined,
  }
}

/** Origem "paga" pela utm — decide se a tag do card é Ads ou Inbound. */
export function ehPago(lead: Pick<LeadNormalizado, 'channel' | 'utm' | 'gclid' | 'fbclid'>): boolean {
  if (lead.channel !== 'site') return true
  if (lead.gclid || lead.fbclid) return true
  const m = (lead.utm?.medium ?? '').toLowerCase()
  return /cpc|ppc|paid|ads|cpm|display|social_paid|pago/.test(m)
}

// ---------------------------------------------------------------------------
// Métricas
// ---------------------------------------------------------------------------

export interface LinhaDiaria {
  campaignKey: string
  provider: 'meta' | 'google'
  campaignId: string
  campaignName: string
  date: string
  impressions: number
  clicks: number
  /** Na moeda da conta, em unidades (não centavos). */
  spend: number
  platformLeads: number
  platformConversions: number
}

function n(v: unknown): number {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

export interface MetaInsightBruto {
  campaign_id?: string
  campaign_name?: string
  date_start?: string
  impressions?: string | number
  clicks?: string | number
  inline_link_clicks?: string | number
  spend?: string | number
  actions?: { action_type?: string; value?: string | number }[]
}

const META_LEAD_ACTIONS = new Set(['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead'])
const META_CONV_ACTIONS = new Set(['purchase', 'offsite_conversion.fb_pixel_purchase', 'omni_purchase'])

export function linhaMeta(raw: MetaInsightBruto): LinhaDiaria | null {
  const id = limpar(raw.campaign_id, 64)
  const date = limpar(raw.date_start, 10)
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  // A Meta repete a mesma conversão em vários action_type (lead e lead_grouped):
  // fica o maior, não a soma, para não contar o mesmo lead duas vezes.
  let leads = 0
  let conv = 0
  for (const a of raw.actions ?? []) {
    const t = String(a.action_type ?? '')
    if (META_LEAD_ACTIONS.has(t)) leads = Math.max(leads, n(a.value))
    if (META_CONV_ACTIONS.has(t)) conv = Math.max(conv, n(a.value))
  }
  return {
    campaignKey: `meta_${idSeguro(id)}`,
    provider: 'meta',
    campaignId: id,
    campaignName: limpar(raw.campaign_name, 200),
    date,
    impressions: n(raw.impressions),
    clicks: n(raw.clicks),
    spend: n(raw.spend),
    platformLeads: leads,
    platformConversions: conv,
  }
}

export interface GoogleRowBruta {
  campaign?: { id?: string | number; name?: string; status?: string }
  segments?: { date?: string }
  metrics?: { impressions?: string | number; clicks?: string | number; costMicros?: string | number; conversions?: string | number }
}

export function linhaGoogle(raw: GoogleRowBruta): LinhaDiaria | null {
  const id = limpar(raw.campaign?.id, 64)
  const date = limpar(raw.segments?.date, 10)
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const conv = n(raw.metrics?.conversions)
  return {
    campaignKey: `google_${idSeguro(id)}`,
    provider: 'google',
    campaignId: id,
    campaignName: limpar(raw.campaign?.name, 200),
    date,
    impressions: n(raw.metrics?.impressions),
    clicks: n(raw.metrics?.clicks),
    spend: Math.round(n(raw.metrics?.costMicros) / 10_000) / 100,
    platformLeads: conv,
    platformConversions: conv,
  }
}

// ---------------------------------------------------------------------------
// Conversões de volta
// ---------------------------------------------------------------------------

export interface EtapaConversao {
  /** Nome do evento na Meta (CAPI). Vazio = não envia para a Meta. */
  meta?: string
  /** Id da ação de conversão do Google (tipo "Importação de cliques"). Vazio = não envia. */
  google?: string
}

export interface ConfigConversoes {
  ativo?: boolean
  etapas?: Record<string, EtapaConversao>
  metaTestCode?: string
}

export const ETAPAS_PADRAO: Record<string, EtapaConversao> = {
  qualificado: { meta: 'QualifiedLead' },
  ganho: { meta: 'Purchase' },
}

export interface OrigemDeal {
  channel?: Canal
  leadId?: string
  gclid?: string
  fbclid?: string
  hashes?: { em?: string; ph?: string }
}

export interface Envio {
  etapa: string
  meta?: string
  google?: string
}

/**
 * Decide o que enviar quando um card troca de coluna. Só a PRIMEIRA chegada numa etapa
 * conta (mesma lógica do `reachedAt`): voltar e avançar de novo não pode registrar duas
 * vendas na plataforma.
 */
export function decidirEnvio(
  antes: { columnId?: string } | undefined,
  depois: { columnId?: string; boardId?: string; source?: OrigemDeal; conversionsSent?: Record<string, unknown> },
  cfg: ConfigConversoes | undefined,
): Envio | null {
  if (!cfg?.ativo) return null
  const col = depois.columnId
  if (!col || col === antes?.columnId) return null
  if (depois.boardId !== 'leads') return null
  const src = depois.source
  if (!src?.channel) return null
  if (depois.conversionsSent && col in depois.conversionsSent) return null
  const etapa = (cfg.etapas ?? ETAPAS_PADRAO)[col]
  if (!etapa) return null

  const temPessoa = !!(src.hashes?.em || src.hashes?.ph)
  const meta = etapa.meta && (src.channel === 'meta' || !!src.fbclid || temPessoa) ? etapa.meta : undefined
  const google = etapa.google && src.gclid ? etapa.google : undefined
  if (!meta && !google) return null
  return { etapa: col, ...(meta ? { meta } : {}), ...(google ? { google } : {}) }
}

/** `fbc` da Meta a partir do fbclid capturado no site. */
export function fbcDe(fbclid: string, quandoMs: number): string {
  return `fb.1.${quandoMs}.${fbclid}`
}

/** Data no formato que o Google pede: "yyyy-mm-dd hh:mm:ss+hh:mm", no fuso informado. */
export function dataGoogle(d: Date, timeZone = 'America/Sao_Paulo'): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    timeZoneName: 'longOffset',
  }).formatToParts(d)
  const p = (t: string) => parts.find((x) => x.type === t)?.value ?? ''
  const off = p('timeZoneName').replace('GMT', '') || '+00:00'
  return `${p('year')}-${p('month')}-${p('day')} ${p('hour')}:${p('minute')}:${p('second')}${off}`
}
