/**
 * Agrupamento da tela de Atividades, sem React.
 *
 * O erro aqui é de ORDEM e de BALDE: uma atividade atrasada caindo em "Hoje", ou um grupo
 * de cliente com a pendência mais distante no topo, mostra o caso menos urgente como se
 * fosse o mais grave — e a lista continua parecendo bem organizada.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { agruparAtividades } from '../../src/lib/atividadesAgrupar'
import { useLocaleStore } from '../../src/store/localeStore'
import type { Activity, ActType } from '../../src/types'

beforeEach(() => useLocaleStore.getState().setIdioma('pt'))

const NOW = new Date(2026, 9, 8, 10, 0) // 8 de outubro de 2026, 10h

function at(id: string, dueAt: Date, extra: Partial<Activity> = {}): Activity {
  return { id, type: 'ligacao', title: id, contact: 'Cliente A', dueAt, done: false, ...extra } as Activity
}

const d = (day: number, month = 9, hour = 15) => new Date(2026, month, day, hour, 0)

const tipos: Record<string, ActType> = {
  ligacao: { id: 'ligacao', label: 'Ligação', icon: 'call', color: '#000', bg: '#fff', evColor: '#000' },
  reuniao: { id: 'reuniao', label: 'Reunião', icon: 'groups', color: '#000', bg: '#fff', evColor: '#000' },
}

describe('agruparAtividades · urgência', () => {
  it('ordena atrasadas, hoje, próximos 7 dias, depois e concluídas', () => {
    const list = [
      at('depois', d(20)),
      at('semana', d(12)),
      at('hoje', d(8, 9, 18)),
      at('atrasada', d(5)),
      at('feita', d(1), { done: true }),
    ]
    const grupos = agruparAtividades(list, 'urgencia', tipos, NOW)
    expect(grupos.map((g) => g.key)).toEqual(['atrasadas', 'hoje', 'semana', 'depois', 'concluidas'])
    expect(grupos.map((g) => g.rows[0].id)).toEqual(['atrasada', 'hoje', 'semana', 'depois', 'feita'])
  })

  it('dentro do grupo, a mais atrasada vem primeiro', () => {
    const grupos = agruparAtividades([at('nova', d(6)), at('velha', d(2))], 'urgencia', tipos, NOW)
    expect(grupos[0].rows.map((a) => a.id)).toEqual(['velha', 'nova'])
  })

  it('não mostra grupo vazio', () => {
    const grupos = agruparAtividades([at('x', d(20))], 'urgencia', tipos, NOW)
    expect(grupos.map((g) => g.key)).toEqual(['depois'])
  })

  it('o limite de 7 dias entra no grupo "próximos 7 dias" e o dia 8 já vai para "depois"', () => {
    const grupos = agruparAtividades([at('limite', d(15)), at('alem', d(16))], 'urgencia', tipos, NOW)
    expect(grupos.find((g) => g.key === 'semana')?.rows.map((a) => a.id)).toEqual(['limite'])
    expect(grupos.find((g) => g.key === 'depois')?.rows.map((a) => a.id)).toEqual(['alem'])
  })
})

describe('agruparAtividades · mês', () => {
  it('agrupa pelo mês do vencimento, em ordem cronológica', () => {
    const list = [at('nov', d(2, 10)), at('set', d(20, 8)), at('out', d(9))]
    const grupos = agruparAtividades(list, 'mes', tipos, NOW)
    expect(grupos.map((g) => g.rows[0].id)).toEqual(['set', 'out', 'nov'])
  })
})

describe('agruparAtividades · tipo e cliente', () => {
  it('põe primeiro o grupo que tem a atividade aberta mais próxima', () => {
    const list = [
      at('a', d(25), { type: 'ligacao' }),
      at('b', d(9), { type: 'reuniao' }),
    ]
    const grupos = agruparAtividades(list, 'tipo', tipos, NOW)
    expect(grupos.map((g) => g.label)).toEqual(['Reunião', 'Ligação'])
  })

  it('grupo só com concluídas vai para o fim', () => {
    const list = [
      at('feita', d(1), { type: 'reuniao', done: true }),
      at('aberta', d(30), { type: 'ligacao' }),
    ]
    const grupos = agruparAtividades(list, 'tipo', tipos, NOW)
    expect(grupos.map((g) => g.label)).toEqual(['Ligação', 'Reunião'])
  })

  it('cliente: agrupa pelo id e não pelo nome', () => {
    const list = [
      at('1', d(10), { contactId: 'c1', contact: 'Ana' }),
      at('2', d(11), { contactId: 'c2', contact: 'Ana' }),
      at('3', d(12), { contactId: 'c1', contact: 'Ana' }),
    ]
    const grupos = agruparAtividades(list, 'cliente', tipos, NOW)
    expect(grupos.map((g) => g.rows.length)).toEqual([2, 1])
  })

  it('atividade sem tipo cadastrado cai em "Sem tipo"', () => {
    const grupos = agruparAtividades([at('x', d(10), { type: 'apagado' })], 'tipo', tipos, NOW)
    expect(grupos[0].label).toBe('Sem tipo')
  })
})

describe('agruparAtividades · sem agrupar', () => {
  it('devolve uma única lista na ordem recebida', () => {
    const list = [at('b', d(20)), at('a', d(2))]
    const grupos = agruparAtividades(list, 'nenhum', tipos, NOW)
    expect(grupos).toHaveLength(1)
    expect(grupos[0].rows.map((a) => a.id)).toEqual(['b', 'a'])
  })
})
