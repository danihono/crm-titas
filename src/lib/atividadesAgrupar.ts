import { t, type Chave } from '../i18n'
import { dateKeyOf, dueInfo } from './format'
import { compararTexto, mesPorExtenso } from '../i18n/formato'
import type { Activity, ActType } from '../types'

/** Como a lista de atividades se agrupa na tela. 'nenhum' mantém a lista corrida. */
export type ActGroup = 'nenhum' | 'urgencia' | 'mes' | 'tipo' | 'cliente'

export interface ActGrupo {
  key: string
  label: string
  rows: Activity[]
}

type Urgencia = 'atrasadas' | 'hoje' | 'semana' | 'depois' | 'concluidas'

/** Ordem da mais urgente para a menos. Concluída fica por último, fora da corrida. */
const URGENCIAS: { id: Urgencia; label: Chave }[] = [
  { id: 'atrasadas', label: 'atividades.urgAtrasadas' },
  { id: 'hoje', label: 'atividades.urgHoje' },
  { id: 'semana', label: 'atividades.urgSemana' },
  { id: 'depois', label: 'atividades.urgDepois' },
  { id: 'concluidas', label: 'atividades.concluidas' },
]

function urgenciaOf(a: Activity, now: Date): Urgencia {
  if (a.done) return 'concluidas'
  if (dueInfo(a.dueAt, a.done, now).overdue) return 'atrasadas'
  const hoje = dateKeyOf(now)
  const key = dateKeyOf(a.dueAt)
  if (key === hoje) return 'hoje'
  const limite = new Date(now)
  limite.setDate(limite.getDate() + 7)
  return key <= dateKeyOf(limite) ? 'semana' : 'depois'
}

/** Dentro de um grupo: abertas por data (a mais próxima primeiro), concluídas por último. */
function ordenar(rows: Activity[]): Activity[] {
  return [...rows].sort((a, b) => Number(a.done) - Number(b.done) || a.dueAt.getTime() - b.dueAt.getTime())
}

/**
 * Agrupa as atividades pelo modo escolhido.
 *
 * Tipo e cliente são listas de nomes, sem ordem natural — então os grupos seguem a urgência:
 * o que tem a atividade aberta mais próxima vem primeiro. Grupo só com concluídas vai para o fim.
 * Mês segue cronológico, como no Faturamento.
 */
export function agruparAtividades(
  list: Activity[],
  modo: ActGroup,
  tipos: Record<string, ActType>,
  now = new Date(),
): ActGrupo[] {
  if (modo === 'nenhum') return [{ key: 'all', label: '', rows: list }]

  if (modo === 'urgencia') {
    return URGENCIAS.map((u) => ({
      key: u.id,
      label: t(u.label),
      rows: ordenar(list.filter((a) => urgenciaOf(a, now) === u.id)),
    })).filter((g) => g.rows.length > 0)
  }

  const map = new Map<string, { key: string; label: string; rows: Activity[] }>()
  for (const a of list) {
    const { key, label } = chaveDoGrupo(a, modo, tipos)
    let g = map.get(key)
    if (!g) { g = { key, label, rows: [] }; map.set(key, g) }
    g.rows.push(a)
  }

  const grupos = [...map.values()].map((g) => ({ ...g, rows: ordenar(g.rows) }))
  if (modo === 'mes') {
    return grupos.sort((a, b) => a.key.localeCompare(b.key))
  }
  // Mais urgente primeiro: a data da atividade aberta mais próxima de cada grupo.
  const rank = (g: ActGrupo) => {
    const abertas = g.rows.filter((a) => !a.done)
    return abertas.length ? Math.min(...abertas.map((a) => a.dueAt.getTime())) : Infinity
  }
  return grupos.sort((a, b) => rank(a) - rank(b) || compararTexto(a.label, b.label))
}

function chaveDoGrupo(a: Activity, modo: ActGroup, tipos: Record<string, ActType>): { key: string; label: string } {
  if (modo === 'mes') {
    const y = a.dueAt.getFullYear()
    const m = a.dueAt.getMonth()
    return {
      key: `${y}-${String(m + 1).padStart(2, '0')}`,
      label: t('fatura.grupoMes', { mes: mesPorExtenso(m), ano: y }),
    }
  }
  if (modo === 'tipo') {
    return { key: a.type || '', label: tipos[a.type]?.label || t('atividades.semTipo') }
  }
  // cliente: o id quando existe (o nome pode repetir); atividade antiga só tem o nome.
  return { key: a.contactId || 'nome:' + a.contact, label: a.contact || t('atividades.semCliente') }
}
