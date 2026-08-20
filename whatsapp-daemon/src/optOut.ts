/**
 * Descadastro de campanhas ("SAIR", "PARE").
 *
 * Módulo próprio, e não dentro de campaigns.ts, para quebrar o ciclo de import:
 * messages.ts precisa desta checagem no ingest, e campaigns.ts já importa
 * messages.ts para gravar a mensagem enviada.
 */

const OPT_OUT_WORDS = ['sair', 'pare', 'parar', 'descadastrar', 'remover', 'stop', 'cancelar']

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
