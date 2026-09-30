import { useEffect, useRef } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { lembrarOwnerEnv, useTenantStore } from '../../store/tenantStore'
import { useMemberships, useOwnerEnvironment } from '../../hooks/useTeam'
import { Splash } from './ProtectedRoute'

/** Rotas /super — só donos do sistema. */
export function OwnerRoute() {
  const { isOwner } = useAuth()
  return isOwner ? <Outlet /> : <Navigate to="/" replace />
}

/**
 * Rotas do CRM (Layout). O DONO DO SISTEMA não entra no CRM de cliente de jeito nenhum —
 * nem digitando a rota na barra de endereços: os dados de atendimento dos clientes são
 * confidenciais. Ele fica no painel SUPER TITAN.
 *
 * A exceção é o PRÓPRIO ambiente dele, aberto pelo card "Meu Ambiente" (`ownerEnv`).
 */
export function CrmRoute() {
  const { isOwner } = useAuth()
  const ownerEnv = useTenantStore((s) => s.ownerEnv)
  useAutoEnterMembership()
  if (isOwner && !ownerEnv) return <OwnerEnvReentry />
  return <Outlet />
}

/**
 * Dono do sistema chegando ao CRM sem estar no próprio ambiente. Se a aba lembra que ele
 * tinha escolhido "Meu Ambiente" (F5, link aberto na mesma aba), reentra — no vínculo
 * `dono`, se houver, senão na própria conta — e segue para a rota pedida. Sem essa
 * lembrança, volta para /super.
 */
function OwnerEnvReentry() {
  const { user } = useAuth()
  const { environment, loading } = useOwnerEnvironment()
  const enterOwnerEnv = useTenantStore((s) => s.enterOwnerEnv)
  const lembrou = lembrarOwnerEnv()

  useEffect(() => {
    if (!lembrou || loading || !user) return
    if (environment) enterOwnerEnv({ uid: environment.tenantUid, name: environment.tenantName })
    else enterOwnerEnv({ uid: user.uid, name: user.displayName || '' })
  }, [lembrou, loading, environment, user, enterOwnerEnv])

  if (!lembrou) return <Navigate to="/super" replace />
  return <Splash />
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
