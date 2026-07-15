import type { CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { BorderBeam } from '@/components/ui/border-beam'
import { useAllDeals, useBoards } from '../hooks/useDeals'
import { useActivities, useActTypes } from '../hooks/useActivities'
import { useInvoices, invoiceStatus } from '../hooks/useInvoices'
import { useLeads } from '../hooks/useLeads'
import { useEvents } from '../hooks/useEvents'
import { revenueChart } from '../hooks/useRevenueChart'
import { fmtK, fmtMoney, dateKeyOf, dueInfo, relativeLabel } from '../lib/format'
import MaterialIcon from '../components/common/MaterialIcon'

const SOURCES = [
  { name: 'Google Ads', pct: '38%', color: '#6f9bcf' },
  { name: 'Indicação', pct: '27%', color: '#5fc9a6' },
  { name: 'LinkedIn', pct: '20%', color: '#b692d6' },
  { name: 'Orgânico', pct: '15%', color: '#e0b56a' },
]
const REV_MONTHS = ['Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun']

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
  const { docs: leads } = useLeads()
  const { docs: events } = useEvents(now.getFullYear(), now.getMonth())
  const rev = revenueChart()
  const typeMap = Object.fromEntries(types.map((t) => [t.id, t]))

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
    { icon: 'person_add', color: '#2f9e6f', bg: 'rgba(95,201,166,0.16)', beam: BEAMS.green, title: `${leads.length} novos leads`, sub: 'aguardando primeiro contato' },
  ]
  const alertCount = vencidas.length + todayEvents.length + pendingToday.length

  const kpis = [
    { icon: 'payments', value: `R$ ${fmtK(pipelineTotal)}`, label: 'Pipeline ativo', c: '#2f9e6f', cbg: 'rgba(95,201,166,0.16)', beam: BEAMS.green, glow: 'radial-gradient(circle,rgba(95,201,166,0.14),transparent 70%)' },
    { icon: 'handshake', value: String(deals.length), label: 'Negócios ativos', c: '#7a52a0', cbg: 'rgba(150,110,200,0.14)', beam: BEAMS.purple, glow: 'radial-gradient(circle,rgba(150,110,200,0.14),transparent 70%)' },
    { icon: 'request_quote', value: `R$ ${fmtMoney(ticket)}`, label: 'Ticket médio', c: '#b3801f', cbg: 'rgba(216,169,96,0.18)', beam: BEAMS.amber, glow: 'radial-gradient(circle,rgba(216,169,96,0.16),transparent 70%)' },
    { icon: 'hourglass_top', value: `R$ ${fmtK(aReceber)}`, label: 'A receber', c: '#4f7fc0', cbg: 'rgba(111,155,207,0.16)', beam: BEAMS.blue, glow: 'radial-gradient(circle,rgba(111,155,207,0.14),transparent 70%)' },
    { icon: 'person_add', value: String(leads.length), label: 'Novos leads', c: '#7a52a0', cbg: 'rgba(150,110,200,0.14)', beam: BEAMS.purple, glow: 'radial-gradient(circle,rgba(150,110,200,0.14),transparent 70%)' },
  ]

  // Funil real (board "Funil de Vendas")
  const funnelBoard = boards.find((b) => b.name.toLowerCase().includes('funil')) ?? boards[0]
  const funnelCols = funnelBoard ? [...funnelBoard.columns].sort((a, b) => a.order - b.order) : []
  const funnelCounts = funnelCols.map((c) => deals.filter((d) => d.boardId === funnelBoard!.id && d.columnId === c.id).length)
  const funnelMax = Math.max(1, ...funnelCounts)

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

      {/* Receita (mock) + Origem (mock) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="beam-card" style={beamCardStyle(BEAMS.purple, { borderRadius: 20, padding: '22px 24px' })}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#1d1726' }}>Receita recorrente</div>
              <div style={{ fontSize: 12, color: '#9c95a8', marginTop: 2 }}>Últimos 12 meses</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#1d1726', letterSpacing: '-.02em' }}>R$ 284,5k</div>
              <div style={{ fontSize: 11.5, color: '#2f9e6f', fontWeight: 700 }}>▲ 12,4% vs mês anterior</div>
            </div>
          </div>
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
            {REV_MONTHS.map((m) => <span key={m}>{m}</span>)}
          </div>
          <BorderBeam className="beam-layer" colorFrom={BEAMS.purple.from} colorTo={BEAMS.purple.to} duration={14} />
        </div>

        <div className="beam-card" style={beamCardStyle(BEAMS.purple, { borderRadius: 20, padding: '22px 24px' })}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1d1726', marginBottom: 2 }}>Origem dos leads</div>
          <div style={{ fontSize: 12, color: '#9c95a8', marginBottom: 14 }}>Este trimestre</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '6px 0 16px' }}>
            <div style={{ width: 138, height: 138, borderRadius: '50%', background: 'conic-gradient(#6f9bcf 0 38%,#5fc9a6 38% 65%,#b692d6 65% 85%,#e0b56a 85% 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 92, height: 92, borderRadius: '50%', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#1d1726' }}>312</div>
                <div style={{ fontSize: 10.5, color: '#9c95a8' }}>leads</div>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {SOURCES.map((s) => (
              <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5 }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color }} />
                <span style={{ flex: 1, color: '#4a4458' }}>{s.name}</span>
                <span style={{ fontWeight: 700, color: '#1d1726' }}>{s.pct}</span>
              </div>
            ))}
          </div>
          <BorderBeam className="beam-layer" colorFrom={BEAMS.purple.from} colorTo={BEAMS.purple.to} duration={14} delay={3.5} />
        </div>
      </div>

      {/* Funil (real) + Feed (real) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 16 }}>
        <div className="beam-card" style={beamCardStyle(BEAMS.purple, { borderRadius: 20, padding: '22px 24px' })}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1d1726', marginBottom: 18 }}>Funil de vendas</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {funnelCols.map((c, i) => (
              <div key={c.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 6 }}>
                  <span style={{ color: '#4a4458', fontWeight: 500 }}>{c.title}</span>
                  <span style={{ color: '#1d1726', fontWeight: 700 }}>{funnelCounts[i]}</span>
                </div>
                <div style={{ height: 9, borderRadius: 6, background: 'rgba(28,20,50,0.06)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.round((funnelCounts[i] / funnelMax) * 100)}%`, borderRadius: 6, background: c.color }} />
                </div>
              </div>
            ))}
            {funnelCols.length === 0 && <div style={{ fontSize: 13, color: '#a39bb0' }}>Sem dados de pipeline.</div>}
          </div>
          <BorderBeam className="beam-layer" colorFrom={BEAMS.purple.from} colorTo={BEAMS.purple.to} duration={14} delay={7} />
        </div>

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
