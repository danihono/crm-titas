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
 *
 * O DONO DO SISTEMA (SUPER TITAN) NÃO entra em tenant de cliente: os dados de
 * atendimento são confidenciais. Ele administra a ficha do cliente (nome, cor, logo)
 * e vê métricas agregadas em /super — nada mais. Por isso não existe mais um
 * `enterClient()` aqui, e o `CrmRoute` devolve todo dono para /super.
 */
interface TenantState {
  tenantUid: string | null
  /**
   * Trava de escrita da UI, lida em todo o CRM. Hoje nenhum caminho a liga — sobrou
   * como defesa em profundidade depois que o acesso somente-leitura do dono do sistema
   * foi removido.
   */
  readOnly: boolean
  client: ClientRef | null
  /** Papel no tenant ativo. null = está na própria conta (manda em tudo). */
  role: MemberRole | null
  enterMembership: (c: ClientRef, role: MemberRole) => void
  exitClient: () => void
}

export const useTenantStore = create<TenantState>((set) => ({
  tenantUid: null,
  readOnly: false,
  client: null,
  role: null,
  enterMembership: (c, role) => set({ tenantUid: c.uid, readOnly: false, client: c, role }),
  exitClient: () => set({ tenantUid: null, readOnly: false, client: null, role: null }),
}))

/**
 * Papel de dono do ambiente: o titular da conta (`role === null`, está no próprio tenant)
 * ou quem foi promovido a `dono` na equipe.
 */
export function isOwnerRole(role: MemberRole | null): boolean {
  return role === null || role === 'dono'
}

/**
 * Quem ALTERA as configurações do tenant: só o dono do ambiente.
 *
 * Diferente de `canManage` de propósito — o Gestor consulta as configurações, mas não mexe.
 */
export function canEditSettings(role: MemberRole | null, readOnly: boolean): boolean {
  if (readOnly) return false
  return isOwnerRole(role)
}

/** Quem ABRE as configurações do tenant. O Atendente fica só com as seções de CONTA. */
export function canSeeSettings(role: MemberRole | null): boolean {
  return role !== 'atendente'
}

/**
 * Pode administrar equipe, setores, etiquetas e afins?
 *
 * ATENÇÃO: não é a regra de Configurações — lá vale `canEditSettings`, mais estrita. Esta
 * continua incluindo o Gestor e é usada por Campanhas; mudá-la aqui tiraria o Gestor de um
 * módulo que não faz parte deste pedido.
 */
export function canManage(role: MemberRole | null, readOnly: boolean): boolean {
  if (readOnly) return false
  return isOwnerRole(role) || role === 'gestor'
}
