import { idiomaAtual, tagIntl, type Idioma } from '../store/localeStore'

/**
 * A máquina de datas e números por idioma.
 *
 * Existe separada de `src/lib/format.ts` porque são assuntos diferentes: aqui
 * ficam os objetos do `Intl` e os separadores; lá ficam os rótulos do produto
 * ("Atrasada", "Venc. 10 Jun"), que continuam com a mesma assinatura de antes
 * para não espalhar a mudança pelos quarenta arquivos que os importam.
 *
 * Tudo é cacheado por idioma: construir um `Intl.DateTimeFormat` é caro, e
 * estas funções são chamadas dentro de listas com centenas de linhas.
 */

function cache<T>(fabrica: (i: Idioma) => T): (i?: Idioma) => T {
  const guardado = {} as Record<Idioma, T>
  return (i = idiomaAtual()) => (guardado[i] ??= fabrica(i))
}

const numero = cache((i) => new Intl.NumberFormat(tagIntl(i), { maximumFractionDigits: 0 }))
const numero1 = cache((i) => new Intl.NumberFormat(tagIntl(i), { maximumFractionDigits: 1 }))
const mesCurto = cache((i) => new Intl.DateTimeFormat(tagIntl(i), { month: 'short' }))
const mesLongo = cache((i) => new Intl.DateTimeFormat(tagIntl(i), { month: 'long' }))
const diaMes = cache((i) => new Intl.DateTimeFormat(tagIntl(i), { day: 'numeric', month: 'short' }))
const diaSemana = cache((i) => new Intl.DateTimeFormat(tagIntl(i), { weekday: 'short' }))
const diaSemanaLongo = cache((i) => new Intl.DateTimeFormat(tagIntl(i), { weekday: 'long' }))
const dataCompleta = cache((i) => new Intl.DateTimeFormat(tagIntl(i), { weekday: 'long', day: 'numeric', month: 'long' }))

/** Inteiro com o separador de milhar do idioma: 12000 -> '12.000' | '12,000'. */
export function num(v: number): string {
  return numero().format(v)
}

/** Uma casa decimal, para '2,4 MB' e '284,5k'. */
export function num1(v: number): string {
  return numero1().format(v)
}

/**
 * 'Jan' | 'ene' | 'Jan'. O `Intl` do espanhol devolve minúsculo e às vezes com
 * ponto ('ene.'); tiramos o ponto e subimos a primeira letra para os rótulos
 * ficarem parelhos com os do português, que é o desenho que a tela já tem.
 */
function limpar(s: string): string {
  const semPonto = s.replace(/\.$/, '')
  return semPonto.charAt(0).toUpperCase() + semPonto.slice(1)
}

export function mesAbrev(m: number): string {
  return limpar(mesCurto().format(new Date(2001, m, 1)))
}

export function mesPorExtenso(m: number): string {
  return limpar(mesLongo().format(new Date(2001, m, 1)))
}

/** 0 = domingo, como `Date.getDay()`. */
export function diaAbrev(d: number): string {
  return limpar(diaSemana().format(new Date(2001, 6, 1 + d)))
}

export function diaPorExtenso(d: number): string {
  return limpar(diaSemanaLongo().format(new Date(2001, 6, 1 + d)))
}

/** '24 Jun' em pt/es, 'Jun 24' em inglês — a ordem vem do idioma, não da gente. */
export function diaEMes(d: Date): string {
  return limpar(diaMes().format(d))
}

/** 'Sexta, 26 de junho' | 'Friday, June 26' — cabeçalho do dia na agenda. */
export function dataPorExtenso(d: Date): string {
  return limpar(dataCompleta().format(d))
}

/** 'sexta-feira, 26 de set' — o carimbo de hoje no cabeçalho do painel. */
const diaCompletoCurto = cache((i) => new Intl.DateTimeFormat(tagIntl(i), { weekday: 'long', day: '2-digit', month: 'short' }))

export function dataCompletaCurta(d: Date): string {
  return diaCompletoCurto().format(d)
}

/** Data curta numérica (10/06/2026 | 6/10/2026). */
export function dataCurta(d: Date): string {
  return d.toLocaleDateString(tagIntl())
}

/** Data e hora, para o carimbo "emitido em" dos relatórios. */
export function dataHoraCurta(d: Date): string {
  return d.toLocaleString(tagIntl())
}

/** Ordenação no alfabeto de quem lê. */
export function compararTexto(a: string, b: string): number {
  return a.localeCompare(b, tagIntl())
}

/** O separador decimal do idioma ativo — ',' em pt/es, '.' em inglês. */
export function separadorDecimal(idioma: Idioma = idiomaAtual()): string {
  return new Intl.NumberFormat(tagIntl(idioma)).format(1.1).charAt(1)
}

/**
 * Lê o que a pessoa DIGITOU no campo de valor, no formato do idioma dela.
 *
 * É a função de maior risco do arquivo. Antes ela assumia '.' de milhar e ','
 * de decimal sempre; com a interface em inglês, '12,000.00' virava 12 — um
 * negócio de doze mil reais gravado como doze, calado. Por isso o separador
 * decimal manda: o que não é ele é ruído de milhar e sai fora.
 */
export function lerNumero(s: string | number, idioma: Idioma = idiomaAtual()): number {
  if (typeof s === 'number') return s
  const bruto = String(s).trim()
  if (!bruto) return 0
  const dec = separadorDecimal(idioma)
  const outro = dec === ',' ? '.' : ','
  const semMilhar = bruto.split(outro).join('')
  return parseFloat(semMilhar.replace(dec, '.').replace(/[^\d.-]/g, '')) || 0
}
