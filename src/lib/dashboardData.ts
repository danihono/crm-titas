import type { Column, ConversationRecord, Deal } from '../types'

/**
 * Cálculo dos gráficos do painel — funções PURAS, sem React.
 *
 * Mesmo papel que lib/reportData.ts cumpre para os Relatórios: o que erra num gráfico
 * quase sempre é conta de data, e conta de data se testa no Node, não olhando a tela.
 */

function dentro(d: Date | undefined, from: Date, to: Date): boolean {
  if (!d) return false
  const t = d.getTime()
  return t >= from.getTime() && t <= to.getTime()
}

/** Divisão que não estoura: etapa anterior zerada devolve null, não NaN nem Infinity. */
function conversao(atual: number, anterior: number | null): number | null {
  if (anterior === null) return null
  if (anterior <= 0) return null
  return (atual / anterior) * 100
}

/** Uma etapa do funil de leads. */
export interface FunnelStage {
  id: string
  label: string
  /** Leads da coorte que ALCANÇARAM esta etapa (não os que estão nela agora). */
  count: number
  /** Quantos pararam aqui, isto é, não chegaram à etapa seguinte. Null na última. */
  parou: number | null
  /** Conversão para a etapa seguinte, em %. Null na última. */
  conv: number | null
  /** Tempo médio até a etapa seguinte, em horas. Null quando falta par de datas. */
  horas: number | null
}

export interface LeadFunnel {
  stages: FunnelStage[]
  /** Leads da coorte que hoje estão numa etapa fora do funil (Perdido). */
  perdidos: number
  /** Tamanho da coorte — o topo do funil. */
  total: number
  /** % do topo que chegou à última etapa. Null quando o topo é zero. */
  fimAFim: number | null
}

/**
 * Até onde este lead chegou, como ÍNDICE da etapa mais avançada.
 *
 * Devolver o máximo (e não "alcançou a etapa X?" avulso) é o que garante a monotonia do
 * funil: um lead criado direto em "Qualificado" tem `reachedAt` só daquela etapa, e sem
 * isto ele apareceria na etapa 3 sem constar nas anteriores — um funil que engorda no meio.
 * Entrar pelo meio conta como ter passado pelo começo, que é a leitura honesta.
 */
function maxAlcancado(deal: Deal, etapas: Column[]): number {
  let max = -1
  etapas.forEach((c, i) => {
    if (deal.reachedAt?.[c.id]) max = Math.max(max, i)
  })
  // A coluna atual também conta: card antigo, de antes do reachedAt existir, só tem isto.
  const atual = etapas.findIndex((c) => c.id === deal.columnId)
  if (atual >= 0) max = Math.max(max, atual)
  // Sem pista nenhuma (card legado já em Perdido): existir é ter entrado no topo.
  return max < 0 ? 0 : max
}

/** Média em horas das transições que têm as DUAS datas. Sem par, devolve null. */
function horasMedias(deals: Deal[], de: Column, para: Column): number | null {
  let soma = 0
  let n = 0
  for (const d of deals) {
    const a = d.reachedAt?.[de.id]
    const b = d.reachedAt?.[para.id]
    if (!a || !b) continue
    const dt = b.getTime() - a.getTime()
    // Transição negativa (relógio do cliente, reprocesso) não vira média; some.
    if (dt < 0) continue
    soma += dt
    n++
  }
  return n ? soma / n / 3600000 : null
}

/**
 * O funil dos leads: uma COORTE seguida etapa a etapa.
 *
 * Coorte = os leads criados no período. Cada etapa conta quantos DESSES chegaram até ela —
 * por isso o funil só pode estreitar, ao contrário de somar módulos diferentes, onde uma
 * etapa passava da anterior e o desenho não fechava.
 *
 * `Perdido` não é degrau: perder não é avançar. O lead perdido continua contado nas etapas
 * por onde passou, e aparece à parte.
 */
export function buildLeadFunnel(input: {
  deals: Deal[]
  columns: Column[]
  from: Date
  to: Date
}): LeadFunnel {
  const { deals, from, to } = input
  const ordenadas = [...input.columns].sort((a, b) => a.order - b.order)
  const etapas = ordenadas.filter((c) => !c.outOfFunnel)
  const foraDoFunil = new Set(ordenadas.filter((c) => c.outOfFunnel).map((c) => c.id))

  const coorte = deals.filter((d) => dentro(d.createdAt, from, to))
  const alcance = coorte.map((d) => maxAlcancado(d, etapas))
  const chegaram = etapas.map((_, i) => alcance.filter((m) => m >= i).length)

  const stages: FunnelStage[] = etapas.map((c, i) => {
    const ultima = i === etapas.length - 1
    return {
      id: c.id,
      label: c.title,
      count: chegaram[i],
      parou: ultima ? null : chegaram[i] - chegaram[i + 1],
      conv: ultima ? null : conversao(chegaram[i + 1], chegaram[i]),
      horas: ultima ? null : horasMedias(coorte, c, etapas[i + 1]),
    }
  })

  const total = chegaram[0] ?? 0
  const fim = chegaram[chegaram.length - 1] ?? 0
  return {
    stages,
    perdidos: coorte.filter((d) => foraDoFunil.has(d.columnId)).length,
    total,
    fimAFim: conversao(fim, total),
  }
}

export interface Heatmap {
  /** [dia 0=domingo..6][hora 0..23] */
  grid: number[][]
  /** Maior valor da grade — a escala de cor. Nunca zero, para não dividir por zero. */
  peak: number
  total: number
  /** Dia e hora de maior movimento, ou null quando não há nada no período. */
  pico: { dia: number; hora: number; n: number } | null
}

export const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

/**
 * Quando as conversas chegam, em grade 7 dias × 24 horas.
 *
 * Usa a hora LOCAL do navegador de propósito: a pergunta é "a que horas o cliente procura a
 * gente", e quem lê a resposta está no fuso da operação.
 */
export function buildHeatmap(conversations: ConversationRecord[]): Heatmap {
  const grid: number[][] = Array.from({ length: 7 }, () => new Array<number>(24).fill(0))
  let total = 0
  let pico: Heatmap['pico'] = null

  for (const c of conversations) {
    const d = c.openedAt
    if (!d || Number.isNaN(d.getTime())) continue
    const dia = d.getDay()
    const hora = d.getHours()
    const n = ++grid[dia][hora]
    total++
    if (!pico || n > pico.n) pico = { dia, hora, n }
  }

  return { grid, peak: Math.max(1, pico?.n ?? 0), total, pico }
}
