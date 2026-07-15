import { useLayoutEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { navDefs } from '../../lib/theme'
import { useUIStore } from '../../store/uiStore'
import { useAuth } from '../../contexts/AuthContext'
import { initialsOf } from '../../lib/format'
import MaterialIcon from '../common/MaterialIcon'

export default function Sidebar() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed)
  const { user, logout } = useAuth()
  const expanded = !collapsed
  const name = user?.displayName || user?.email || 'Usuário'

  // Indicador deslizante (anel roxo giratório) — mede a posição do item ativo
  // e desliza até ele com overshoot (cubic-bezier definido em .nav-ring).
  const location = useLocation()
  const activeIndex = navDefs.findIndex((d) =>
    d.path === '/' ? location.pathname === '/' : location.pathname.startsWith(d.path),
  )
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([])
  const [indicator, setIndicator] = useState<{ top: number; height: number } | null>(null)

  useLayoutEffect(() => {
    const el = activeIndex >= 0 ? itemRefs.current[activeIndex] : null
    if (!el) {
      setIndicator(null)
      return
    }
    setIndicator({ top: el.offsetTop, height: el.offsetHeight })
  }, [activeIndex, collapsed])

  return (
    <aside
      style={{
        width: collapsed ? 76 : 248,
        flexShrink: 0,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(180deg,#0d0a11,#0a070d)',
        borderRight: '1px solid rgba(176,148,210,0.08)',
        padding: '26px 14px 18px',
        transition: 'width .22s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '4px 6px 26px', justifyContent: collapsed ? 'center' : undefined }}>
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 11,
            background: 'linear-gradient(150deg,#9a6fb8,#5a3a7e)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 6px 18px rgba(120,70,160,0.4)',
            flexShrink: 0,
          }}
        >
          <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 26, fontWeight: 600, color: '#fff', lineHeight: 1, letterSpacing: '.04em' }}>T</span>
        </div>
        {expanded && (
          <div>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontWeight: 600, fontSize: 23, letterSpacing: '.18em', lineHeight: 1, color: '#f3eef6' }}>TITÃS</div>
            <div style={{ fontSize: 9, letterSpacing: '.42em', color: '#8a7d97', marginTop: 3, fontWeight: 600 }}>C R M</div>
          </div>
        )}
      </div>

      {expanded && (
        <div style={{ fontSize: 10, letterSpacing: '.18em', color: '#5f5668', fontWeight: 700, padding: '0 10px 10px' }}>PRINCIPAL</div>
      )}

      <nav style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {indicator && (
          <div className="nav-ring" style={{ top: indicator.top, height: indicator.height }}>
            <div className="nav-ring__glow" />
            <div className="nav-ring__clip">
              <div className="nav-ring__spin" />
              <div className="nav-ring__plate" />
            </div>
          </div>
        )}
        {navDefs.map((d, i) => (
          <NavLink
            key={d.id}
            to={d.path}
            end={d.path === '/'}
            ref={(el) => {
              itemRefs.current[i] = el
            }}
            style={{ textDecoration: 'none', position: 'relative', zIndex: 1 }}
          >
            {({ isActive }) => (
              <button style={navItemStyle(isActive, collapsed)}>
                <MaterialIcon name={d.icon} size={21} style={{ fontVariationSettings: "'wght' 300" } as React.CSSProperties} />
                {expanded && <span style={{ flex: 1, textAlign: 'left' }}>{d.label}</span>}
                {isActive && expanded && (
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#c9a6e0', boxShadow: '0 0 10px #c9a6e0' }} />
                )}
              </button>
            )}
          </NavLink>
        ))}
      </nav>

      <div
        style={{
          marginTop: 'auto',
          borderTop: '1px solid rgba(176,148,210,0.08)',
          paddingTop: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 11,
          justifyContent: collapsed ? 'center' : undefined,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            flexShrink: 0,
            borderRadius: '50%',
            background: 'linear-gradient(150deg,#b692d6,#6f4d92)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: 13,
            color: '#160f1d',
          }}
        >
          {initialsOf(name)}
        </div>
        {expanded && (
          <>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#ece6f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
              <div style={{ fontSize: 11, color: '#7d7388' }}>Gerente Comercial</div>
            </div>
            <MaterialIcon name="logout" size={18} color="#6f6579" style={{ cursor: 'pointer' }} onClick={() => logout()} />
          </>
        )}
      </div>
    </aside>
  )
}

function navItemStyle(active: boolean, collapsed: boolean): React.CSSProperties {
  const base: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: collapsed ? 0 : 12,
    justifyContent: collapsed ? 'center' : undefined,
    width: '100%',
    padding: collapsed ? '12px 0' : '11px 13px',
    border: 'none',
    borderRadius: 12,
    cursor: 'pointer',
    fontSize: 13.5,
    fontWeight: active ? 600 : 500,
  }
  // O fundo/realce do item ativo agora é a placa do anel roxo giratório
  // (.nav-ring), que desliza por trás do botão — o botão em si fica limpo.
  if (active) {
    return { ...base, color: '#f1ecf5', background: 'transparent' }
  }
  return { ...base, color: '#8e8499', background: 'transparent' }
}
