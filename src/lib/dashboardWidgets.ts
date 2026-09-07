import type { Accent, DashboardLayout, DashboardWidget } from '../types'

/**
 * O catálogo do painel: que blocos existem, quanto ocupam e de que dado vivem.
 *
 * A grade é EXPLÍCITA — 6 colunas × 3 faixas, 18 células — e é isso que mantém a
 * promessa de caber numa tela só. Com linhas implícitas (`grid-auto-rows`) as
 * trilhas passariam a ser dimensionadas pelo conteúdo, os cards perderiam altura
 * definida e o "rola por dentro do card" deixaria de valer em silêncio: nenhum
 * erro, só o painel virando uma página comprida. Aqui o teto é aritmético.
 */
export const COLUNAS = 6
export const FAIXAS = 3
export const CELULAS = COLUNAS * FAIXAS

/** De onde o widget tira o dado. Decide quais consultas o painel liga. */
export type Fonte =
  | 'negocios'    // useAllDeals   — a Topbar já assina, de graça
  | 'quadros'     // useBoards
  | 'atividades'  // useActivities — de graça
  | 'tipos'       // useActTypes
  | 'notas'       // useInvoices   — de graça
  | 'contatos'    // useContacts   — de graça
  | 'eventos'     // useEvents(ano,mês)     — consulta parametrizada
  | 'conversas'   // useConversations(de,até) — parametrizada, a mais cara
  | 'equipe'      // useMembers + useSectors + useTags

export interface WidgetDef {
  type: string
  nome: string
  descricao: string
  icone: string
  /** Abaixo disto o gráfico não cabe — medido, não chutado (ver o plano). */
  minCols: number
  minRows: number
  /** Tamanho com que entra no painel. */
  cols: number
  rows: number
  /** Aceita a variante escura em destaque e a troca de acento. */
  colorivel: boolean
  fontes: Fonte[]
  /** Alguns fazem sentido uma vez só (a saudação não, o funil sim). */
  unico?: boolean
}

export const CATALOGO: WidgetDef[] = [
  // ── Pipeline ────────────────────────────────────────────────────────────
  { type: 'pipeline', nome: 'Pipeline ativo', descricao: 'Soma dos negócios abertos, com o pipeline novo por semana.', icone: 'payments', minCols: 1, minRows: 1, cols: 1, rows: 1, colorivel: true, fontes: ['negocios'], unico: true },
  { type: 'negocios', nome: 'Negócios ativos', descricao: 'Quantos negócios estão abertos, e quantos nascem por semana.', icone: 'handshake', minCols: 1, minRows: 1, cols: 1, rows: 1, colorivel: true, fontes: ['negocios'], unico: true },
  { type: 'ticket', nome: 'Ticket médio', descricao: 'Valor médio por negócio aberto. Sem série: o valor do negócio não é versionado.', icone: 'request_quote', minCols: 1, minRows: 1, cols: 1, rows: 1, colorivel: true, fontes: ['negocios'], unico: true },
  { type: 'novosLeads', nome: 'Novos leads', descricao: 'Leads parados na etapa de entrada, e quantos entraram por semana.', icone: 'person_add', minCols: 1, minRows: 1, cols: 1, rows: 1, colorivel: true, fontes: ['negocios', 'quadros'], unico: true },
  { type: 'funil', nome: 'Funil de Leads', descricao: 'Os leads do período seguidos etapa a etapa, com conversão e tempo.', icone: 'filter_alt', minCols: 2, minRows: 2, cols: 2, rows: 2, colorivel: false, fontes: ['negocios', 'quadros'], unico: true },
  { type: 'origem', nome: 'Origem dos leads', descricao: 'De onde vieram os leads, por etiqueta.', icone: 'donut_small', minCols: 1, minRows: 1, cols: 2, rows: 1, colorivel: false, fontes: ['negocios'], unico: true },

  // ── Dia a dia ───────────────────────────────────────────────────────────
  { type: 'agendaHoje', nome: 'Agenda hoje', descricao: 'O próximo compromisso de hoje.', icone: 'event', minCols: 1, minRows: 1, cols: 1, rows: 1, colorivel: true, fontes: ['eventos'], unico: true },
  { type: 'tarefasHoje', nome: 'Tarefas hoje', descricao: 'Quantas tarefas vencem hoje, e qual é a próxima.', icone: 'task_alt', minCols: 1, minRows: 1, cols: 1, rows: 1, colorivel: true, fontes: ['atividades'], unico: true },
  { type: 'atividade', nome: 'Atividade recente', descricao: 'As últimas atividades registradas.', icone: 'history', minCols: 1, minRows: 1, cols: 2, rows: 1, colorivel: false, fontes: ['atividades', 'tipos'], unico: true },
  { type: 'proximasTarefas', nome: 'Próximas tarefas', descricao: 'A lista do que vence, com link para a conversa do cliente.', icone: 'checklist', minCols: 1, minRows: 1, cols: 2, rows: 1, colorivel: false, fontes: ['atividades', 'tipos'], unico: true },
  { type: 'proximosCompromissos', nome: 'Próximos compromissos', descricao: 'Os compromissos da agenda daqui para a frente.', icone: 'calendar_month', minCols: 1, minRows: 1, cols: 2, rows: 1, colorivel: false, fontes: ['eventos'], unico: true },

  // ── Conversas ───────────────────────────────────────────────────────────
  { type: 'calor', nome: 'Quando o cliente procura', descricao: 'Mapa de calor das conversas por dia da semana e hora.', icone: 'grid_on', minCols: 2, minRows: 1, cols: 2, rows: 2, colorivel: false, fontes: ['conversas'], unico: true },
  { type: 'conversasDia', nome: 'Conversas por dia', descricao: 'Quantas conversas abriram a cada dia do período.', icone: 'show_chart', minCols: 2, minRows: 1, cols: 3, rows: 1, colorivel: false, fontes: ['conversas'], unico: true },
  { type: 'filaAgora', nome: 'Fila agora', descricao: 'Como as conversas abertas estão divididas neste momento.', icone: 'inbox', minCols: 2, minRows: 1, cols: 2, rows: 1, colorivel: false, fontes: ['contatos'], unico: true },
  { type: 'rankAtendentes', nome: 'Por atendente', descricao: 'Ranking de conversas por atendente no período.', icone: 'groups', minCols: 2, minRows: 1, cols: 2, rows: 1, colorivel: false, fontes: ['conversas', 'equipe'], unico: true },
  { type: 'rankSetores', nome: 'Por setor', descricao: 'Ranking de conversas por setor no período.', icone: 'account_tree', minCols: 2, minRows: 1, cols: 2, rows: 1, colorivel: false, fontes: ['conversas', 'equipe'], unico: true },
  { type: 'rankEtiquetas', nome: 'Por etiqueta', descricao: 'Ranking de conversas por etiqueta no período.', icone: 'sell', minCols: 2, minRows: 1, cols: 2, rows: 1, colorivel: false, fontes: ['conversas', 'equipe'], unico: true },

  // ── Faturamento (fora do padrão, mas disponível a quem quiser) ──────────
  { type: 'aReceber', nome: 'A receber', descricao: 'Saldo em aberto e ainda no prazo, semana a semana.', icone: 'hourglass_top', minCols: 1, minRows: 1, cols: 1, rows: 1, colorivel: true, fontes: ['notas'], unico: true },
  { type: 'notasVencidas', nome: 'Notas vencidas', descricao: 'Quantas notas passaram do vencimento sem pagamento.', icone: 'error', minCols: 1, minRows: 1, cols: 1, rows: 1, colorivel: true, fontes: ['notas'], unico: true },
  { type: 'receita', nome: 'Receita recebida', descricao: 'Notas pagas nos últimos 12 meses.', icone: 'trending_up', minCols: 2, minRows: 1, cols: 3, rows: 1, colorivel: false, fontes: ['notas'], unico: true },
]

const PORTIPO = new Map(CATALOGO.map((d) => [d.type, d]))

export function widgetDef(type: string): WidgetDef | undefined {
  return PORTIPO.get(type)
}

/** O painel de fábrica — é a tela que existia antes de tudo virar configurável. */
export function layoutPadrao(): DashboardLayout {
  const w = (type: string, extra?: Partial<DashboardWidget>): DashboardWidget => {
    const d = PORTIPO.get(type)!
    return { id: type, type, cols: d.cols, rows: d.rows, ...extra }
  }
  return {
    widgets: [
      w('pipeline', { variant: 'featured', accent: 'green' }),
      w('negocios', { accent: 'purple' }),
      w('ticket', { accent: 'amber' }),
      w('novosLeads', { accent: 'green' }),
      w('agendaHoje', { accent: 'blue' }),
      w('tarefasHoje', { accent: 'purple' }),
      w('funil'),
      w('calor'),
      w('origem'),
      w('atividade'),
    ],
  }
}

/* ── Grade ─────────────────────────────────────────────────────────────── */

export function celulasUsadas(widgets: DashboardWidget[]): number {
  return widgets.reduce((n, x) => n + x.cols * x.rows, 0)
}

export function celulasLivres(widgets: DashboardWidget[]): number {
  return CELULAS - celulasUsadas(widgets)
}

/**
 * Cabe? A conta é de ÁREA, não de posicionamento exato.
 *
 * O grid usa `grid-auto-flow: dense`, que preenche buraco deixado para trás — com
 * área suficiente o navegador acha lugar em praticamente todo caso real, e a
 * alternativa (simular o algoritmo de empacotamento do CSS aqui) erraria de um
 * jeito pior: recusaria arranjo que o navegador acomodaria bem.
 */
export function cabe(widgets: DashboardWidget[], novo: { cols: number; rows: number }): boolean {
  return celulasUsadas(widgets) + novo.cols * novo.rows <= CELULAS
}

/** Quais consultas o painel precisa ligar para este layout. */
export function fontesDoLayout(widgets: DashboardWidget[]): Set<Fonte> {
  const out = new Set<Fonte>()
  for (const w of widgets) {
    for (const f of PORTIPO.get(w.type)?.fontes ?? []) out.add(f)
  }
  return out
}

/* ── Leitura defensiva ─────────────────────────────────────────────────── */

const ACENTOS: Accent[] = ['purple', 'green', 'amber', 'rose', 'blue']

function inteiro(v: unknown, min: number, max: number, padrao: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : padrao
  return Math.min(max, Math.max(min, n))
}

/**
 * Lê o layout gravado no Firestore, item a item, descartando o que não serve.
 *
 * Mesma cautela de `toFlowNodes` em lib/converters.ts, e pelo mesmo motivo: este
 * documento pode ter sido escrito por uma versão anterior do app, com um tipo de
 * widget que não existe mais ou com tamanho que hoje é inválido. Um item torto
 * não pode derrubar o painel inteiro — ele some, o resto fica.
 *
 * Devolve `null` quando não há nada aproveitável, e aí quem chama usa o padrão.
 */
export function layoutFromDoc(v: unknown): DashboardLayout | null {
  const d = (v ?? null) as { widgets?: unknown } | null
  if (!d || !Array.isArray(d.widgets)) return null

  const vistos = new Set<string>()
  const widgets = d.widgets.flatMap((raw): DashboardWidget[] => {
    const x = (raw ?? {}) as Record<string, unknown>
    const type = typeof x.type === 'string' ? x.type : ''
    const def = PORTIPO.get(type)
    if (!def) return []

    // Tipo marcado como único não pode aparecer duas vezes — layout antigo com
    // duplicata renderizaria dois cards idênticos disputando a mesma conta.
    if (def.unico) {
      if (vistos.has(type)) return []
      vistos.add(type)
    }

    const id = typeof x.id === 'string' && x.id ? x.id : type
    const acento = ACENTOS.includes(x.accent as Accent) ? (x.accent as Accent) : undefined
    return [{
      id,
      type,
      cols: inteiro(x.cols, def.minCols, COLUNAS, def.cols),
      rows: inteiro(x.rows, def.minRows, FAIXAS, def.rows),
      variant: x.variant === 'featured' && def.colorivel ? 'featured' : 'surface',
      ...(acento ? { accent: acento } : {}),
    }]
  })

  if (widgets.length === 0) return null

  // Layout gravado quando a grade era maior (ou com tipos que cresceram) não
  // pode estourar a tela: corta no que cabe, na ordem em que a pessoa montou.
  const cabendo: DashboardWidget[] = []
  for (const w of widgets) {
    if (cabe(cabendo, w)) cabendo.push(w)
  }
  return cabendo.length ? { widgets: cabendo } : null
}
