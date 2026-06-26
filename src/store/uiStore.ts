import { create } from 'zustand'
import { dateKeyOf } from '../lib/format'

export type ContactView = 'chat' | 'info' | 'files'
export type ActFilter = 'todas' | 'pendente' | 'atrasada' | 'concluida'

const now = new Date()

interface UIState {
  sidebarCollapsed: boolean
  activeBoard: string
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

  toggleSidebar: () => void
  setActiveBoard: (id: string) => void
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
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  activeBoard: 'b1',
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

  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setActiveBoard: (id) => set({ activeBoard: id }),
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
}))
