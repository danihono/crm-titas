import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useUIStore } from '../../store/uiStore'
import { useAuth } from '../../contexts/AuthContext'
import { useContacts } from '../../hooks/useContacts'
import { useAllDeals } from '../../hooks/useDeals'
import { useActivities } from '../../hooks/useActivities'
import { useInvoices } from '../../hooks/useInvoices'
import { greeting, fmtMoney } from '../../lib/format'
import MaterialIcon from '../common/MaterialIcon'
import RingButton from '../common/RingButton'

interface SearchResult {
  key: string
  icon: string
  label: string
  sub: string
  go: () => void
}

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

  const selectContact = useUIStore((s) => s.selectContact)
  const setActiveBoard = useUIStore((s) => s.setActiveBoard)
  const { docs: contacts } = useContacts()
  const { docs: deals } = useAllDeals()
  const { docs: activities } = useActivities()
  const { docs: invoices } = useInvoices()

  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)

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

      <div style={{ position: 'relative', width: 280 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(176,148,210,0.12)', borderRadius: 11, padding: '9px 14px' }}>
          <MaterialIcon name="search" size={19} color="#7d7388" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Buscar negócios, contatos..."
            style={{ background: 'transparent', border: 'none', outline: 'none', color: '#e8e2ee', fontSize: 13, width: '100%' }}
          />
        </div>
        {showResults && (
          <div style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0, maxHeight: 340, overflowY: 'auto', background: '#17121e', border: '1px solid rgba(176,148,210,0.2)', borderRadius: 13, boxShadow: '0 14px 34px rgba(8,5,12,0.55)', padding: 6, zIndex: 30 }}>
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

      <button style={{ position: 'relative', width: 42, height: 42, borderRadius: 11, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(176,148,210,0.12)', color: '#b9aec6', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <MaterialIcon name="notifications" size={21} />
        <span style={{ position: 'absolute', top: 9, right: 10, width: 7, height: 7, borderRadius: '50%', background: '#cd8ae0', boxShadow: '0 0 8px #cd8ae0' }} />
      </button>

      <RingButton
        radius={11}
        onClick={() => navigate('/agente')}
        style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'linear-gradient(140deg,#7a52a0,#553578)', border: '1px solid rgba(200,160,230,0.3)', padding: '0 16px', height: 42, color: '#f4eefa', fontWeight: 600, fontSize: 13, cursor: 'pointer', boxShadow: '0 6px 18px rgba(110,65,150,0.35)' }}
      >
        <MaterialIcon name="auto_awesome" size={19} /> Titã IA
      </RingButton>
    </header>
  )
}
