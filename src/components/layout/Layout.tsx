import { Outlet, useNavigate } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import MaterialIcon from '../common/MaterialIcon'
import { useTenantStore } from '../../store/tenantStore'

export default function Layout() {
  const navigate = useNavigate()
  const readOnly = useTenantStore((s) => s.readOnly)
  const client = useTenantStore((s) => s.client)
  const exitClient = useTenantStore((s) => s.exitClient)

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', background: '#0a080c' }}>
      <Sidebar />
      <main style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', minWidth: 0, background: '#f5f3f8' }}>
        {readOnly && client && (
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '0 22px', height: 40, background: 'linear-gradient(90deg,#553578,#7a52a0)', color: '#f4eefa', fontSize: 13 }}>
            <MaterialIcon name="visibility" size={17} />
            <span><b>SUPER TITAN</b> · Visualizando cliente: <b>{client.name}</b> · somente leitura</span>
            <div style={{ flex: 1 }} />
            <button
              onClick={() => { exitClient(); navigate('/super') }}
              style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 8, padding: '5px 11px', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
            >
              <MaterialIcon name="arrow_back" size={16} /> Sair do cliente
            </button>
          </div>
        )}
        <Topbar />
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', background: '#f5f3f8' }}>
          <Outlet />
        </div>
      </main>
    </div>
  )
}
