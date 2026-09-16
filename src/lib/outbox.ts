/**
 * Fila de saída da conversa — as bolhas que já estão na tela mas ainda não viraram
 * documento no Firestore.
 *
 * Existe por causa do transporte. O daemon de WhatsApp é self-hosted atrás de NAT, então
 * o CRM não fala HTTP com ele: escreve um comando em `waCommands/{uid}/queue` e espera.
 * No caminho do WhatsApp o CRM NUNCA grava o documento da mensagem — quem grava é o
 * daemon, depois de a volta inteira fechar (fila → Baileys → servidores do WhatsApp →
 * `batch.commit()` de lá → `onSnapshot` de volta aqui). Desenhar só no fim dessa volta é
 * o que fazia o clique em enviar parecer que não pegou.
 *
 * Então a bolha entra na tela no mesmo quadro do clique, vinda daqui, e sai quando a
 * mensagem de verdade chega. Este arquivo é só a regra de quando ela sai — sem React e
 * sem Firebase, para poder ser testada por fora (`tests/unit/outbox.test.ts`).
 */
import type { Message } from '../types'
import type { OutgoingMedia } from './whatsapp'

/** Estado de uma bolha otimista. Mensagem entregue não fica na fila: some. */
export type StatusSaida = 'enviando' | 'falhou'

export interface ItemSaida {
  /** Id local e estável, só para o React. Nunca vai para o Firestore. */
  chave: string
  contactId: string
  /** Texto JÁ com variáveis e assinatura aplicadas — exatamente o que foi despachado. */
  text: string
  /**
   * Relógio do CLIENTE. Serve para desenhar o horário da bolha enquanto ela é só nossa;
   * nada é gravado com ele (quem carimba a mensagem é o servidor).
   */
  at: Date
  status: StatusSaida
  /** Mensagem do erro, quando `status` é 'falhou' — é o que a bolha vermelha mostra. */
  erro?: string
  /**
   * Ids das mensagens que JÁ ESTAVAM na conversa quando este item entrou na fila.
   *
   * É o que torna a reconciliação independente de relógio: doc que não está aqui é doc
   * que nasceu depois do envio. Comparar horários em vez disto erraria por minutos — o
   * relógio do navegador não é o do servidor, e é justamente o servidor quem carimba.
   */
  jaVistas: ReadonlySet<string>
  /**
   * Quando a promessa de entrega resolveu. Só a válvula de segurança usa isto — ver
   * `expirou`. Enquanto é `undefined`, o item está genuinamente em voo.
   */
  entregueEm?: number

  // ── anexo ────────────────────────────────────────────────────────────
  mediaType?: Message['mediaType']
  /** `blob:` de `URL.createObjectURL` — a pré-via local, enquanto o arquivo sobe. */
  mediaUrl?: string
  fileName?: string
  sizeBytes?: number
  caption?: string
  /** O arquivo escolhido, guardado para o reenvio poder subir de novo. */
  file?: File
  /** Descritor do que já subiu ao Storage: reenviar não re-sobe o mesmo arquivo. */
  media?: OutgoingMedia
}

/**
 * Prazo da válvula de segurança, contado a partir do ACK da entrega.
 *
 * O normal é a bolha sair por CASAMENTO (o doc real apareceu). Mas há um caso em que o
 * doc nunca aparece na lista mesmo tendo sido gravado: numa conversa acima do teto de
 * `limitToLast`, o doc pendente do próprio navegador pode cair fora da janela. Sem este
 * prazo a bolha ficaria pendurada para sempre. Com ele, some pouco depois do ACK.
 */
export const PRAZO_ENTREGUE_MS = 10_000

/** Item já confirmado pelo servidor e velho demais para continuar esperando o casamento. */
function expirou(item: ItemSaida, agora: number): boolean {
  return item.entregueEm !== undefined && agora - item.entregueEm >= PRAZO_ENTREGUE_MS
}

/**
 * A mensagem real `m` é o documento deste item?
 *
 * Texto casa por texto. Anexo casa por tipo + nome do arquivo, porque o `text` gravado é
 * a legenda ou um rótulo canônico em português (ver `saveOutgoingMediaMessage` no daemon)
 * — comparar texto ali faria duas fotos sem legenda casarem entre si.
 */
function casa(item: ItemSaida, m: Message): boolean {
  if (!m.fromMe || item.jaVistas.has(m.id)) return false
  if (item.mediaType) {
    if (m.mediaType !== item.mediaType) return false
    // `fileName` só entra na comparação quando os dois lados têm: o daemon grava o nome,
    // mas mídia sem nome (áudio gravado na hora) cai no tipo, que já basta entre as
    // mensagens NOVAS — que é tudo o que `jaVistas` deixa passar até aqui.
    return !item.fileName || !m.fileName || m.fileName === item.fileName
  }
  return !m.mediaType && m.text.trim() === item.text.trim()
}

/**
 * Quais bolhas otimistas ainda merecem aparecer na tela.
 *
 * A saída é por CASAMENTO com o documento real, nunca pela promessa de entrega ter
 * resolvido — e isso não é preciosismo, é o único critério que serve para os dois
 * caminhos de envio, que resolvem em ordens opostas:
 *
 *   • WhatsApp: o doc só existe no fim da volta pelo daemon, então ele chega mais ou
 *     menos junto com o ACK;
 *   • local (daemon fora do ar): `writeBatch` aparece no cache do Firestore na hora,
 *     MUITO antes de `commit()` resolver.
 *
 * Sair no ACK, portanto, duplicaria a bolha no caminho local e abriria um buraco no do
 * WhatsApp. Casar com o doc acerta os dois.
 *
 * Cada documento é reivindicado por no máximo UM item: mandar "ok" duas vezes seguidas
 * cria duas bolhas de mesmo texto, e sem isso as duas casariam com o primeiro "ok" a
 * chegar — uma sairia, a outra ficaria pendurada esperando um doc já gasto.
 *
 * A bolha VERMELHA também casa, e é proposital. Uma falha aqui é o que este cliente
 * conseguiu observar, não o veredito do WhatsApp: o comando pode ter estourado o tempo,
 * ou a aba ter perdido a rede, e a mensagem ter saído assim mesmo. Quando o documento
 * aparece, ele é a prova de que saiu — e deixar o "não enviada" ao lado dela diria à
 * pessoa duas coisas contraditórias sobre a mesma mensagem, que é pior do que qualquer
 * uma das duas sozinha. Sem documento, a vermelha fica: só a que está em voo expira.
 */
export function aindaPendentes(
  itens: readonly ItemSaida[],
  mensagens: readonly Message[],
  agora: number = Date.now(),
): ItemSaida[] {
  if (itens.length === 0) return []
  const reivindicados = new Set<string>()
  const restantes: ItemSaida[] = []

  // Na ordem da fila: a bolha mais antiga escolhe primeiro, que é a ordem em que os
  // documentos também chegam.
  for (const item of itens) {
    const doc = mensagens.find((m) => !reivindicados.has(m.id) && casa(item, m))
    if (doc) {
      reivindicados.add(doc.id)
      continue
    }
    // Só o que está em voo expira; a bolha vermelha fica até a pessoa resolver.
    if (item.status === 'enviando' && expirou(item, agora)) continue
    restantes.push(item)
  }
  return restantes
}

/** Id local de uma bolha. `randomUUID` quando há; o resto é para navegador sem ele. */
export function novaChave(): string {
  const c = globalThis.crypto
  if (c && 'randomUUID' in c) return `saida:${c.randomUUID()}`
  return `saida:${Date.now()}:${Math.random().toString(36).slice(2)}`
}

/** A foto dos ids da conversa no instante do envio — a `jaVistas` de um item novo. */
export function idsAtuais(mensagens: readonly Message[]): ReadonlySet<string> {
  return new Set(mensagens.map((m) => m.id))
}

/**
 * A bolha otimista vestida de `Message`, para reaproveitar o mesmo desenho das outras.
 *
 * `id` recebe a chave local: ela não colide com id do Firestore e serve de `key` do React.
 */
export function mensagemDaSaida(item: ItemSaida): Message {
  return {
    id: item.chave,
    fromMe: true,
    text: item.text,
    sentAt: item.at,
    mediaType: item.mediaType,
    mediaUrl: item.mediaUrl ?? '',
    mediaPath: '',
    mimeType: '',
    fileName: item.fileName ?? '',
    sizeBytes: item.sizeBytes ?? 0,
    caption: item.caption ?? '',
    mediaError: '',
    importedFromHistory: false,
    // `pending` aqui é o do MODELO ("a mídia ainda não tem arquivo para mostrar"), e não
    // o nosso estado de envio. A pré-via é local e já renderiza, então é false.
    pending: false,
    channel: '',
  }
}
