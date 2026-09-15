import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useElementWidth } from '../../hooks/useElementWidth'
import { C, purpleAvatar } from '../../styles/sx'
import { plural, t, type Chave } from '../../i18n'
import { fmtK, fmtMoney, dueInfo, relativeLabel, chatTimeLabel, dateKeyOf } from '../../lib/format'
import { useUIStore } from '../../store/uiStore'
import { useIsDark } from '../../store/themeStore'
import { LEADS_BOARD_ID } from '../../hooks/useDeals'
import MaterialIcon from '../common/MaterialIcon'
import Avatar from '../common/Avatar'
import StatCard from './StatCard'
import HeroCard from './HeroCard'
import LeadFunnel from './LeadFunnel'
import ConversationHeatmap from './ConversationHeatmap'
import { ChartCard } from './WidgetShell'
import { TrendArea, RankedBars, StatusStack, MonthBars, CHART_DARK } from '../reports/Charts'
import type { DadosPainel } from '../../hooks/useDashboardData'
import type { DashboardWidget, Activity, EventDoc, ActType } from '../../types'
import type { EmEspera, ReportRow } from '../../lib/reportData'

/**
 * Desenha um widget do painel.
 *
 * Todo dado chega por prop (`dados`) — nenhum widget assina Firestore por conta
 * própria. É isso que deixa o painel decidir, pelo layout, quais consultas ligar,
 * e evita dois widgets do mesmo assunto assinarem a mesma coisa duas vezes.
 */
export default function WidgetContent({ w, dados }: { w: DashboardWidget; dados: DadosPainel }) {
  const navigate = useNavigate()
  const setActiveBoard = useUIStore((s) => s.setActiveBoard)
  const selectContact = useUIStore((s) => s.selectContact)
  const setContactsView = useUIStore((s) => s.setContactsView)
  const dark = useIsDark()
  const paleta = dark ? CHART_DARK : undefined

  const stat = (p: Parameters<typeof StatCard>[0]) => (
    <StatCard {...p} featured={w.variant === 'featured'} accent={w.accent ?? p.accent} />
  )

  switch (w.type) {
    // ── Pipeline ────────────────────────────────────────────────────────
    case 'pipeline':
      return stat({
        label: t('widget.pipeline'), value: `R$ ${fmtK(dados.pipelineTotal)}`,
        sub: t('painel.somaHoje'),
        icon: 'payments', accent: 'green', series: dados.serieNovoPipeline,
        info: t('painel.pipelineInfo'),
        linkLabel: t('painel.verPipeline'), onLink: () => navigate('/pipeline'),
      })

    case 'negocios':
      return stat({
        label: t('widget.negocios'), value: String(dados.deals.length), sub: t('painel.criadosSemana'),
        icon: 'handshake', accent: 'purple', series: dados.serieNegocios,
        linkLabel: t('painel.verQuadro'), onLink: () => navigate('/pipeline'),
      })

    case 'ticket':
      return stat({
        label: t('widget.ticket'), value: `R$ ${fmtMoney(dados.ticket)}`,
        sub: t('painel.mediaEntre', { n: dados.deals.length }),
        icon: 'request_quote', accent: 'amber',
        // Sem série: é razão de duas séries sem passado — `updateDeal` sobrescreve
        // o valor do negócio sem versionar.
        linkLabel: t('painel.verPipeline'), onLink: () => navigate('/pipeline'),
      })

    case 'novosLeads':
      return stat({
        label: t('widget.novosLeads'), value: String(dados.leadsNovos), sub: t('painel.aguardandoContato'),
        icon: 'person_add', accent: 'green', series: dados.serieLeads,
        info: t('painel.novosLeadsInfo'),
        linkLabel: t('painel.verFunil'), onLink: () => { setActiveBoard(LEADS_BOARD_ID); navigate('/pipeline') },
      })

    // ── Dia a dia ───────────────────────────────────────────────────────
    case 'agendaHoje':
      return stat({
        label: t('widget.agendaHoje'),
        value: dados.todayEvents.length ? dados.todayEvents[0].time : '—',
        sub: dados.todayEvents[0]?.title ?? t('painel.agendaLivre'),
        icon: 'event', accent: 'blue',
        linkLabel: t('painel.verAgenda'), onLink: () => navigate('/agenda'),
      })

    case 'tarefasHoje':
      return stat({
        label: t('widget.tarefasHoje'), value: String(dados.pendingToday.length),
        sub: dados.nextPending
          ? `${dados.nextPending.title} · ${dueInfo(dados.nextPending.dueAt, dados.nextPending.done).text}`
          : t('painel.nadaPendenteHoje'),
        icon: 'task_alt', accent: 'purple', series: dados.serieTarefas,
        info: t('painel.tarefasInfo'),
        linkLabel: t('painel.verTarefas'), onLink: () => navigate('/atividades'),
      })

    // ── Faturamento ─────────────────────────────────────────────────────
    case 'aReceber':
      return stat({
        label: t('widget.aReceber'), value: `R$ ${fmtK(dados.aReceber)}`, sub: t('painel.emAbertoNoPrazo'),
        icon: 'hourglass_top', accent: 'blue', series: dados.serieAReceber,
        info: t('painel.aReceberInfo'),
        linkLabel: t('painel.verNotas'), onLink: () => navigate('/faturamento'),
      })

    case 'notasVencidas':
      return stat({
        label: t('widget.notasVencidas'), value: String(dados.vencidas),
        sub: dados.vencidas ? `R$ ${fmtMoney(dados.vencidoSum)} em atraso` : t('painel.faturamentoEmDia'),
        icon: 'error', accent: 'rose', series: dados.serieVencidas,
        linkLabel: t('painel.verFaturamento'), onLink: () => navigate('/faturamento'),
      })

    case 'receita': {
      const r = dados.receita
      return (
        <ChartCard
          title={t('widget.receita')}
          sub={t('painel.notasPagas12m')}
          right={<span style={{ fontSize: 18, fontWeight: 800, color: C.ink, letterSpacing: '-.02em' }}>R$ {fmtK(r.total)}</span>}
        >
          {!r.hasData && <Vazio>{t('painel.semNotasPagas')}</Vazio>}
          {r.hasData && (
            <>
              <svg viewBox="0 0 560 170" preserveAspectRatio="none" style={{ width: '100%', height: '78%', minHeight: 70, display: 'block' }}>
                <defs>
                  <linearGradient id="wRevFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor={C.purpleSoft} stopOpacity="0.28" />
                    <stop offset="1" stopColor={C.purpleSoft} stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d={r.area} fill="url(#wRevFill)" />
                <path d={r.line} fill="none" stroke={C.purple} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              </svg>
              <div className="widget-legenda" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, color: C.faint }}>
                {r.months.map((m, i) => <span key={`${m}-${i}`}>{m}</span>)}
              </div>
            </>
          )}
        </ChartCard>
      )
    }

    case 'leadsMes': {
      const l = dados.leadsMes
      return (
        <HeroCard
          label={t('painel.leadsDoMes', { mes: l.mes })}
          value={String(l.count)}
          changePct={l.changePct}
          icon="rocket_launch"
          sub={l.count === 0
            ? t('painel.semLeadsMes')
            : t('painel.criadosNesteMes', {
                parte: l.ganhos ? t('painel.jaEmGanho', { n: l.ganhos }) : t('painel.nenhumEmGanho'),
              })}
          linkLabel={t('painel.verFunil')}
          onLink={() => { setActiveBoard(LEADS_BOARD_ID); navigate('/pipeline') }}
        />
      )
    }

    // ── Gráficos ────────────────────────────────────────────────────────
    case 'ganhosMes': {
      const temGanho = dados.ganhosMes.some((m) => m.count > 0)
      // Altura 132, e não 150: numa faixa da grade o corpo do card tem ~125px
      // depois do título, e o gráfico mais alto empurrava o eixo dos meses para
      // dentro da rolagem interna — sumia justamente o que diz QUAL mês é cada
      // barra.
      return (
        <ChartCard title={t('widget.ganhosMes')} sub={t('painel.ganhosMesSub')}>
          {temGanho
            ? <Fluido>{(w) => <MonthBars meses={dados.ganhosMes} width={w} height={132} palette={paleta} />}</Fluido>
            : <Vazio>{t('painel.semGanhos12Meses')}</Vazio>}
        </ChartCard>
      )
    }

    case 'funil':
      return (
        <ChartCard title={t('widget.funil')} sub={t('painel.funilSub')} style={{ }}>
          <LeadFunnel dados={dados.funil} />
        </ChartCard>
      )

    case 'calor':
      return (
        <ChartCard title={t('widget.calor')} sub={t('painel.calorSub')}>
          <ConversationHeatmap data={dados.heat} />
        </ChartCard>
      )

    case 'origem':
      return (
        <ChartCard title={t('widget.origem')} sub={t('painel.origemSub')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, height: '100%' }}>
            <div style={{ width: 96, height: 96, flexShrink: 0, borderRadius: '50%', background: dados.donutGradient, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: C.surface, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: C.ink }}>{dados.leadsTotal}</div>
                <div style={{ fontSize: 9.5, color: C.muted }}>{dados.leadsTotal === 1 ? 'lead' : 'leads'}</div>
              </div>
            </div>
            <div className="widget-legenda" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {dados.origens.slice(0, 5).map((s) => (
                <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5 }}>
                  <span style={{ width: 8, height: 8, flexShrink: 0, borderRadius: 3, background: s.color }} />
                  <span style={{ flex: 1, minWidth: 0, color: C.strong, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
                  <span style={{ fontWeight: 700, color: C.ink }}>{s.pct}%</span>
                </div>
              ))}
              {dados.origens.length === 0 && <Vazio>{t('painel.semLeads')}</Vazio>}
            </div>
          </div>
        </ChartCard>
      )

    case 'conversasDia':
      return (
        <ChartCard title={t('widget.conversasDia')} sub={t('painel.conversasDiaSub')}>
          {dados.relatorio
            ? <Fluido>{(w) => <TrendArea points={dados.relatorio!.byDay} width={w} height={150} palette={paleta} />}</Fluido>
            : <Vazio>{t('painel.semConversasPeriodo')}</Vazio>}
        </ChartCard>
      )

    case 'filaAgora':
      return (
        <ChartCard title={t('widget.filaAgora')} sub={t('painel.filaAgoraSub')}>
          <Fluido>{(w) => <StatusStack {...dados.fila} width={w} palette={paleta} />}</Fluido>
        </ChartCard>
      )

    case 'filaEspera':
      return (
        <ChartCard title={t('widget.filaEspera')} sub={t('painel.filaEsperaSub')}>
          {dados.espera.map((e) => (
            <LinhaEspera
              key={e.contactId}
              e={e}
              onAbrir={() => { selectContact(e.contactId); setContactsView('atendimento'); navigate('/contatos') }}
            />
          ))}
          {dados.espera.length === 0 && <Vazio>{t('painel.filaLimpa')}</Vazio>}
        </ChartCard>
      )

    case 'rankAtendentes':
      return <Ranking titulo={t('widget.rankAtendentes')} sub={t('painel.conversasNoPeriodo')} linhas={dados.relatorio?.byAgent} paleta={paleta} />
    case 'rankSetores':
      return <Ranking titulo={t('widget.rankSetores')} sub={t('painel.conversasNoPeriodo')} linhas={dados.relatorio?.bySector} paleta={paleta} />
    case 'rankEtiquetas':
      return <Ranking titulo={t('widget.rankEtiquetas')} sub={t('painel.conversasNoPeriodo')} linhas={dados.relatorio?.byTag} paleta={paleta} />

    // ── Listas ──────────────────────────────────────────────────────────
    case 'atividade':
      return (
        <ChartCard
          title={t('widget.atividade')}
          right={<VerTudo onClick={() => navigate('/atividades')} />}
        >
          {dados.feed.map((a) => (
            <LinhaAtividade key={a.id} a={a} t={dados.typeMap[a.type]} quando={a.createdAt ? relativeLabel(a.createdAt) : ''} />
          ))}
          {dados.feed.length === 0 && <Vazio>{t('painel.semAtividades')}</Vazio>}
        </ChartCard>
      )

    case 'proximasTarefas':
      return (
        <ChartCard
          title={t('widget.proximasTarefas')}
          right={<VerTudo onClick={() => navigate('/atividades')} />}
        >
          {dados.pendentes.slice(0, 10).map((a) => (
            <LinhaAtividade
              key={a.id}
              a={a}
              t={dados.typeMap[a.type]}
              quando={dueInfo(a.dueAt, a.done).text}
              atrasada={dueInfo(a.dueAt, a.done).overdue}
            />
          ))}
          {dados.pendentes.length === 0 && <Vazio>{t('painel.nadaPendenteBom')}</Vazio>}
        </ChartCard>
      )

    case 'proximosCompromissos':
      return (
        <ChartCard
          title={t('widget.proximosCompromissos')}
          right={<VerTudo onClick={() => navigate('/agenda')} />}
        >
          {dados.proximosEventos.slice(0, 10).map((e) => <LinhaEvento key={e.id} e={e} />)}
          {dados.proximosEventos.length === 0 && <Vazio>{t('painel.semCompromissos')}</Vazio>}
        </ChartCard>
      )

    default:
      // Tipo desconhecido não deveria chegar aqui (o converter filtra), mas um
      // card em branco é melhor que a tela toda quebrada.
      return <ChartCard title={t('painel.widgetDesconhecido')}><Vazio>{t('painel.blocoSumiu')}</Vazio></ChartCard>
  }
}

function Ranking({ titulo, sub, linhas, paleta }: {
  titulo: string
  sub: string
  linhas?: ReportRow[]
  paleta?: typeof CHART_DARK
}) {
  return (
    <ChartCard title={titulo} sub={sub}>
      {linhas && linhas.length > 0
        ? <Fluido>{(w) => <RankedBars rows={linhas.slice(0, 6)} width={w} palette={paleta} />}</Fluido>
        : <Vazio>{t('painel.semConversasNoPeriodo')}</Vazio>}
    </ChartCard>
  )
}

/** Mede a largura disponível e entrega para um gráfico que precisa de número. */
function Fluido({ children }: { children: (w: number) => React.ReactNode }) {
  const [ref, largura] = useElementWidth<HTMLDivElement>()
  return <div ref={ref} style={{ width: '100%' }}>{children(largura)}</div>
}

function VerTudo({ onClick }: { onClick: () => void }) {
  return (
    <span onClick={onClick} style={{ fontSize: 11.5, color: C.purple, cursor: 'pointer', fontWeight: 700, flexShrink: 0 }}>
      Ver tudo
    </span>
  )
}

function Vazio({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12.5, color: C.faint, padding: '10px 0', lineHeight: 1.5 }}>{children}</div>
}

function LinhaAtividade({ a, t, quando, atrasada }: {
  a: Activity
  t?: ActType
  quando: string
  atrasada?: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: `1px solid ${C.lineHair}` }}>
      <MaterialIcon
        name={t?.icon ?? 'event'} size={16} color={t?.color ?? C.purple}
        style={{ background: t?.bg ?? C.tintPurpleStrong, width: 30, height: 30, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, color: C.ink, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.title}</div>
        <div style={{ fontSize: 11, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.contact}</div>
      </div>
      <div style={{ fontSize: 10.5, color: atrasada ? C.roseDeep : C.faint, flexShrink: 0, fontWeight: atrasada ? 700 : 400 }}>{quando}</div>
    </div>
  )
}

// Chave do catálogo, e não o texto: uma constante de módulo é avaliada uma vez,
// no import, e congelaria o rótulo no idioma em que a aba abriu.
const ESTADO: Record<EmEspera['estado'], { rotulo: Chave; cor: string; tinta: string }> = {
  fila: { rotulo: 'painel.estadoNaFila', cor: C.blue, tinta: C.tintBlue },
  atendimento: { rotulo: 'atend.emAtendimento', cor: C.green, tinta: C.tintGreen },
  esperando: { rotulo: 'atend.esperandoCliente', cor: C.amber, tinta: C.tintAmber },
}

/**
 * Faz a tela reavaliar de minuto em minuto.
 *
 * A espera é calculada contra o relógio, não contra o dado: sem este tique
 * "há 2min" ficaria congelado até o próximo snapshot do Firestore — e numa fila
 * parada (que é justamente quando o bloco importa) snapshot não chega.
 */
function useMinuto(): number {
  const [t, setT] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setT(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])
  return t
}

function LinhaEspera({ e, onAbrir }: { e: EmEspera; onAbrir: () => void }) {
  const agora = useMinuto()
  const st = ESTADO[e.estado]
  // Quem ainda não recebeu nenhuma resposta é o caso grave da lista, e é a espera
  // que fica em rosa — não o nome da pessoa.
  const corEspera = e.semResposta ? C.roseDeep : C.faint

  return (
    <div
      onClick={onAbrir}
      role="button"
      tabIndex={0}
      onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onAbrir() } }}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0',
        borderBottom: `1px solid ${C.lineHair}`, cursor: 'pointer',
      }}
    >
      <Avatar photoUrl={e.photoUrl} initials={e.initials} size={30} bg={purpleAvatar} fontSize={11.5} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, color: C.ink, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {e.nome}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 1 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: st.cor, background: st.tinta, borderRadius: 6, padding: '1px 6px' }}>
            {t(st.rotulo)}
          </span>
          {e.semResposta && (
            <span className="widget-sub" style={{ fontSize: 10.5, color: C.roseDeep, fontWeight: 600 }}>{t('painel.semResposta')}</span>
          )}
        </div>
      </div>
      {e.naoLidas > 0 && (
        <span
          title={plural(e.naoLidas, 'painel.naoLida_1', 'painel.naoLida_n')}
          style={{
            fontSize: 10, fontWeight: 700, color: C.onAccent, background: C.purple,
            borderRadius: 20, padding: '1px 7px', flexShrink: 0,
          }}
        >
          {e.naoLidas}
        </span>
      )}
      <div style={{ fontSize: 10.5, color: corEspera, flexShrink: 0, fontWeight: e.semResposta ? 700 : 400 }}>
        {relativeLabel(e.desde, new Date(agora))}
      </div>
    </div>
  )
}

/** "Hoje" / "Ter" / "12 Set" — nunca a hora, que já vai na linha de baixo. */
function diaDoEvento(d: Date): string {
  const hoje = new Date()
  if (dateKeyOf(d) === dateKeyOf(hoje)) return t('comum.hoje')
  return chatTimeLabel(d)
}

function LinhaEvento({ e }: { e: EventDoc }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: `1px solid ${C.lineHair}` }}>
      <div style={{ width: 3, alignSelf: 'stretch', borderRadius: 3, background: e.color, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, color: C.ink, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.title}</div>
        <div style={{ fontSize: 11, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.subtitle}</div>
      </div>
      <div style={{ fontSize: 10.5, color: C.faint, flexShrink: 0, textAlign: 'right', lineHeight: 1.35 }}>
        {diaDoEvento(e.date)}<br />{e.time}
      </div>
    </div>
  )
}
