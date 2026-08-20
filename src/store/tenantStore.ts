import { create } from 'zustand'
import type { MemberRole } from '../types'

export interface ClientRef {
  uid: string
  name: string
}

/**
 * Tenant "ativo" — de quem os hooks de dados leem.
 * - Usuário na própria conta: `tenantUid` = null → cai no próprio uid (efetivo).
 * - Atendente convidado: `tenantUid` = uid do dono da equipe, `readOnly` = false,
 *   `role` = papel dele lá dentro (limita o que a UI oferece; as security rules
 *   limitam de verdade).
 * - Dono (SUPER TITAN) visualizando um cliente: `tenantUid` = uid do cliente,
 *   `readOnly` = true (apenas leitura sobre os dados de outro tenant).
 */
interface TenantState {
  tenantUid: string | null
  readOnly: boolean
  client: ClientRef | null
  /** Papel no tenant ativo. null = está na própria conta (manda em tudo). */
  role: MemberRole | null
  enterClient: (c: ClientRef) => void
  enterMembership: (c: ClientRef, role: MemberRole) => void
  exitClient: () => void
}

export const useTenantStore = create<TenantState>((set) => ({
  tenantUid: null,
  readOnly: false,
  client: null,
  role: null,
  enterClient: (c) => set({ tenantUid: c.uid, readOnly: true, client: c, role: null }),
  enterMembership: (c, role) => set({ tenantUid: c.uid, readOnly: false, client: c, role }),
  exitClient: () => set({ tenantUid: null, readOnly: false, client: null, role: null }),
}))

/** Pode mexer em equipe, setores, etiquetas e demais configurações do tenant? */
export function canManage(role: MemberRole | null, readOnly: boolean): boolean {
  if (readOnly) return false
  return role === null || role === 'dono' || role === 'gestor'
}
