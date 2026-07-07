import { Timestamp, type DocumentData } from 'firebase/firestore'
import type {
  Board, Deal, Contact, Message, FileMeta, Activity, ActType,
  Invoice, EventDoc, Lead, AgentConfig, AgentMessage, UserProfile, FileType, InvoiceStatus,
  ContactNameSource,
} from '../types'

function toDate(v: unknown): Date | undefined {
  if (v instanceof Timestamp) return v.toDate()
  if (v instanceof Date) return v
  return undefined
}

function toContactNameSource(v: unknown): ContactNameSource | undefined {
  return v === 'phone' || v === 'profile' || v === 'manual' ? v : undefined
}

export function boardFromDoc(id: string, d: DocumentData): Board {
  return {
    id,
    name: d.name ?? '',
    icon: d.icon ?? 'dashboard',
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
    lastMessage: d.lastMessage ?? '',
    lastMessageAt: toDate(d.lastMessageAt),
    createdAt: toDate(d.createdAt),
  }
}

export function messageFromDoc(id: string, d: DocumentData): Message {
  return {
    id,
    fromMe: !!d.fromMe,
    text: d.text ?? '',
    sentAt: toDate(d.sentAt) ?? new Date(0),
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
  return {
    id,
    num: d.num ?? '',
    client: d.client ?? '',
    value: d.value ?? 0,
    dueAt: toDate(d.dueAt) ?? new Date(),
    status: (d.status ?? 'Pendente') as InvoiceStatus,
    createdAt: toDate(d.createdAt),
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
    createdAt: toDate(d.createdAt),
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
  }
}
