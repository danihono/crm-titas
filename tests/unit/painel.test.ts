/**
 * As contas dos blocos novos do painel, sem React e sem Firebase.
 *
 * Os dois assuntos aqui erram CALADO na tela: conta de mês (uma virada de ano no balde
 * errado desloca o gráfico inteiro sem quebrar nada) e ordem de fila (quem espera há mais
 * tempo tem de estar no topo — uma ordenação invertida mostra o caso menos urgente como
 * se fosse o mais grave, e ninguém desconfia de uma lista que parece cheia).
 */
import { describe, expect, it } from 'vitest'
import { ganhosPorMes, leadsDoMes } from '../../src/lib/dashboardData'
import { variacao } from '../../src/lib/format'
import { filaDeEspera } from '../../src/lib/reportData'
import type { Contact, ConvState, Deal } from '../../src/types'

const AGORA = new Date('2026-09-15T12:00:00')

function negocio(p: Partial<Deal>): Deal {
  return {
    id: 'd1', company: 'Acme', contact: 'Ana', value: 1000, initials: 'AN', tag: '',
    boardId: 'leads', columnId: 'novo', order: 0, ...p,
  }
}

function contato(p: Partial<Contact> & { conv?: Partial<ConvState> }): Contact {
  const { conv, ...resto } = p
  return {
    id: 'c1', name: 'Ana', company: '', initials: 'AN', online: false, role: '',
    email: '', phone: '', whatsapp: '', status: '',
    ...resto,
    ...(conv
      ? {
        conv: {
          status: 'entrada', recordId: 'r1', assignedTo: '', assignedName: '',
          sectorId: '', tagIds: [], ...conv,
        } as ConvState,
      }
      : {}),
  }
}

describe('negócios ganhos por mês', () => {
  it('conta o negócio no mês em que ele chegou à etapa Ganho', () => {
    const meses = ganhosPorMes([
      negocio({ id: 'a', value: 500, reachedAt: { ganho: new Date('2026-09-02T10:00:00') } }),
      negocio({ id: 'b', value: 250, reachedAt: { ganho: new Date('2026-09-28T10:00:00') } }),
    ], AGORA)

    // Índice 11 = mês corrente da série de 12.
    expect(meses).toHaveLength(12)
    expect(meses[11].label).toBe('Set')
    expect(meses[11].count).toBe(2)
    expect(meses[11].valor).toBe(750)
  })

  it('ignora negócio que nunca chegou à etapa Ganho', () => {
    // Sem `reachedAt.ganho` o modelo não sabe QUANDO foi ganho — e cair no createdAt
    // encheria o gráfico de vitória que ninguém teve.
    const meses = ganhosPorMes([
      negocio({ createdAt: new Date('2026-09-01T10:00:00') }),
      negocio({ id: 'x', reachedAt: { proposta: new Date('2026-09-01T10:00:00') } }),
    ], AGORA)
    expect(meses.every((m) => m.count === 0)).toBe(true)
  })

  it('não confunde o mês na virada do ano', () => {
    const meses = ganhosPorMes([
      negocio({ id: 'dez', reachedAt: { ganho: new Date('2025-12-20T10:00:00') } }),
      negocio({ id: 'jan', reachedAt: { ganho: new Date('2026-01-05T10:00:00') } }),
    ], AGORA)

    const dez = meses.find((m) => m.titulo === 'Dezembro de 2025')
    const jan = meses.find((m) => m.titulo === 'Janeiro de 2026')
    expect(dez?.count).toBe(1)
    expect(jan?.count).toBe(1)
    // Cada mês aparece uma vez só: 12 baldes, 12 títulos distintos.
    expect(new Set(meses.map((m) => m.titulo)).size).toBe(12)
  })

  it('deixa zero explícito no mês sem nada, em vez de buraco', () => {
    const meses = ganhosPorMes([], AGORA)
    expect(meses).toHaveLength(12)
    expect(meses.every((m) => m.count === 0 && m.valor === 0)).toBe(true)
    expect(meses[0].label).toBe('Out')
    expect(meses[11].label).toBe('Set')
  })
})

describe('leads do mês', () => {
  it('conta os criados no mês e compara com o anterior', () => {
    const l = leadsDoMes([
      negocio({ id: '1', createdAt: new Date('2026-09-01T09:00:00'), reachedAt: { ganho: new Date('2026-09-10T09:00:00') } }),
      negocio({ id: '2', createdAt: new Date('2026-09-14T09:00:00') }),
      negocio({ id: '3', createdAt: new Date('2026-09-15T09:00:00') }),
      negocio({ id: '4', createdAt: new Date('2026-08-20T09:00:00') }),
      negocio({ id: '5', createdAt: new Date('2026-08-21T09:00:00') }),
    ], AGORA)

    expect(l.count).toBe(3)
    expect(l.ganhos).toBe(1)
    expect(l.changePct).toBeCloseTo(50)
    expect(l.mes).toBe('Setembro')
  })

  it('não inventa variação quando o mês anterior foi zero', () => {
    // Crescer de 0 para 4 não é "+400%" nem "+∞%": não há base, e o chip some.
    const l = leadsDoMes([negocio({ createdAt: new Date('2026-09-02T09:00:00') })], AGORA)
    expect(l.count).toBe(1)
    expect(l.changePct).toBeNull()
  })

  it('deixa de fora o lead sem data de criação', () => {
    const l = leadsDoMes([negocio({ id: 'sem-data' })], AGORA)
    expect(l.count).toBe(0)
  })
})

describe('fila de espera', () => {
  const dezMin = new Date('2026-09-15T11:50:00')
  const duasHoras = new Date('2026-09-15T10:00:00')

  it('põe quem espera há mais tempo no topo', () => {
    const fila = filaDeEspera([
      contato({ id: 'novo', name: 'Novo', conv: { openedAt: dezMin } }),
      contato({ id: 'antigo', name: 'Antigo', conv: { openedAt: duasHoras } }),
    ])
    expect(fila.map((l) => l.contactId)).toEqual(['antigo', 'novo'])
  })

  it('deixa fora o atendimento finalizado e o contato sem atendimento', () => {
    const fila = filaDeEspera([
      contato({ id: 'fim', conv: { status: 'finalizado', openedAt: duasHoras } }),
      contato({ id: 'sem-conv', lastMessageAt: duasHoras }),
      contato({ id: 'aberto', conv: { openedAt: duasHoras } }),
    ])
    expect(fila.map((l) => l.contactId)).toEqual(['aberto'])
  })

  it('marca quem ainda não recebeu nenhuma resposta', () => {
    const [semResposta, respondido] = filaDeEspera([
      contato({ id: 'a', conv: { openedAt: duasHoras } }),
      contato({ id: 'b', conv: { openedAt: dezMin, firstResponseAt: dezMin } }),
    ])
    expect(semResposta.semResposta).toBe(true)
    expect(respondido.semResposta).toBe(false)
  })

  it('classifica nas mesmas três categorias da fila agora', () => {
    const fila = filaDeEspera([
      contato({ id: 'fila', conv: { openedAt: duasHoras } }),
      contato({ id: 'atend', conv: { openedAt: duasHoras, assignedTo: 'u1' } }),
      contato({ id: 'esper', conv: { openedAt: duasHoras, assignedTo: 'u1', status: 'esperando' } }),
    ])
    expect(fila.map((l) => l.estado).sort()).toEqual(['atendimento', 'esperando', 'fila'])
  })

  it('usa a última mensagem quando o atendimento não tem abertura', () => {
    // Contato antigo, de antes de `openedAt` existir: sem a reserva ele sumiria da fila.
    const [linha] = filaDeEspera([contato({ id: 'legado', lastMessageAt: duasHoras, conv: {} })])
    expect(linha.desde).toEqual(duasHoras)
  })

  it('ignora a espera sem começo, em vez de jogá-la no topo', () => {
    const fila = filaDeEspera([contato({ id: 'sem-data', conv: {} })])
    expect(fila).toEqual([])
  })

  it('corta no limite pedido, mantendo os mais antigos', () => {
    const muitos = Array.from({ length: 12 }, (_, i) => contato({
      id: `c${i}`,
      conv: { openedAt: new Date(2026, 8, 15, 10, i) },
    }))
    const fila = filaDeEspera(muitos, 3)
    expect(fila.map((l) => l.contactId)).toEqual(['c0', 'c1', 'c2'])
  })
})

describe('chip de variação', () => {
  it('trata zero como neutro, sem seta de subida', () => {
    // O defeito que motivou a função: "▲ 0,0%" — seta de subida no que não subiu.
    expect(variacao(0)).toEqual({ seta: '=', texto: '0,0%', sentido: 'igual' })
  })

  it('é neutro em tudo que ARREDONDA para 0,0%', () => {
    // O corte tem de ser o mesmo do texto: se sai "0,0%", a seta não pode dizer
    // outra coisa. 0,04 exibe "0,0"; 0,05 já exibe "0,1".
    expect(variacao(0.04).sentido).toBe('igual')
    expect(variacao(-0.04).sentido).toBe('igual')
    expect(variacao(0.05).sentido).toBe('sobe')
    expect(variacao(0.05).texto).toBe('0,1%')
    expect(variacao(-0.05).sentido).toBe('cai')
  })

  it('mostra sentido e número em vírgula decimal, sem sinal', () => {
    expect(variacao(22.22)).toEqual({ seta: '▲', texto: '22,2%', sentido: 'sobe' })
    // A seta carrega o sinal: "▼ -34,5%" leria como dupla negação.
    expect(variacao(-34.5)).toEqual({ seta: '▼', texto: '34,5%', sentido: 'cai' })
  })
})
