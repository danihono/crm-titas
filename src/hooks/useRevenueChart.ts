import { MESES_CURTO } from '../lib/format'
import { invoiceStatus } from './useInvoices'
import type { Invoice } from '../types'

export interface RevChart {
  line: string
  area: string
  lastX: number
  lastY: number
  /** Rótulos dos 12 meses da série, do mais antigo ao mês atual. */
  months: string[]
  /** Soma recebida nos 12 meses. */
  total: number
  /** Variação do mês atual sobre o anterior, em %. null quando não há base de comparação. */
  changePct: number | null
  /** false quando não há nenhuma nota paga — a tela mostra o vazio em vez de uma linha reta. */
  hasData: boolean
}

const W = 560
const H = 150
const PAD = 14

/**
 * Série real de receita: soma das notas PAGAS nos últimos 12 meses (mês do
 * vencimento, que é a data mais próxima do recebimento que o modelo guarda).
 *
 * A escala parte do zero de propósito. Ancorar no menor valor da série, como
 * fazia a versão mockada, empola variações mínimas e faz R$ 100 parecer um pico.
 */
export function revenueChart(invoices: Invoice[], now = new Date()): RevChart {
  const buckets = new Array<number>(12).fill(0)
  const months: string[] = []

  // Índice 11 = mês atual; 0 = onze meses atrás.
  const baseYear = now.getFullYear()
  const baseMonth = now.getMonth()
  const keyOf = (y: number, m: number) => y * 12 + m
  const firstKey = keyOf(baseYear, baseMonth) - 11

  for (let i = 0; i < 12; i++) {
    months.push(MESES_CURTO[(firstKey + i) % 12])
  }

  for (const iv of invoices) {
    if (invoiceStatus(iv, now) !== 'Paga') continue
    const idx = keyOf(iv.dueAt.getFullYear(), iv.dueAt.getMonth()) - firstKey
    if (idx >= 0 && idx < 12) buckets[idx] += iv.value
  }

  const total = buckets.reduce((s, v) => s + v, 0)
  // O teto nunca é zero: sem isso a divisão abaixo vira NaN e o path some.
  const max = Math.max(...buckets, 1)

  const pts = buckets.map((v, i) => {
    const x = (i / 11) * W
    const y = H - (v / max) * (H - PAD * 2) - PAD
    return [x, y] as const
  })

  const line = 'M' + pts.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L ')
  const prev = buckets[10]
  const last = buckets[11]

  return {
    line,
    area: line + ` L ${W} ${H} L 0 ${H} Z`,
    lastX: pts[11][0],
    lastY: pts[11][1],
    months,
    total,
    changePct: prev > 0 ? ((last - prev) / prev) * 100 : null,
    hasData: total > 0,
  }
}
