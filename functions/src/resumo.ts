/**
 * O RESUMO DIÁRIO, sem Firebase.
 *
 * Este arquivo não importa nada — nem firebase-admin, nem firebase-functions, nem o Gemini.
 * É de propósito: aqui moram as duas coisas que mais erram calado (conta de fuso e escolha
 * do que pode sair por WhatsApp), e as duas se testam no Node, sem emulador nem chave de
 * API. `assistente.ts` fica com o que fala com o mundo.
 */

/** Fuso padrão quando o ambiente não configurou horário de atendimento. */
export const TZ_PADRAO = 'America/Sao_Paulo'

/**
 * Janela em que um horário ainda vale para o dia.
 *
 * A função roda de 15 em 15 minutos, então sem janela um resumo marcado para 07:00 só
 * sairia se um tick caísse exatamente em 07:00. Com 30 minutos ela tolera atraso de fila e
 * deploy — e, ao mesmo tempo, impede que um deploy às 11h dispare o resumo das 7h como se
 * fosse novo. A trava contra repetição é outra: o id determinístico do doc na fila.
 */
const JANELA_MIN = 30

/** Teto de itens por bloco. WhatsApp não é relatório: lista longa ninguém lê. */
const MAX_ITENS = 8

// ---------------------------------------------------------------------------
// Tempo no fuso do ambiente (funções puras — é aqui que mora o erro de fuso)
// ---------------------------------------------------------------------------

export interface AgoraNoFuso {
  /** 'YYYY-MM-DD' no fuso do ambiente. */
  dateKey: string
  /** Minutos desde a meia-noite, no fuso do ambiente. */
  minutos: number
}

/**
 * Que horas são no ambiente do cliente.
 *
 * O servidor roda em UTC e não sabe onde o cliente está. Usar o relógio da máquina mandaria
 * o "bom dia" às quatro da manhã — o tipo de erro que ninguém reporta, só desinstala.
 */
export function agoraNoFuso(now: Date, timezone?: string): AgoraNoFuso {
  const tz = timezone || TZ_PADRAO
  let partes: Intl.DateTimeFormatPart[]
  try {
    partes = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(now)
  } catch {
    // Fuso inválido gravado no perfil não pode derrubar o resumo de todo mundo: a função
    // agendada processa os ambientes em sequência, e um throw aqui pararia a rodada.
    partes = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ_PADRAO,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(now)
  }
  const p = (tipo: string) => partes.find((x) => x.type === tipo)?.value ?? '00'
  // 'hour' com hour12:false devolve 24 à meia-noite em alguns ambientes — normalizar.
  const hora = Number(p('hour')) % 24
  return {
    dateKey: `${p('year')}-${p('month')}-${p('day')}`,
    minutos: hora * 60 + Number(p('minute')),
  }
}

/** 'HH:MM' → minutos desde a meia-noite. Devolve null para entrada inválida. */
export function hhmmParaMinutos(v: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v ?? '').trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

/**
 * Já passou da hora, e ainda estamos dentro da janela?
 *
 * A volta pela meia-noite é tratada: um resumo marcado para 23:50 tem janela até 00:20 do
 * dia seguinte, e comparar cru diria que 00:05 é "antes" de 23:50.
 */
export function dentroDaJanela(sendAt: string, agoraMin: number): boolean {
  const alvo = hhmmParaMinutos(sendAt)
  if (alvo === null) return false
  const delta = (agoraMin - alvo + 1440) % 1440
  return delta < JANELA_MIN
}

// ---------------------------------------------------------------------------
// Os dados do resumo (formas simples — a montagem do texto é pura sobre elas)
// ---------------------------------------------------------------------------

export interface ItemAgenda { time: string; title: string }
export interface ItemTarefa { title: string; atrasadaDias: number }
export interface ItemFatura { num: string; client: string; value: number; diasVencida: number }
export interface ItemConversa { name: string; lastMessage: string }

export interface DadosResumo {
  agenda: ItemAgenda[]
  tarefasHoje: ItemTarefa[]
  tarefasAtrasadas: ItemTarefa[]
  faturasVencidas: ItemFatura[]
  faturasAVencer: ItemFatura[]
  conversas: ItemConversa[]
}

export interface BlocosResumo {
  agenda: boolean
  tarefas: boolean
  faturas: boolean
  conversas: boolean
}

/** Papéis que enxergam faturamento — espelha `podeGerir` em firestore.rules. */
export type Papel = 'dono' | 'gestor' | 'atendente'

/**
 * Os blocos que este DESTINATÁRIO pode receber.
 *
 * A regra que importa deste arquivo inteiro. As Cloud Functions usam Admin SDK, que IGNORA
 * as security rules por completo: a consulta de faturamento aqui funciona para qualquer
 * ambiente, sempre. Quem decide o que sai é este gate, e não o que a consulta conseguiu ler.
 *
 * Dentro do CRM, um erro desses vira lista vazia e um erro no console. No WhatsApp não
 * existe esse aviso: a mensagem sai e chega no celular de alguém, e não volta.
 */
export function blocosPermitidos(blocks: BlocosResumo, papel: Papel): BlocosResumo {
  if (papel === 'dono' || papel === 'gestor') return blocks
  return { ...blocks, faturas: false }
}

// ---------------------------------------------------------------------------
// Montagem do texto (pura — testável sem Firestore e sem Gemini)
// ---------------------------------------------------------------------------

/**
 * Os rótulos do resumo, nos três idiomas.
 *
 * Vive aqui, e não no idioma.ts, porque este arquivo é PURO de propósito — ele
 * é testado sem Firebase e sem Gemini, e é essa pureza que permite ter teste
 * para uma mensagem que, no WhatsApp, não volta atrás.
 */
const R = {
  pt: {
    agenda: '📅 *AGENDA DE HOJE*', tarefas: '✅ *TAREFAS*', faturas: '💰 *FATURAS*',
    conversas: '💬 *CONVERSAS SEM RESPOSTA*',
    atrasada: ['atrasada', 'atrasadas'], paraHoje: 'para hoje',
    dia: ['dia', 'dias'], atrasadaHa: 'atrasada há', vencida: ['vencida', 'vencidas'],
    venceuHa: 'venceu há', venceEm: 'vence em', eMais: '…e mais',
    vazio: 'Nada pendente para hoje. Bom dia livre! 🙂',
    rodape: '_Responda aqui para perguntar qualquer coisa sobre esses dados._\n_Responda SAIR para parar de receber._',
  },
  es: {
    agenda: '📅 *AGENDA DE HOY*', tarefas: '✅ *TAREAS*', faturas: '💰 *FACTURAS*',
    conversas: '💬 *CONVERSACIONES SIN RESPUESTA*',
    atrasada: ['atrasada', 'atrasadas'], paraHoje: 'para hoy',
    dia: ['día', 'días'], atrasadaHa: 'atrasada hace', vencida: ['vencida', 'vencidas'],
    venceuHa: 'venció hace', venceEm: 'vence en', eMais: '…y {n} más',
    vazio: '¡Nada pendiente para hoy. Buen día libre! 🙂',
    rodape: '_Responde aquí para preguntar cualquier cosa sobre estos datos._\n_Responde SALIR para dejar de recibirlo._',
  },
  en: {
    agenda: '📅 *TODAY\'S CALENDAR*', tarefas: '✅ *TASKS*', faturas: '💰 *INVOICES*',
    conversas: '💬 *UNANSWERED CONVERSATIONS*',
    atrasada: ['overdue', 'overdue'], paraHoje: 'due today',
    dia: ['day', 'days'], atrasadaHa: 'overdue by', vencida: ['overdue', 'overdue'],
    venceuHa: 'due', venceEm: 'due in', eMais: '…and {n} more',
    vazio: 'Nothing pending today. Enjoy the clear day! 🙂',
    rodape: '_Reply here to ask anything about this data._\n_Reply STOP to stop receiving it._',
  },
} as const

export type IdiomaResumo = keyof typeof R

/**
 * A moeda é REAL em qualquer idioma — o valor é do negócio, não de quem lê. O
 * que muda é só o separador.
 *
 * O "R$" é prefixado à mão, e não por `style: 'currency'`, porque o Intl decide
 * o SÍMBOLO pelo idioma: em espanhol ele devolvia "4200,00 BRL" e em inglês
 * poria o símbolo colado à esquerda. Mesma escolha do fmtBRL do cliente.
 */
function moeda(v: number, idioma: IdiomaResumo): string {
  const tag = idioma === 'pt' ? 'pt-BR' : idioma
  return 'R$ ' + v.toLocaleString(tag, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Corta a lista no teto e devolve o rodapé "e mais N" quando sobra coisa. */
function comTeto<T>(itens: T[], render: (t: T) => string, idioma: IdiomaResumo): string[] {
  const linhas = itens.slice(0, MAX_ITENS).map(render)
  const resto = itens.length - MAX_ITENS
  if (resto > 0) {
    const molde = R[idioma].eMais
    linhas.push('  ' + (molde.includes('{n}') ? molde.replace('{n}', String(resto)) : `${molde} ${resto}`))
  }
  return linhas
}

function plural(n: number, formas: readonly [string, string] | readonly string[]): string {
  return `${n} ${n === 1 ? formas[0] : formas[1]}`
}

/**
 * O corpo do resumo, montado por TEMPLATE — nunca pelo modelo.
 *
 * Os números vêm daqui porque mensagem de WhatsApp não volta: um valor de fatura alucinado
 * ou um horário invertido chega ao cliente sem ninguém no meio, diferente do chat da tela,
 * onde a pessoa lê e desconta. Ao modelo cabe só a saudação (ver `saudacao`).
 */
export function montarResumo(
  dados: DadosResumo,
  blocks: BlocosResumo,
  // Padrão 'pt' para o chamador antigo (e a suíte) não precisar mudar de assinatura.
  idioma: IdiomaResumo = 'pt',
): string {
  const r = R[idioma]
  const partes: string[] = []

  if (blocks.agenda && dados.agenda.length) {
    partes.push(
      `${r.agenda} (${dados.agenda.length})`,
      ...comTeto(dados.agenda, (e) => `  ${e.time || '--:--'} · ${e.title}`, idioma),
    )
  }

  if (blocks.tarefas && (dados.tarefasAtrasadas.length || dados.tarefasHoje.length)) {
    const resumo = [
      dados.tarefasAtrasadas.length ? plural(dados.tarefasAtrasadas.length, r.atrasada) : '',
      dados.tarefasHoje.length ? `${dados.tarefasHoje.length} ${r.paraHoje}` : '',
    ].filter(Boolean).join(' · ')
    partes.push(
      `${r.tarefas} · ${resumo}`,
      ...comTeto(dados.tarefasAtrasadas, (t) => `  ${t.title} (${r.atrasadaHa} ${plural(t.atrasadaDias, r.dia)})`, idioma),
      ...comTeto(dados.tarefasHoje, (t) => `  ${t.title}`, idioma),
    )
  }

  if (blocks.faturas && (dados.faturasVencidas.length || dados.faturasAVencer.length)) {
    const total = dados.faturasVencidas.reduce((s, f) => s + f.value, 0)
    const cabecalho = dados.faturasVencidas.length
      ? `${r.faturas} · ${plural(dados.faturasVencidas.length, r.vencida)} — ${moeda(total, idioma)}`
      : r.faturas
    partes.push(
      cabecalho,
      ...comTeto(dados.faturasVencidas, (f) => `  ${f.num} · ${f.client} · ${moeda(f.value, idioma)} · ${r.venceuHa} ${plural(f.diasVencida, r.dia)}`, idioma),
      ...comTeto(dados.faturasAVencer, (f) => `  ${f.num} · ${f.client} · ${moeda(f.value, idioma)} · ${r.venceEm} ${plural(-f.diasVencida, r.dia)}`, idioma),
    )
  }

  if (blocks.conversas && dados.conversas.length) {
    partes.push(
      `${r.conversas} (${dados.conversas.length})`,
      ...comTeto(dados.conversas, (c) => `  ${c.name} — "${c.lastMessage.slice(0, 60)}"`, idioma),
    )
  }

  // Dia vazio também é informação: sem isto, o silêncio pareceria falha do sistema.
  if (!partes.length) return r.vazio
  return partes.join('\n\n')
}

/**
 * O rodapé. O opt-out sai em TODA mensagem — é o que torna o envio diário legítimo.
 *
 * A PALAVRA muda de idioma, a lista de palavras ACEITAS só cresce: o daemon
 * continua atendendo SAIR e PARE para sempre (whatsapp-daemon/src/optOut.ts).
 * Quem recebeu "responda SAIR" há um ano não pode descobrir que a palavra
 * mudou justamente na hora de sair.
 */
export function rodape(idioma: IdiomaResumo = 'pt'): string {
  return R[idioma].rodape
}
