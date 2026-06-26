import { create } from 'zustand'

export interface ClientRef {
  uid: string
  name: string
}

/**
 * Tenant "ativo" — de quem os hooks de dados leem.
 * - Usuário comum: `tenantUid` = null → cai no próprio uid (efetivo).
 * - Dono (SUPER TITAN) visualizando um cliente: `tenantUid` = uid do cliente,
 *   `readOnly` = true (apenas leitura sobre os dados de outro tenant).
 */
interface TenantState {
  tenantUid: string | null
  readOnly: boolean
  client: ClientRef | null
  enterClient: (c: ClientRef) => void
  exitClient: () => void
}

export const useTenantStore = create<TenantState>((set) => ({
  tenantUid: null,
  readOnly: false,
  client: null,
  enterClient: (c) => set({ tenantUid: c.uid, readOnly: true, client: c }),
  exitClient: () => set({ tenantUid: null, readOnly: false, client: null }),
}))
