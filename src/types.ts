// Tipos de domínio do CRM (lado app — datas já convertidas para Date pelos converters).
// Espelham o modelo Firestore users/{uid}/... do plano.

export type FileType = 'pdf' | 'doc' | 'img' | 'xls'
export type ActivityStatus = 'pendente' | 'atrasada' | 'concluida'
export type InvoiceStatus = 'Paga' | 'Pendente' | 'Vencida'
export type AgentRole = 'agent' | 'user'
export type ContactNameSource = 'phone' | 'profile' | 'manual'

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
  lastMessage?: string
  lastMessageAt?: Date
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
}
