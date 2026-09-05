import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useContacts } from '../../hooks/useContacts'
import { useSelfProfile } from '../../hooks/useProfile'
import { useMessageNotifications } from '../../hooks/useMessageNotifications'
import { useAllDeals } from '../../hooks/useDeals'
import { useActivities } from '../../hooks/useActivities'
import { useInvoices } from '../../hooks/useInvoices'
import { useThemeStore } from '../../store/themeStore'
import { settingsNav } from '../../lib/theme'
import { C } from '../../styles/sx'
import { useUIStore } from '../../store/uiStore'
import { fmtMoney, initialsOf } from '../../lib/format'
import Avatar from '../common/Avatar'
import MaterialIcon from '../common/MaterialIcon'

interface SearchResult {
  key: string
  icon: string
  label: string
  sub: string
  go: () => void
}

/**
 * Topo enxuto: busca à esquerda; claro/escuro, configurações e perfil à direita.
 *
 * Saíram daqui o sino (o contador de não lidas foi para o item Contatos do menu,
 * junto com o pedido de permissão de notificação) e o botão "Titã IA", que era
 * atalho para uma tela que o menu lateral já lista. O botão de recolher menu foi
 * para dentro da própria barra lateral.
 */
export default function Topbar() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  const selectContact = useUIStore((s) => s.selectContact)
  const setActiveBoard = useUIStore((s) => s.setActiveBoard)
  const { docs: contacts } = useContacts()
  const profile = useSelfProfile()
  const { prefs } = profile
  const { docs: deals } = useAllDeals()
  const { docs: activities } = useActivities()
  const { docs: invoices } = useInvoices()

  const resolved = useThemeStore((s) => s.resolved)
  const setMode = useThemeStore((s) => s.setMode)

  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [menu, setMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const name = profile.displayName || user?.displayName || user?.email || 'Usuário'

  // Vive no Topbar, e não na página de Conversas, para o aviso valer em qualquer tela.
  useMessageNotifications(contacts, prefs)

  // Fecha o menu do perfil ao clicar fora.
  useEffect(() => {
    if (!menu) return
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menu])

  const results = useMemo<SearchResult[]>(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const hit = (...vals: (string | undefined)[]) => vals.some((v) => v?.toLowerCase().includes(q))
    const out: SearchResult[] = []
    for (const c of contacts) {
      if (out.length >= 12) break
      if (hit(c.name, c.company, c.email, c.phone, c.whatsapp)) {
        out.push({ key: `c-${c.id}`, icon: 'person', label: c.name, sub: c.company, go: () => { selectContact(c.id); navigate('/contatos') } })
      }
    }
    for (const d of deals) {
      if (out.length >= 12) break
      if (hit(d.company, d.contact, d.tag)) {
        out.push({ key: `d-${d.id}`, icon: 'view_kanban', label: d.company, sub: `${d.contact} · R$ ${fmtMoney(d.value)}`, go: () => { setActiveBoard(d.boardId); navigate('/pipeline') } })
      }
    }
    for (const a of activities) {
      if (out.length >= 12) break
      if (hit(a.title, a.contact)) {
        out.push({ key: `a-${a.id}`, icon: 'task_alt', label: a.title, sub: a.contact, go: () => navigate('/atividades') })
      }
    }
    for (const iv of invoices) {
      if (out.length >= 12) break
      if (hit(iv.num, iv.client)) {
        out.push({ key: `i-${iv.id}`, icon: 'receipt_long', label: `${iv.num} · ${iv.client}`, sub: `R$ ${fmtMoney(iv.value)}`, go: () => navigate('/faturamento') })
      }
    }
    return out
  }, [query, contacts, deals, activities, invoices, navigate, selectContact, setActiveBoard])

  const showResults = focused && query.trim().length > 0

  return (
    <header
      style={{
        height: 66,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '0 24px',
        background: C.darkB,
        boxShadow: `0 1px 0 ${C.chromeHairline}, 0 6px 22px rgba(8,5,12,0.25)`,
        zIndex: 3,
      }}
    >
      <div style={{ position: 'relative', width: 420, maxWidth: '46%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: C.chromeFill, border: `1px solid ${C.chromeBorder}`, borderRadius: 11, padding: '9px 14px' }}>
          <MaterialIcon name="search" size={19} color={C.chromeDim} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Buscar contato, negócio, atividade, nota..."
            style={{ background: 'transparent', border: 'none', outline: 'none', color: '#e8e2ee', fontSize: 13, width: '100%' }}
          />
        </div>
        {showResults && (
          <div style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0, maxHeight: 340, overflowY: 'auto', background: C.chromePop, border: `1px solid ${C.chromeBorder}`, borderRadius: 13, boxShadow: '0 14px 34px rgba(8,5,12,0.55)', padding: 6, zIndex: 30 }}>
            {results.map((r) => (
              <button
                key={r.key}
                // onMouseDown para disparar antes do blur do input fechar o dropdown
                onMouseDown={(e) => { e.preventDefault(); r.go(); setQuery(''); setFocused(false) }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderRadius: 9, padding: '9px 10px', cursor: 'pointer' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(176,148,210,0.1)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                <MaterialIcon name={r.icon} size={18} color="#b096d4" />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#ece6f4', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</span>
                  <span style={{ display: 'block', fontSize: 11, color: '#8a7d97', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.sub}</span>
                </span>
              </button>
            ))}
            {results.length === 0 && (
              <div style={{ padding: '12px 10px', fontSize: 12.5, color: '#8a7d97', textAlign: 'center' }}>Nada encontrado para "{query.trim()}".</div>
            )}
          </div>
        )}
      </div>

      <div style={{ flex: 1 }} />

      {/* Claro / escuro. Dois botões em vez de um alternador porque o estado fica
          visível: dá para ver em qual tema se está sem precisar deduzir do ícone. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: C.chromeFill, border: `1px solid ${C.chromeBorder}`, borderRadius: 11, padding: 3 }}>
        <ThemeBtn icon="light_mode" label="Tema claro" on={resolved === 'light'} onClick={() => setMode('light')} />
        <ThemeBtn icon="dark_mode" label="Tema escuro" on={resolved === 'dark'} onClick={() => setMode('dark')} />
      </div>

      <button onClick={() => navigate(settingsNav.path)} title="Configurações" style={chromeBtn}>
        <MaterialIcon name="settings" size={20} />
      </button>

      <div ref={menuRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setMenu((v) => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'transparent', border: 'none', borderRadius: 11, padding: '4px 6px 4px 10px', cursor: 'pointer' }}
        >
          <span style={{ textAlign: 'right', minWidth: 0, maxWidth: 170 }}>
            <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: C.chromeInk, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
            {profile.role && (
              <span style={{ display: 'block', fontSize: 11, color: C.chromeDim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{profile.role}</span>
            )}
          </span>
          <Avatar photoUrl={profile.photoUrl || undefined} initials={initialsOf(name) || '?'} size={34} bg="#6f4d92" fontSize={12.5} />
          <MaterialIcon name={menu ? 'expand_less' : 'expand_more'} size={18} color={C.chromeDim} />
        </button>

        {menu && (
          <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 208, background: C.chromePop, border: `1px solid ${C.chromeBorder}`, borderRadius: 13, boxShadow: '0 14px 34px rgba(8,5,12,0.55)', padding: 6, zIndex: 30 }}>
            <MenuItem icon="person" label="Meu perfil" onClick={() => { setMenu(false); navigate(settingsNav.path) }} />
            <MenuItem icon="settings" label="Configurações" onClick={() => { setMenu(false); navigate(settingsNav.path) }} />
            <div style={{ height: 1, background: C.chromeBorder, margin: '5px 4px' }} />
            <MenuItem icon="logout" label="Sair" danger onClick={() => { setMenu(false); void logout() }} />
          </div>
        )}
      </div>
    </header>
  )
}

const chromeBtn: React.CSSProperties = {
  width: 40,
  height: 40,
  flexShrink: 0,
  borderRadius: 11,
  background: C.chromeFill,
  border: `1px solid ${C.chromeBorder}`,
  color: '#b9aec6',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

function ThemeBtn({ icon, label, on, onClick }: { icon: string; label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-pressed={on}
      style={{
        width: 32,
        height: 32,
        borderRadius: 9,
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        // Mesmo padrão de "selecionado" do menu: pílula roxa clara.
        background: on ? 'var(--c-chrome-sel)' : 'transparent',
        color: on ? 'var(--c-chrome-sel-ink)' : '#8a7d97',
        transition: 'background .16s ease, color .16s ease',
      }}
    >
      <MaterialIcon name={icon} size={18} />
    </button>
  )
}

function MenuItem({ icon, label, onClick, danger }: { icon: string; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
        background: 'transparent', border: 'none', borderRadius: 9, padding: '9px 10px',
        cursor: 'pointer', fontSize: 13, fontWeight: 500, color: danger ? '#e59ab5' : '#ece6f4',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(176,148,210,0.1)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
    >
      <MaterialIcon name={icon} size={18} color={danger ? '#e59ab5' : '#b096d4'} /> {label}
    </button>
  )
}
