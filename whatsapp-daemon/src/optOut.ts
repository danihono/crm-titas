/**
 * Descadastro de campanhas ("SAIR", "PARE", "SALIR", "STOP").
 *
 * Módulo próprio, e não dentro de campaigns.ts, para quebrar o ciclo de import:
 * messages.ts precisa desta checagem no ingest, e campaigns.ts já importa
 * messages.ts para gravar a mensagem enviada.
 *
 * ESTA LISTA SÓ CRESCE. O rodapé do resumo diário agora diz SALIR para quem
 * está em espanhol e STOP para quem está em inglês, mas as palavras antigas
 * ficam aceitas para sempre: quem leu "responda SAIR" há um ano não pode
 * descobrir que a palavra mudou justamente na hora de querer sair. Descadastro
 * é promessa feita ao cliente, e promessa não se versiona.
 */

const OPT_OUT_WORDS = [
  // português
  'sair', 'pare', 'parar', 'descadastrar', 'remover', 'cancelar',
  // espanhol
  'salir', 'baja', 'darse de baja', 'cancelar suscripcion',
  // inglês
  'stop', 'unsubscribe', 'opt out',
]

/** A mensagem respondida é um pedido de descadastro? Compara a resposta INTEIRA. */
export function isOptOutText(text: string): boolean {
  const clean = text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z\s]/g, '')
    .trim()
  // "sair" isolado é opt-out; "não consigo sair do sistema" não é. Por isso a
  // comparação é com a mensagem toda, e não uma busca por substring.
  return OPT_OUT_WORDS.includes(clean)
}
