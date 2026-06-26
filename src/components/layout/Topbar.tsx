import { useLocation, useNavigate } from 'react-router-dom'
import { useUIStore } from '../../store/uiStore'
import { useAuth } from '../../contexts/AuthContext'
import { greeting } from '../../lib/format'
import MaterialIcon from '../common/MaterialIcon'

const TITLES: Record<string, string> = {
  '/': 'Visão geral',
  '/pipeline': 'Pipeline de vendas',
  '/contatos': 'Conversas',
  '/atividades': 'Atividades',
  '/faturamento': 'Faturamento',
  '/agenda': 'Agenda',
  '/agente': 'Agente de IA',
}

export default function Topbar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const collapsed = useUIStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const title = TITLES[pathname] || 'Visão geral'
  const name = user?.displayName || user?.email || ''

  return (
    <header
      style={{
        height: 70,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 18,
        padding: '0 30px',
        background: 'linear-gradient(180deg,#0d0a11,#0b080f)',
        boxShadow: '0 1px 0 rgba(176,148,210,0.08),0 6px 22px rgba(8,5,12,0.25)',
        zIndex: 3,
      }}
    >
      <button
        onClick={toggleSidebar}
        style={{
          width: 40,
          height: 40,
          flexShrink: 0,
          borderRadius: 11,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(176,148,210,0.12)',
          color: '#b9aec6',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <MaterialIcon name={collapsed ? 'menu' : 'menu_open'} size={22} />
      </button>

      <div>
        <div style={{ fontSize: 12, color: '#8a7d97' }}>{greeting(name)}</div>
        <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 25, fontWeight: 600, lineHeight: 1.05, color: '#f1ecf5' }}>{title}</div>
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(176,148,210,0.12)', borderRadius: 11, padding: '9px 14px', width: 280 }}>
        <MaterialIcon name="search" size={19} color="#7d7388" />
        <input placeholder="Buscar negócios, contatos..." style={{ background: 'transparent', border: 'none', outline: 'none', color: '#e8e2ee', fontSize: 13, width: '100%' }} />
      </div>

      <button style={{ position: 'relative', width: 42, height: 42, borderRadius: 11, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(176,148,210,0.12)', color: '#b9aec6', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <MaterialIcon name="notifications" size={21} />
        <span style={{ position: 'absolute', top: 9, right: 10, width: 7, height: 7, borderRadius: '50%', background: '#cd8ae0', boxShadow: '0 0 8px #cd8ae0' }} />
      </button>

      <button
        onClick={() => navigate('/agente')}
        style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'linear-gradient(140deg,#7a52a0,#553578)', border: '1px solid rgba(200,160,230,0.3)', borderRadius: 11, padding: '0 16px', height: 42, color: '#f4eefa', fontWeight: 600, fontSize: 13, cursor: 'pointer', boxShadow: '0 6px 18px rgba(110,65,150,0.35)' }}
      >
        <MaterialIcon name="auto_awesome" size={19} /> Titã IA
      </button>
    </header>
  )
}
