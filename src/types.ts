// Tipos de domínio do CRM (lado app — datas já convertidas para Date pelos converters).
// Espelham o modelo Firestore users/{uid}/... do plano.

export type FileType = 'pdf' | 'doc' | 'img' | 'xls'
export type ActivityStatus = 'pendente' | 'atrasada' | 'concluida'
export type InvoiceStatus = 'Paga' | 'Pendente' | 'Vencida'
export type AgentRole = 'agent' | 'user'
export type ContactNameSource = 'phone' | 'profile' | 'agenda' | 'manual'
export type HistoryImportStatus = 'loading' | 'done' | 'error'
/** Origem da foto do contato: migrada do WhatsApp, enviada à mão, ou removida pelo usuário. */
export type PhotoSource = 'whatsapp' | 'manual' | 'removed'

/** Estado da recuperação de histórico antigo do WhatsApp de um contato. */
export interface HistoryImport {
  status: HistoryImportStatus
  /** total de mensagens trazidas nas respostas on-demand. */
  imported?: number
  error?: string
  at?: Date
}

/** Estado da recuperação das mídias que ficaram sem arquivo salvo. */
export interface MediaRecovery {
  status: HistoryImportStatus
  /** mensagens que a rodada tentou. */
  total?: number
  recovered?: number
  failed?: number
  /** código dominante da falha — diz se adianta tentar de novo (ex.: storage_denied não). */
  error?: string
  at?: Date
}

export interface Column {
  id: string
  title: string
  color: string
  order: number
}

export interface Board {
  id: string
  name: string
  icon: string
  columns: Column[]
  createdAt?: Date
}

/** Card do Kanban — normalizado em users/{uid}/deals. value em reais (inteiro). */
export interface Deal {
  id: string
  company: string
  contact: string
  value: number
  initials: string
  tag: string
  boardId: string
  columnId: string
  order: number
  createdAt?: Date
}

/** Tipo de caixa do fluxograma — define a cor da faixa e o ícone. */
export type FlowNodeKind = 'start' | 'step' | 'decision' | 'end'
/** Como o fluxo nasceu: desenhado à mão ou gerado pelo Titã IA. */
export type FlowSource = 'manual' | 'ia'

/** Caixa do quadro de fluxos. x/y em coordenadas do canvas. */
export interface FlowNode {
  id: string
  title: string
  subtitle: string
  kind: FlowNodeKind
  x: number
  y: number
}

/** Seta ligando duas caixas. `label` vazio = seta sem rótulo. */
export interface FlowEdge {
  id: string
  from: string
  to: string
  label: string
}

/**
 * Fluxograma livre — um doc por fluxo em users/{uid}/flows, com nós e setas
 * embutidos (mesma escolha de Board.columns: são poucos e salvam juntos).
 */
export interface Flow {
  id: string
  name: string
  description: string
  nodes: FlowNode[]
  edges: FlowEdge[]
  source: FlowSource
  createdAt?: Date
  updatedAt?: Date
}

/** Papéis dentro de um tenant. `dono` é quem criou a conta; os demais entram por convite. */
export type MemberRole = 'dono' | 'gestor' | 'atendente'

/**
 * Atendente com acesso ao tenant — users/{tenantUid}/members/{memberUid}.
 * O id do doc É o uid do Auth: as security rules checam vínculo por
 * exists(.../members/$(request.auth.uid)), e isso só funciona com o uid na chave.
 */
export interface Member {
  id: string
  name: string
  email: string
  role: MemberRole
  /** Setores em que o atendente atua. Vazio = todos. */
  sectorIds: string[]
  active: boolean
  /** Nome do tenant, desnormalizado — o atendente lista os vínculos dele sem ler cada dono. */
  tenantName?: string
  createdAt?: Date
}

/** Convite pendente — invites/{email}, criado pelo tenant e aceito pelo convidado. */
export interface Invite {
  id: string
  email: string
  tenantUid: string
  tenantName: string
  role: MemberRole
  sectorIds: string[]
  createdAt?: Date
}

/** Fila/departamento de atendimento (Comercial, Suporte, Financeiro...). */
export interface Sector {
  id: string
  name: string
  color: string
  /** Mensagem automática ao transferir a conversa para o setor. Vazio = nenhuma. */
  greeting: string
  order: number
  createdAt?: Date
}

/** Etiqueta aplicável a contatos/conversas. */
export interface Tag {
  id: string
  label: string
  color: string
  order: number
  createdAt?: Date
}

/** Resposta pronta, chamada no chat por `/atalho`. Suporta variáveis {{nome}}. */
export interface QuickReply {
  id: string
  shortcut: string
  title: string
  text: string
  sectorId: string
  createdAt?: Date
}

export type CustomFieldType = 'texto' | 'numero' | 'data' | 'lista' | 'booleano'

/** Campo extra do cadastro de contato — o valor fica em Contact.custom[fieldId]. */
export interface CustomField {
  id: string
  label: string
  type: CustomFieldType
  /** Opções quando type === 'lista'. */
  options: string[]
  order: number
  createdAt?: Date
}

/**
 * Janela de atendimento de um dia. `open`/`close` em "HH:MM".
 * Fora da janela o CRM avisa o atendente e o chatbot responde a mensagem de ausência.
 */
export interface DayHours {
  enabled: boolean
  open: string
  close: string
}

/** Horários de atendimento, domingo (0) a sábado (6). */
export interface BusinessHours {
  days: DayHours[]
  /** Resposta automática fora do horário. Vazio = não responde. */
  awayMessage: string
  timezone: string
}

/** Estado do atendimento, espelhando as abas Entrada · Esperando · Finalizados. */
export type ConvStatus = 'entrada' | 'esperando' | 'finalizado'

/**
 * Atendimento corrente do contato — gravado como mapa `conv` no PRÓPRIO doc do contato.
 * Fica junto (e não em coleção separada) porque a lista de conversas e a lista de
 * contatos são a mesma tela: assim a caixa de entrada continua sendo UMA consulta.
 */
export interface ConvState {
  status: ConvStatus
  /** Doc correspondente em users/{uid}/conversations — o ciclo atual no histórico. */
  recordId: string
  /** uid do atendente responsável. Vazio = na fila, sem dono. */
  assignedTo: string
  assignedName: string
  sectorId: string
  tagIds: string[]
  openedAt?: Date
  /** Primeira resposta NOSSA depois que o cliente escreveu — base do relatório. */
  firstResponseAt?: Date
  closedAt?: Date
  closedBy?: string
}

/**
 * Ciclo de atendimento — users/{uid}/conversations/{convId}.
 * Só existe para os Relatórios: o mapa `conv` do contato guarda apenas o ciclo atual,
 * e "conversas finalizadas no período" precisa do histórico. Fica numa coleção PLANA do
 * tenant (e não sob o contato) para o relatório ser uma consulta simples, sem
 * collectionGroup — que exigiria regra baseada em `resource.data` e não fecharia para
 * atendentes convidados.
 */
export interface ConversationRecord {
  id: string
  contactId: string
  contactName: string
  assignedTo: string
  assignedName: string
  sectorId: string
  tagIds: string[]
  openedAt: Date
  firstResponseAt?: Date
  closedAt?: Date
  closedBy?: string
  /** Nota de 1 a 5 da pesquisa de satisfação, quando respondida. */
  rating?: number
}

export interface Contact {
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
  /** Origem do contato: 'whatsapp' quando auto-criado pelo espelhamento (expurgo LGPD). */
  source?: string
  /** Origem do nome exibido no contato. */
  nameSource?: ContactNameSource
  /** URL da foto do contato (migrada do WhatsApp ou enviada à mão). Vazio = usa iniciais. */
  photoUrl?: string
  /** Caminho da foto no Storage (para remover/substituir). */
  photoPath?: string
  /** Origem da foto — controla se o daemon pode sobrescrever (respeita 'manual'/'removed'). */
  photoSource?: PhotoSource
  /** Estado da recuperação de histórico antigo do WhatsApp (por contato). */
  historyImport?: HistoryImport
  mediaRecovery?: MediaRecovery
  lastMessage?: string
  lastMessageAt?: Date
  /** Mensagens recebidas desde a última vez que a conversa foi aberta. */
  unreadCount?: number
  /** Atendimento corrente. Ausente em contatos criados antes dos módulos de atendimento. */
  conv?: ConvState
  /** Valores dos campos personalizados, por id do CustomField. */
  custom?: Record<string, string>
  createdAt?: Date
}

export interface Message {
  id: string
  fromMe: boolean
  text: string
  sentAt: Date
  mediaType?: 'image' | 'video' | 'audio' | 'document' | 'sticker'
  mediaUrl?: string
  mediaPath?: string
  mimeType?: string
  fileName?: string
  sizeBytes?: number
  caption?: string
  /**
   * Por que a mídia não tem arquivo. Fica `string` de propósito, e não uma união: docs
   * antigos carregam códigos anteriores a esta lista, e estreitar o tipo os quebraria.
   * Hoje: 'view_once_unsupported' | 'download_failed' | 'wa_media_expired'
   *     | 'storage_denied' | 'storage_failed'
   */
  mediaError?: string
  importedFromHistory?: boolean
  /** true quando a mídia ainda não está disponível para renderização/download. */
  pending?: boolean
  /** Canal de origem: 'whatsapp' para mensagens espelhadas. */
  channel?: string
}

export interface FileMeta {
  id: string
  name: string
  type: FileType
  sizeBytes: number
  storagePath: string
  downloadURL: string
  uploadedAt: Date
}

export interface Activity {
  id: string
  /** id de um ActType */
  type: string
  title: string
  contact: string
  dueAt: Date
  done: boolean
  createdAt?: Date
}

export interface ActType {
  id: string
  label: string
  icon: string
  color: string
  bg: string
  evColor: string
}

export interface Invoice {
  id: string
  num: string
  client: string
  value: number
  dueAt: Date
  status: InvoiceStatus
  createdAt?: Date
}

export interface EventDoc {
  id: string
  title: string
  date: Date
  dateKey: string
  time: string
  color: string
  subtitle: string
  activityId?: string
  scheduledMessageId?: string
  createdAt?: Date
}

export type ScheduledMessageStatus = 'pending' | 'sent' | 'failed' | 'canceled'

export interface ScheduledMessage {
  id: string
  contactId: string
  contactName: string
  text: string
  dueAt: Date
  dateKey: string
  time: string
  eventId?: string
  status: ScheduledMessageStatus
  attempts: number
  lastError?: string
  sentMessageId?: string
  sentAt?: Date
  createdAt?: Date
  updatedAt?: Date
}

export interface Lead {
  id: string
  name: string
  company: string
  initials: string
  source: string
  value: number
  createdAt?: Date
}

export interface AgentSources {
  pipeline: boolean
  contatos: boolean
  atividades: boolean
  conversas: boolean
  faturamento: boolean
}

export interface AgentConfig {
  name: string
  persona: string
  instructions: string
  sources: AgentSources
}

export interface AgentMessage {
  id: string
  role: AgentRole
  text: string
  createdAt?: Date
}

export interface Features {
  /** Espelhamento de WhatsApp habilitado para este tenant (feature-flag "no escuro"). */
  whatsapp?: boolean
}

export interface UserProfile {
  displayName: string
  role: string
  agent: AgentConfig
  features?: Features
  /** Nome da empresa/organização — cabeçalho de Configurações e dos convites. */
  orgName?: string
  businessHours?: BusinessHours
}
