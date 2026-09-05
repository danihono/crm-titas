import { useMemo, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { BorderBeam } from '@/components/ui/border-beam'
import { useAllDeals, useBoards, LEADS_BOARD_ID } from '../hooks/useDeals'
import { useUIStore } from '../store/uiStore'
import { useActivities, useActTypes } from '../hooks/useActivities'
import { useEvents } from '../hooks/useEvents'
import { useConversations } from '../hooks/useConversations'
import { buildLeadFunnel, buildHeatmap } from '../lib/dashboardData'
import { semanas, porSemana } from '../lib/sparkline'
import StatCard from '../components/dashboard/StatCard'
import { C, FONT_DISPLAY } from '../styles/sx'
import LeadFunnel from '../components/dashboard/LeadFunnel'
import ConversationHeatmap from '../components/dashboard/ConversationHeatmap'
import { fmtK, fmtMoney, dateKeyOf, dueInfo, relativeLabel, greeting } from '../lib/format'
import { useAuth } from '../contexts/AuthContext'
import { useSelfProfile } from '../hooks/useProfile'
import { srcMap } from '../lib/theme'
import MaterialIcon from '../components/common/MaterialIcon'

/** Cores para origens de lead que não estão no srcMap (o usuário digita o que quiser). */
const SOURCE_FALLBACK = ['#6f9bcf', '#5fc9a6', '#b692d6', '#e0b56a', '#d98aab', '#5fa9c9']

// Feixes do <BorderBeam>: roxo é o padrão do dashboard; cards com accent
// próprio (verde, azul) ganham feixe na mesma cor do accent.
const BEAMS = {
  purple: { from: '#c4a3ea', to: '#8b5cf6', glow: 'rgba(139,92,246,0.22)' },
  blue: { from: '#8fb4dd', to: '#4f7fc0', glow: 'rgba(111,155,207,0.30)' },
} as const
type Beam = (typeof BEAMS)[keyof typeof BEAMS]

/**
 * Card de gráfico. `overflow:hidden` + `minHeight:0` são o que mantém o painel
 * numa tela só: se o conteúdo de um card crescer, ele rola DENTRO do card em vez
 * de empurrar a página para baixo.
 */
const beamCardStyle = (beam: Beam, extra?: CSSProperties): CSSProperties =>
  ({
    background: C.surface, border: `1px solid ${C.line}`, position: 'relative',
    overflow: 'hidden', minHeight: 0, display: 'flex', flexDirection: 'column',
    borderRadius: 18, padding: '16px 18px',
    '--beam-glow': beam.glow, ...extra,
  }) as CSSProperties

const tituloCard: CSSProperties = { fontSize: 14, fontWeight: 700, color: C.ink }
const subCard: CSSProperties = { fontSize: 11.5, color: C.muted, marginTop: 1, marginBottom: 12 }

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
  const { docs: events } = useEvents(now.getFullYear(), now.getMonth())

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

  const pipelineTotal = deals.reduce((s, d) => s + (d.value || 0), 0)
  const ticket = deals.length ? Math.round(pipelineTotal / deals.length) : 0

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

  /**
   * Uma fileira só de cards, no lugar das duas de antes (indicadores + alertas).
   * Nada de faturamento aqui: notas e recebíveis moram na tela de Faturamento, e
   * o painel deixou de repetir o que já está lá.
   */
  const cards = [
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
      icon: 'person_add', accent: 'green' as const,
      label: 'Novos leads', value: String(leadsNovos),
      sub: 'Aguardando primeiro contato.',
      series: serieLeads,
      link: 'Ver funil', go: () => { setActiveBoard(LEADS_BOARD_ID); navigate('/pipeline') },
      info: 'Leads parados na etapa de entrada do quadro LEADS. A linha conta quantos entraram por semana.',
    },
    {
      icon: 'event', accent: 'blue' as const,
      label: 'Agenda hoje',
      value: todayEvents.length ? todayEvents[0].time : '—',
      sub: todayEvents[0]?.title ?? 'Agenda livre hoje.',
      // Sem gráfico: useEvents carrega UM mês de calendário, e metade dele é
      // futuro. "Densidade de agenda" não é tendência.
      link: 'Ver agenda', go: () => navigate('/agenda'),
    },
    {
      icon: 'task_alt', accent: 'purple' as const,
      label: 'Tarefas hoje', value: String(pendingToday.length),
      sub: nextPending ? `${nextPending.title} · ${dueInfo(nextPending.dueAt, nextPending.done).text}` : 'Nada pendente para hoje.',
      // Sem gráfico, e isto não é escolha de desenho: toggleActivity grava só
      // `done`. Não existe `doneAt`, então quantas tarefas estavam pendentes
      // numa semana passada é informação que o banco não tem.
      link: 'Ver tarefas', go: () => navigate('/atividades'),
    },
  ]

  const pendencias = todayEvents.length + pendingToday.length
  const feed = activities.slice(0, 6)
  const dateLabel = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' }).format(now)

  return (
    // O painel cabe numa tela só: altura fixa, três faixas, e o que sobra vai
    // para a faixa dos gráficos. `minHeight` é a válvula — abaixo dela a página
    // volta a rolar, em vez de espremer tudo até ficar ilegível. 600 é o piso
    // que ainda deixa um notebook de 768px de tela caber sem barra.
    <div style={{ height: '100%', minHeight: 600, display: 'flex', flexDirection: 'column', gap: 13, padding: '18px 26px 20px' }}>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20 }}>
        <div>
          <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: 25, fontWeight: 700, letterSpacing: '-.03em', color: C.ink, margin: 0, lineHeight: 1.15 }}>
            {greeting(profile.displayName || user?.displayName || user?.email || '').split(' · ')[0]}
          </h1>
          <div style={{ fontSize: 12.5, color: C.sub, marginTop: 3 }}>
            {pendencias > 0
              ? `Você tem ${pendencias} ${pendencias === 1 ? 'compromisso' : 'compromissos'} hoje.`
              : 'Nada marcado para hoje.'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 12, color: C.muted, textTransform: 'capitalize', marginRight: 4 }}>{dateLabel}</span>
          {[30, 90, 365].map((d) => (
            <button
              key={d}
              onClick={() => setDias(d)}
              style={{
                border: '1px solid ' + (dias === d ? C.selBorder : C.fieldBorder),
                background: dias === d ? C.sel : C.surface,
                color: dias === d ? C.purple : C.sub,
                borderRadius: 10, padding: '6px 12px', fontSize: 12, fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {d === 365 ? '12 meses' : `${d} dias`}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flexShrink: 0, display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 12 }}>
        {cards.map((k) => (
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

      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '1.15fr 1.25fr 0.9fr', gap: 13 }}>
        <div className="beam-card funil-card" style={beamCardStyle(BEAMS.purple)}>
          <div style={tituloCard}>Funil de Leads</div>
          <div style={subCard}>Os leads criados no período, seguidos etapa a etapa</div>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            <LeadFunnel dados={funil} />
          </div>
          <BorderBeam className="beam-layer" colorFrom={BEAMS.purple.from} colorTo={BEAMS.purple.to} duration={14} />
        </div>

        <div className="beam-card" style={beamCardStyle(BEAMS.blue)}>
          <div style={tituloCard}>Quando o cliente procura</div>
          <div style={subCard}>Conversas abertas por dia da semana e hora</div>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            <ConversationHeatmap data={heat} />
          </div>
          <BorderBeam className="beam-layer" colorFrom={BEAMS.blue.from} colorTo={BEAMS.blue.to} duration={14} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 13, minHeight: 0 }}>
          <div className="beam-card" style={beamCardStyle(BEAMS.purple, { flex: 1 })}>
            <div style={tituloCard}>Origem dos leads</div>
            <div style={subCard}>Todos os leads cadastrados</div>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 96, height: 96, flexShrink: 0, borderRadius: '50%', background: donutGradient, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: C.surface, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: C.ink }}>{leadCards.length}</div>
                  <div style={{ fontSize: 9.5, color: C.muted }}>{leadCards.length === 1 ? 'lead' : 'leads'}</div>
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {sourceList.slice(0, 5).map((s) => (
                  <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5 }}>
                    <span style={{ width: 8, height: 8, flexShrink: 0, borderRadius: 3, background: s.color }} />
                    <span style={{ flex: 1, minWidth: 0, color: C.strong, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
                    <span style={{ fontWeight: 700, color: C.ink }}>{s.pct}%</span>
                  </div>
                ))}
                {sourceList.length === 0 && (
                  <div style={{ color: C.faint, fontSize: 12, lineHeight: 1.5 }}>Nenhum lead cadastrado ainda.</div>
                )}
              </div>
            </div>
            <BorderBeam className="beam-layer" colorFrom={BEAMS.purple.from} colorTo={BEAMS.purple.to} duration={14} delay={3.5} />
          </div>

          <div className="beam-card" style={beamCardStyle(BEAMS.purple, { flex: 1 })}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={tituloCard}>Atividade recente</div>
              <span onClick={() => navigate('/atividades')} style={{ fontSize: 11.5, color: C.purple, cursor: 'pointer', fontWeight: 700 }}>Ver tudo</span>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {feed.map((a) => {
                const t = typeMap[a.type]
                return (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: `1px solid ${C.lineHair}` }}>
                    <MaterialIcon name={t?.icon ?? 'event'} size={16} color={t?.color ?? C.purple} style={{ background: t?.bg ?? C.tintPurpleStrong, width: 30, height: 30, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, color: C.ink, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.title}</div>
                      <div style={{ fontSize: 11, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.contact}</div>
                    </div>
                    <div style={{ fontSize: 10.5, color: C.faint, flexShrink: 0 }}>{a.createdAt ? relativeLabel(a.createdAt) : ''}</div>
                  </div>
                )
              })}
              {feed.length === 0 && <div style={{ fontSize: 12.5, color: C.faint, padding: '8px 0' }}>Sem atividades ainda.</div>}
            </div>
            <BorderBeam className="beam-layer" colorFrom={BEAMS.purple.from} colorTo={BEAMS.purple.to} duration={14} delay={10.5} />
          </div>
        </div>
      </div>
    </div>
  )
}
