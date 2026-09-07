import { useNavigate } from 'react-router-dom'
import { useElementWidth } from '../../hooks/useElementWidth'
import { C } from '../../styles/sx'
import { fmtK, fmtMoney, dueInfo, relativeLabel, chatTimeLabel, dateKeyOf } from '../../lib/format'
import { useUIStore } from '../../store/uiStore'
import { useIsDark } from '../../store/themeStore'
import { LEADS_BOARD_ID } from '../../hooks/useDeals'
import MaterialIcon from '../common/MaterialIcon'
import StatCard from './StatCard'
import LeadFunnel from './LeadFunnel'
import ConversationHeatmap from './ConversationHeatmap'
import { ChartCard } from './WidgetShell'
import { TrendArea, RankedBars, StatusStack, CHART_DARK } from '../reports/Charts'
import type { DadosPainel } from '../../hooks/useDashboardData'
import type { DashboardWidget, Activity, EventDoc, ActType } from '../../types'
import type { ReportRow } from '../../lib/reportData'

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
  const dark = useIsDark()
  const paleta = dark ? CHART_DARK : undefined

  const stat = (p: Parameters<typeof StatCard>[0]) => (
    <StatCard {...p} featured={w.variant === 'featured'} accent={w.accent ?? p.accent} />
  )

  switch (w.type) {
    // ── Pipeline ────────────────────────────────────────────────────────
    case 'pipeline':
      return stat({
        label: 'Pipeline ativo', value: `R$ ${fmtK(dados.pipelineTotal)}`,
        sub: 'Soma de hoje. A linha é o pipeline novo por semana.',
        icon: 'payments', accent: 'green', series: dados.serieNovoPipeline,
        info: 'O número é a soma de todos os negócios abertos agora; a linha, o valor criado em cada uma das últimas 12 semanas.',
        linkLabel: 'Ver pipeline', onLink: () => navigate('/pipeline'),
      })

    case 'negocios':
      return stat({
        label: 'Negócios ativos', value: String(dados.deals.length), sub: 'Criados por semana.',
        icon: 'handshake', accent: 'purple', series: dados.serieNegocios,
        linkLabel: 'Ver quadro', onLink: () => navigate('/pipeline'),
      })

    case 'ticket':
      return stat({
        label: 'Ticket médio', value: `R$ ${fmtMoney(dados.ticket)}`,
        sub: `Média entre ${dados.deals.length} negócio(s) aberto(s).`,
        icon: 'request_quote', accent: 'amber',
        // Sem série: é razão de duas séries sem passado — `updateDeal` sobrescreve
        // o valor do negócio sem versionar.
        linkLabel: 'Ver pipeline', onLink: () => navigate('/pipeline'),
      })

    case 'novosLeads':
      return stat({
        label: 'Novos leads', value: String(dados.leadsNovos), sub: 'Aguardando primeiro contato.',
        icon: 'person_add', accent: 'green', series: dados.serieLeads,
        info: 'Leads parados na etapa de entrada do quadro LEADS. A linha conta quantos entraram por semana.',
        linkLabel: 'Ver funil', onLink: () => { setActiveBoard(LEADS_BOARD_ID); navigate('/pipeline') },
      })

    // ── Dia a dia ───────────────────────────────────────────────────────
    case 'agendaHoje':
      return stat({
        label: 'Agenda hoje',
        value: dados.todayEvents.length ? dados.todayEvents[0].time : '—',
        sub: dados.todayEvents[0]?.title ?? 'Agenda livre hoje.',
        icon: 'event', accent: 'blue',
        linkLabel: 'Ver agenda', onLink: () => navigate('/agenda'),
      })

    case 'tarefasHoje':
      return stat({
        label: 'Tarefas hoje', value: String(dados.pendingToday.length),
        sub: dados.nextPending
          ? `${dados.nextPending.title} · ${dueInfo(dados.nextPending.dueAt, dados.nextPending.done).text}`
          : 'Nada pendente para hoje.',
        icon: 'task_alt', accent: 'purple',
        linkLabel: 'Ver tarefas', onLink: () => navigate('/atividades'),
      })

    // ── Faturamento ─────────────────────────────────────────────────────
    case 'aReceber':
      return stat({
        label: 'A receber', value: `R$ ${fmtK(dados.aReceber)}`, sub: 'Em aberto e ainda no prazo.',
        icon: 'hourglass_top', accent: 'blue', series: dados.serieAReceber,
        info: 'Saldo em aberto e dentro do prazo no fim de cada semana. Nota paga sem data de baixa conta como paga desde sempre.',
        linkLabel: 'Ver notas', onLink: () => navigate('/faturamento'),
      })

    case 'notasVencidas':
      return stat({
        label: 'Notas vencidas', value: String(dados.vencidas),
        sub: dados.vencidas ? `R$ ${fmtMoney(dados.vencidoSum)} em atraso` : 'Faturamento em dia.',
        icon: 'error', accent: 'rose', series: dados.serieVencidas,
        linkLabel: 'Ver faturamento', onLink: () => navigate('/faturamento'),
      })

    case 'receita': {
      const r = dados.receita
      return (
        <ChartCard
          title="Receita recebida"
          sub="Notas pagas · últimos 12 meses"
          right={<span style={{ fontSize: 18, fontWeight: 800, color: C.ink, letterSpacing: '-.02em' }}>R$ {fmtK(r.total)}</span>}
        >
          {!r.hasData && <Vazio>Nenhuma nota paga nos últimos 12 meses.</Vazio>}
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

    // ── Gráficos ────────────────────────────────────────────────────────
    case 'funil':
      return (
        <ChartCard title="Funil de Leads" sub="Os leads criados no período, seguidos etapa a etapa" style={{ }}>
          <LeadFunnel dados={dados.funil} />
        </ChartCard>
      )

    case 'calor':
      return (
        <ChartCard title="Quando o cliente procura" sub="Conversas abertas por dia da semana e hora">
          <ConversationHeatmap data={dados.heat} />
        </ChartCard>
      )

    case 'origem':
      return (
        <ChartCard title="Origem dos leads" sub="Todos os leads cadastrados">
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
              {dados.origens.length === 0 && <Vazio>Nenhum lead cadastrado ainda.</Vazio>}
            </div>
          </div>
        </ChartCard>
      )

    case 'conversasDia':
      return (
        <ChartCard title="Conversas por dia" sub="Quantas conversas abriram a cada dia do período">
          {dados.relatorio
            ? <Fluido>{(w) => <TrendArea points={dados.relatorio!.byDay} width={w} height={150} palette={paleta} />}</Fluido>
            : <Vazio>Sem dados de conversa no período.</Vazio>}
        </ChartCard>
      )

    case 'filaAgora':
      return (
        <ChartCard title="Fila agora" sub="Como as conversas abertas estão divididas neste momento">
          <Fluido>{(w) => <StatusStack {...dados.fila} width={w} palette={paleta} />}</Fluido>
        </ChartCard>
      )

    case 'rankAtendentes':
      return <Ranking titulo="Por atendente" sub="Conversas no período" linhas={dados.relatorio?.byAgent} paleta={paleta} />
    case 'rankSetores':
      return <Ranking titulo="Por setor" sub="Conversas no período" linhas={dados.relatorio?.bySector} paleta={paleta} />
    case 'rankEtiquetas':
      return <Ranking titulo="Por etiqueta" sub="Conversas no período" linhas={dados.relatorio?.byTag} paleta={paleta} />

    // ── Listas ──────────────────────────────────────────────────────────
    case 'atividade':
      return (
        <ChartCard
          title="Atividade recente"
          right={<VerTudo onClick={() => navigate('/atividades')} />}
        >
          {dados.feed.map((a) => (
            <LinhaAtividade key={a.id} a={a} t={dados.typeMap[a.type]} quando={a.createdAt ? relativeLabel(a.createdAt) : ''} />
          ))}
          {dados.feed.length === 0 && <Vazio>Sem atividades ainda.</Vazio>}
        </ChartCard>
      )

    case 'proximasTarefas':
      return (
        <ChartCard
          title="Próximas tarefas"
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
          {dados.pendentes.length === 0 && <Vazio>Nada pendente. Bom sinal.</Vazio>}
        </ChartCard>
      )

    case 'proximosCompromissos':
      return (
        <ChartCard
          title="Próximos compromissos"
          right={<VerTudo onClick={() => navigate('/agenda')} />}
        >
          {dados.proximosEventos.slice(0, 10).map((e) => <LinhaEvento key={e.id} e={e} />)}
          {dados.proximosEventos.length === 0 && <Vazio>Nenhum compromisso marcado.</Vazio>}
        </ChartCard>
      )

    default:
      // Tipo desconhecido não deveria chegar aqui (o converter filtra), mas um
      // card em branco é melhor que a tela toda quebrada.
      return <ChartCard title="Widget desconhecido"><Vazio>Este bloco não existe mais.</Vazio></ChartCard>
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
        : <Vazio>Nenhuma conversa no período.</Vazio>}
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

/** "Hoje" / "Ter" / "12 Set" — nunca a hora, que já vai na linha de baixo. */
function diaDoEvento(d: Date): string {
  const hoje = new Date()
  if (dateKeyOf(d) === dateKeyOf(hoje)) return 'Hoje'
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
