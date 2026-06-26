// Helpers de formatação — valores em REAIS (inteiro) e datas amigáveis em PT-BR.
// Os rótulos "Hoje/Ontem/há 2h/Atrasada" são DERIVADOS aqui (não persistidos).

const MESES_CURTO = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const MESES_LONGO = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const DIAS_CURTO = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const brl = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })

/** '12.000' | '24.000,00' -> 12000 (número em reais). */
export function parseValueBR(s: string | number): number {
  if (typeof s === 'number') return s
  return parseFloat(String(s).replace(/\./g, '').replace(',', '.')) || 0
}

/** 12000 -> '12.000' (sem o "R$"). */
export function fmtMoney(v: number): string {
  return brl.format(v)
}

/** 12000 -> 'R$ 12.000'. */
export function fmtBRL(v: number): string {
  return 'R$ ' + brl.format(v)
}

/** Abreviação tipo legacy fmtK: 12000 -> '12k', 284500 -> '284,5k'. */
export function fmtK(v: number): string {
  if (v >= 1000) return (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1).replace('.', ',') + 'k'
  return String(v)
}

export function monthName(m: number): string {
  return MESES_LONGO[m]
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Date -> 'HH:MM'. */
export function timeHHMM(d: Date): string {
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes())
}

/** Date -> 'YYYY-MM-DD' (local). */
export function dateKeyOf(d: Date): string {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** Iniciais a partir do nome completo: "João Silva" -> "JS". */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase()
}

/** Rótulo curto para a lista de contatos (campo "time"): hora, "Ontem" ou dia da semana. */
export function chatTimeLabel(d: Date, now = new Date()): string {
  if (sameDay(d, now)) return timeHHMM(d)
  const y = new Date(now)
  y.setDate(now.getDate() - 1)
  if (sameDay(d, y)) return 'Ontem'
  const diff = (now.getTime() - d.getTime()) / 86400000
  if (diff < 7) return DIAS_CURTO[d.getDay()]
  return d.getDate() + ' ' + MESES_CURTO[d.getMonth()]
}

/** "há 2h" / "ontem" / "24 Jun" — para leads/feed. */
export function relativeLabel(d: Date, now = new Date()): string {
  const ms = now.getTime() - d.getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return 'há ' + min + 'min'
  const h = Math.floor(min / 60)
  if (h < 24) return 'há ' + h + 'h'
  const days = Math.floor(h / 24)
  if (days === 1) return 'ontem'
  if (days < 7) return 'há ' + days + 'd'
  return d.getDate() + ' ' + MESES_CURTO[d.getMonth()]
}

export interface DueInfo {
  text: string
  overdue: boolean
}

/** Rótulo de vencimento de atividade + flag de atraso (derivado de dueAt/done). */
export function dueInfo(dueAt: Date, done: boolean, now = new Date()): DueInfo {
  const overdue = !done && dueAt.getTime() < now.getTime() && !sameDay(dueAt, now)
  if (done) {
    return { text: dateLabel(dueAt, now), overdue: false }
  }
  if (overdue) {
    return { text: 'Atrasada · ' + dueAt.getDate() + ' ' + MESES_CURTO[dueAt.getMonth()], overdue: true }
  }
  if (sameDay(dueAt, now)) return { text: 'Hoje, ' + timeHHMM(dueAt), overdue: false }
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  if (sameDay(dueAt, tomorrow)) return { text: 'Amanhã, ' + timeHHMM(dueAt), overdue: false }
  return { text: dueAt.getDate() + ' ' + MESES_CURTO[dueAt.getMonth()] + ', ' + timeHHMM(dueAt), overdue: false }
}

/** 'Venc. 10 Jun' para faturamento. */
export function dueDateShort(d: Date): string {
  return 'Venc. ' + pad2(d.getDate()) + ' ' + MESES_CURTO[d.getMonth()]
}

function dateLabel(d: Date, now = new Date()): string {
  if (sameDay(d, now)) return 'Hoje, ' + timeHHMM(d)
  return d.getDate() + ' ' + MESES_CURTO[d.getMonth()] + ', ' + timeHHMM(d)
}

/** "Sexta, 26 de Junho" — cabeçalho do dia selecionado na agenda. */
export function longDayLabel(d: Date): string {
  return DIAS[d.getDay()] + ', ' + d.getDate() + ' de ' + MESES_LONGO[d.getMonth()]
}

/** Extensão do arquivo -> categoria usada no fileVM. */
export function extToType(name: string): 'pdf' | 'doc' | 'img' | 'xls' {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  if (ext === 'pdf') return 'pdf'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return 'img'
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'xls'
  return 'doc'
}

/** Tamanho legível: 180000 -> '180 KB', 2400000 -> '2,4 MB'. */
export function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1).replace('.', ',') + ' MB'
  if (bytes >= 1024) return Math.round(bytes / 1024) + ' KB'
  return bytes + ' B'
}

/** Saudação por horário. */
export function greeting(name: string, now = new Date()): string {
  const h = now.getHours()
  const part = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
  const first = name.trim().split(/\s+/)[0] || ''
  return `${part}, ${first} · ${DIAS_CURTO[now.getDay()]}, ${now.getDate()} ${MESES_CURTO[now.getMonth()]}`
}
