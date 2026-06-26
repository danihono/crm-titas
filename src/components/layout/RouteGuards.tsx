import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useTenantStore } from '../../store/tenantStore'

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
  if (isOwner && !tenantUid) return <Navigate to="/super" replace />
  return <Outlet />
}
