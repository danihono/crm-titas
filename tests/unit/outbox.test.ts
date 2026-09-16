/**
 * A reconciliação das bolhas otimistas da conversa.
 *
 * Este é um assunto que erra CALADO nos dois sentidos, e os dois defeitos são visíveis
 * para quem está conversando: sair cedo demais faz a mensagem sumir da tela e voltar
 * (ou aparecer duas vezes, no caminho local, onde o documento entra no cache antes de o
 * envio terminar); sair tarde demais deixa uma bolha fantasma pendurada com um relógio
 * que nunca vira ✓✓. Nada disso quebra o app — só faz o CRM parecer que perdeu a
 * mensagem, que é exatamente a desconfiança que o envio otimista existe para evitar.
 */
import { describe, expect, it } from 'vitest'
import { aindaPendentes, PRAZO_ENTREGUE_MS, type ItemSaida } from '../../src/lib/outbox'
import type { Message } from '../../src/types'

const AGORA = new Date('2026-09-16T12:00:00').getTime()

function item(over: Partial<ItemSaida> & Pick<ItemSaida, 'chave'>): ItemSaida {
  return {
    contactId: 'c1',
    text: 'oi',
    at: new Date(AGORA),
    status: 'enviando',
    jaVistas: new Set<string>(),
    ...over,
  }
}

function msg(over: Partial<Message> & Pick<Message, 'id'>): Message {
  return {
    fromMe: true,
    text: 'oi',
    sentAt: new Date(AGORA),
    ...over,
  }
}

describe('aindaPendentes', () => {
  it('tira a bolha quando o documento real chega', () => {
    const fila = [item({ chave: 'k1', text: 'bom dia' })]
    expect(aindaPendentes(fila, [], AGORA)).toHaveLength(1)
    expect(aindaPendentes(fila, [msg({ id: 'm1', text: 'bom dia' })], AGORA)).toEqual([])
  })

  it('ignora espaço nas pontas — o daemon e o caminho local aparam o texto', () => {
    const fila = [item({ chave: 'k1', text: 'bom dia ' })]
    expect(aindaPendentes(fila, [msg({ id: 'm1', text: 'bom dia' })], AGORA)).toEqual([])
  })

  it('não casa com mensagem que já estava na conversa antes do envio', () => {
    // O caso real: responder "ok" a quem já tinha recebido um "ok" ontem. Sem `jaVistas`,
    // a bolha nova casaria com a mensagem VELHA e sumiria antes de a mensagem sair.
    const velha = msg({ id: 'm1', text: 'ok' })
    const fila = [item({ chave: 'k1', text: 'ok', jaVistas: new Set(['m1']) })]
    expect(aindaPendentes(fila, [velha], AGORA)).toHaveLength(1)
    expect(aindaPendentes(fila, [velha, msg({ id: 'm2', text: 'ok' })], AGORA)).toEqual([])
  })

  it('não casa com mensagem recebida — bolha otimista é sempre nossa', () => {
    const fila = [item({ chave: 'k1', text: 'ok' })]
    const recebida = msg({ id: 'm1', text: 'ok', fromMe: false })
    expect(aindaPendentes(fila, [recebida], AGORA)).toHaveLength(1)
  })

  it('cada documento serve a uma bolha só', () => {
    // Dois "ok" seguidos. Com um documento só na tela, UMA bolha sai e a outra continua
    // esperando o documento dela — e não as duas casando com o mesmo doc.
    const fila = [item({ chave: 'k1', text: 'ok' }), item({ chave: 'k2', text: 'ok' })]
    const umSo = aindaPendentes(fila, [msg({ id: 'm1', text: 'ok' })], AGORA)
    expect(umSo.map((i) => i.chave)).toEqual(['k2'])

    const ambos = aindaPendentes(fila, [msg({ id: 'm1', text: 'ok' }), msg({ id: 'm2', text: 'ok' })], AGORA)
    expect(ambos).toEqual([])
  })

  it('anexo casa por tipo e nome do arquivo, não por texto', () => {
    // O `text` gravado de uma mídia é a legenda ou um rótulo canônico, então texto não
    // distingue duas fotos sem legenda.
    const fila = [
      item({ chave: 'k1', text: '[imagem]', mediaType: 'image', fileName: 'praia.jpg' }),
      item({ chave: 'k2', text: '[imagem]', mediaType: 'image', fileName: 'serra.jpg' }),
    ]
    const docs = [msg({ id: 'm1', text: '[imagem]', mediaType: 'image', fileName: 'serra.jpg' })]
    expect(aindaPendentes(fila, docs, AGORA).map((i) => i.chave)).toEqual(['k1'])
  })

  it('anexo não casa com mensagem de texto de mesmo rótulo', () => {
    const fila = [item({ chave: 'k1', text: '[imagem]', mediaType: 'image', fileName: 'a.jpg' })]
    expect(aindaPendentes(fila, [msg({ id: 'm1', text: '[imagem]' })], AGORA)).toHaveLength(1)
  })

  it('texto não casa com anexo', () => {
    const fila = [item({ chave: 'k1', text: 'oi' })]
    expect(aindaPendentes(fila, [msg({ id: 'm1', text: 'oi', mediaType: 'image' })], AGORA)).toHaveLength(1)
  })

  it('a válvula de segurança tira a bolha confirmada que nunca achou o documento', () => {
    // Conversa acima do teto da janela: o documento foi gravado, mas não veio no snapshot.
    const fila = [item({ chave: 'k1', entregueEm: AGORA })]
    expect(aindaPendentes(fila, [], AGORA + PRAZO_ENTREGUE_MS - 1)).toHaveLength(1)
    expect(aindaPendentes(fila, [], AGORA + PRAZO_ENTREGUE_MS)).toEqual([])
  })

  it('bolha em voo não expira — só a que já teve ACK', () => {
    const fila = [item({ chave: 'k1' })]
    expect(aindaPendentes(fila, [], AGORA + PRAZO_ENTREGUE_MS * 10)).toHaveLength(1)
  })

  it('bolha vermelha fica enquanto não houver documento, e nunca expira sozinha', () => {
    const fila = [item({ chave: 'k1', status: 'falhou', erro: 'WhatsApp não está conectado.' })]
    expect(aindaPendentes(fila, [], AGORA + PRAZO_ENTREGUE_MS * 10)).toHaveLength(1)
  })

  it('bolha vermelha some quando o documento real aparece', () => {
    // A falha é o que ESTE cliente observou (timeout, rede caindo), não o veredito do
    // WhatsApp: a mensagem pode ter saído assim mesmo. Chegando o documento, manter o
    // "não enviada" ao lado dele diria duas coisas contraditórias sobre a mesma mensagem.
    const fila = [item({ chave: 'k1', text: 'ok', status: 'falhou', erro: 'timeout' })]
    expect(aindaPendentes(fila, [msg({ id: 'm1', text: 'ok' })], AGORA)).toEqual([])
  })

  it('vermelha e em voo do mesmo texto: o documento serve a uma só', () => {
    // Falhou, a pessoa mandou de novo, e só um documento chegou. A mais antiga reivindica;
    // a outra continua esperando o documento dela (ou a válvula de segurança).
    const fila = [
      item({ chave: 'k1', text: 'ok', status: 'falhou', erro: 'timeout' }),
      item({ chave: 'k2', text: 'ok' }),
    ]
    expect(aindaPendentes(fila, [msg({ id: 'm1', text: 'ok' })], AGORA).map((i) => i.chave)).toEqual(['k2'])
  })
})
