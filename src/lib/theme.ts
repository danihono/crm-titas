// Paletas, mapas de cor/ícone e defaults — portados de legacy/CRM Titãs.dc.html
// (constructor: avPalette, deepMap, typeColors, typeIcons; e mapas inline de
// renderColumns/renderNewLeads/renderInvoices/renderActivities/fileVM).

import type { ActType, AgentConfig } from '../types'

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

/** status da atividade -> [cor, fundo, label] (renderActivities). */
export const activityBadgeMap: Record<string, [string, string, string]> = {
  pendente: ['#7a52a0', 'rgba(150,110,200,0.12)', 'Pendente'],
  atrasada: ['#c14d77', 'rgba(217,138,171,0.16)', 'Atrasada'],
  concluida: ['#2f9e6f', 'rgba(95,201,166,0.16)', 'Concluída'],
}

/** Tipos de atividade padrão (semeados em users/{uid}/actTypes). */
export const defaultActTypes: ActType[] = [
  { id: 'call', label: 'Ligação', icon: 'call', color: '#2f9e6f', bg: 'rgba(95,201,166,0.16)', evColor: '#5fc9a6' },
  { id: 'meeting', label: 'Reunião', icon: 'groups', color: '#4f7fc0', bg: 'rgba(111,155,207,0.16)', evColor: '#6f9bcf' },
  { id: 'email', label: 'E-mail', icon: 'mail', color: '#7a52a0', bg: 'rgba(150,110,200,0.14)', evColor: '#b692d6' },
  { id: 'task', label: 'Tarefa', icon: 'check_circle', color: '#b3801f', bg: 'rgba(216,169,96,0.18)', evColor: '#d8a960' },
]

/** Config inicial do agente Titã IA (campo agent em users/{uid}). */
export const defaultAgentConfig: AgentConfig = {
  name: 'Titã IA',
  persona: 'Consultor de Vendas',
  instructions:
    'Você é o assistente comercial da Titãs CRM. Analise o pipeline, contatos, atividades e conversas para sugerir próximos passos, priorizar negócios e redigir mensagens. Seja objetivo, estratégico e fale em português do Brasil.',
  sources: { pipeline: true, contatos: true, atividades: true, conversas: true, faturamento: false },
}

export const navDefs = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', path: '/' },
  { id: 'pipeline', label: 'Pipeline', icon: 'view_kanban', path: '/pipeline' },
  { id: 'contatos', label: 'Contatos', icon: 'forum', path: '/contatos' },
  { id: 'atividades', label: 'Atividades', icon: 'task_alt', path: '/atividades' },
  { id: 'faturamento', label: 'Faturamento', icon: 'receipt_long', path: '/faturamento' },
  { id: 'agenda', label: 'Agenda', icon: 'calendar_month', path: '/agenda' },
  { id: 'agente', label: 'Agente de IA', icon: 'auto_awesome', path: '/agente' },
] as const
