// Dados de exemplo portados de legacy/CRM Titãs.dc.html (constructor/state, linhas ~870-998),
// já no formato novo: valores em REAIS (número) e datas como OFFSETS relativos a "hoje"
// (resolvidos para Timestamp em seed.ts), para o demo ficar sempre "vivo".

export interface At { d: number; hh: number; mm: number } // d = offset em dias a partir de hoje

export const boards = [
  {
    id: 'b1',
    name: 'Funil de Vendas',
    icon: 'monetization_on',
    columns: [
      { id: 'lead', title: 'Lead', color: '#6f9bcf', order: 0 },
      { id: 'qual', title: 'Qualificado', color: '#b692d6', order: 1 },
      { id: 'prop', title: 'Proposta', color: '#d8a960', order: 2 },
      { id: 'nego', title: 'Negociação', color: '#d98aab', order: 3 },
      { id: 'fech', title: 'Fechado', color: '#5fc9a6', order: 4 },
    ],
  },
  {
    id: 'b2',
    name: 'Pós-venda',
    icon: 'support_agent',
    columns: [
      { id: 'pv1', title: 'Onboarding', color: '#6f9bcf', order: 0 },
      { id: 'pv2', title: 'Implantação', color: '#b692d6', order: 1 },
      { id: 'pv3', title: 'Adoção', color: '#d8a960', order: 2 },
      { id: 'pv4', title: 'Renovação', color: '#5fc9a6', order: 3 },
    ],
  },
]

export const deals = [
  { id: 'k1', boardId: 'b1', columnId: 'lead', company: 'Nexa Software', contact: 'Marina Alves', value: 12000, initials: 'MA', tag: 'Inbound', order: 0 },
  { id: 'k2', boardId: 'b1', columnId: 'lead', company: 'Orbita Labs', contact: 'Tiago Rocha', value: 8500, initials: 'TR', tag: 'Ads', order: 1 },
  { id: 'k3', boardId: 'b1', columnId: 'qual', company: 'Vortex SaaS', contact: 'Camila Dias', value: 24000, initials: 'CD', tag: 'Indicação', order: 0 },
  { id: 'k4', boardId: 'b1', columnId: 'qual', company: 'Lumen Tech', contact: 'Bruno Sá', value: 15200, initials: 'BS', tag: 'LinkedIn', order: 1 },
  { id: 'k5', boardId: 'b1', columnId: 'prop', company: 'Hélix Data', contact: 'Paula Nunes', value: 31000, initials: 'PN', tag: 'Outbound', order: 0 },
  { id: 'k6', boardId: 'b1', columnId: 'prop', company: 'Quanta IO', contact: 'Léo Martins', value: 9800, initials: 'LM', tag: 'Ads', order: 1 },
  { id: 'k7', boardId: 'b1', columnId: 'nego', company: 'Atlas Cloud', contact: 'Rafa Lima', value: 48000, initials: 'RL', tag: 'Indicação', order: 0 },
  { id: 'k8', boardId: 'b1', columnId: 'fech', company: 'Pulse Apps', contact: 'Nina Costa', value: 18500, initials: 'NC', tag: 'Inbound', order: 0 },
  { id: 'p1', boardId: 'b2', columnId: 'pv1', company: 'Atlas Cloud', contact: 'Rafa Lima', value: 48000, initials: 'RL', tag: 'Indicação', order: 0 },
  { id: 'p2', boardId: 'b2', columnId: 'pv2', company: 'Pulse Apps', contact: 'Nina Costa', value: 18500, initials: 'NC', tag: 'Inbound', order: 0 },
  { id: 'p3', boardId: 'b2', columnId: 'pv4', company: 'Vortex SaaS', contact: 'Camila Dias', value: 24000, initials: 'CD', tag: 'Indicação', order: 0 },
]

export interface SeedContact {
  id: string
  name: string
  company: string
  initials: string
  online: boolean
  role: string
  email: string
  phone: string
  whatsapp: string
  status: string
  lastMessage: string
  lastMessageAt: At
}

export const contacts: SeedContact[] = [
  { id: 'c1', name: 'Marina Alves', company: 'Nexa Software', initials: 'MA', online: true, role: 'Head de Marketing', email: 'marina@nexasoftware.com', phone: '+55 11 98712-4455', whatsapp: '+55 11 98712-4455', status: 'online agora', lastMessage: 'Perfeito, pode enviar a proposta!', lastMessageAt: { d: 0, hh: 14, mm: 2 } },
  { id: 'c2', name: 'Tiago Rocha', company: 'Orbita Labs', initials: 'TR', online: false, role: 'CTO', email: 'tiago@orbitalabs.com', phone: '+55 21 99654-1020', whatsapp: '+55 21 99654-1020', status: 'visto por último às 12:40', lastMessage: 'Vou analisar com o time e retorno.', lastMessageAt: { d: 0, hh: 12, mm: 40 } },
  { id: 'c3', name: 'Camila Dias', company: 'Vortex SaaS', initials: 'CD', online: true, role: 'Gerente de Produto', email: 'camila@vortexsaas.com', phone: '+55 11 98123-7788', whatsapp: '+55 11 98123-7788', status: 'online agora', lastMessage: 'Qual o prazo de implementação?', lastMessageAt: { d: 0, hh: 11, mm: 18 } },
  { id: 'c4', name: 'Bruno Sá', company: 'Lumen Tech', initials: 'BS', online: false, role: 'Diretor Comercial', email: 'bruno@lumentech.com', phone: '+55 31 99888-2031', whatsapp: '+55 31 99888-2031', status: 'visto por último ontem', lastMessage: 'Obrigado pela demo, ficou claro.', lastMessageAt: { d: -1, hh: 17, mm: 10 } },
  { id: 'c5', name: 'Paula Nunes', company: 'Hélix Data', initials: 'PN', online: false, role: 'Financeiro', email: 'paula@helixdata.com', phone: '+55 11 97777-6655', whatsapp: '+55 11 97777-6655', status: 'visto por último ontem', lastMessage: 'A nota chegou, está em aprovação.', lastMessageAt: { d: -1, hh: 9, mm: 30 } },
  { id: 'c6', name: 'Rafa Lima', company: 'Atlas Cloud', initials: 'RL', online: true, role: 'CEO', email: 'rafa@atlascloud.com', phone: '+55 11 96543-2211', whatsapp: '+55 11 96543-2211', status: 'online agora', lastMessage: 'Fechado! Vamos seguir 🚀', lastMessageAt: { d: -4, hh: 10, mm: 12 } },
]

export interface SeedMessage { fromMe: boolean; text: string; at: At }

export const threads: Record<string, SeedMessage[]> = {
  c1: [
    { fromMe: false, text: 'Oi Rafael! Recebi o material que você enviou, ficou muito bom.', at: { d: 0, hh: 13, mm: 40 } },
    { fromMe: true, text: 'Que ótimo, Marina! Fico feliz que tenha gostado. Posso montar a proposta com base no plano Enterprise?', at: { d: 0, hh: 13, mm: 52 } },
    { fromMe: false, text: 'Pode sim. Esse plano cobre os 3 ambientes que conversamos?', at: { d: 0, hh: 13, mm: 58 } },
    { fromMe: true, text: 'Cobre sim — produção, homologação e dev, todos com suporte prioritário.', at: { d: 0, hh: 14, mm: 0 } },
    { fromMe: false, text: 'Perfeito, pode enviar a proposta!', at: { d: 0, hh: 14, mm: 2 } },
  ],
  c2: [{ fromMe: false, text: 'Vou analisar com o time e retorno.', at: { d: 0, hh: 12, mm: 40 } }],
  c3: [{ fromMe: false, text: 'Qual o prazo de implementação?', at: { d: 0, hh: 11, mm: 18 } }],
  c4: [{ fromMe: false, text: 'Obrigado pela demo, ficou claro.', at: { d: -1, hh: 17, mm: 10 } }],
  c5: [{ fromMe: false, text: 'A nota chegou, está em aprovação.', at: { d: -1, hh: 9, mm: 30 } }],
  c6: [{ fromMe: false, text: 'Fechado! Vamos seguir 🚀', at: { d: -4, hh: 10, mm: 12 } }],
}

export const files: Record<string, { id: string; name: string; type: 'pdf' | 'doc' | 'img' | 'xls'; sizeBytes: number; at: At }[]> = {
  c1: [
    { id: 'f1', name: 'Proposta_Enterprise.pdf', type: 'pdf', sizeBytes: 2_400_000, at: { d: -2, hh: 10, mm: 0 } },
    { id: 'f2', name: 'Briefing_Marca.docx', type: 'doc', sizeBytes: 180_000, at: { d: -8, hh: 9, mm: 0 } },
    { id: 'f3', name: 'Mockup_Home.png', type: 'img', sizeBytes: 1_100_000, at: { d: -14, hh: 16, mm: 0 } },
  ],
  c3: [{ id: 'f4', name: 'Requisitos_Integração.pdf', type: 'pdf', sizeBytes: 920_000, at: { d: -6, hh: 11, mm: 0 } }],
  c6: [
    { id: 'f5', name: 'Contrato_Assinado.pdf', type: 'pdf', sizeBytes: 3_100_000, at: { d: -16, hh: 14, mm: 0 } },
    { id: 'f6', name: 'NF_1048.pdf', type: 'pdf', sizeBytes: 140_000, at: { d: -16, hh: 14, mm: 5 } },
  ],
}

export interface SeedActivity { id: string; type: string; title: string; contact: string; due: At; done: boolean }

export const activities: SeedActivity[] = [
  { id: 'a1', type: 'call', title: 'Ligar para Marina (follow-up proposta)', contact: 'Nexa Software', due: { d: 0, hh: 14, mm: 0 }, done: false },
  { id: 'a2', type: 'meeting', title: 'Reunião de fechamento Atlas Cloud', contact: 'Atlas Cloud', due: { d: 0, hh: 16, mm: 30 }, done: false },
  { id: 'a3', type: 'email', title: 'Enviar contrato para Vortex SaaS', contact: 'Vortex SaaS', due: { d: 1, hh: 9, mm: 0 }, done: false },
  { id: 'a4', type: 'task', title: 'Atualizar pipeline semanal', contact: 'Interno', due: { d: -1, hh: 10, mm: 0 }, done: false },
  { id: 'a5', type: 'call', title: 'Retornar ligação do Tiago', contact: 'Orbita Labs', due: { d: -1, hh: 11, mm: 0 }, done: true },
  { id: 'a6', type: 'meeting', title: 'Demo de produto — Lumen Tech', contact: 'Lumen Tech', due: { d: 1, hh: 11, mm: 0 }, done: false },
  { id: 'a7', type: 'email', title: 'Cobrança da nota #1046', contact: 'Hélix Data', due: { d: -1, hh: 16, mm: 0 }, done: true },
  { id: 'a8', type: 'task', title: 'Preparar apresentação Q3', contact: 'Interno', due: { d: 4, hh: 15, mm: 0 }, done: false },
]

export interface SeedInvoice { id: string; num: string; client: string; value: number; due: At; status: 'Paga' | 'Pendente' | 'Vencida' }

export const invoices: SeedInvoice[] = [
  { id: 'i1', num: '#1048', client: 'Atlas Cloud', value: 48000, due: { d: -16, hh: 0, mm: 0 }, status: 'Paga' },
  { id: 'i2', num: '#1047', client: 'Vortex SaaS', value: 24000, due: { d: 2, hh: 0, mm: 0 }, status: 'Pendente' },
  { id: 'i3', num: '#1046', client: 'Hélix Data', value: 31000, due: { d: -6, hh: 0, mm: 0 }, status: 'Vencida' },
  { id: 'i4', num: '#1045', client: 'Pulse Apps', value: 18500, due: { d: -21, hh: 0, mm: 0 }, status: 'Paga' },
  { id: 'i5', num: '#1044', client: 'Lumen Tech', value: 15200, due: { d: 6, hh: 0, mm: 0 }, status: 'Pendente' },
  { id: 'i6', num: '#1043', client: 'Nexa Software', value: 12000, due: { d: 4, hh: 0, mm: 0 }, status: 'Pendente' },
]

export interface SeedEvent { id: string; title: string; at: At; color: string; subtitle: string }

export const events: SeedEvent[] = [
  { id: 'e1', title: 'Workshop de vendas', at: { d: -14, hh: 9, mm: 0 }, color: '#d8a960', subtitle: 'Time comercial · Sala 2' },
  { id: 'e2', title: 'Call Vortex SaaS', at: { d: -8, hh: 10, mm: 30 }, color: '#b692d6', subtitle: 'Camila Dias · Google Meet' },
  { id: 'e3', title: 'Follow-up Marina', at: { d: 0, hh: 14, mm: 0 }, color: '#b692d6', subtitle: 'Nexa Software · Ligação' },
  { id: 'e4', title: 'Reunião Atlas Cloud', at: { d: 0, hh: 16, mm: 30 }, color: '#6f9bcf', subtitle: 'Fechamento · Presencial' },
  { id: 'e5', title: 'Demo Lumen Tech', at: { d: 1, hh: 11, mm: 0 }, color: '#5fc9a6', subtitle: 'Bruno Sá · Zoom' },
  { id: 'e6', title: 'Apresentação Q3', at: { d: 4, hh: 15, mm: 0 }, color: '#d98aab', subtitle: 'Diretoria · Auditório' },
]

export interface SeedLead { id: string; name: string; company: string; initials: string; source: string; value: number; createdAt: At }

export const leads: SeedLead[] = [
  { id: 'l1', name: 'Joana Reis', company: 'Skyline Co.', initials: 'JR', source: 'Google Ads', value: 9500, createdAt: { d: 0, hh: -2, mm: 0 } },
  { id: 'l2', name: 'Pedro Maia', company: 'Nuvex', initials: 'PM', source: 'LinkedIn', value: 14000, createdAt: { d: 0, hh: -5, mm: 0 } },
  { id: 'l3', name: 'Aline Souza', company: 'DataForge', initials: 'AS', source: 'Indicação', value: 22000, createdAt: { d: -1, hh: 0, mm: 0 } },
  { id: 'l4', name: 'Caio Lima', company: 'Bright Labs', initials: 'CL', source: 'Orgânico', value: 7800, createdAt: { d: -1, hh: 0, mm: 0 } },
]
