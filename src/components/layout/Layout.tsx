import { Outlet, useNavigate } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import MaterialIcon from '../common/MaterialIcon'
import { useTenantStore } from '../../store/tenantStore'
import { useMemberships } from '../../hooks/useTeam'

export default function Layout() {
  const navigate = useNavigate()
  const readOnly = useTenantStore((s) => s.readOnly)
  const client = useTenantStore((s) => s.client)
  const tenantUid = useTenantStore((s) => s.tenantUid)
  const role = useTenantStore((s) => s.role)
  const exitClient = useTenantStore((s) => s.exitClient)
  const enterMembership = useTenantStore((s) => s.enterMembership)
  const { memberships } = useMemberships()

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', background: '#0a080c' }}>
      <Sidebar />
      <main style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', minWidth: 0, background: '#f5f3f8' }}>
        {/* Atendente convidado: mostra em que equipe está e deixa voltar à conta dele. */}
        {!readOnly && memberships.length > 0 && (
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '0 22px', height: 38, background: '#efeaf6', borderBottom: '1px solid #e2def0', color: '#553578', fontSize: 12.5 }}>
            <MaterialIcon name="groups" size={17} />
            <span>
              Atendendo em <b>{client?.name ?? 'sua conta'}</b>
              {role && <> · {role}</>}
            </span>
            <div style={{ flex: 1 }} />
            <select
              value={tenantUid ?? ''}
              onChange={(e) => {
                const m = memberships.find((x) => x.tenantUid === e.target.value)
                if (m) enterMembership({ uid: m.tenantUid, name: m.tenantName }, m.role)
                else exitClient()
              }}
              style={{ background: '#fff', border: '1px solid #d9d2e6', borderRadius: 9, padding: '5px 9px', fontSize: 12, color: '#553578', fontFamily: "'Manrope',sans-serif", cursor: 'pointer', outline: 'none' }}
            >
              <option value="">Minha conta</option>
              {memberships.map((m) => (
                <option key={m.tenantUid} value={m.tenantUid}>{m.tenantName}</option>
              ))}
            </select>
          </div>
        )}
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
