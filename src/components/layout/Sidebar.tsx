import { NavLink, useLocation } from 'react-router-dom'
import { navDefs, settingsNav } from '../../lib/theme'
import { C, FONT_DISPLAY } from '../../styles/sx'
import { useUIStore } from '../../store/uiStore'
import { useAuth } from '../../contexts/AuthContext'
import { useSelfProfile } from '../../hooks/useProfile'
import { useContacts } from '../../hooks/useContacts'
import { requestNotificationPermission } from '../../hooks/useMessageNotifications'
import { initialsOf } from '../../lib/format'
import Avatar from '../common/Avatar'
import MaterialIcon from '../common/MaterialIcon'

export default function Sidebar() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const { user } = useAuth()
  // Nome/cargo/foto vêm do doc da conta (Configurações → Perfil), não do Auth: o
  // displayName do Auth só é escrito no cadastro e nunca mais, então editar o perfil
  // não chegava aqui. O Auth fica como reserva enquanto o doc não carregou.
  const profile = useSelfProfile()
  const expanded = !collapsed
  const name = profile.displayName || user?.displayName || user?.email || 'Usuário'

  // Contador de não lidas: saiu do sino do topo e veio para o item Contatos, que é
  // para onde o sino levava de qualquer forma.
  const { docs: contacts } = useContacts()
  const unread = contacts.reduce((n, c) => n + (c.unreadCount ?? 0), 0)

  const { pathname } = useLocation()
  const emConfig = pathname.startsWith(settingsNav.path)

  return (
    <aside
      style={{
        width: collapsed ? 76 : 248,
        flexShrink: 0,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: C.darkA,
        borderRight: `1px solid ${C.chromeHairline}`,
        padding: '20px 14px 18px',
        transition: 'width .22s ease',
      }}
    >
      {/* Marca + recolher. O botão de recolher morava no topo da tela; aqui ele fica
          junto do que recolhe, que é onde a interface de referência o coloca. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '4px 2px 22px', justifyContent: collapsed ? 'center' : undefined }}>
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
          <span style={{ fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 700, color: '#fff', lineHeight: 1, letterSpacing: '-0.02em' }}>T</span>
        </div>
        {expanded && (
          <>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 19, letterSpacing: '.12em', lineHeight: 1, color: C.chromeInk }}>TITÃS</div>
              <div style={{ fontSize: 9, letterSpacing: '.42em', color: C.chromeLabel, marginTop: 3, fontWeight: 600 }}>C R M</div>
            </div>
            <button onClick={toggleSidebar} title="Recolher menu" style={iconBtn}>
              <MaterialIcon name="left_panel_close" size={19} />
            </button>
          </>
        )}
      </div>
      {collapsed && (
        <button onClick={toggleSidebar} title="Expandir menu" style={{ ...iconBtn, alignSelf: 'center', marginBottom: 14 }}>
          <MaterialIcon name="left_panel_open" size={19} />
        </button>
      )}

      <nav style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {navDefs.map((d, i) => {
          const abreGrupo = d.group && d.group !== navDefs[i - 1]?.group
          return (
            <div key={d.id}>
              {abreGrupo && expanded && (
                <div style={{ fontSize: 9.5, letterSpacing: '.16em', color: C.chromeLabel, fontWeight: 700, padding: '14px 12px 7px' }}>
                  {d.group}
                </div>
              )}
              {abreGrupo && collapsed && (
                <div style={{ height: 1, background: C.chromeHairline, margin: '9px 8px' }} />
              )}
              <NavLink to={d.path} end={d.path === '/'} style={{ textDecoration: 'none', display: 'block' }}>
                {({ isActive }) => (
                  <NavItem
                    icon={d.icon}
                    label={d.label}
                    active={isActive}
                    collapsed={collapsed}
                    badge={d.id === 'contatos' ? unread : 0}
                    // Único momento em que o navegador aceita o pedido de permissão é
                    // um clique. Era o sino que fazia isso; agora é este item.
                    onClick={d.id === 'contatos' ? () => void requestNotificationPermission() : undefined}
                  />
                )}
              </NavLink>
            </div>
          )
        })}
      </nav>

      {/* Configurações, fixo no pé — fora da lista que rola. */}
      <div style={{ borderTop: `1px solid ${C.chromeHairline}`, paddingTop: 10, marginTop: 10 }}>
        <NavLink to={settingsNav.path} style={{ textDecoration: 'none', display: 'block' }}>
          <NavItem icon={settingsNav.icon} label={settingsNav.label} active={emConfig} collapsed={collapsed} badge={0} />
        </NavLink>
      </div>

      <div
        style={{
          borderTop: `1px solid ${C.chromeHairline}`,
          marginTop: 10,
          paddingTop: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 11,
          justifyContent: collapsed ? 'center' : undefined,
        }}
      >
        <Avatar
          photoUrl={profile.photoUrl || undefined}
          initials={initialsOf(name) || '?'}
          size={34}
          bg="#6f4d92"
          fontSize={12.5}
        />
        {expanded && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: C.chromeInk, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
            {profile.role && (
              <div style={{ fontSize: 11, color: C.chromeDim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{profile.role}</div>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}

const iconBtn: React.CSSProperties = {
  width: 30,
  height: 30,
  flexShrink: 0,
  borderRadius: 9,
  background: 'transparent',
  border: 'none',
  color: C.chromeDim,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

/**
 * Item do menu. Selecionado = pílula roxa clara com barra à esquerda — o mesmo
 * padrão de "selecionado" que vale no sistema inteiro. Antes era um anel roxo
 * giratório que deslizava atrás do item.
 */
function NavItem({ icon, label, active, collapsed, badge, onClick }: {
  icon: string
  label: string
  active: boolean
  collapsed: boolean
  badge: number
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: collapsed ? 0 : 12,
        justifyContent: collapsed ? 'center' : undefined,
        width: '100%',
        padding: collapsed ? '11px 0' : '10px 13px',
        border: 'none',
        borderRadius: 12,
        cursor: 'pointer',
        fontSize: 13.5,
        fontWeight: active ? 600 : 500,
        color: active ? C.chromeSelInk : C.chromeDim,
        background: active ? C.chromeSel : 'transparent',
        transition: 'background .16s ease, color .16s ease',
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = 'transparent'
      }}
    >
      {active && (
        <span style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: 3, height: 18, borderRadius: 3, background: C.chromeSelBar }} />
      )}
      <MaterialIcon name={icon} size={20} style={{ fontVariationSettings: "'wght' 300" } as React.CSSProperties} />
      {!collapsed && <span style={{ flex: 1, textAlign: 'left' }}>{label}</span>}
      {badge > 0 && (
        <span
          style={{
            minWidth: 18,
            height: 18,
            padding: '0 5px',
            borderRadius: 999,
            background: 'var(--c-wa-green)',
            color: '#08210f',
            fontSize: 10.5,
            fontWeight: 800,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            ...(collapsed ? { position: 'absolute', top: 4, right: 10 } : null),
          }}
        >
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  )
}
