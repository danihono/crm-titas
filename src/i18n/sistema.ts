import { t, type Chave } from '.'
import { LEADS_BOARD_ID } from '../lib/theme'
import type { ActType, ActivityStatus, Column, InvoiceStatus, PaymentMethod } from '../types'

/**
 * A fronteira entre o que o SISTEMA escreveu e o que a PESSOA escreveu.
 *
 * A regra é uma só: traduz-se o sistema, nunca o conteúdo. Uma etiqueta, um
 * setor, um nome de quadro ou um título de card saem exatamente como foram
 * digitados, em qualquer idioma — traduzir o texto de alguém é apagá-lo.
 *
 * O complicado são os poucos rótulos que o sistema semeou DENTRO do banco.
 * Cada um resolvido aqui, e nenhum deles reescreve o Firestore: a tradução
 * acontece na hora de mostrar. Reescrever seria migração de dados, mudaria o
 * histórico que o funil já leu, e apagaria o nome que a pessoa deu depois.
 */

const ETAPAS_LEADS: Record<string, Chave> = {
  novo: 'sistema.leads.novo',
  contato: 'sistema.leads.contato',
  qualificado: 'sistema.leads.qualificado',
  proposta: 'sistema.leads.proposta',
  ganho: 'sistema.leads.ganho',
  perdido: 'sistema.leads.perdido',
}

/**
 * Título da etapa: traduzido só no quadro Leads.
 *
 * O Leads é do sistema — `travaQuadroFixo` não deixa ninguém renomear nem
 * apagar etapa dele, justamente porque o Funil de Leads do painel depende
 * desses degraus. Como ninguém escreveu esses nomes, traduzi-los não apaga o
 * texto de ninguém.
 *
 * Em qualquer outro quadro o título é da pessoa e sai cru — inclusive uma
 * etapa que ela tenha chamado de "Qualificado" por conta própria.
 */
export function tituloEtapa(boardId: string, coluna: Column): string {
  if (boardId !== LEADS_BOARD_ID) return coluna.title
  const chave = ETAPAS_LEADS[coluna.id]
  return chave ? t(chave) : coluna.title
}

/**
 * A etapa do funil do painel, que sempre lê o quadro Leads. Mesma regra do
 * `tituloEtapa`, sem precisar repetir o id do quadro em cada chamada.
 */
export function tituloEtapaLeads(id: string, titulo: string): string {
  const chave = ETAPAS_LEADS[id]
  return chave ? t(chave) : titulo
}

/** Nome do quadro: só o Leads é do sistema. */
export function nomeQuadro(id: string, nome: string): string {
  return id === LEADS_BOARD_ID ? t('sistema.leads.quadro') : nome
}

/**
 * Os quatro tipos de atividade semeados no cadastro, e o texto original deles.
 *
 * O par id→texto tem de bater para a tradução valer: se a pessoa renomeou
 * "Ligação" para "Prospecção ativa", o id continua `call`, e traduzir pelo id
 * devolveria "Llamada" — apagando a palavra dela. Comparar com o texto semeado
 * é o que separa "nunca mexeram nisso" de "isto agora é meu".
 */
const SEMEADOS: Record<string, { pt: string; chave: Chave }> = {
  call: { pt: 'Ligação', chave: 'sistema.atividade.call' },
  meeting: { pt: 'Reunião', chave: 'sistema.atividade.meeting' },
  email: { pt: 'E-mail', chave: 'sistema.atividade.email' },
  task: { pt: 'Tarefa', chave: 'sistema.atividade.task' },
}

export function rotuloTipoAtividade(tipo: Pick<ActType, 'id' | 'label'>): string {
  const semeado = SEMEADOS[tipo.id]
  if (!semeado || semeado.pt !== tipo.label) return tipo.label
  return t(semeado.chave)
}

/**
 * Status da nota. As palavras em português SÃO o valor gravado no Firestore
 * (`InvoiceStatus`), então o dado não muda — ganha um rótulo na exibição.
 */
const NOTA: Record<InvoiceStatus, Chave> = {
  Paga: 'sistema.notaPaga',
  Pendente: 'sistema.notaPendente',
  Vencida: 'sistema.notaVencida',
}

export function rotuloStatusNota(status: InvoiceStatus): string {
  return t(NOTA[status])
}

/**
 * Forma de pagamento. Como no status da nota, a palavra em português É o valor
 * gravado (`PaymentMethod`) — traduz-se o rótulo, nunca o dado.
 */
const PAGAMENTO: Record<PaymentMethod, Chave> = {
  Pix: 'sistema.pagPix',
  Boleto: 'sistema.pagBoleto',
  'Cartão': 'sistema.pagCartao',
  'Transferência': 'sistema.pagTransferencia',
  Dinheiro: 'sistema.pagDinheiro',
  Outro: 'sistema.pagOutro',
}

export function rotuloPagamento(metodo: PaymentMethod): string {
  return t(PAGAMENTO[metodo])
}

/** Status da atividade — derivado na hora, nada gravado. */
const ATIVIDADE: Record<ActivityStatus, Chave> = {
  pendente: 'sistema.atividadePendente',
  atrasada: 'sistema.atividadeAtrasada',
  concluida: 'sistema.atividadeConcluida',
}

export function rotuloStatusAtividade(status: ActivityStatus): string {
  return t(ATIVIDADE[status])
}
