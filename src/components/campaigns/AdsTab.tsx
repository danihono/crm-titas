import { Fragment, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAdCampaigns, useAdDaily, useIntegrations } from '../../hooks/useIntegrations'
import { LEADS_COLUMNS, useDeals } from '../../hooks/useDeals'
import { LEADS_BOARD_ID } from '../../lib/theme'
import { tituloEtapaLeads } from '../../i18n/sistema'
import { useUIStore } from '../../store/uiStore'
import { tagIntl } from '../../store/localeStore'
import { dateKeyOf } from '../../lib/format'
import { num, num1 } from '../../i18n/formato'
import { sx, C, FONT_MONO } from '../../styles/sx'
import { t, type Chave } from '../../i18n'
import MaterialIcon from '../common/MaterialIcon'
import type { AdCampaign, AdDaily, Deal, LeadChannel } from '../../types'

/**
 * Campanhas → Anúncios: o que a plataforma diz (gasto, impressões, cliques) cruzado com
 * o que o CRM sabe (lead, qualificado, venda, receita). É o cruzamento que importa: o
 * gerenciador de anúncios conta "lead" quando alguém preenche o formulário, e só o CRM
 * sabe quantos desses viraram dinheiro.
 */

type Periodo = 7 | 30 | 90
type Filtro = 'todos' | LeadChannel

const CANAL: Record<LeadChannel, { label: string; icon: string }> = {
  meta: { label: 'Meta', icon: 'campaign' },
  google: { label: 'Google', icon: 'ads_click' },
  site: { label: 'Site', icon: 'language' },
}

export function canalDaChave(key: string): LeadChannel {
  return key.startsWith('meta_') ? 'meta' : key.startsWith('google_') ? 'google' : 'site'
}

function moeda(v: number, casas = 0): string {
  return new Intl.NumberFormat(tagIntl(), { style: 'currency', currency: 'BRL', minimumFractionDigits: casas, maximumFractionDigits: casas }).format(v)
}

function razao(a: number, b: number): number | null {
  return b > 0 ? a / b : null
}

interface Linha {
  key: string
  canal: LeadChannel
  nome: string
  status?: string
  spend: number
  impressions: number
  clicks: number
  platformLeads: number
  leads: Deal[]
  qualificados: number
  vendas: number
  receita: number
}

function chegou(d: Deal, col: string): boolean {
  return !!d.reachedAt?.[col] || d.columnId === col
}

function montarLinhas(daily: AdDaily[], campanhas: AdCampaign[], deals: Deal[], desde: Date): Linha[] {
  const porKey = new Map<string, Linha>()
  const nomes = new Map(campanhas.map((c) => [c.id, c]))
  const linha = (key: string, nome?: string): Linha => {
    let l = porKey.get(key)
    if (!l) {
      const c = nomes.get(key)
      l = {
        key, canal: canalDaChave(key), nome: c?.name || nome || key, status: c?.status,
        spend: 0, impressions: 0, clicks: 0, platformLeads: 0, leads: [], qualificados: 0, vendas: 0, receita: 0,
      }
      porKey.set(key, l)
    }
    return l
  }
  for (const d of daily) {
    const l = linha(d.campaignKey, d.campaignName)
    l.spend += d.spend
    l.impressions += d.impressions
    l.clicks += d.clicks
    l.platformLeads += d.platformLeads
  }
  for (const d of deals) {
    if (!d.source || d.boardId !== LEADS_BOARD_ID) continue
    if (!d.createdAt || d.createdAt < desde) continue
    const key = d.source.campaignKey || `${d.source.channel}_sem_campanha`
    const l = linha(key, d.source.campaignName || t('anuncios.semCampanha'))
    l.leads.push(d)
    if (chegou(d, 'qualificado')) l.qualificados++
    if (chegou(d, 'ganho') && d.columnId !== 'perdido') {
      l.vendas++
      l.receita += d.value
    }
  }
  return [...porKey.values()].sort((a, b) => b.spend - a.spend || b.leads.length - a.leads.length)
}

function somar(linhas: Linha[]) {
  return linhas.reduce(
    (s, l) => ({
      spend: s.spend + l.spend,
      impressions: s.impressions + l.impressions,
      clicks: s.clicks + l.clicks,
      leads: s.leads + l.leads.length,
      qualificados: s.qualificados + l.qualificados,
      vendas: s.vendas + l.vendas,
      receita: s.receita + l.receita,
    }),
    { spend: 0, impressions: 0, clicks: 0, leads: 0, qualificados: 0, vendas: 0, receita: 0 },
  )
}

// ---------------------------------------------------------------------------

function Kpi({ label, value, sub }: { label: Chave; value: string; sub?: string }) {
  return (
    <div style={{ ...sx.card, padding: '16px 18px', minWidth: 0 }}>
      <div style={{ fontSize: 10.5, letterSpacing: '.12em', color: C.muted, fontWeight: 700, textTransform: 'uppercase' }}>{t(label)}</div>
      <div style={{ fontFamily: FONT_MONO, fontSize: 22, color: C.ink, marginTop: 8, fontWeight: 500 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: C.sub, marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

/**
 * Barras diárias de UMA série. Gasto e leads ficam em gráficos separados de propósito:
 * escalas diferentes num eixo só (ou dois eixos) fazem a leitura mentir.
 */
function BarrasDia({ titulo, dias, valores, formatar }: {
  titulo: string
  dias: string[]
  valores: number[]
  formatar: (v: number) => string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(...valores, 0)
  const W = 600
  const H = 120
  const passo = W / Math.max(1, dias.length)
  const largura = Math.max(2, passo - 2)
  const total = valores.reduce((a, b) => a + b, 0)
  const rotuloDia = (k: string) => new Intl.DateTimeFormat(tagIntl(), { day: 'numeric', month: 'short' }).format(new Date(`${k}T12:00:00`))

  return (
    <div style={{ ...sx.card, padding: '16px 18px', minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{titulo}</div>
        <div style={{ fontSize: 12, color: C.sub, fontFamily: FONT_MONO }}>
          {hover !== null ? `${rotuloDia(dias[hover])}: ${formatar(valores[hover])}` : `${t('comum.total')}: ${formatar(total)}`}
        </div>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${titulo}. ${t('comum.total')}: ${formatar(total)}`}
        style={{ width: '100%', height: 120, display: 'block', marginTop: 12 }}
        onMouseLeave={() => setHover(null)}
      >
        <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} stroke={C.lineSoft} strokeWidth={1} />
        {valores.map((v, i) => {
          const h = max > 0 ? Math.max(v > 0 ? 3 : 0, (v / max) * (H - 6)) : 0
          const x = i * passo + 1
          const r = Math.min(4, largura / 2, h)
          return (
            <g key={dias[i]} onMouseEnter={() => setHover(i)}>
              {/* alvo de hover mais largo que a barra */}
              <rect x={i * passo} y={0} width={passo} height={H} fill="transparent" />
              {h > 0 && (
                <path
                  d={`M${x},${H} V${H - h + r} Q${x},${H - h} ${x + r},${H - h} H${x + largura - r} Q${x + largura},${H - h} ${x + largura},${H - h + r} V${H} Z`}
                  fill={C.purple}
                  opacity={hover === null || hover === i ? 1 : 0.45}
                />
              )}
            </g>
          )
        })}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.faint, marginTop: 6 }}>
        <span>{dias[0] ? rotuloDia(dias[0]) : ''}</span>
        <span>{dias.length ? rotuloDia(dias[dias.length - 1]) : ''}</span>
      </div>
    </div>
  )
}

const th = { textAlign: 'left', fontSize: 11, color: C.muted, fontWeight: 700, padding: '10px 10px', whiteSpace: 'nowrap', borderBottom: `1px solid ${C.lineSoft}` } as const
const td = { fontSize: 12.5, color: C.ink, padding: '11px 10px', borderBottom: `1px solid ${C.lineHair}`, whiteSpace: 'nowrap', fontFamily: FONT_MONO } as const

function Canal({ canal }: { canal: LeadChannel }) {
  const c = CANAL[canal]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: C.sub, background: C.tintNeutral, borderRadius: 999, padding: '2px 9px' }}>
      <MaterialIcon name={c.icon} size={13} /> {c.label}
    </span>
  )
}

function LeadsDaCampanha({ leads }: { leads: Deal[] }) {
  const navigate = useNavigate()
  const colunas = new Map(LEADS_COLUMNS.map((c) => [c.id, c]))
  if (!leads.length) return <div style={{ fontSize: 12.5, color: C.faint, padding: '8px 0' }}>{t('anuncios.semLeadsCrm')}</div>
  return (
    <div style={{ display: 'grid', gap: 6, padding: '6px 0 10px' }}>
      {leads.slice(0, 50).map((d) => {
        const col = colunas.get(d.columnId)
        return (
          <button
            key={d.id}
            type="button"
            onClick={() => navigate('/pipeline')}
            style={{ display: 'flex', alignItems: 'center', gap: 10, border: `1px solid ${C.lineHair}`, background: C.surface, borderRadius: 10, padding: '8px 12px', cursor: 'pointer', textAlign: 'left' }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: col?.color ?? C.faint, flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: C.ink, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.contact}</span>
            <span style={{ fontSize: 12, color: C.sub }}>{col ? tituloEtapaLeads(col.id, col.title) : d.columnId}</span>
            <span style={{ fontSize: 12, color: C.faint }}>{d.createdAt ? new Intl.DateTimeFormat(tagIntl(), { day: 'numeric', month: 'short' }).format(d.createdAt) : ''}</span>
          </button>
        )
      })}
    </div>
  )
}

export default function AdsTab() {
  const [periodo, setPeriodo] = useState<Periodo>(30)
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [aberta, setAberta] = useState<string | null>(null)
  const navigate = useNavigate()
  const setSettingsSection = useUIStore((s) => s.setSettingsSection)

  const desde = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - (periodo - 1))
    return d
  }, [periodo])

  const { integrations } = useIntegrations()
  const { docs: daily } = useAdDaily(desde)
  const { docs: campanhas } = useAdCampaigns()
  const { docs: deals } = useDeals(LEADS_BOARD_ID)

  const todas = useMemo(() => montarLinhas(daily, campanhas, deals, desde), [daily, campanhas, deals, desde])
  const linhas = filtro === 'todos' ? todas : todas.filter((l) => l.canal === filtro)
  const tot = somar(linhas)

  const dias = useMemo(() => {
    const out: string[] = []
    for (let i = 0; i < periodo; i++) out.push(dateKeyOf(new Date(desde.getTime() + i * 86_400_000 + 3_600_000)))
    return out
  }, [desde, periodo])
  const keys = new Set(linhas.map((l) => l.key))
  const gastoDia = dias.map((k) => daily.filter((d) => d.date === k && keys.has(d.campaignKey)).reduce((s, d) => s + d.spend, 0))
  const leadsDia = dias.map((k) => linhas.reduce((s, l) => s + l.leads.filter((d) => d.createdAt && dateKeyOf(d.createdAt) === k).length, 0))

  const nadaConectado = !integrations.meta.conectado && !integrations.google.conectado && !integrations.site.chave
  if (nadaConectado && todas.length === 0) {
    return (
      <div style={{ ...sx.card, padding: 36, textAlign: 'center' }}>
        <MaterialIcon name="hub" size={30} color={C.purple} />
        <div style={{ fontSize: 16, fontWeight: 700, color: C.ink, marginTop: 10 }}>{t('anuncios.vazioTitulo')}</div>
        <div style={{ fontSize: 13, color: C.sub, marginTop: 6, maxWidth: 520, marginInline: 'auto', lineHeight: 1.6 }}>{t('anuncios.vazioTexto')}</div>
        <button
          type="button"
          onClick={() => { setSettingsSection('integracoes'); navigate('/configuracoes') }}
          style={{ ...sx.btnPrimary, display: 'inline-flex', marginTop: 16 }}
        >
          <MaterialIcon name="settings" size={17} /> {t('anuncios.irIntegracoes')}
        </button>
      </div>
    )
  }

  const chip = (on: boolean) => ({
    ...sx.btnGhost, padding: '7px 12px', fontSize: 12.5,
    ...(on ? { background: C.sel, borderColor: C.selBorder, color: C.purple, fontWeight: 700 } : {}),
  })
  const cpl = razao(tot.spend, tot.leads)
  const cac = razao(tot.spend, tot.vendas)
  const roas = razao(tot.receita, tot.spend)
  const ctr = razao(tot.clicks * 100, tot.impressions)

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        {([7, 30, 90] as Periodo[]).map((p) => (
          <button key={p} type="button" onClick={() => setPeriodo(p)} style={chip(periodo === p)}>{t('anuncios.ultimosDias', { n: p })}</button>
        ))}
        <span style={{ width: 1, height: 22, background: C.line, margin: '0 4px' }} />
        {(['todos', 'meta', 'google', 'site'] as Filtro[]).map((f) => (
          <button key={f} type="button" onClick={() => setFiltro(f)} style={chip(filtro === f)}>
            {f === 'todos' ? t('comum.todos') : CANAL[f].label}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 14 }}>
        <Kpi label="anuncios.gasto" value={moeda(tot.spend)} sub={t('anuncios.impressoes', { n: num(tot.impressions) })} />
        <Kpi label="anuncios.cliques" value={num(tot.clicks)} sub={ctr !== null ? t('anuncios.ctr', { v: num1(ctr) }) : undefined} />
        <Kpi label="anuncios.leads" value={num(tot.leads)} sub={cpl !== null ? t('anuncios.cpl', { v: moeda(cpl, 2) }) : undefined} />
        <Kpi label="anuncios.qualificados" value={num(tot.qualificados)} sub={tot.leads ? t('anuncios.taxa', { v: num1((tot.qualificados / tot.leads) * 100) }) : undefined} />
        <Kpi label="anuncios.vendas" value={num(tot.vendas)} sub={cac !== null ? t('anuncios.cac', { v: moeda(cac, 2) }) : undefined} />
        <Kpi label="anuncios.receita" value={moeda(tot.receita)} sub={roas !== null ? t('anuncios.roas', { v: num1(roas) }) : undefined} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12, marginBottom: 14 }}>
        <BarrasDia titulo={t('anuncios.gastoPorDia')} dias={dias} valores={gastoDia} formatar={(v) => moeda(v)} />
        <BarrasDia titulo={t('anuncios.leadsPorDia')} dias={dias} valores={leadsDia} formatar={(v) => num(v)} />
      </div>

      <div style={{ ...sx.card, padding: '6px 10px 10px', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>{t('anuncios.campanha')}</th>
              <th style={{ ...th, textAlign: 'right' }}>{t('anuncios.gasto')}</th>
              <th style={{ ...th, textAlign: 'right' }}>{t('anuncios.cliques')}</th>
              <th style={{ ...th, textAlign: 'right' }}>{t('anuncios.leadsPlataforma')}</th>
              <th style={{ ...th, textAlign: 'right' }}>{t('anuncios.leads')}</th>
              <th style={{ ...th, textAlign: 'right' }}>{t('anuncios.cplCurto')}</th>
              <th style={{ ...th, textAlign: 'right' }}>{t('anuncios.qualificados')}</th>
              <th style={{ ...th, textAlign: 'right' }}>{t('anuncios.vendas')}</th>
              <th style={{ ...th, textAlign: 'right' }}>{t('anuncios.receita')}</th>
              <th style={{ ...th, textAlign: 'right' }}>ROAS</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const lcpl = razao(l.spend, l.leads.length)
              const lroas = razao(l.receita, l.spend)
              const on = aberta === l.key
              return (
                <Fragment key={l.key}>
                  <tr onClick={() => setAberta(on ? null : l.key)} style={{ cursor: 'pointer', background: on ? C.tintPurpleWeak : undefined }}>
                    <td style={{ ...td, fontFamily: 'inherit', whiteSpace: 'normal' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <MaterialIcon name={on ? 'expand_less' : 'expand_more'} size={16} color={C.muted} />
                        <Canal canal={l.canal} />
                        <span style={{ fontWeight: 600 }}>{l.nome}</span>
                        {l.status && l.status !== 'ACTIVE' && l.status !== 'ENABLED' && (
                          <span style={{ fontSize: 11, color: C.faint }}>{l.status.toLowerCase()}</span>
                        )}
                      </div>
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>{l.spend ? moeda(l.spend) : '—'}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{l.clicks ? num(l.clicks) : '—'}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{l.platformLeads ? num(l.platformLeads) : '—'}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{num(l.leads.length)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{lcpl !== null ? moeda(lcpl, 2) : '—'}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{num(l.qualificados)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{num(l.vendas)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{l.receita ? moeda(l.receita) : '—'}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{lroas !== null ? `${num1(lroas)}×` : '—'}</td>
                  </tr>
                  {on && (
                    <tr>
                      <td colSpan={10} style={{ padding: '0 14px', borderBottom: `1px solid ${C.lineHair}` }}>
                        <LeadsDaCampanha leads={l.leads} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {linhas.length === 0 && (
              <tr><td colSpan={10} style={{ ...td, fontFamily: 'inherit', color: C.faint, textAlign: 'center', padding: 28 }}>{t('anuncios.semDados')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 12, color: C.faint, marginTop: 10, lineHeight: 1.6 }}>{t('anuncios.rodape')}</div>
    </div>
  )
}
