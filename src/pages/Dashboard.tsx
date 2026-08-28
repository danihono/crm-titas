import { useMemo, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { BorderBeam } from '@/components/ui/border-beam'
import { useAllDeals, useBoards, LEADS_BOARD_ID } from '../hooks/useDeals'
import { useActivities, useActTypes } from '../hooks/useActivities'
import { useInvoices, invoiceStatus } from '../hooks/useInvoices'
import { useEvents } from '../hooks/useEvents'
import { useConversations } from '../hooks/useConversations'
import { buildLeadFunnel, buildHeatmap } from '../lib/dashboardData'
import LeadFunnel from '../components/dashboard/LeadFunnel'
import ConversationHeatmap from '../components/dashboard/ConversationHeatmap'
import { revenueChart } from '../hooks/useRevenueChart'
import { fmtK, fmtMoney, dateKeyOf, dueInfo, relativeLabel } from '../lib/format'
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
  ({ background: '#fff', border: '1px solid #ececf3', position: 'relative', overflow: 'hidden', '--beam-glow': beam.glow, ...extra }) as CSSProperties

export default function Dashboard() {
  const navigate = useNavigate()
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
    : 'conic-gradient(#ece9f2 0 100%)'

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

  const alerts = [
    { icon: 'error', color: '#c14d77', bg: 'rgba(217,138,171,0.16)', beam: BEAMS.rose, title: vencidas.length ? `${vencidas.length} nota(s) vencida(s)` : 'Nenhuma nota vencida', sub: vencidas.length ? `R$ ${fmtMoney(vencidoSum)} em atraso` : 'faturamento em dia' },
    { icon: 'event', color: '#b3801f', bg: 'rgba(216,169,96,0.18)', beam: BEAMS.amber, title: todayEvents[0]?.title ?? 'Sem compromissos hoje', sub: todayEvents[0] ? `Hoje às ${todayEvents[0].time}` : 'agenda livre' },
    { icon: 'task_alt', color: '#7a52a0', bg: 'rgba(150,110,200,0.14)', beam: BEAMS.purple, title: nextPending?.title ?? 'Sem tarefas pendentes', sub: nextPending ? dueInfo(nextPending.dueAt, nextPending.done).text : 'tudo em dia' },
    { icon: 'person_add', color: '#2f9e6f', bg: 'rgba(95,201,166,0.16)', beam: BEAMS.green, title: `${leadsNovos} novos leads`, sub: 'aguardando primeiro contato' },
  ]
  const alertCount = vencidas.length + todayEvents.length + pendingToday.length

  const kpis = [
    { icon: 'payments', value: `R$ ${fmtK(pipelineTotal)}`, label: 'Pipeline ativo', c: '#2f9e6f', cbg: 'rgba(95,201,166,0.16)', beam: BEAMS.green, glow: 'radial-gradient(circle,rgba(95,201,166,0.14),transparent 70%)' },
    { icon: 'handshake', value: String(deals.length), label: 'Negócios ativos', c: '#7a52a0', cbg: 'rgba(150,110,200,0.14)', beam: BEAMS.purple, glow: 'radial-gradient(circle,rgba(150,110,200,0.14),transparent 70%)' },
    { icon: 'request_quote', value: `R$ ${fmtMoney(ticket)}`, label: 'Ticket médio', c: '#b3801f', cbg: 'rgba(216,169,96,0.18)', beam: BEAMS.amber, glow: 'radial-gradient(circle,rgba(216,169,96,0.16),transparent 70%)' },
    { icon: 'hourglass_top', value: `R$ ${fmtK(aReceber)}`, label: 'A receber', c: '#4f7fc0', cbg: 'rgba(111,155,207,0.16)', beam: BEAMS.blue, glow: 'radial-gradient(circle,rgba(111,155,207,0.14),transparent 70%)' },
    { icon: 'person_add', value: String(leadsNovos), label: 'Novos leads', c: '#7a52a0', cbg: 'rgba(150,110,200,0.14)', beam: BEAMS.purple, glow: 'radial-gradient(circle,rgba(150,110,200,0.14),transparent 70%)' },
  ]


  // Feed real (atividades recentes)
  const feed = activities.slice(0, 5)

  const dateLabel = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' }).format(now)

  return (
    <div style={{ padding: '28px 30px 40px' }}>
      {/* Alertas */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 13 }}>
        <MaterialIcon name="notifications_active" size={22} color="#c14d77" />
        <span style={{ fontSize: 15, fontWeight: 700, color: '#1d1726' }}>Alertas do dia</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#c14d77', background: 'rgba(217,138,171,0.16)', borderRadius: 20, padding: '2px 9px' }}>{alertCount}</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: '#9c95a8', textTransform: 'capitalize' }}>{dateLabel}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 13, marginBottom: 24 }}>
        {alerts.map((al, i) => (
          <div key={i} className="beam-card" style={beamCardStyle(al.beam, { display: 'flex', gap: 12, alignItems: 'center', borderLeft: `3px solid ${al.color}`, borderRadius: 14, padding: '13px 15px' })}>
            <MaterialIcon name={al.icon} size={20} color={al.color} style={{ background: al.bg, width: 40, height: 40, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1d1726', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{al.title}</div>
              <div style={{ fontSize: 11.5, color: '#6e6780', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{al.sub}</div>
            </div>
            <BorderBeam className="beam-layer" colorFrom={al.beam.from} colorTo={al.beam.to} duration={10} delay={i * 2.5} />
          </div>
        ))}
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 14, marginBottom: 16 }}>
        {kpis.map((k, i) => (
          <div key={i} className="beam-card" style={beamCardStyle(k.beam, { borderRadius: 18, padding: '20px 20px 18px' })}>
            <div style={{ position: 'absolute', top: -30, right: -30, width: 110, height: 110, borderRadius: '50%', background: k.glow }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <MaterialIcon name={k.icon} size={22} color={k.c} style={{ background: k.cbg, width: 40, height: 40, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }} />
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.02em', color: '#1d1726', lineHeight: 1 }}>{k.value}</div>
            <div style={{ fontSize: 12.5, color: '#6e6780', marginTop: 6 }}>{k.label}</div>
            <BorderBeam className="beam-layer" colorFrom={k.beam.from} colorTo={k.beam.to} duration={9} delay={i * 1.8} />
          </div>
        ))}
      </div>

      {/* Jornada + mapa de calor: os dois únicos gráficos que cruzam módulos. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#1d1726' }}>Visão do sistema</div>
        <div style={{ flex: 1 }} />
        {[30, 90, 365].map((d) => (
          <button
            key={d}
            onClick={() => setDias(d)}
            style={{
              border: '1px solid ' + (dias === d ? '#7a52a0' : '#e6e3ee'),
              background: dias === d ? 'rgba(150,110,200,0.12)' : '#fff',
              color: dias === d ? '#7a52a0' : '#6e6780',
              borderRadius: 10, padding: '7px 13px', fontSize: 12.5, fontWeight: 700,
              cursor: 'pointer', fontFamily: "'Manrope',sans-serif",
            }}
          >
            {d === 365 ? '12 meses' : `${d} dias`}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.35fr', gap: 16, marginBottom: 16 }}>
        <div className="beam-card" style={beamCardStyle(BEAMS.purple, { borderRadius: 20, padding: '22px 24px' })}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1d1726', marginBottom: 2 }}>Funil de Leads</div>
          <div style={{ fontSize: 12, color: '#9c95a8', marginBottom: 18 }}>
            Os leads criados no período, seguidos etapa a etapa
          </div>
          <LeadFunnel dados={funil} />
          <BorderBeam className="beam-layer" colorFrom={BEAMS.purple.from} colorTo={BEAMS.purple.to} duration={14} />
        </div>

        <div className="beam-card" style={beamCardStyle(BEAMS.blue, { borderRadius: 20, padding: '22px 24px' })}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1d1726', marginBottom: 2 }}>Quando o cliente procura</div>
          <div style={{ fontSize: 12, color: '#9c95a8', marginBottom: 16 }}>
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
              <div style={{ fontSize: 15, fontWeight: 700, color: '#1d1726' }}>Receita recebida</div>
              <div style={{ fontSize: 12, color: '#9c95a8', marginTop: 2 }}>Notas pagas · últimos 12 meses</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#1d1726', letterSpacing: '-.02em' }}>R$ {fmtK(rev.total)}</div>
              {rev.changePct !== null && (
                <div style={{ fontSize: 11.5, color: rev.changePct >= 0 ? '#2f9e6f' : '#c14d77', fontWeight: 700 }}>
                  {rev.changePct >= 0 ? '▲' : '▼'} {Math.abs(rev.changePct).toFixed(1).replace('.', ',')}% vs mês anterior
                </div>
              )}
            </div>
          </div>
          {!rev.hasData && (
            <div style={{ padding: '46px 0 40px', textAlign: 'center', color: '#a39bb0', fontSize: 13, lineHeight: 1.5 }}>
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
                <stop offset="1" stopColor="#7a52a0" />
              </linearGradient>
            </defs>
            <line x1="0" y1="42" x2="560" y2="42" stroke="rgba(28,20,50,0.06)" />
            <line x1="0" y1="86" x2="560" y2="86" stroke="rgba(28,20,50,0.06)" />
            <line x1="0" y1="130" x2="560" y2="130" stroke="rgba(28,20,50,0.06)" />
            <path d={rev.area} fill="url(#revFill)" />
            <path d={rev.line} fill="none" stroke="url(#revStroke)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx={rev.lastX} cy={rev.lastY} r="5" fill="#7a52a0" stroke="#ffffff" strokeWidth="2.5" />
          </svg>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10.5, color: '#a39bb0' }}>
            {rev.months.map((m, i) => <span key={`${m}-${i}`}>{m}</span>)}
          </div>
          </>}
          <BorderBeam className="beam-layer" colorFrom={BEAMS.purple.from} colorTo={BEAMS.purple.to} duration={14} />
        </div>

        <div className="beam-card" style={beamCardStyle(BEAMS.purple, { borderRadius: 20, padding: '22px 24px' })}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1d1726', marginBottom: 2 }}>Origem dos leads</div>
          <div style={{ fontSize: 12, color: '#9c95a8', marginBottom: 14 }}>Todos os leads cadastrados</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '6px 0 16px' }}>
            <div style={{ width: 138, height: 138, borderRadius: '50%', background: donutGradient, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 92, height: 92, borderRadius: '50%', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#1d1726' }}>{leadCards.length}</div>
                <div style={{ fontSize: 10.5, color: '#9c95a8' }}>{leadCards.length === 1 ? 'lead' : 'leads'}</div>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {sourceList.map((s) => (
              <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5 }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color }} />
                <span style={{ flex: 1, color: '#4a4458' }}>{s.name}</span>
                <span style={{ fontWeight: 700, color: '#1d1726' }}>{s.pct}%</span>
              </div>
            ))}
            {sourceList.length === 0 && (
              <div style={{ textAlign: 'center', color: '#a39bb0', fontSize: 12.5, lineHeight: 1.5 }}>
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
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1d1726' }}>Atividade recente</div>
            <span onClick={() => navigate('/atividades')} style={{ fontSize: 12, color: '#7a52a0', cursor: 'pointer', fontWeight: 700 }}>Ver tudo</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {feed.map((a) => {
              const t = typeMap[a.type]
              return (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '10px 0', borderBottom: '1px solid rgba(28,20,50,0.06)' }}>
                  <MaterialIcon name={t?.icon ?? 'event'} size={19} color={t?.color ?? '#7a52a0'} style={{ background: t?.bg ?? 'rgba(150,110,200,0.14)', width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: '#2a2435', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.title}</div>
                    <div style={{ fontSize: 11.5, color: '#9c95a8' }}>{a.contact}</div>
                  </div>
                  <div style={{ fontSize: 11, color: '#a39bb0', flexShrink: 0 }}>{a.createdAt ? relativeLabel(a.createdAt) : ''}</div>
                </div>
              )
            })}
            {feed.length === 0 && <div style={{ fontSize: 13, color: '#a39bb0', padding: '10px 0' }}>Sem atividades ainda.</div>}
          </div>
          <BorderBeam className="beam-layer" colorFrom={BEAMS.purple.from} colorTo={BEAMS.purple.to} duration={14} delay={10.5} />
        </div>
      </div>
    </div>
  )
}
