import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useContacts } from '../../hooks/useContacts'
import { saveSelfPrefs, useSelfProfile } from '../../hooks/useProfile'
import { useMessageNotifications } from '../../hooks/useMessageNotifications'
import { useAllDeals } from '../../hooks/useDeals'
import { useActivities } from '../../hooks/useActivities'
import { useInvoices } from '../../hooks/useInvoices'
import { useThemeStore } from '../../store/themeStore'
import { navDefs, settingsNav } from '../../lib/theme'
import { t } from '../../i18n'
import { C, FONT_MONO } from '../../styles/sx'
import { useUIStore } from '../../store/uiStore'
import { useTenantStore, canManage } from '../../store/tenantStore'
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
 * Topo enxuto: onde se está (conta / tela) à esquerda; busca, claro/escuro e
 * perfil à direita. Tem a cor da página — não é uma faixa, é o alto da tela.
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
  // Busca global: faturamento é de gestor para cima nas regras. Sem este filtro, todo
  // atendente gerava um erro de permissão no console a cada carga da tela.
  const podeVerFaturamento = canManage(
    useTenantStore((s) => s.role),
    useTenantStore((s) => s.readOnly),
  )
  const { docs: invoices } = useInvoices({ enabled: podeVerFaturamento })

  const resolved = useThemeStore((s) => s.resolved)
  const setMode = useThemeStore((s) => s.setMode)

  // Aplica na hora e espelha na conta, para o tema seguir a pessoa de um
  // computador para o outro. A gravação é best-effort: se o Firestore recusar,
  // o tema já está valendo aqui de qualquer jeito.
  const trocarTema = (m: 'light' | 'dark') => {
    setMode(m)
    saveSelfPrefs({ theme: m }).catch(() => {})
  }

  const { pathname } = useLocation()
  const client = useTenantStore((s) => s.client)
  // A tela atual, pelo menu: o item cujo caminho é o mais longo que casa com a URL.
  const tela = useMemo(() => {
    if (pathname.startsWith(settingsNav.path)) return t(settingsNav.label)
    const d = [...navDefs]
      .sort((a, b) => b.path.length - a.path.length)
      .find((x) => (x.path === '/' ? pathname === '/' : pathname.startsWith(x.path)))
    return d ? t(d.label) : ''
  }, [pathname])

  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)
  const [menu, setMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const name = profile.displayName || user?.displayName || user?.email || t('sidebar.usuario')

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

  // ⌘K / Ctrl+K leva à busca de qualquer tela.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const atalho = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K'

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
        height: 60,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '0 28px',
        background: C.darkB,
        zIndex: 3,
      }}
    >
      <nav aria-label={t('topo.ondeEstou')} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: C.muted, whiteSpace: 'nowrap', minWidth: 0 }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{client?.name ?? 'Titãs'}</span>
        {tela && <span aria-hidden>/</span>}
        {tela && <span style={{ color: C.ink, fontWeight: 500 }}>{tela}</span>}
      </nav>

      <div style={{ flex: 1 }} />

      <div style={{ position: 'relative', width: 380, maxWidth: '42%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: C.chromeFill, border: `1px solid ${C.chromeBorder}`, borderRadius: 999, padding: '7px 8px 7px 14px' }}>
          <MaterialIcon name="search" size={18} color={C.muted} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={t('topo.buscarPlaceholder')}
            style={{ background: 'transparent', border: 'none', outline: 'none', color: C.ink, fontSize: 13, width: '100%', minWidth: 0 }}
          />
          <span style={{ fontFamily: FONT_MONO, fontSize: 10.5, color: C.muted, border: `1px solid ${C.line}`, borderRadius: 6, padding: '2px 6px', whiteSpace: 'nowrap' }}>{atalho}</span>
        </div>
        {showResults && (
          <div style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0, maxHeight: 340, overflowY: 'auto', background: C.chromePop, border: `1px solid ${C.chromeBorder}`, borderRadius: 14, boxShadow: 'var(--c-shadow-pop)', padding: 6, zIndex: 30 }}>
            {results.map((r) => (
              <button
                key={r.key}
                // onMouseDown para disparar antes do blur do input fechar o dropdown
                onMouseDown={(e) => { e.preventDefault(); r.go(); setQuery(''); setFocused(false) }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderRadius: 10, padding: '9px 10px', cursor: 'pointer' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--c-chrome-hover)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                <MaterialIcon name={r.icon} size={18} color={C.purple} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 500, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</span>
                  <span style={{ display: 'block', fontSize: 11, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.sub}</span>
                </span>
              </button>
            ))}
            {results.length === 0 && (
              <div style={{ padding: '12px 10px', fontSize: 12.5, color: C.muted, textAlign: 'center' }}>{t('topo.nadaEncontrado', { termo: query.trim() })}</div>
            )}
          </div>
        )}
      </div>

      {/* Claro / escuro. Dois botões em vez de um alternador porque o estado fica
          visível: dá para ver em qual tema se está sem precisar deduzir do ícone. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: C.chromeFill, border: `1px solid ${C.chromeBorder}`, borderRadius: 999, padding: 3 }}>
        <ThemeBtn icon="light_mode" label={t('topo.temaClaro')} on={resolved === 'light'} onClick={() => trocarTema('light')} />
        <ThemeBtn icon="dark_mode" label={t('topo.temaEscuro')} on={resolved === 'dark'} onClick={() => trocarTema('dark')} />
      </div>

      <div ref={menuRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setMenu((v) => !v)}
          title={name}
          aria-label={name}
          aria-expanded={menu}
          style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', borderRadius: 999, padding: 2, cursor: 'pointer' }}
        >
          <Avatar photoUrl={profile.photoUrl || undefined} initials={initialsOf(name) || '?'} size={34} bg={C.purpleSolid} fontSize={12.5} />
          <MaterialIcon name={menu ? 'expand_less' : 'expand_more'} size={18} color={C.muted} />
        </button>

        {menu && (
          <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 220, background: C.chromePop, border: `1px solid ${C.chromeBorder}`, borderRadius: 14, boxShadow: 'var(--c-shadow-pop)', padding: 6, zIndex: 30 }}>
            <div style={{ padding: '8px 10px 10px' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
              {profile.role && <div style={{ fontSize: 11.5, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{profile.role}</div>}
            </div>
            <div style={{ height: 1, background: C.line, margin: '0 4px 5px' }} />
            <MenuItem icon="person" label={t('topo.meuPerfil')} onClick={() => { setMenu(false); navigate(settingsNav.path) }} />
            <MenuItem icon="settings" label={t('nav.configuracoes')} onClick={() => { setMenu(false); navigate(settingsNav.path) }} />
            <div style={{ height: 1, background: C.line, margin: '5px 4px' }} />
            <MenuItem icon="logout" label={t('topo.sair')} danger onClick={() => { setMenu(false); void logout() }} />
          </div>
        )}
      </div>
    </header>
  )
}

function ThemeBtn({ icon, label, on, onClick }: { icon: string; label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-pressed={on}
      style={{
        width: 30,
        height: 30,
        borderRadius: '50%',
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        // Mesmo padrão de "selecionado" do menu: pílula roxa cheia.
        background: on ? 'var(--c-chrome-sel)' : 'transparent',
        color: on ? 'var(--c-chrome-sel-ink)' : 'var(--c-chrome-dim)',
        transition: 'background .16s ease, color .16s ease',
      }}
    >
      <MaterialIcon name={icon} size={17} />
    </button>
  )
}

function MenuItem({ icon, label, onClick, danger }: { icon: string; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
        background: 'transparent', border: 'none', borderRadius: 10, padding: '9px 10px',
        cursor: 'pointer', fontSize: 13, fontWeight: 500, color: danger ? C.rose : C.ink,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--c-chrome-hover)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
    >
      <MaterialIcon name={icon} size={18} color={danger ? C.rose : C.sub} /> {label}
    </button>
  )
}
