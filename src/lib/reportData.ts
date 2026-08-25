import type { Contact, ConversationRecord, Member, Sector, Tag } from '../types'
import { convOf } from '../hooks/useConversations'

/** Uma linha de recorte (atendente, setor ou etiqueta). */
export interface ReportRow {
  key: string
  label: string
  /** Cor da entidade — vira o ponto ao lado do rótulo, nunca a cor do texto. */
  color: string
  total: number
  closed: number
  firstResponseMs: number | null
  resolutionMs: number | null
}

export interface DayPoint {
  dateKey: string
  label: string
  total: number
}

export interface ReportModel {
  from: Date
  to: Date
  days: number
  kpis: {
    total: number
    open: number
    closed: number
    firstResponseMs: number | null
    resolutionMs: number | null
  }
  byDay: DayPoint[]
  byAgent: ReportRow[]
  bySector: ReportRow[]
  byTag: ReportRow[]
  live: { fila: number; atendimento: number; esperando: number }
}

/** Duração legível a partir de milissegundos. "—" quando não há amostra. */
export function fmtDuration(ms: number | null): string {
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
export function avgSpan(
  rows: ConversationRecord[],
  to: (r: ConversationRecord) => Date | undefined,
): number | null {
  const spans = rows.flatMap((r) => {
    const end = to(r)
    if (!end || !r.openedAt) return []
    const ms = end.getTime() - r.openedAt.getTime()
    return ms >= 0 ? [ms] : []
  })
  if (spans.length === 0) return null
  return spans.reduce((a, b) => a + b, 0) / spans.length
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function fmtDate(d: Date): string {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function rowFor(
  key: string,
  label: string,
  color: string,
  mine: ConversationRecord[],
): ReportRow {
  const closedRows = mine.filter((c) => c.closedAt)
  return {
    key,
    label,
    color,
    total: mine.length,
    closed: closedRows.length,
    firstResponseMs: avgSpan(mine, (r) => r.firstResponseAt),
    resolutionMs: avgSpan(closedRows, (r) => r.closedAt),
  }
}

/**
 * Série diária cobrindo TODO o período, inclusive os dias sem conversa.
 *
 * Preencher os buracos é o que mantém o eixo do tempo honesto: uma série que só
 * lista os dias movimentados espaça pontos desiguais e faz uma semana parada
 * parecer crescimento contínuo.
 */
function buildByDay(rows: ConversationRecord[], from: Date, to: Date): DayPoint[] {
  const counts = new Map<string, number>()
  rows.forEach((r) => {
    if (!r.openedAt) return
    const k = dayKey(r.openedAt)
    counts.set(k, (counts.get(k) ?? 0) + 1)
  })

  const out: DayPoint[] = []
  const cursor = new Date(from)
  cursor.setHours(0, 0, 0, 0)
  const end = new Date(to)
  end.setHours(0, 0, 0, 0)

  // Teto de segurança: período muito largo viraria um eixo ilegível e um laço enorme.
  for (let i = 0; cursor <= end && i < 400; i++) {
    const k = dayKey(cursor)
    out.push({
      dateKey: k,
      label: cursor.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      total: counts.get(k) ?? 0,
    })
    cursor.setDate(cursor.getDate() + 1)
  }
  return out
}

/**
 * Monta o relatório inteiro a partir dos dados brutos.
 *
 * Ponto único de verdade de propósito: a tela, o CSV e o PDF consomem este mesmo
 * modelo. Recalcular em cada lugar é como um número exportado passa a divergir do
 * que estava na tela — e aí o relatório inteiro perde credibilidade.
 */
export function buildReport(args: {
  conversations: ConversationRecord[]
  contacts: Contact[]
  members: Member[]
  sectors: Sector[]
  tags: Tag[]
  from: Date
  to: Date
  days: number
}): ReportModel {
  const { conversations, contacts, members, sectors, tags, from, to, days } = args

  const closed = conversations.filter((c) => c.closedAt)
  const open = conversations.filter((c) => !c.closedAt)

  const byAgent = members
    .map((m) => rowFor(m.id, m.name, '#7a52a0', conversations.filter((c) => c.assignedTo === m.id)))
    .concat(rowFor('__sem__', 'Sem responsável', '#9c95a8', conversations.filter((c) => !c.assignedTo)))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total)

  const bySector = sectors
    .map((s) => rowFor(s.id, s.name, s.color, conversations.filter((c) => c.sectorId === s.id)))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total)

  const byTag = tags
    .map((t) => rowFor(t.id, t.label, t.color, conversations.filter((c) => c.tagIds.includes(t.id))))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total)

  const liveContacts = contacts.filter((c) => c.conv && c.conv.status !== 'finalizado')

  return {
    from,
    to,
    days,
    kpis: {
      total: conversations.length,
      open: open.length,
      closed: closed.length,
      firstResponseMs: avgSpan(conversations, (r) => r.firstResponseAt),
      resolutionMs: avgSpan(closed, (r) => r.closedAt),
    },
    byDay: buildByDay(conversations, from, to),
    byAgent,
    bySector,
    byTag,
    live: {
      fila: liveContacts.filter((c) => !convOf(c).assignedTo).length,
      atendimento: liveContacts.filter((c) => convOf(c).assignedTo && convOf(c).status === 'entrada').length,
      esperando: liveContacts.filter((c) => convOf(c).status === 'esperando').length,
    },
  }
}
