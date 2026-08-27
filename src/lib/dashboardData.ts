import type { Contact, ConversationRecord, Deal, Invoice } from '../types'

/**
 * Cálculo dos gráficos do painel — funções PURAS, sem React.
 *
 * Mesmo papel que lib/reportData.ts cumpre para os Relatórios: o que erra num gráfico
 * quase sempre é conta de data, e conta de data se testa no Node, não olhando a tela.
 */

/** Uma etapa da jornada. `conv` = conversão vinda da etapa anterior (null na primeira). */
export interface JourneyStage {
  id: 'contatos' | 'conversas' | 'negocios' | 'pagas'
  label: string
  hint: string
  count: number
  conv: number | null
}

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

/**
 * A jornada de ponta a ponta: contato → conversa → negócio → nota paga.
 *
 * Cada etapa é recortada pela SUA data: contato por createdAt, conversa por openedAt,
 * negócio por createdAt e nota pela BAIXA (paidAt) — dinheiro que entrou, não que foi
 * emitido.
 *
 * Registro sem data fica de fora. Não é escolha do gráfico: `useContacts` já ordena por
 * createdAt e o Firestore OMITE da consulta todo doc sem o campo do orderBy, então esse
 * contato já não aparece no CRM.
 */
export function buildJourney(input: {
  contacts: Contact[]
  conversations: ConversationRecord[]
  deals: Deal[]
  invoices: Invoice[]
  from: Date
  to: Date
}): JourneyStage[] {
  const { contacts, conversations, deals, invoices, from, to } = input

  const nContatos = contacts.filter((c) => dentro(c.createdAt, from, to)).length
  const nConversas = conversations.filter((c) => dentro(c.openedAt, from, to)).length
  const nNegocios = deals.filter((d) => dentro(d.createdAt, from, to)).length
  const nPagas = invoices.filter((iv) => dentro(iv.paidAt, from, to)).length

  return [
    { id: 'contatos', label: 'Contatos', hint: 'cadastrados no período', count: nContatos, conv: null },
    { id: 'conversas', label: 'Conversas', hint: 'atendimentos abertos', count: nConversas, conv: conversao(nConversas, nContatos) },
    { id: 'negocios', label: 'Negócios', hint: 'criados no pipeline', count: nNegocios, conv: conversao(nNegocios, nConversas) },
    { id: 'pagas', label: 'Notas pagas', hint: 'com baixa no período', count: nPagas, conv: conversao(nPagas, nNegocios) },
  ]
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
