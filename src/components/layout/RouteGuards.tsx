import { useEffect, useRef } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useTenantStore } from '../../store/tenantStore'
import { useMemberships } from '../../hooks/useTeam'

/** Rotas /super — só donos do sistema. */
export function OwnerRoute() {
  const { isOwner } = useAuth()
  return isOwner ? <Outlet /> : <Navigate to="/" replace />
}

/**
 * Rotas do CRM (Layout). Donos só entram aqui com um cliente selecionado;
 * sem cliente, vão para o painel SUPER TITAN.
 */
export function CrmRoute() {
  const { isOwner } = useAuth()
  const tenantUid = useTenantStore((s) => s.tenantUid)
  useAutoEnterMembership()
  if (isOwner && !tenantUid) return <Navigate to="/super" replace />
  return <Outlet />
}

/**
 * Atendente convidado cai direto na equipe de que faz parte.
 *
 * O aceite do convite acontece uma vez só, no login seguinte ao convite. Sem isto, da
 * segunda sessão em diante ele entraria no PRÓPRIO tenant — vazio — sem entender por
 * que "sumiu tudo". Só age uma vez por sessão (`decided`), para não desfazer a escolha
 * de quem usa o seletor de equipe para voltar à própria conta.
 */
function useAutoEnterMembership(): void {
  const { isOwner } = useAuth()
  const { memberships, loading } = useMemberships()
  const tenantUid = useTenantStore((s) => s.tenantUid)
  const enterMembership = useTenantStore((s) => s.enterMembership)
  const decided = useRef(false)

  useEffect(() => {
    if (decided.current || loading || isOwner || tenantUid) return
    decided.current = true
    const first = memberships[0]
    if (first) enterMembership({ uid: first.tenantUid, name: first.tenantName }, first.role)
  }, [loading, isOwner, tenantUid, memberships, enterMembership])
}
