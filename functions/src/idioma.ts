/**
 * Os três idiomas, do lado do servidor.
 *
 * O cliente manda `idioma` no payload de cada callable (ver src/hooks/*.ts). Aqui
 * ele serve a duas coisas:
 *
 *  1. dizer ao modelo em que idioma responder — antes estava cravado
 *     "responda em português do Brasil" nos prompts, então a Assistente
 *     respondia em português para quem pôs a tela em inglês;
 *  2. escolher a mensagem de erro, que chega ao usuário pelo `alert(e.message)`
 *     da tela e por isso é texto de interface, não log.
 *
 * Idioma desconhecido cai no português: um payload torto não pode virar tela
 * sem texto.
 */

export type Idioma = 'pt' | 'es' | 'en'

export function normalizarIdioma(v: unknown): Idioma {
  return v === 'es' || v === 'en' ? v : 'pt'
}

/**
 * A instrução de idioma vai no idioma de DESTINO de propósito: o modelo obedece
 * melhor a "Answer in English" do que a "responda em inglês".
 */
export const INSTRUCAO_IDIOMA: Record<Idioma, string> = {
  pt: 'Responda em português do Brasil.',
  es: 'Responde en español.',
  en: 'Answer in English.',
}

type Tri = { pt: string; es: string; en: string }

/**
 * Mensagens que chegam à tela. Mesma disciplina do catálogo do cliente: os três
 * idiomas na mesma linha, para uma tradução esquecida ser impossível de não ver.
 */
const MENSAGENS = {
  facaLogin: {
    pt: 'Faça login para usar o Titã IA.',
    es: 'Inicia sesión para usar Titã IA.',
    en: 'Sign in to use Titã AI.',
  },
  facaLoginSimples: {
    pt: 'Faça login para continuar.',
    es: 'Inicia sesión para continuar.',
    en: 'Sign in to continue.',
  },
  historicoGrande: {
    pt: 'Histórico grande demais.',
    es: 'Historial demasiado grande.',
    en: 'The history is too large.',
  },
  perguntaVazia: {
    pt: 'Pergunta vazia.',
    es: 'Pregunta vacía.',
    en: 'The question is empty.',
  },
  perguntaLonga: {
    pt: 'Pergunta longa demais.',
    es: 'Pregunta demasiado larga.',
    en: 'The question is too long.',
  },
  naoRespondeu: {
    pt: 'O Titã IA não conseguiu responder isso. Tente reformular a pergunta.',
    es: 'Titã IA no logró responder eso. Intenta reformular la pregunta.',
    en: "Titã AI couldn't answer that. Try rephrasing the question.",
  },
  naoConsultou: {
    pt: 'Não foi possível consultar o Titã IA agora.',
    es: 'No se pudo consultar a Titã IA ahora.',
    en: "Titã AI couldn't be reached right now.",
  },
  conversaVazia: {
    pt: 'Conversa vazia — não há o que sugerir.',
    es: 'Conversación vacía — no hay nada que sugerir.',
    en: 'The conversation is empty — there is nothing to suggest.',
  },
  conversaGrande: {
    pt: 'Conversa grande demais.',
    es: 'Conversación demasiado grande.',
    en: 'The conversation is too large.',
  },
  semTipos: {
    pt: 'Nenhum tipo de atividade disponível.',
    es: 'Ningún tipo de actividad disponible.',
    en: 'No activity type available.',
  },
  hojeInvalido: {
    pt: 'Data de hoje ausente ou fora do formato.',
    es: 'Falta la fecha de hoy o tiene un formato inválido.',
    en: "Today's date is missing or malformed.",
  },
  conversaSemTexto: {
    pt: 'Conversa sem texto — não há o que sugerir.',
    es: 'Conversación sin texto — no hay nada que sugerir.',
    en: 'The conversation has no text — there is nothing to suggest.',
  },
  semTiposValidos: {
    pt: 'Nenhum tipo de atividade válido.',
    es: 'Ningún tipo de actividad válido.',
    en: 'No valid activity type.',
  },
  naoSugeriu: {
    pt: 'O Titã IA não conseguiu sugerir uma tarefa para esta conversa.',
    es: 'Titã IA no logró sugerir una tarea para esta conversación.',
    en: "Titã AI couldn't suggest a task for this conversation.",
  },
  descrevaFluxo: {
    pt: 'Descreva o fluxo que você quer.',
    es: 'Describe el flujo que quieres.',
    en: 'Describe the flow you want.',
  },
  descricaoLonga: {
    pt: 'Descrição longa demais.',
    es: 'Descripción demasiado larga.',
    en: 'The description is too long.',
  },
  naoMontouFluxo: {
    pt: 'O Titã IA não conseguiu montar o fluxo agora.',
    es: 'Titã IA no logró armar el flujo ahora.',
    en: "Titã AI couldn't build the flow right now.",
  },
  naoGerouFluxo: {
    pt: 'Não foi possível gerar o fluxo agora.',
    es: 'No se pudo generar el flujo ahora.',
    en: "The flow couldn't be generated right now.",
  },
  soDonoExclui: {
    pt: 'Apenas o dono do sistema pode excluir clientes.',
    es: 'Solo el dueño del sistema puede eliminar clientes.',
    en: 'Only the system owner can delete clients.',
  },
  uidAusente: {
    pt: 'uid do cliente não informado.',
    es: 'uid del cliente no informado.',
    en: "The client's uid was not provided.",
  },
  naoExcluiPropria: {
    pt: 'Você não pode excluir a própria conta por aqui.',
    es: 'No puedes eliminar tu propia cuenta por aquí.',
    en: "You can't delete your own account from here.",
  },
  naoExcluiDono: {
    pt: 'Contas de dono do sistema não podem ser excluídas por aqui.',
    es: 'Las cuentas de dueño del sistema no se pueden eliminar por aquí.',
    en: "System-owner accounts can't be deleted from here.",
  },
  soDonoVeMetricas: {
    pt: 'Apenas o dono do sistema vê estas métricas.',
    es: 'Solo el dueño del sistema ve estas métricas.',
    en: 'Only the system owner sees these metrics.',
  },
  ambienteOuPessoa: {
    pt: 'Ambiente ou pessoa não informados.',
    es: 'Entorno o persona no informados.',
    en: 'Workspace or person not provided.',
  },
  soGestorRevoga: {
    pt: 'Apenas quem administra o ambiente pode revogar acessos.',
    es: 'Solo quien administra el entorno puede revocar accesos.',
    en: 'Only whoever administers the workspace can revoke access.',
  },
  titularNaoRevoga: {
    pt: 'O titular do ambiente não pode ter o acesso revogado.',
    es: "Al titular del entorno no se le puede revocar el acceso.",
    en: "The workspace holder's access can't be revoked.",
  },
  naoEncerrouSessoes: {
    pt: 'Não foi possível encerrar as sessões desta pessoa.',
    es: 'No se pudieron cerrar las sesiones de esta persona.',
    en: "This person's sessions couldn't be ended.",
  },
} satisfies Record<string, Tri>

export type ChaveMensagem = keyof typeof MENSAGENS

export function msg(chave: ChaveMensagem, idioma: Idioma): string {
  return MENSAGENS[chave][idioma]
}
