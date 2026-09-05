import { useMemo, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { BorderBeam } from '@/components/ui/border-beam'
import { useAllDeals, useBoards, LEADS_BOARD_ID } from '../hooks/useDeals'
import { useUIStore } from '../store/uiStore'
import { useActivities, useActTypes } from '../hooks/useActivities'
import { useInvoices, invoiceStatus } from '../hooks/useInvoices'
import { useEvents } from '../hooks/useEvents'
import { useConversations } from '../hooks/useConversations'
import { buildLeadFunnel, buildHeatmap, aReceberPorSemana, vencidasPorSemana } from '../lib/dashboardData'
import { semanas, porSemana } from '../lib/sparkline'
import StatCard from '../components/dashboard/StatCard'
import { C, FONT_DISPLAY } from '../styles/sx'
import LeadFunnel from '../components/dashboard/LeadFunnel'
import ConversationHeatmap from '../components/dashboard/ConversationHeatmap'
import { revenueChart } from '../hooks/useRevenueChart'
import { fmtK, fmtMoney, dateKeyOf, dueInfo, relativeLabel, greeting } from '../lib/format'
import { useAuth } from '../contexts/AuthContext'
import { useSelfProfile } from '../hooks/useProfile'
import { srcMap } from '../lib/theme'
import MaterialIcon from '../components/common/MaterialIcon'

/** Cores para origens de lead que não estão no srcMap (o usuário digita o que quiser). */
const SOURCE_FALLBACK = ['#6f9bcf', '#5fc9a6', '#b692d6', '#e0b56a', '#d98aab', '#5fa9c9']

// Feixes do <BorderBeam>: roxo é o padrão do dashboard; cards com accent
// próprio (verde, âmbar, azul, rosa) ganham feixe na mesma cor do accent.
const BEAMS = {
  purple: { from: '#c4a3ea', to: '#8b5cf6', glow: 'rgba(139,92,246,0.22)' },
  green: { from: '#5fc9a6', to: '#2f9e6f', glow: 'rgba(95,201,166,0.30)' },
  amber: { from: '#e0b56a', to: '#b3801f', glow: 'rgba(216,169,96,0.32)' },
  blue: { from: '#8fb4dd', to: '#4f7fc0', glow: 'rgba(111,155,207,0.30)' },
  rose: { from: '#d98aab', to: '#c14d77', glow: 'rgba(217,138,171,0.30)' },
} as const
type Beam = (typeof BEAMS)[keyof typeof BEAMS]

/** Estilo do card animado: sombra/hover ficam na classe .beam-card (index.css). */
const beamCardStyle = (beam: Beam, extra?: CSSProperties): CSSProperties =>
  ({ background: C.surface, border: `1px solid ${C.line}`, position: 'relative', overflow: 'hidden', '--beam-glow': beam.glow, ...extra }) as CSSProperties

export default function Dashboard() {
  const navigate = useNavigate()
  const setActiveBoard = useUIStore((s) => s.setActiveBoard)
  const { user } = useAuth()
  const profile = useSelfProfile()
  const now = new Date()
  const { docs: deals } = useAllDeals()
  const { docs: boards } = useBoards()
  const { docs: activities } = useActivities()
  const { docs: types } = useActTypes()
  const { docs: invoices } = useInvoices()
  const { docs: events } = useEvents(now.getFullYear(), now.getMonth())
  const rev = revenueChart(invoices, now)

  // Período dos gráficos de jornada e de calor. Sem ele a jornada compararia contatos de
  // sempre com notas do mês, e a conversão sairia sem sentido.
  const [dias, setDias] = useState(90)
  // O intervalo precisa ser estável entre renders: `useConversations` reassina a consulta a
  // cada objeto Date novo, e um `new Date()` solto aqui religaria o listener sem parar.
  const [from, to] = useMemo(() => {
    const fim = new Date()
    fim.setHours(23, 59, 59, 999)
    const ini = new Date(fim)
    ini.setDate(ini.getDate() - (dias - 1))
    ini.setHours(0, 0, 0, 0)
    return [ini, fim]
  }, [dias])
  const { docs: conversations } = useConversations(from, to)
  // O funil sai do quadro LEADS: é o único lugar do sistema onde o MESMO registro anda de
  // etapa em etapa, e por isso o único que pode virar funil sem inventar ligação.
  const leadsBoard = boards.find((b) => b.id === LEADS_BOARD_ID)
  const leadCards = useMemo(() => deals.filter((d) => d.boardId === LEADS_BOARD_ID), [deals])
  const funil = useMemo(
    () => buildLeadFunnel({ deals: leadCards, columns: leadsBoard?.columns ?? [], from, to }),
    [leadCards, leadsBoard, from, to],
  )
  // Aguardando primeiro contato = quem ainda está na etapa de entrada, não todo lead.
  const primeiraEtapa = leadsBoard
    ? [...leadsBoard.columns].sort((a, b) => a.order - b.order)[0]?.id
    : undefined
  const leadsNovos = primeiraEtapa ? leadCards.filter((d) => d.columnId === primeiraEtapa).length : 0
  const heat = useMemo(() => buildHeatmap(conversations), [conversations])
  const typeMap = Object.fromEntries(types.map((t) => [t.id, t]))

  // Origem dos leads — a etiqueta do card, que é para onde a migração levou o `source` da
  // lista antiga. Uma fonte só: o quadro.
  const sourceCounts = new Map<string, number>()
  leadCards.forEach((l) => {
    const key = l.tag?.trim() || 'Sem origem'
    sourceCounts.set(key, (sourceCounts.get(key) ?? 0) + 1)
  })
  let acc = 0
  const sourceList = [...sourceCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count], i) => {
      const share = (count / leadCards.length) * 100
      const stop: [number, number] = [acc, (acc += share)]
      return {
        name,
        count,
        // Arredonda só o rótulo; a rosca usa a fração exata para fechar em 100%.
        pct: Math.round(share),
        color: srcMap[name]?.[0] ?? SOURCE_FALLBACK[i % SOURCE_FALLBACK.length],
        stop,
      }
    })
  const donutGradient = sourceList.length
    ? `conic-gradient(${sourceList.map((s) => `${s.color} ${s.stop[0]}% ${s.stop[1]}%`).join(',')})`
    : `conic-gradient(${C.line} 0 100%)`

  // KPIs reais
  const pipelineTotal = deals.reduce((s, d) => s + (d.value || 0), 0)
  const ticket = deals.length ? Math.round(pipelineTotal / deals.length) : 0
  const withStatus = invoices.map((iv) => invoiceStatus(iv))
  const aReceber = invoices.filter((_, i) => withStatus[i] === 'Pendente').reduce((s, iv) => s + iv.value, 0)
  const vencidas = invoices.filter((_, i) => withStatus[i] === 'Vencida')
  const vencidoSum = vencidas.reduce((s, iv) => s + iv.value, 0)

  // Alertas reais
  const todayKey = dateKeyOf(now)
  const todayEvents = events.filter((e) => e.dateKey === todayKey).sort((a, b) => a.time.localeCompare(b.time))
  const pendingToday = activities.filter((a) => !a.done && dateKeyOf(a.dueAt) === todayKey)
  const nextPending = pendingToday[0] ?? activities.filter((a) => !a.done).sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())[0]

  // ── Séries dos mini gráficos ────────────────────────────────────────────
  // 12 semanas, e só onde existe histórico DE VERDADE. Onde o modelo não guarda
  // quando a coisa aconteceu, o card fica sem gráfico (ver lib/dashboardData.ts).
  const faixas = useMemo(() => semanas(12, now), [todayKey])
  const serieNovoPipeline = useMemo(
    () => porSemana(deals, (d) => d.createdAt, faixas, (d) => d.value || 0),
    [deals, faixas],
  )
  const serieNegocios = useMemo(() => porSemana(deals, (d) => d.createdAt, faixas), [deals, faixas])
  // `reachedAt` só é gravado na PRIMEIRA chegada à etapa, que é exatamente a
  // semântica de "entrou no funil nesta semana".
  const serieLeads = useMemo(
    () => (primeiraEtapa ? porSemana(leadCards, (d) => d.reachedAt?.[primeiraEtapa], faixas) : []),
    [leadCards, primeiraEtapa, faixas],
  )
  const serieAReceber = useMemo(() => aReceberPorSemana(invoices, faixas), [invoices, faixas])
  const serieVencidas = useMemo(() => vencidasPorSemana(invoices, faixas), [invoices, faixas])

  const alerts = [
    {
      icon: 'error', accent: 'rose' as const,
      label: 'Notas vencidas',
      value: String(vencidas.length),
      sub: vencidas.length ? `R$ ${fmtMoney(vencidoSum)} em atraso` : 'Faturamento em dia.',
      series: serieVencidas,
      link: 'Ver faturamento', go: () => navigate('/faturamento'),
      info: 'Notas não pagas cujo vencimento já passou. A linha remonta o fim de cada uma das últimas 12 semanas.',
    },
    {
      icon: 'event', accent: 'amber' as const,
      label: 'Compromisso de hoje',
      value: todayEvents.length ? todayEvents[0].time : '—',
      sub: todayEvents[0]?.title ?? 'Agenda livre hoje.',
      // Sem gráfico: useEvents carrega UM mês de calendário, e metade dele é
      // futuro. "Densidade de agenda" não é tendência.
      link: 'Ver agenda', go: () => navigate('/agenda'),
    },
    {
      icon: 'task_alt', accent: 'purple' as const,
      label: 'Próxima tarefa',
      value: String(pendingToday.length),
      sub: nextPending ? `${nextPending.title} · ${dueInfo(nextPending.dueAt, nextPending.done).text}` : 'Nada pendente para hoje.',
      // Sem gráfico, e isto não é escolha de desenho: toggleActivity grava só
      // `done`. Não existe `doneAt`, então quantas tarefas estavam pendentes
      // numa semana passada é informação que o banco não tem.
      link: 'Ver atividades', go: () => navigate('/atividades'),
    },
    {
      icon: 'person_add', accent: 'green' as const,
      label: 'Novos leads',
      value: String(leadsNovos),
      sub: 'Aguardando primeiro contato.',
      series: serieLeads,
      link: 'Ver funil', go: () => { setActiveBoard(LEADS_BOARD_ID); navigate('/pipeline') },
      info: 'Leads parados na etapa de entrada do quadro LEADS. A linha conta quantos entraram por semana.',
    },
  ]
  const alertCount = vencidas.length + todayEvents.length + pendingToday.length

  const kpis = [
    {
      icon: 'payments', accent: 'green' as const, featured: true,
      label: 'Pipeline ativo', value: `R$ ${fmtK(pipelineTotal)}`,
      sub: 'Soma de hoje. A linha é o pipeline novo por semana.',
      series: serieNovoPipeline,
      link: 'Ver pipeline', go: () => navigate('/pipeline'),
      info: 'O número é a soma de todos os negócios abertos agora; a linha, o valor criado em cada uma das últimas 12 semanas.',
    },
    {
      icon: 'handshake', accent: 'purple' as const,
      label: 'Negócios ativos', value: String(deals.length),
      sub: 'Criados por semana.',
      series: serieNegocios,
      link: 'Ver quadro', go: () => navigate('/pipeline'),
    },
    {
      icon: 'request_quote', accent: 'amber' as const,
      label: 'Ticket médio', value: `R$ ${fmtMoney(ticket)}`,
      sub: `Média entre ${deals.length} negócio(s) aberto(s).`,
      // Sem gráfico: é razão de duas séries sem passado. `updateDeal` sobrescreve
      // o valor do negócio sem versionar, então "ticket médio em maio" não existe.
      link: 'Ver pipeline', go: () => navigate('/pipeline'),
    },
    {
      icon: 'hourglass_top', accent: 'blue' as const,
      label: 'A receber', value: `R$ ${fmtK(aReceber)}`,
      sub: 'Em aberto e ainda no prazo.',
      series: serieAReceber,
      link: 'Ver notas', go: () => navigate('/faturamento'),
      info: 'Saldo em aberto e dentro do prazo no fim de cada semana. Nota paga sem data de baixa conta como paga desde sempre.',
    },
  ]

  // Feed real (atividades recentes)
  const feed = activities.slice(0, 5)

  const dateLabel = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' }).format(now)

  return (
    <div style={{ padding: '28px 30px 40px' }}>
      {/* Saudação — o título desta tela, no formato da interface de referência. */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, marginBottom: 22 }}>
        <div>
          <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: 28, fontWeight: 700, letterSpacing: '-.03em', color: C.ink, margin: 0, lineHeight: 1.15 }}>
            {greeting(profile.displayName || user?.displayName || user?.email || '').split(' · ')[0]}
          </h1>
          <div style={{ fontSize: 13, color: C.sub, marginTop: 5 }}>
            {alertCount > 0
              ? `Você tem ${alertCount} ${alertCount === 1 ? 'item' : 'itens'} pedindo atenção hoje.`
              : 'Nada pendente para hoje.'}
          </div>
        </div>
        <span style={{ fontSize: 12.5, color: C.muted, textTransform: 'capitalize', paddingTop: 6 }}>{dateLabel}</span>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 26 }}>
        {kpis.map((k) => (
          <StatCard
            key={k.label}
            label={k.label}
            value={k.value}
            sub={k.sub}
            icon={k.icon}
            accent={k.accent}
            series={k.series}
            featured={k.featured}
            info={k.info}
            linkLabel={k.link}
            onLink={k.go}
          />
        ))}
      </div>

      {/* Alertas */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 13 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>Alertas do dia</span>
        {alertCount > 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, color: C.rose, background: C.tintRose, borderRadius: 20, padding: '2px 9px' }}>{alertCount}</span>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 26 }}>
        {alerts.map((al) => (
          <StatCard
            key={al.label}
            label={al.label}
            value={al.value}
            sub={al.sub}
            icon={al.icon}
            accent={al.accent}
            series={al.series}
            info={al.info}
            linkLabel={al.link}
            onLink={al.go}
          />
        ))}
      </div>

      {/* Jornada + mapa de calor: os dois únicos gráficos que cruzam módulos. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>Visão do sistema</div>
        <div style={{ flex: 1 }} />
        {[30, 90, 365].map((d) => (
          <button
            key={d}
            onClick={() => setDias(d)}
            style={{
              border: '1px solid ' + (dias === d ? C.purple : C.fieldBorder),
              background: dias === d ? C.tintPurple : C.surface,
              color: dias === d ? C.purple : C.sub,
              borderRadius: 10, padding: '7px 13px', fontSize: 12.5, fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {d === 365 ? '12 meses' : `${d} dias`}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.35fr', gap: 16, marginBottom: 16 }}>
        <div className="beam-card" style={beamCardStyle(BEAMS.purple, { borderRadius: 20, padding: '22px 24px' })}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, marginBottom: 2 }}>Funil de Leads</div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 18 }}>
            Os leads criados no período, seguidos etapa a etapa
          </div>
          <LeadFunnel dados={funil} />
          <BorderBeam className="beam-layer" colorFrom={BEAMS.purple.from} colorTo={BEAMS.purple.to} duration={14} />
        </div>

        <div className="beam-card" style={beamCardStyle(BEAMS.blue, { borderRadius: 20, padding: '22px 24px' })}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, marginBottom: 2 }}>Quando o cliente procura</div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>
            Conversas abertas por dia da semana e hora
          </div>
          <ConversationHeatmap data={heat} />
          <BorderBeam className="beam-layer" colorFrom={BEAMS.blue.from} colorTo={BEAMS.blue.to} duration={14} />
        </div>
      </div>

      {/* Receita (mock) + Origem (mock) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="beam-card" style={beamCardStyle(BEAMS.purple, { borderRadius: 20, padding: '22px 24px' })}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>Receita recebida</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Notas pagas · últimos 12 meses</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: C.ink, letterSpacing: '-.02em' }}>R$ {fmtK(rev.total)}</div>
              {rev.changePct !== null && (
                <div style={{ fontSize: 11.5, color: rev.changePct >= 0 ? C.green : C.rose, fontWeight: 700 }}>
                  {rev.changePct >= 0 ? '▲' : '▼'} {Math.abs(rev.changePct).toFixed(1).replace('.', ',')}% vs mês anterior
                </div>
              )}
            </div>
          </div>
          {!rev.hasData && (
            <div style={{ padding: '46px 0 40px', textAlign: 'center', color: C.faint, fontSize: 13, lineHeight: 1.5 }}>
              Nenhuma nota paga nos últimos 12 meses.<br />
              <span style={{ fontSize: 12 }}>A curva aparece assim que a primeira nota for marcada como paga.</span>
            </div>
          )}
          {rev.hasData && <>
          <svg viewBox="0 0 560 170" style={{ width: '100%', height: 'auto', display: 'block', marginTop: 8 }}>
            <defs>
              <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#9a6fb8" stopOpacity="0.28" />
                <stop offset="1" stopColor="#9a6fb8" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="revStroke" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#8e6fc0" />
                <stop offset="1" stopColor={C.purple} />
              </linearGradient>
            </defs>
            <line x1="0" y1="42" x2="560" y2="42" stroke={C.tintNeutral} />
            <line x1="0" y1="86" x2="560" y2="86" stroke={C.tintNeutral} />
            <line x1="0" y1="130" x2="560" y2="130" stroke={C.tintNeutral} />
            <path d={rev.area} fill="url(#revFill)" />
            <path d={rev.line} fill="none" stroke="url(#revStroke)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx={rev.lastX} cy={rev.lastY} r="5" fill={C.purple} stroke={C.surface} strokeWidth="2.5" />
          </svg>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10.5, color: C.faint }}>
            {rev.months.map((m, i) => <span key={`${m}-${i}`}>{m}</span>)}
          </div>
          </>}
          <BorderBeam className="beam-layer" colorFrom={BEAMS.purple.from} colorTo={BEAMS.purple.to} duration={14} />
        </div>

        <div className="beam-card" style={beamCardStyle(BEAMS.purple, { borderRadius: 20, padding: '22px 24px' })}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, marginBottom: 2 }}>Origem dos leads</div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>Todos os leads cadastrados</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '6px 0 16px' }}>
            <div style={{ width: 138, height: 138, borderRadius: '50%', background: donutGradient, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 92, height: 92, borderRadius: '50%', background: C.surface, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: C.ink }}>{leadCards.length}</div>
                <div style={{ fontSize: 10.5, color: C.muted }}>{leadCards.length === 1 ? 'lead' : 'leads'}</div>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {sourceList.map((s) => (
              <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5 }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color }} />
                <span style={{ flex: 1, color: C.strong }}>{s.name}</span>
                <span style={{ fontWeight: 700, color: C.ink }}>{s.pct}%</span>
              </div>
            ))}
            {sourceList.length === 0 && (
              <div style={{ textAlign: 'center', color: C.faint, fontSize: 12.5, lineHeight: 1.5 }}>
                Nenhum lead cadastrado ainda.
              </div>
            )}
          </div>
          <BorderBeam className="beam-layer" colorFrom={BEAMS.purple.from} colorTo={BEAMS.purple.to} duration={14} delay={3.5} />
        </div>
      </div>

      {/* Feed (real). O cartão "Funil de vendas" que ficava aqui saiu: ele contava quem ESTÁ
          em cada coluna do quadro de vendas, enquanto o Funil de Leads acima conta quem
          PASSOU por cada etapa. Dois cartões com o mesmo nome e números diferentes na mesma
          tela confundem mais do que informam. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
        <div className="beam-card" style={beamCardStyle(BEAMS.purple, { borderRadius: 20, padding: '22px 24px' })}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>Atividade recente</div>
            <span onClick={() => navigate('/atividades')} style={{ fontSize: 12, color: C.purple, cursor: 'pointer', fontWeight: 700 }}>Ver tudo</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {feed.map((a) => {
              const t = typeMap[a.type]
              return (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '10px 0', borderBottom: `1px solid ${C.lineHair}` }}>
                  <MaterialIcon name={t?.icon ?? 'event'} size={19} color={t?.color ?? C.purple} style={{ background: t?.bg ?? C.tintPurpleStrong, width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: C.ink, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.title}</div>
                    <div style={{ fontSize: 11.5, color: C.muted }}>{a.contact}</div>
                  </div>
                  <div style={{ fontSize: 11, color: C.faint, flexShrink: 0 }}>{a.createdAt ? relativeLabel(a.createdAt) : ''}</div>
                </div>
              )
            })}
            {feed.length === 0 && <div style={{ fontSize: 13, color: C.faint, padding: '10px 0' }}>Sem atividades ainda.</div>}
          </div>
          <BorderBeam className="beam-layer" colorFrom={BEAMS.purple.from} colorTo={BEAMS.purple.to} duration={14} delay={10.5} />
        </div>
      </div>
    </div>
  )
}
