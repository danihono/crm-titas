/**
 * O resumo diário, sem Firebase.
 *
 * Os dois assuntos aqui são os que erram CALADO em produção: conta de fuso (o resumo chega
 * de madrugada e ninguém reporta, só desinstala) e o gate de papel (o Admin SDK lê
 * faturamento de qualquer ambiente, então quem decide o que sai é este código). No WhatsApp
 * não existe lista vazia nem erro no console: a mensagem sai e chega.
 */
import { describe, expect, it } from 'vitest'
import {
  agoraNoFuso, hhmmParaMinutos, dentroDaJanela, blocosPermitidos, montarResumo,
  type BlocosResumo, type DadosResumo,
} from '../../functions/src/resumo'

const TODOS: BlocosResumo = { agenda: true, tarefas: true, faturas: true, conversas: true }

const VAZIO: DadosResumo = {
  agenda: [], tarefasHoje: [], tarefasAtrasadas: [],
  faturasVencidas: [], faturasAVencer: [], conversas: [],
}

describe('hora no fuso do ambiente', () => {
  // 2026-09-09T02:30:00Z: no Brasil (UTC-3) ainda é DIA 8, às 23:30. Usar o relógio do
  // servidor mandaria o resumo no dia errado e na hora errada de uma vez só.
  const meiaNoiteUtc = new Date('2026-09-09T02:30:00Z')

  it('devolve o dia e a hora locais, não os do servidor', () => {
    expect(agoraNoFuso(meiaNoiteUtc, 'America/Sao_Paulo')).toEqual({
      dateKey: '2026-09-08',
      minutos: 23 * 60 + 30,
    })
  })

  it('respeita fusos diferentes do padrão', () => {
    expect(agoraNoFuso(meiaNoiteUtc, 'UTC').dateKey).toBe('2026-09-09')
    expect(agoraNoFuso(meiaNoiteUtc, 'America/Manaus').dateKey).toBe('2026-09-08')
  })

  it('trata a meia-noite como minuto zero, não como 24h', () => {
    expect(agoraNoFuso(new Date('2026-09-09T03:00:00Z'), 'America/Sao_Paulo')).toEqual({
      dateKey: '2026-09-09',
      minutos: 0,
    })
  })

  it('fuso inválido no perfil cai no padrão em vez de derrubar a rodada', () => {
    // A função agendada processa os ambientes em sequência: um throw aqui pararia o
    // resumo de todos os clientes seguintes por causa do dado torto de um.
    expect(() => agoraNoFuso(meiaNoiteUtc, 'Nao/Existe')).not.toThrow()
    expect(agoraNoFuso(meiaNoiteUtc, 'Nao/Existe').dateKey).toBe('2026-09-08')
  })
})

describe('janela de envio', () => {
  it('aceita HH:MM e recusa lixo', () => {
    expect(hhmmParaMinutos('07:00')).toBe(420)
    expect(hhmmParaMinutos('7:05')).toBe(425)
    expect(hhmmParaMinutos('25:00')).toBeNull()
    expect(hhmmParaMinutos('07:61')).toBeNull()
    expect(hhmmParaMinutos('')).toBeNull()
  })

  it('abre na hora marcada e fecha 30 minutos depois', () => {
    expect(dentroDaJanela('07:00', 420)).toBe(true)
    expect(dentroDaJanela('07:00', 449)).toBe(true)
    expect(dentroDaJanela('07:00', 450)).toBe(false)
  })

  it('não dispara o resumo das 7h num deploy às 11h', () => {
    expect(dentroDaJanela('07:00', 11 * 60)).toBe(false)
  })

  it('ainda não deu a hora', () => {
    expect(dentroDaJanela('07:00', 419)).toBe(false)
  })

  it('atravessa a meia-noite', () => {
    // 23:50 com janela de 30min vai até 00:20. Comparar cru diria que 00:05 é "antes".
    expect(dentroDaJanela('23:50', 5)).toBe(true)
    expect(dentroDaJanela('23:50', 25)).toBe(false)
  })
})

describe('gate de papel — o que pode sair por WhatsApp', () => {
  it('dono e gestor recebem faturamento', () => {
    expect(blocosPermitidos(TODOS, 'dono').faturas).toBe(true)
    expect(blocosPermitidos(TODOS, 'gestor').faturas).toBe(true)
  })

  it('ATENDENTE não recebe faturamento, mesmo com o bloco ligado', () => {
    // `invoices` é de gestor para cima nas security rules — mas o Admin SDK as ignora,
    // então esta função é a única coisa entre o dado e o celular de quem não pode vê-lo.
    expect(blocosPermitidos(TODOS, 'atendente').faturas).toBe(false)
  })

  it('o gate não mexe nos outros blocos', () => {
    const r = blocosPermitidos(TODOS, 'atendente')
    expect(r.agenda).toBe(true)
    expect(r.tarefas).toBe(true)
    expect(r.conversas).toBe(true)
  })

  it('o texto do atendente sai SEM o bloco de faturas', () => {
    const dados: DadosResumo = {
      ...VAZIO,
      faturasVencidas: [{ num: 'NF-102', client: 'Atlas', value: 4200, diasVencida: 4 }],
      agenda: [{ time: '09:00', title: 'Reunião' }],
    }
    const texto = montarResumo(dados, blocosPermitidos(TODOS, 'atendente'))
    expect(texto).not.toContain('NF-102')
    expect(texto).not.toContain('Atlas')
    expect(texto).toContain('Reunião')
  })
})

describe('montagem do texto', () => {
  it('dia vazio diz que está vazio — silêncio pareceria falha', () => {
    expect(montarResumo(VAZIO, TODOS)).toContain('Nada pendente')
  })

  it('bloco desligado não aparece nem com dado', () => {
    const dados: DadosResumo = { ...VAZIO, agenda: [{ time: '09:00', title: 'Reunião' }] }
    expect(montarResumo(dados, { ...TODOS, agenda: false })).toContain('Nada pendente')
  })

  it('mostra valor em real e o total das vencidas', () => {
    const dados: DadosResumo = {
      ...VAZIO,
      faturasVencidas: [
        { num: 'NF-102', client: 'Atlas', value: 4200, diasVencida: 4 },
        { num: 'NF-103', client: 'Nexa', value: 800, diasVencida: 1 },
      ],
    }
    const texto = montarResumo(dados, TODOS)
    expect(texto).toContain('2 vencidas')
    expect(texto).toContain('5.000,00')      // o total
    expect(texto).toContain('venceu há 1 dia')  // singular, não "1 dias"
    expect(texto).toContain('venceu há 4 dias')
  })

  it('corta a lista longa e diz quantas sobraram', () => {
    const dados: DadosResumo = {
      ...VAZIO,
      agenda: Array.from({ length: 12 }, (_, i) => ({ time: `0${i}:00`, title: `Evento ${i}` })),
    }
    const texto = montarResumo(dados, TODOS)
    expect(texto).toContain('AGENDA DE HOJE* (12)')
    expect(texto).toContain('…e mais 4')
    expect(texto).not.toContain('Evento 11')
  })
})
