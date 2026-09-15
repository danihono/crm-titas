// Helpers de formatação — valores em REAIS (inteiro) e datas amigáveis.
// Os rótulos "Hoje/Ontem/há 2h/Atrasada" são DERIVADOS aqui (não persistidos).
//
// O idioma entra por baixo: os nomes de mês e de dia vêm do `Intl`
// (src/i18n/formato.ts) e as palavras vêm do catálogo. As assinaturas ficaram
// iguais de propósito — são quarenta arquivos importando daqui, e trocar o
// idioma não podia virar um refactor de chamada em cada um deles.
//
// A MOEDA NÃO SEGUE O IDIOMA. O valor é do negócio, não de quem lê: o CRM
// fatura em reais mesmo com a tela em inglês. O que muda é só o separador —
// 'R$ 12.000' em pt/es, 'R$ 12,000' em inglês.
import { t } from '../i18n'
import {
  dataPorExtenso, diaAbrev, diaEMes, lerNumero, mesPorExtenso, num, num1, num1Fixo,
} from '../i18n/formato'

/** '12.000' | '24.000,00' -> 12000, no formato que o idioma ativo usa. */
export function parseValueBR(s: string | number): number {
  return lerNumero(s)
}

/** 12000 -> '12.000' (sem o "R$"). */
export function fmtMoney(v: number): string {
  return num(v)
}

/** 12000 -> 'R$ 12.000'. */
export function fmtBRL(v: number): string {
  return 'R$ ' + num(v)
}

/** Abreviação tipo legacy fmtK: 12000 -> '12k', 284500 -> '284,5k'. */
export function fmtK(v: number): string {
  if (v >= 1000) return num1(v / 1000) + 'k'
  return String(v)
}

export function monthName(m: number): string {
  return mesPorExtenso(m)
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

/**
 * Telefone brasileiro legível: '+5511998489772' -> '+55 11 99848-9772'.
 *
 * Contato criado pelo espelhamento do WhatsApp guarda o número cru, e ele acaba aparecendo
 * como se fosse nome. Formatos reconhecidos: com ou sem DDI 55, celular (9 dígitos) e fixo
 * (8). O que não casar volta como veio — melhor um número feio do que um número escondido.
 *
 * NÃO segue o idioma: formata o plano de numeração brasileiro, que é uma
 * propriedade do número, não de quem está lendo a tela.
 */
export function fmtPhoneBR(raw: string): string {
  const d = (raw || '').replace(/\D/g, '')
  const nat = d.startsWith('55') && (d.length === 12 || d.length === 13) ? d.slice(2) : d
  const ddi = nat === d ? '' : '+55 '
  if (nat.length === 11) return `${ddi}${nat.slice(0, 2)} ${nat.slice(2, 7)}-${nat.slice(7)}`
  if (nat.length === 10) return `${ddi}${nat.slice(0, 2)} ${nat.slice(2, 6)}-${nat.slice(6)}`
  return raw
}

/** É só um número, sem nome? (contato do WhatsApp que nunca foi nomeado) */
export function looksLikePhone(v: string): boolean {
  const t = (v || '').trim()
  return t.length > 0 && /^\+?[\d\s()-]+$/.test(t) && t.replace(/\D/g, '').length >= 8
}

/** Texto comparável para busca: sem acento, sem pontuação, minúsculo. */
export function searchable(v: string): string {
  return (v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
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
  if (sameDay(d, y)) return t('comum.ontem')
  const diff = (now.getTime() - d.getTime()) / 86400000
  if (diff < 7) return diaAbrev(d.getDay())
  return diaEMes(d)
}

/** "há 2h" / "ontem" / "24 Jun" — para leads/feed. */
export function relativeLabel(d: Date, now = new Date()): string {
  const ms = now.getTime() - d.getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return t('formato.agora')
  if (min < 60) return t('formato.haMin', { n: min })
  const h = Math.floor(min / 60)
  if (h < 24) return t('formato.haHoras', { n: h })
  const days = Math.floor(h / 24)
  if (days === 1) return t('formato.ontemMinusculo')
  if (days < 7) return t('formato.haDias', { n: days })
  return diaEMes(d)
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
    return { text: t('formato.atrasadaEm', { data: diaEMes(dueAt) }), overdue: true }
  }
  if (sameDay(dueAt, now)) return { text: t('formato.hojeAs', { hora: timeHHMM(dueAt) }), overdue: false }
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  if (sameDay(dueAt, tomorrow)) return { text: t('formato.amanhaAs', { hora: timeHHMM(dueAt) }), overdue: false }
  return { text: t('formato.dataAs', { data: diaEMes(dueAt), hora: timeHHMM(dueAt) }), overdue: false }
}

/** 'Venc. 10 Jun' para faturamento. */
export function dueDateShort(d: Date): string {
  return t('formato.vencimento', { data: diaEMes(d) })
}

function dateLabel(d: Date, now = new Date()): string {
  if (sameDay(d, now)) return t('formato.hojeAs', { hora: timeHHMM(d) })
  return t('formato.dataAs', { data: diaEMes(d), hora: timeHHMM(d) })
}

/** "Sexta, 26 de junho" — cabeçalho do dia selecionado na agenda. */
export function longDayLabel(d: Date): string {
  return dataPorExtenso(d)
}

/** Extensão do arquivo -> categoria usada no fileVM. */
export function extToType(name: string): 'pdf' | 'doc' | 'img' | 'xls' {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  if (ext === 'pdf') return 'pdf'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return 'img'
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'xls'
  return 'doc'
}

export type MidiaTipo = 'image' | 'video' | 'audio' | 'document' | 'sticker'

/**
 * O rótulo CANÔNICO de uma mídia — em português, sempre, em qualquer idioma.
 *
 * É o valor que o daemon grava na ingestão (whatsapp-daemon/src/messages.ts,
 * MEDIA_META) quando a mensagem chega sem legenda, e por isso ele é DADO, não
 * texto de tela. Serve para duas coisas, e só para essas duas:
 *
 *  1. GRAVAR, quando o CRM cria a mensagem sozinho (sem WhatsApp conectado);
 *  2. COMPARAR com o que está gravado, para saber se o `text` é só o marcador
 *     da mídia ou uma legenda de verdade.
 *
 * Traduzir isto seria um defeito silencioso: o histórico ficaria com marcadores
 * em três idiomas, misturados por quem estava com qual tela aberta, e a
 * comparação do item 2 passaria a falhar fora do português — a tela repetiria
 * "[imagem]" embaixo da própria imagem.
 */
const MIDIA_CANONICA: Record<MidiaTipo, string> = {
  image: '[imagem]',
  video: '[vídeo]',
  audio: '[áudio]',
  document: '[documento]',
  sticker: '[figurinha]',
}

export function placeholderMidia(type?: MidiaTipo): string {
  return type ? MIDIA_CANONICA[type] : ''
}

/** O `text` gravado é só o marcador da mídia, e não uma legenda? */
export function ehPlaceholderMidia(text: string): boolean {
  return Object.values(MIDIA_CANONICA).includes(text)
}

/**
 * Rótulo de uma mídia PARA MOSTRAR — este sim segue o idioma. É o que aparece
 * no preview da lista de conversas e no lugar do nome de um arquivo sem nome.
 * Nunca vai para o Firestore: para gravar, use `placeholderMidia`.
 */
export function mediaLabel(type?: MidiaTipo): string {
  if (type === 'image') return t('formato.midiaImagem')
  if (type === 'video') return t('formato.midiaVideo')
  if (type === 'audio') return t('formato.midiaAudio')
  if (type === 'document') return t('formato.midiaDocumento')
  if (type === 'sticker') return t('formato.midiaFigurinha')
  return ''
}

/** Tamanho legível: 180000 -> '180 KB', 2400000 -> '2,4 MB'. */
export function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return num1(bytes / (1024 * 1024)) + ' MB'
  if (bytes >= 1024) return Math.round(bytes / 1024) + ' KB'
  return bytes + ' B'
}

/** Saudação por horário. */
/** Como a variação deve ser lida: subiu, caiu, ou não mudou. */
export interface Variacao {
  /** '▲' · '▼' · '=' */
  seta: string
  /** "22,2%" — já em vírgula decimal e sem sinal (a seta carrega o sentido). */
  texto: string
  sentido: 'sobe' | 'cai' | 'igual'
}

/**
 * Formata uma variação percentual para os chips do painel.
 *
 * O caso que motiva a função é o ZERO. Uma variação de 0 (ou de 0,04%, que
 * arredonda para "0,0%") saía como "▲ 0,0%": seta de subida para coisa que não
 * subiu. O corte é 0,05 — o mesmo ponto em que o `toFixed(1)` abaixo passa a
 * exibir "0,1" —, para o desenho nunca discordar do número que está do lado.
 *
 * Fica aqui, e não dentro dos cards, porque são DOIS chips com paletas
 * diferentes (StatCard sobre superfície, HeroCard sobre o roxo) e a regra de
 * arredondamento tem de ser a mesma nos dois.
 */
export function variacao(pct: number): Variacao {
  const texto = num1Fixo(Math.abs(pct)) + '%'
  if (Math.abs(pct) < 0.05) return { seta: '=', texto, sentido: 'igual' }
  return pct > 0
    ? { seta: '▲', texto, sentido: 'sobe' }
    : { seta: '▼', texto, sentido: 'cai' }
}

export function greeting(name: string, now = new Date()): string {
  const h = now.getHours()
  const parte = h < 12 ? t('formato.bomDia') : h < 18 ? t('formato.boaTarde') : t('formato.boaNoite')
  const first = name.trim().split(/\s+/)[0] || ''
  return t('formato.saudacao', {
    parte, nome: first, dia: diaAbrev(now.getDay()), data: diaEMes(now),
  })
}
