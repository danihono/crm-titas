import { Timestamp, type DocumentData } from 'firebase/firestore'
import type {
  Board, Deal, Contact, Message, FileMeta, Activity, ActType,
  Invoice, EventDoc, Lead, AgentConfig, AgentMessage, UserProfile, FileType, InvoiceStatus,
  ScheduledMessage, ScheduledMessageStatus, ContactNameSource, HistoryImport, HistoryImportStatus, PhotoSource,
  MediaRecovery, Flow, FlowNode, FlowEdge, FlowNodeKind,
  Member, MemberRole, Invite, Sector, Tag, QuickReply, CustomField, CustomFieldType,
  BusinessHours, DayHours, ConvState, ConvStatus, ConversationRecord,
  Campaign, CampaignStatus, CampaignTarget, CampaignTargetStatus,
  Variable, MediaAsset, KnowledgeDoc, UserPrefs,
} from '../types'

function toDate(v: unknown): Date | undefined {
  if (v instanceof Timestamp) return v.toDate()
  if (v instanceof Date) return v
  return undefined
}

function toContactNameSource(v: unknown): ContactNameSource | undefined {
  return v === 'phone' || v === 'profile' || v === 'agenda' || v === 'manual' ? v : undefined
}

function toPhotoSource(v: unknown): PhotoSource | undefined {
  return v === 'whatsapp' || v === 'manual' || v === 'removed' ? v : undefined
}

function toHistoryImport(v: unknown): HistoryImport | undefined {
  if (!v || typeof v !== 'object') return undefined
  const d = v as Record<string, unknown>
  const status = d.status
  if (status !== 'loading' && status !== 'done' && status !== 'error') return undefined
  return {
    status: status as HistoryImportStatus,
    imported: typeof d.imported === 'number' ? d.imported : 0,
    error: typeof d.error === 'string' ? d.error : undefined,
    at: toDate(d.at),
  }
}

function toMediaRecovery(v: unknown): MediaRecovery | undefined {
  if (!v || typeof v !== 'object') return undefined
  const d = v as Record<string, unknown>
  const status = d.status
  if (status !== 'loading' && status !== 'done' && status !== 'error') return undefined
  return {
    status: status as HistoryImportStatus,
    total: typeof d.total === 'number' ? d.total : 0,
    recovered: typeof d.recovered === 'number' ? d.recovered : 0,
    failed: typeof d.failed === 'number' ? d.failed : 0,
    error: typeof d.error === 'string' ? d.error : undefined,
    at: toDate(d.at),
  }
}

export function boardFromDoc(id: string, d: DocumentData): Board {
  return {
    id,
    name: d.name ?? '',
    icon: d.icon ?? 'dashboard',
    color: typeof d.color === 'string' && d.color ? d.color : '#7a52a0',
    columns: Array.isArray(d.columns) ? d.columns : [],
    createdAt: toDate(d.createdAt),
  }
}

export function dealFromDoc(id: string, d: DocumentData): Deal {
  return {
    id,
    company: d.company ?? '',
    contact: d.contact ?? '',
    value: d.value ?? 0,
    initials: d.initials ?? '?',
    tag: d.tag ?? 'Novo',
    boardId: d.boardId ?? '',
    columnId: d.columnId ?? '',
    order: d.order ?? 0,
    createdAt: toDate(d.createdAt),
  }
}

function toFlowNodeKind(v: unknown): FlowNodeKind {
  return v === 'start' || v === 'decision' || v === 'end' ? v : 'step'
}

/**
 * Nós e setas chegam de um array embutido no doc — e podem ter sido escritos
 * por uma versão anterior do app ou pela IA. Descartamos o que não tem id em
 * vez de confiar, senão um item torto quebra a renderização do quadro inteiro.
 */
function toFlowNodes(v: unknown): FlowNode[] {
  if (!Array.isArray(v)) return []
  return v.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return []
    const d = raw as Record<string, unknown>
    if (typeof d.id !== 'string' || !d.id) return []
    return [{
      id: d.id,
      title: typeof d.title === 'string' ? d.title : '',
      subtitle: typeof d.subtitle === 'string' ? d.subtitle : '',
      kind: toFlowNodeKind(d.kind),
      x: typeof d.x === 'number' ? d.x : 0,
      y: typeof d.y === 'number' ? d.y : 0,
    }]
  })
}

function toFlowEdges(v: unknown, nodes: FlowNode[]): FlowEdge[] {
  if (!Array.isArray(v)) return []
  const ids = new Set(nodes.map((n) => n.id))
  return v.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return []
    const d = raw as Record<string, unknown>
    const { id, from, to } = d
    // Seta órfã (aponta para um nó que já foi apagado) não tem como ser desenhada.
    if (typeof id !== 'string' || typeof from !== 'string' || typeof to !== 'string') return []
    if (!ids.has(from) || !ids.has(to)) return []
    return [{ id, from, to, label: typeof d.label === 'string' ? d.label : '' }]
  })
}

export function flowFromDoc(id: string, d: DocumentData): Flow {
  const nodes = toFlowNodes(d.nodes)
  return {
    id,
    name: d.name ?? '',
    description: d.description ?? '',
    nodes,
    edges: toFlowEdges(d.edges, nodes),
    source: d.source === 'ia' ? 'ia' : 'manual',
    createdAt: toDate(d.createdAt),
    updatedAt: toDate(d.updatedAt),
  }
}

function toStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

export function toMemberRole(v: unknown): MemberRole {
  return v === 'dono' || v === 'gestor' ? v : 'atendente'
}

export function memberFromDoc(id: string, d: DocumentData): Member {
  return {
    id,
    name: d.name ?? '',
    email: d.email ?? '',
    role: toMemberRole(d.role),
    sectorIds: toStringArray(d.sectorIds),
    // Sem o campo, o vínculo é antigo/criado à mão — vale como ativo.
    active: d.active !== false,
    tenantName: d.tenantName ?? '',
    createdAt: toDate(d.createdAt),
  }
}

export function inviteFromDoc(id: string, d: DocumentData): Invite {
  return {
    id,
    email: d.email ?? id,
    tenantUid: d.tenantUid ?? '',
    tenantName: d.tenantName ?? '',
    role: toMemberRole(d.role),
    sectorIds: toStringArray(d.sectorIds),
    createdAt: toDate(d.createdAt),
  }
}

export function sectorFromDoc(id: string, d: DocumentData): Sector {
  return {
    id,
    name: d.name ?? '',
    color: d.color ?? '#7a52a0',
    greeting: d.greeting ?? '',
    order: d.order ?? 0,
    createdAt: toDate(d.createdAt),
  }
}

export function tagFromDoc(id: string, d: DocumentData): Tag {
  return {
    id,
    label: d.label ?? '',
    color: d.color ?? '#7a52a0',
    order: d.order ?? 0,
    createdAt: toDate(d.createdAt),
  }
}

export function quickReplyFromDoc(id: string, d: DocumentData): QuickReply {
  return {
    id,
    shortcut: d.shortcut ?? '',
    title: d.title ?? '',
    text: d.text ?? '',
    sectorId: d.sectorId ?? '',
    createdAt: toDate(d.createdAt),
  }
}

function toCustomFieldType(v: unknown): CustomFieldType {
  return v === 'numero' || v === 'data' || v === 'lista' || v === 'booleano' ? v : 'texto'
}

export function customFieldFromDoc(id: string, d: DocumentData): CustomField {
  return {
    id,
    label: d.label ?? '',
    type: toCustomFieldType(d.type),
    options: toStringArray(d.options),
    order: d.order ?? 0,
    createdAt: toDate(d.createdAt),
  }
}

function toDayHours(v: unknown): DayHours {
  const d = (v ?? {}) as Record<string, unknown>
  return {
    enabled: !!d.enabled,
    open: typeof d.open === 'string' ? d.open : '09:00',
    close: typeof d.close === 'string' ? d.close : '18:00',
  }
}

/** Sempre devolve os 7 dias, mesmo se o doc vier curto/torto — a UI indexa por getDay(). */
export function businessHoursFromDoc(v: unknown): BusinessHours {
  const d = (v ?? {}) as Record<string, unknown>
  const raw = Array.isArray(d.days) ? d.days : []
  return {
    days: Array.from({ length: 7 }, (_, i) => toDayHours(raw[i])),
    awayMessage: typeof d.awayMessage === 'string' ? d.awayMessage : '',
    timezone: typeof d.timezone === 'string' ? d.timezone : 'America/Sao_Paulo',
  }
}

export function toConvStatus(v: unknown): ConvStatus {
  return v === 'esperando' || v === 'finalizado' ? v : 'entrada'
}

/**
 * Contato sem `conv` é anterior aos módulos de atendimento (ou nasceu do daemon antigo).
 * Devolvemos undefined em vez de um estado inventado — quem consome decide o default,
 * e assim a UI consegue distinguir "nunca atendido" de "na entrada".
 */
function toConvState(v: unknown): ConvState | undefined {
  if (!v || typeof v !== 'object') return undefined
  const d = v as Record<string, unknown>
  return {
    status: toConvStatus(d.status),
    recordId: typeof d.recordId === 'string' ? d.recordId : '',
    assignedTo: typeof d.assignedTo === 'string' ? d.assignedTo : '',
    assignedName: typeof d.assignedName === 'string' ? d.assignedName : '',
    sectorId: typeof d.sectorId === 'string' ? d.sectorId : '',
    tagIds: toStringArray(d.tagIds),
    openedAt: toDate(d.openedAt),
    firstResponseAt: toDate(d.firstResponseAt),
    closedAt: toDate(d.closedAt),
    closedBy: typeof d.closedBy === 'string' ? d.closedBy : '',
  }
}

function toCustomValues(v: unknown): Record<string, string> {
  if (!v || typeof v !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (val !== null && val !== undefined) out[k] = String(val)
  }
  return out
}

export function conversationFromDoc(id: string, d: DocumentData): ConversationRecord {
  return {
    id,
    contactId: d.contactId ?? '',
    contactName: d.contactName ?? '',
    assignedTo: d.assignedTo ?? '',
    assignedName: d.assignedName ?? '',
    sectorId: d.sectorId ?? '',
    tagIds: toStringArray(d.tagIds),
    openedAt: toDate(d.openedAt) ?? new Date(0),
    firstResponseAt: toDate(d.firstResponseAt),
    closedAt: toDate(d.closedAt),
    closedBy: d.closedBy ?? '',
    rating: typeof d.rating === 'number' ? d.rating : undefined,
  }
}

export function variableFromDoc(id: string, d: DocumentData): Variable {
  return {
    id,
    key: d.key ?? '',
    value: d.value ?? '',
    description: d.description ?? '',
    createdAt: toDate(d.createdAt),
  }
}

export function mediaAssetFromDoc(id: string, d: DocumentData): MediaAsset {
  return {
    id,
    name: d.name ?? '',
    type: (d.type ?? 'doc') as FileType,
    mimeType: d.mimeType ?? '',
    sizeBytes: d.sizeBytes ?? 0,
    storagePath: d.storagePath ?? '',
    downloadURL: d.downloadURL ?? '',
    uploadedAt: toDate(d.uploadedAt) ?? new Date(0),
  }
}

export function knowledgeFromDoc(id: string, d: DocumentData): KnowledgeDoc {
  return {
    id,
    title: d.title ?? '',
    content: d.content ?? '',
    // Sem o campo, o doc é anterior ao interruptor — vale como ligado.
    enabled: d.enabled !== false,
    createdAt: toDate(d.createdAt),
    updatedAt: toDate(d.updatedAt),
  }
}

export function prefsFromDoc(v: unknown): UserPrefs {
  const d = (v ?? {}) as Record<string, unknown>
  // Avisar por padrão: quem não quer desliga, e o contrário (silêncio calado) faz
  // parecer que o CRM não está recebendo mensagem.
  return { notifyDesktop: d.notifyDesktop !== false, notifySound: d.notifySound !== false }
}

function toCampaignStatus(v: unknown): CampaignStatus {
  return v === 'enviando' || v === 'pausada' || v === 'concluida' ? v : 'rascunho'
}

export function campaignFromDoc(id: string, d: DocumentData): Campaign {
  return {
    id,
    name: d.name ?? '',
    text: d.text ?? '',
    tagIds: toStringArray(d.tagIds),
    status: toCampaignStatus(d.status),
    ratePerHour: typeof d.ratePerHour === 'number' ? d.ratePerHour : 15,
    respectBusinessHours: d.respectBusinessHours !== false,
    total: d.total ?? 0,
    sent: d.sent ?? 0,
    failed: d.failed ?? 0,
    skipped: d.skipped ?? 0,
    createdBy: d.createdBy ?? '',
    startedAt: toDate(d.startedAt),
    finishedAt: toDate(d.finishedAt),
    nextSendAt: toDate(d.nextSendAt),
    lastError: d.lastError ?? '',
    createdAt: toDate(d.createdAt),
  }
}

function toTargetStatus(v: unknown): CampaignTargetStatus {
  return v === 'enviando' || v === 'enviado' || v === 'falhou' || v === 'optout' ? v : 'pendente'
}

export function campaignTargetFromDoc(id: string, d: DocumentData): CampaignTarget {
  return {
    id,
    contactId: d.contactId ?? id,
    name: d.name ?? '',
    phone: d.phone ?? '',
    status: toTargetStatus(d.status),
    sentAt: toDate(d.sentAt),
    error: d.error ?? '',
  }
}

export function contactFromDoc(id: string, d: DocumentData): Contact {
  return {
    id,
    name: d.name ?? '',
    company: d.company ?? '',
    initials: d.initials ?? '?',
    online: !!d.online,
    role: d.role ?? '',
    email: d.email ?? '',
    phone: d.phone ?? '',
    whatsapp: d.whatsapp ?? '',
    status: d.status ?? '',
    source: d.source ?? '',
    nameSource: toContactNameSource(d.nameSource),
    photoUrl: d.photoUrl ?? '',
    photoPath: d.photoPath ?? '',
    photoSource: toPhotoSource(d.photoSource),
    historyImport: toHistoryImport(d.historyImport),
    mediaRecovery: toMediaRecovery(d.mediaRecovery),
    lastMessage: d.lastMessage ?? '',
    lastMessageAt: toDate(d.lastMessageAt),
    unreadCount: typeof d.unreadCount === 'number' ? d.unreadCount : 0,
    optOut: !!d.optOut,
    conv: toConvState(d.conv),
    custom: toCustomValues(d.custom),
    createdAt: toDate(d.createdAt),
  }
}

export function messageFromDoc(id: string, d: DocumentData): Message {
  return {
    id,
    fromMe: !!d.fromMe,
    text: d.text ?? '',
    sentAt: toDate(d.sentAt) ?? new Date(0),
    mediaType: d.mediaType,
    mediaUrl: d.mediaUrl ?? '',
    mediaPath: d.mediaPath ?? '',
    mimeType: d.mimeType ?? '',
    fileName: d.fileName ?? '',
    sizeBytes: d.sizeBytes ?? 0,
    caption: d.caption ?? '',
    mediaError: d.mediaError ?? '',
    importedFromHistory: !!d.importedFromHistory,
    pending: !!d.pending,
    channel: d.channel ?? '',
  }
}

export function fileFromDoc(id: string, d: DocumentData): FileMeta {
  return {
    id,
    name: d.name ?? '',
    type: (d.type ?? 'doc') as FileType,
    sizeBytes: d.sizeBytes ?? 0,
    storagePath: d.storagePath ?? '',
    downloadURL: d.downloadURL ?? '',
    uploadedAt: toDate(d.uploadedAt) ?? new Date(0),
  }
}

export function activityFromDoc(id: string, d: DocumentData): Activity {
  return {
    id,
    type: d.type ?? 'task',
    title: d.title ?? '',
    contact: d.contact ?? '',
    dueAt: toDate(d.dueAt) ?? new Date(),
    done: !!d.done,
    createdAt: toDate(d.createdAt),
  }
}

export function actTypeFromDoc(id: string, d: DocumentData): ActType {
  return {
    id,
    label: d.label ?? '',
    icon: d.icon ?? 'event',
    color: d.color ?? '#7a52a0',
    bg: d.bg ?? 'rgba(150,110,200,0.14)',
    evColor: d.evColor ?? '#b692d6',
  }
}

export function invoiceFromDoc(id: string, d: DocumentData): Invoice {
  const inst = d.installment
  return {
    id,
    num: d.num ?? '',
    client: d.client ?? '',
    value: d.value ?? 0,
    dueAt: toDate(d.dueAt) ?? new Date(),
    status: (d.status ?? 'Pendente') as InvoiceStatus,
    createdAt: toDate(d.createdAt),
    // Nota antiga não tem nenhum destes — daí o cuidado com cada um.
    seq: typeof d.seq === 'number' ? d.seq : undefined,
    desc: d.desc ?? '',
    contactId: d.contactId || undefined,
    paymentMethod: d.paymentMethod || undefined,
    notes: d.notes ?? '',
    paidAt: toDate(d.paidAt),
    seriesId: d.seriesId || undefined,
    installment: inst && typeof inst.n === 'number' && typeof inst.of === 'number'
      ? { n: inst.n, of: inst.of }
      : undefined,
    recurrence: d.recurrence === 'mensal' ? 'mensal' : undefined,
  }
}

export function eventFromDoc(id: string, d: DocumentData): EventDoc {
  return {
    id,
    title: d.title ?? '',
    date: toDate(d.date) ?? new Date(),
    dateKey: d.dateKey ?? '',
    time: d.time ?? '',
    color: d.color ?? '#9a6fb8',
    subtitle: d.subtitle ?? '',
    activityId: d.activityId,
    scheduledMessageId: d.scheduledMessageId,
    createdAt: toDate(d.createdAt),
  }
}

export function scheduledMessageFromDoc(id: string, d: DocumentData): ScheduledMessage {
  return {
    id,
    contactId: d.contactId ?? '',
    contactName: d.contactName ?? '',
    text: d.text ?? '',
    dueAt: toDate(d.dueAt) ?? new Date(),
    dateKey: d.dateKey ?? '',
    time: d.time ?? '',
    eventId: d.eventId ?? '',
    status: (d.status ?? 'pending') as ScheduledMessageStatus,
    attempts: d.attempts ?? 0,
    lastError: d.lastError ?? '',
    sentMessageId: d.sentMessageId ?? '',
    sentAt: toDate(d.sentAt),
    createdAt: toDate(d.createdAt),
    updatedAt: toDate(d.updatedAt),
  }
}

export function leadFromDoc(id: string, d: DocumentData): Lead {
  return {
    id,
    name: d.name ?? '',
    company: d.company ?? '',
    initials: d.initials ?? '?',
    source: d.source ?? '',
    value: d.value ?? 0,
    createdAt: toDate(d.createdAt),
  }
}

export function agentMessageFromDoc(id: string, d: DocumentData): AgentMessage {
  return {
    id,
    role: d.role === 'user' ? 'user' : 'agent',
    text: d.text ?? '',
    createdAt: toDate(d.createdAt),
  }
}

export function profileFromDoc(d: DocumentData | undefined): UserProfile | null {
  if (!d) return null
  return {
    displayName: d.displayName ?? '',
    role: d.role ?? 'Gerente Comercial',
    agent: (d.agent ?? {}) as AgentConfig,
    features: (d.features ?? {}) as UserProfile['features'],
    orgName: d.orgName ?? '',
    businessHours: businessHoursFromDoc(d.businessHours),
    signature: d.signature ?? '',
    phone: d.phone ?? '',
    closingMessage: d.closingMessage ?? '',
    closingEnabled: !!d.closingEnabled,
    prefs: prefsFromDoc(d.prefs),
  }
}
