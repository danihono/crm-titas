import { useMemo, useState } from 'react'
import { useContacts } from '../hooks/useContacts'
import { useConversations, convOf } from '../hooks/useConversations'
import { useMembers } from '../hooks/useTeam'
import { useSectors, useTags } from '../hooks/useSettings'
import { sx, C } from '../styles/sx'
import MaterialIcon from '../components/common/MaterialIcon'
import TabBar, { type TabDef } from '../components/common/TabBar'
import type { ConversationRecord } from '../types'

type ReportTab = 'geral' | 'agora' | 'atendentes' | 'setores' | 'etiquetas'

const TABS: TabDef<ReportTab>[] = [
  { id: 'geral', label: 'Geral', icon: 'insights' },
  { id: 'agora', label: 'Agora', icon: 'bolt' },
  { id: 'atendentes', label: 'Atendentes', icon: 'badge' },
  { id: 'setores', label: 'Setores', icon: 'account_tree' },
  { id: 'etiquetas', label: 'Etiquetas', icon: 'label' },
]

const RANGES = [
  { days: 7, label: '7 dias' },
  { days: 30, label: '30 dias' },
  { days: 90, label: '90 dias' },
]

/** Duração legível a partir de milissegundos. "—" quando não há amostra. */
function fmtDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return '—'
  const min = Math.round(ms / 60000)
  if (min < 1) return 'menos de 1 min'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const rest = min % 60
  if (h < 24) return rest ? `${h}h ${rest}min` : `${h}h`
  const d = Math.floor(h / 24)
  return `${d}d ${h % 24}h`
}

/** Média das durações presentes; null se nenhuma conversa tiver o par de marcos. */
function avgSpan(rows: ConversationRecord[], to: (r: ConversationRecord) => Date | undefined): number | null {
  const spans = rows.flatMap((r) => {
    const end = to(r)
    if (!end || !r.openedAt) return []
    const ms = end.getTime() - r.openedAt.getTime()
    return ms >= 0 ? [ms] : []
  })
  if (spans.length === 0) return null
  return spans.reduce((a, b) => a + b, 0) / spans.length
}

export default function Reports() {
  const [tab, setTab] = useState<ReportTab>('geral')
  const [days, setDays] = useState(7)

  // As datas viram estado derivado do "days" para a query não se re-assinar a cada
  // render (useConversations depende do timestamp exato do intervalo).
  const [from, to] = useMemo(() => {
    const end = new Date()
    const start = new Date(end.getTime() - days * 86_400_000)
    start.setHours(0, 0, 0, 0)
    return [start, end]
  }, [days])

  const { docs: conversations, loading } = useConversations(from, to)
  const { docs: contacts } = useContacts()
  const { docs: members } = useMembers()
  const { docs: sectors } = useSectors()
  const { docs: tags } = useTags()

  const closed = conversations.filter((c) => c.closedAt)
  const open = conversations.filter((c) => !c.closedAt)

  return (
    <div>
      <div style={{ padding: '26px 30px 16px', background: '#ffffff', borderBottom: '1px solid ' + C.fieldBorder }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h1 style={{ ...sx.serif, fontSize: 30, fontWeight: 600, color: C.ink, margin: 0 }}>Relatórios</h1>
            <div style={{ fontSize: 13, color: C.sub, marginTop: 4 }}>
              Volume de conversas, tempo de resposta e desempenho por atendente, setor e etiqueta.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 7 }}>
            {RANGES.map((r) => (
              <button
                key={r.days}
                onClick={() => setDays(r.days)}
                style={{
                  border: '1px solid ' + (days === r.days ? C.purple : C.fieldBorder),
                  background: days === r.days ? 'rgba(150,110,200,0.12)' : '#fff',
                  color: days === r.days ? C.purple : C.sub,
                  borderRadius: 20, padding: '7px 15px', fontSize: 12.5, fontWeight: 700,
                  cursor: 'pointer', fontFamily: "'Manrope',sans-serif",
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      <div style={{ padding: '24px 30px 40px' }}>
        {loading && <div style={{ color: C.faint, fontSize: 13 }}>Carregando…</div>}

        {!loading && tab === 'geral' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 18 }}>
              <Kpi icon="forum" color={C.purple} label="Total de conversas" hint="Iniciadas no período" value={String(conversations.length)} />
              <Kpi icon="mark_chat_unread" color={C.amber} label="Em aberto" hint="Ainda sem finalização" value={String(open.length)} />
              <Kpi icon="task_alt" color={C.green} label="Finalizadas" hint="Encerradas pela equipe" value={String(closed.length)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 16 }}>
              <Kpi
                icon="bolt"
                color={C.blue}
                label="Primeira resposta"
                hint="Média entre abrir a conversa e a equipe responder"
                value={fmtDuration(avgSpan(conversations, (r) => r.firstResponseAt))}
              />
              <Kpi
                icon="schedule"
                color={C.rose}
                label="Tempo até finalizar"
                hint="Média entre abrir e encerrar o atendimento"
                value={fmtDuration(avgSpan(closed, (r) => r.closedAt))}
              />
            </div>
            {conversations.length === 0 && (
              <Empty>
                Nenhuma conversa registrada neste período. Os relatórios passam a contar a partir do
                momento em que as conversas começam a ser atendidas nas abas de Contatos.
              </Empty>
            )}
          </>
        )}

        {!loading && tab === 'agora' && (
          <NowPanel contacts={contacts} />
        )}

        {!loading && tab === 'atendentes' && (
          <Breakdown
            title="Desempenho por atendente"
            rows={members.map((m) => {
              const mine = conversations.filter((c) => c.assignedTo === m.id)
              return {
                key: m.id,
                label: m.name,
                color: C.purple,
                total: mine.length,
                closed: mine.filter((c) => c.closedAt).length,
                firstResponse: avgSpan(mine, (r) => r.firstResponseAt),
                resolution: avgSpan(mine.filter((c) => c.closedAt), (r) => r.closedAt),
              }
            }).concat({
              key: '__sem__',
              label: 'Sem responsável',
              color: C.faint,
              total: conversations.filter((c) => !c.assignedTo).length,
              closed: conversations.filter((c) => !c.assignedTo && c.closedAt).length,
              firstResponse: avgSpan(conversations.filter((c) => !c.assignedTo), (r) => r.firstResponseAt),
              resolution: null,
            })}
            fmtDuration={fmtDuration}
          />
        )}

        {!loading && tab === 'setores' && (
          <Breakdown
            title="Conversas por setor"
            rows={sectors.map((s) => {
              const mine = conversations.filter((c) => c.sectorId === s.id)
              return {
                key: s.id,
                label: s.name,
                color: s.color,
                total: mine.length,
                closed: mine.filter((c) => c.closedAt).length,
                firstResponse: avgSpan(mine, (r) => r.firstResponseAt),
                resolution: avgSpan(mine.filter((c) => c.closedAt), (r) => r.closedAt),
              }
            })}
            fmtDuration={fmtDuration}
            empty="Nenhum setor cadastrado. Crie setores em Configurações › Setores."
          />
        )}

        {!loading && tab === 'etiquetas' && (
          <Breakdown
            title="Conversas por etiqueta"
            rows={tags.map((t) => {
              const mine = conversations.filter((c) => c.tagIds.includes(t.id))
              return {
                key: t.id,
                label: t.label,
                color: t.color,
                total: mine.length,
                closed: mine.filter((c) => c.closedAt).length,
                firstResponse: avgSpan(mine, (r) => r.firstResponseAt),
                resolution: avgSpan(mine.filter((c) => c.closedAt), (r) => r.closedAt),
              }
            })}
            fmtDuration={fmtDuration}
            empty="Nenhuma etiqueta cadastrada. Crie etiquetas em Configurações › Etiquetas."
          />
        )}
      </div>
    </div>
  )
}

function Kpi({ icon, color, label, hint, value }: {
  icon: string
  color: string
  label: string
  hint: string
  value: string
}) {
  return (
    <div style={{ ...sx.card, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color, fontSize: 12.5, fontWeight: 700 }}>
        <MaterialIcon name={icon} size={18} /> {label}
      </div>
      <div style={{ fontSize: 11.5, color: C.faint, marginTop: 4 }}>{hint}</div>
      <div style={{ fontSize: 27, fontWeight: 800, color: C.ink, marginTop: 12 }}>{value}</div>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ ...sx.card, padding: 30, textAlign: 'center', color: C.faint, fontSize: 13, marginTop: 18, lineHeight: 1.6 }}>
      {children}
    </div>
  )
}

interface BreakdownRow {
  key: string
  label: string
  color: string
  total: number
  closed: number
  firstResponse: number | null
  resolution: number | null
}

function Breakdown({ title, rows, fmtDuration, empty }: {
  title: string
  rows: BreakdownRow[]
  fmtDuration: (ms: number | null) => string
  empty?: string
}) {
  const cols = '1.6fr 90px 110px 1fr 1fr'
  return (
    <div style={{ ...sx.card, borderRadius: 20, overflow: 'hidden' }}>
      <div style={{ padding: '18px 22px', borderBottom: '1px solid ' + C.lineSoft, fontSize: 15, fontWeight: 700, color: C.ink }}>
        {title}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 14, padding: '12px 22px', fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: '.04em', borderBottom: '1px solid #f0eef5' }}>
        <span>NOME</span><span>CONVERSAS</span><span>FINALIZADAS</span><span>1ª RESPOSTA</span><span>ATÉ FINALIZAR</span>
      </div>
      {rows.filter((r) => r.total > 0).map((r) => (
        <div key={r.key} style={{ display: 'grid', gridTemplateColumns: cols, gap: 14, padding: '14px 22px', alignItems: 'center', borderBottom: '1px solid #f4f2f8' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5, color: C.ink, fontWeight: 600 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: r.color, flexShrink: 0 }} />
            {r.label}
          </span>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{r.total}</span>
          <span style={{ fontSize: 13.5, color: C.sub }}>{r.closed}</span>
          <span style={{ fontSize: 13, color: C.sub }}>{fmtDuration(r.firstResponse)}</span>
          <span style={{ fontSize: 13, color: C.sub }}>{fmtDuration(r.resolution)}</span>
        </div>
      ))}
      {rows.every((r) => r.total === 0) && (
        <div style={{ textAlign: 'center', padding: 34, color: C.faint, fontSize: 13 }}>
          {empty ?? 'Nada registrado neste período.'}
        </div>
      )}
    </div>
  )
}

/**
 * Aba "Agora": estado vivo da fila. Sai dos CONTATOS, e não do histórico — é o mapa
 * `conv` do contato que carrega o status corrente, e assim a fila não depende de a
 * consulta por período alcançar conversas abertas há muito tempo.
 */
function NowPanel({ contacts }: { contacts: ReturnType<typeof useContacts>['docs'] }) {
  const live = contacts.filter((c) => c.conv && c.conv.status !== 'finalizado')
  const naFila = live.filter((c) => !convOf(c).assignedTo)
  const emAtendimento = live.filter((c) => convOf(c).assignedTo && convOf(c).status === 'entrada')
  const esperando = live.filter((c) => convOf(c).status === 'esperando')

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 18 }}>
        <Kpi icon="pending" color={C.rose} label="Na fila" hint="Sem responsável definido" value={String(naFila.length)} />
        <Kpi icon="support_agent" color={C.green} label="Em atendimento" hint="Com atendente responsável" value={String(emAtendimento.length)} />
        <Kpi icon="hourglass_top" color={C.amber} label="Esperando" hint="Aguardando retorno do cliente" value={String(esperando.length)} />
      </div>

      <div style={{ ...sx.card, borderRadius: 20, overflow: 'hidden' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid ' + C.lineSoft, fontSize: 15, fontWeight: 700, color: C.ink }}>
          Conversas abertas agora
        </div>
        {live.map((c) => {
          const conv = convOf(c)
          return (
            <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 130px', gap: 14, padding: '13px 22px', alignItems: 'center', borderBottom: '1px solid #f4f2f8' }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>{c.name}</span>
              <span style={{ fontSize: 12.5, color: conv.assignedName ? C.sub : C.rose }}>
                {conv.assignedName || 'sem responsável'}
              </span>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: conv.status === 'esperando' ? C.amber : C.green, textAlign: 'center', background: conv.status === 'esperando' ? 'rgba(216,169,96,0.18)' : 'rgba(95,201,166,0.16)', borderRadius: 20, padding: '4px 11px' }}>
                {conv.status === 'esperando' ? 'Esperando' : 'Entrada'}
              </span>
            </div>
          )
        })}
        {live.length === 0 && (
          <div style={{ textAlign: 'center', padding: 34, color: C.faint, fontSize: 13 }}>
            Nenhuma conversa aberta no momento.
          </div>
        )}
      </div>
    </>
  )
}
