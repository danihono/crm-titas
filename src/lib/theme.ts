// Paletas, mapas de cor/ícone e defaults — portados de legacy/CRM Titãs.dc.html
// (constructor: avPalette, deepMap, typeColors, typeIcons; e mapas inline de
// renderColumns/renderNewLeads/renderInvoices/renderActivities/fileVM).

import type { ActType, AgentConfig, AssistantWhatsapp } from '../types'

/**
 * Id fixo do quadro do sistema. É fixo de propósito: o painel aponta para ele
 * pelo nome.
 *
 * Mora aqui, e não em useDeals.ts, porque a tradução precisa dele
 * (src/i18n/sistema.ts) e este é o módulo de constantes puras — importar um
 * hook que abre o Firebase só para comparar uma string arrastaria o SDK inteiro
 * para dentro de quem só quer escrever um rótulo. `useDeals` reexporta, então
 * quem já importava de lá continua igual.
 */
export const LEADS_BOARD_ID = 'leads'

export const avPalette = [
  '#9a6fb8', '#7a52a0', '#b47cc4', '#6f9bcf', '#c98aab', '#5fa9c9', '#cf9b6f',
]

/** Cor "rasa" do card -> cor "profunda" do valor (renderColumns). */
export const deepMap: Record<string, string> = {
  '#6f9bcf': '#4f7fc0',
  '#b692d6': '#7a52a0',
  '#d8a960': '#b3801f',
  '#d98aab': '#c14d77',
  '#5fc9a6': '#2f9e6f',
  '#9a6fb8': '#6f4d92',
}

/** Cores selecionáveis ao criar um Tipo de atividade (modal Tipos). */
export const typeColors = [
  { color: '#2f9e6f', bg: 'rgba(95,201,166,0.16)', ev: '#5fc9a6' },
  { color: '#4f7fc0', bg: 'rgba(111,155,207,0.16)', ev: '#6f9bcf' },
  { color: '#7a52a0', bg: 'rgba(150,110,200,0.14)', ev: '#b692d6' },
  { color: '#b3801f', bg: 'rgba(216,169,96,0.18)', ev: '#d8a960' },
  { color: '#c14d77', bg: 'rgba(217,138,171,0.16)', ev: '#d98aab' },
]

export const typeIcons = [
  'call', 'groups', 'mail', 'check_circle', 'event', 'videocam',
  'description', 'attach_money', 'support_agent', 'campaign', 'handshake', 'schedule',
]

/** tag do negócio -> [cor, fundo] (renderColumns). */
export const tagMap: Record<string, [string, string]> = {
  Inbound: ['#2f9e6f', 'rgba(95,201,166,0.16)'],
  Ads: ['#b3801f', 'rgba(216,169,96,0.18)'],
  'Indicação': ['#7a52a0', 'rgba(150,110,200,0.14)'],
  LinkedIn: ['#4f7fc0', 'rgba(111,155,207,0.16)'],
  Outbound: ['#c14d77', 'rgba(217,138,171,0.16)'],
  Novo: ['#6e6780', 'rgba(28,20,50,0.06)'],
}

/** origem do lead -> [cor, fundo] (renderNewLeads). */
export const srcMap: Record<string, [string, string]> = {
  'Google Ads': ['#4f7fc0', 'rgba(111,155,207,0.16)'],
  LinkedIn: ['#7a52a0', 'rgba(150,110,200,0.14)'],
  'Indicação': ['#2f9e6f', 'rgba(95,201,166,0.16)'],
  'Orgânico': ['#b3801f', 'rgba(216,169,96,0.18)'],
}

/** tipo de arquivo -> [ícone, cor, fundo] (fileVM). */
export const fileTypeMap: Record<string, [string, string, string]> = {
  pdf: ['picture_as_pdf', '#c14d77', 'rgba(217,138,171,0.16)'],
  doc: ['description', '#4f7fc0', 'rgba(111,155,207,0.16)'],
  img: ['image', '#2f9e6f', 'rgba(95,201,166,0.16)'],
  xls: ['table_chart', '#b3801f', 'rgba(216,169,96,0.18)'],
}

/** status da nota -> [cor, fundo] (renderInvoices). */
export const invoiceStatusMap: Record<string, [string, string]> = {
  Paga: ['#2f9e6f', 'rgba(95,201,166,0.16)'],
  Pendente: ['#b3801f', 'rgba(216,169,96,0.18)'],
  Vencida: ['#c14d77', 'rgba(217,138,171,0.16)'],
}

/**
 * status da atividade -> [cor, fundo] (renderActivities).
 *
 * O rótulo saiu da tupla: ele agora vem de `rotuloStatusAtividade`
 * (src/i18n/sistema.ts), junto dos outros rótulos que o sistema escreve. Cor é
 * constante, texto é idioma — misturar os dois num lugar só fazia o arquivo de
 * paletas virar catálogo de tradução.
 */
export const activityBadgeMap: Record<string, [string, string]> = {
  pendente: ['#7a52a0', 'rgba(150,110,200,0.12)'],
  atrasada: ['#c14d77', 'rgba(217,138,171,0.16)'],
  concluida: ['#2f9e6f', 'rgba(95,201,166,0.16)'],
}

/**
 * Tipos de atividade padrão (semeados em users/{uid}/actTypes).
 *
 * Ficam em português PORQUE SÃO DADO: são gravados uma vez, no cadastro, e a
 * partir dali a pessoa pode renomeá-los. Quem decide como aparecem na tela é
 * `rotuloTipoAtividade` (src/i18n/sistema.ts), que traduz pelo id enquanto o
 * texto gravado ainda for o que foi semeado — e cala assim que alguém escrever
 * outro nome por cima.
 */
export const defaultActTypes: ActType[] = [
  { id: 'call', label: 'Ligação', icon: 'call', color: '#2f9e6f', bg: 'rgba(95,201,166,0.16)', evColor: '#5fc9a6' },
  { id: 'meeting', label: 'Reunião', icon: 'groups', color: '#4f7fc0', bg: 'rgba(111,155,207,0.16)', evColor: '#6f9bcf' },
  { id: 'email', label: 'E-mail', icon: 'mail', color: '#7a52a0', bg: 'rgba(150,110,200,0.14)', evColor: '#b692d6' },
  { id: 'task', label: 'Tarefa', icon: 'check_circle', color: '#b3801f', bg: 'rgba(216,169,96,0.18)', evColor: '#d8a960' },
]

/**
 * Resumo diário desligado — o estado de quem nunca abriu a seção.
 *
 * Existe como constante porque a tela precisa de um objeto completo para renderizar os
 * campos antes do primeiro salvamento, e `agent.whatsapp` é opcional no Firestore.
 */
export const defaultAssistantWhatsapp: AssistantWhatsapp = {
  enabled: false,
  sendAt: '07:00',
  blocks: { agenda: true, tarefas: true, faturas: true, conversas: true },
}

/**
 * Config inicial da Assistente (campo `agent` em users/{uid} — o nome do campo não mudou
 * junto com o do módulo; ver o comentário em AgentConfig).
 *
 * Só vale para quem começa agora: quem já personalizou o nome fica com o dele.
 */
export const defaultAgentConfig: AgentConfig = {
  name: 'Assistente',
  persona: 'Consultor de Vendas',
  // Sem instrução de idioma aqui: quem manda no idioma da resposta é a
  // preferência da pessoa, passada à callable e aplicada em functions/src/idioma.ts.
  // Deixar "fale em português do Brasil" cravado no padrão faria a Assistente
  // responder em português para quem pôs a tela em inglês.
  instructions:
    'Você é o assistente comercial da Titãs CRM. Analise o pipeline, contatos, atividades e conversas para sugerir próximos passos, priorizar negócios e redigir mensagens. Seja objetivo e estratégico.',
  sources: { pipeline: true, contatos: true, atividades: true, conversas: true, faturamento: false, agenda: true },
  whatsapp: defaultAssistantWhatsapp,
}

/**
 * Menu lateral, agrupado por assunto — a lista corrida de 10 itens não dizia
 * onde uma coisa estava, só que existia.
 *
 * `group` vazio = item solto no topo, sem cabeçalho (o Dashboard).
 * Configurações NÃO está aqui: é fixo no rodapé da barra (ver settingsNav).
 */
// `label` e `group` são CHAVES do catálogo, não texto: quem monta o menu passa
// as duas por t(). O grupo vazio é o item solto do topo (o Dashboard), e por
// isso o campo guarda a chave do cabeçalho em vez de um id à parte — não há
// dois nomes para a mesma coisa.
export const navDefs = [
  { id: 'dashboard', label: 'nav.dashboard', icon: 'dashboard', path: '/', group: '' },

  { id: 'pipeline', label: 'nav.pipeline', icon: 'view_kanban', path: '/pipeline', group: 'nav.grupoOperacao' },
  { id: 'contatos', label: 'nav.contatos', icon: 'forum', path: '/contatos', group: 'nav.grupoOperacao' },
  { id: 'atividades', label: 'nav.atividades', icon: 'task_alt', path: '/atividades', group: 'nav.grupoOperacao' },
  { id: 'agenda', label: 'nav.agenda', icon: 'calendar_month', path: '/agenda', group: 'nav.grupoOperacao' },

  { id: 'assistente', label: 'nav.assistente', icon: 'auto_awesome', path: '/assistente', group: 'nav.grupoCrescimento' },
  { id: 'campanhas', label: 'nav.campanhas', icon: 'campaign', path: '/campanhas', group: 'nav.grupoCrescimento' },

  { id: 'faturamento', label: 'nav.faturamento', icon: 'receipt_long', path: '/faturamento', group: 'nav.grupoGestao' },
  { id: 'relatorios', label: 'nav.relatorios', icon: 'insights', path: '/relatorios', group: 'nav.grupoGestao' },
] as const

/**
 * Itens do menu que exigem papel de gestor.
 *
 * Faturamento é lido só por gestor nas security rules; deixá-lo no menu do atendente
 * entregava uma tela que carrega vazia e um erro de permissão no console. O menu não
 * é a trava — a regra é —, mas oferecer o que vai ser negado é defeito de interface.
 */
export const navSoGestor: readonly string[] = ['faturamento']

/** Fixo no pé do menu, separado do resto — como na interface de referência. */
export const settingsNav = {
  id: 'configuracoes',
  label: 'nav.configuracoes',
  icon: 'settings',
  path: '/configuracoes',
} as const
