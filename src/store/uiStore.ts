import { create } from 'zustand'
import { dateKeyOf } from '../lib/format'

export type ContactView = 'chat' | 'info' | 'files' | 'agenda'
export type ActFilter = 'todas' | 'pendente' | 'atrasada' | 'concluida'
export type PipelineView = 'kanban' | 'fluxos'
/** Aba da tela de Contatos: a caixa de atendimento ou o cadastro. */
export type ContactsView = 'atendimento' | 'cadastro'

/** Lead que a agenda mandou criar — o Pipeline consome uma vez e limpa. */
export interface NovoLead {
  contact: string
  company: string
  contactId: string
}

const now = new Date()

interface UIState {
  sidebarCollapsed: boolean
  activeBoard: string
  pipelineView: PipelineView
  contactsView: ContactsView
  novoLead: NovoLead | null
  /** Fluxo aberto no editor; null = mostrando a lista de fluxos. */
  activeFlow: string | null
  selectedContact: string | null
  contactView: ContactView
  selectedDayKey: string
  calYear: number
  calMonth: number
  actFilter: ActFilter

  showContactModal: boolean
  showSchedModal: boolean
  showActModal: boolean
  showTypeModal: boolean
  showInvoiceModal: boolean
  showWhatsappModal: boolean

  toggleSidebar: () => void
  setActiveBoard: (id: string) => void
  setPipelineView: (v: PipelineView) => void
  setContactsView: (v: ContactsView) => void
  pedirNovoLead: (l: NovoLead) => void
  limparNovoLead: () => void
  openFlow: (id: string) => void
  closeFlow: () => void
  selectContact: (id: string) => void
  setContactView: (v: ContactView) => void
  selectDay: (key: string) => void
  prevMonth: () => void
  nextMonth: () => void
  setActFilter: (f: ActFilter) => void

  openContactModal: () => void
  closeContactModal: () => void
  openSchedModal: (contactId: string) => void
  closeSchedModal: () => void
  openActModal: () => void
  closeActModal: () => void
  openTypeModal: () => void
  closeTypeModal: () => void
  openInvoiceModal: () => void
  closeInvoiceModal: () => void
  openWhatsappModal: () => void
  closeWhatsappModal: () => void
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  // Vazio, não um id chutado: sem quadro escolhido o Kanban cai no primeiro da lista, que é
  // o LEADS (nasce com createdAt zero). Fixar 'b1' abria num quadro de seed que pode nem
  // existir no ambiente do cliente.
  activeBoard: '',
  pipelineView: 'kanban',
  contactsView: 'atendimento',
  novoLead: null,
  activeFlow: null,
  selectedContact: null,
  contactView: 'chat',
  selectedDayKey: dateKeyOf(now),
  calYear: now.getFullYear(),
  calMonth: now.getMonth(),
  actFilter: 'todas',

  showContactModal: false,
  showSchedModal: false,
  showActModal: false,
  showTypeModal: false,
  showInvoiceModal: false,
  showWhatsappModal: false,

  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setActiveBoard: (id) => set({ activeBoard: id }),
  setPipelineView: (v) => set({ pipelineView: v }),
  setContactsView: (v) => set({ contactsView: v }),
  pedirNovoLead: (l) => set({ novoLead: l }),
  limparNovoLead: () => set({ novoLead: null }),
  openFlow: (id) => set({ activeFlow: id }),
  closeFlow: () => set({ activeFlow: null }),
  selectContact: (id) => set({ selectedContact: id, contactView: 'chat' }),
  setContactView: (v) => set({ contactView: v }),
  selectDay: (key) => set({ selectedDayKey: key }),
  prevMonth: () =>
    set((s) => {
      let m = s.calMonth - 1
      let y = s.calYear
      if (m < 0) { m = 11; y-- }
      return { calMonth: m, calYear: y }
    }),
  nextMonth: () =>
    set((s) => {
      let m = s.calMonth + 1
      let y = s.calYear
      if (m > 11) { m = 0; y++ }
      return { calMonth: m, calYear: y }
    }),
  setActFilter: (f) => set({ actFilter: f }),

  openContactModal: () => set({ showContactModal: true }),
  closeContactModal: () => set({ showContactModal: false }),
  openSchedModal: (contactId) => set({ selectedContact: contactId, showSchedModal: true }),
  closeSchedModal: () => set({ showSchedModal: false }),
  openActModal: () => set({ showActModal: true }),
  closeActModal: () => set({ showActModal: false }),
  openTypeModal: () => set({ showTypeModal: true }),
  closeTypeModal: () => set({ showTypeModal: false }),
  openInvoiceModal: () => set({ showInvoiceModal: true }),
  closeInvoiceModal: () => set({ showInvoiceModal: false }),
  openWhatsappModal: () => set({ showWhatsappModal: true }),
  closeWhatsappModal: () => set({ showWhatsappModal: false }),
}))
