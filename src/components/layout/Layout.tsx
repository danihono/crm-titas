import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import PageHeader from './PageHeader'
import MaterialIcon from '../common/MaterialIcon'
import { C, FONT_UI } from '../../styles/sx'
import { useTenantStore } from '../../store/tenantStore'
import { useMemberships } from '../../hooks/useTeam'

/**
 * Cabeçalho por rota. Só entra onde a tela não tem um próprio:
 *  - Dashboard monta o seu (é o da saudação);
 *  - Relatórios e Campanhas já têm <h1>;
 *  - Contatos, Pipeline e Agente de IA ocupam a altura toda (height:100%) e são
 *    identificados pelo menu lateral; um cabeçalho ali roubaria altura da
 *    conversa e ainda quebraria o cálculo de altura dos painéis.
 */
const HEADERS: Record<string, { title: string; subtitle: string }> = {
  '/atividades': { title: 'Atividades', subtitle: 'Ligações, reuniões, e-mails e tarefas — o que está pendente, atrasado e concluído.' },
  '/faturamento': { title: 'Faturamento', subtitle: 'Cobranças emitidas, o que já foi pago e o que está vencendo.' },
  '/agenda': { title: 'Agenda', subtitle: 'Compromissos e mensagens agendadas do mês.' },
  '/configuracoes': { title: 'Configurações', subtitle: 'Perfil, equipe, atendimento e automações deste ambiente.' },
}

export default function Layout() {
  const { pathname } = useLocation()
  const header = HEADERS[pathname]
  const readOnly = useTenantStore((s) => s.readOnly)
  const client = useTenantStore((s) => s.client)
  const tenantUid = useTenantStore((s) => s.tenantUid)
  const role = useTenantStore((s) => s.role)
  const exitClient = useTenantStore((s) => s.exitClient)
  const enterMembership = useTenantStore((s) => s.enterMembership)
  const { memberships } = useMemberships()

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', background: 'var(--c-void)' }}>
      <Sidebar />
      <main style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', minWidth: 0, background: C.panel }}>
        {/* Atendente convidado: mostra em que equipe está e deixa voltar à conta dele. */}
        {!readOnly && memberships.length > 0 && (
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '0 22px', height: 38, background: C.tintPurple, borderBottom: `1px solid ${C.selBorder}`, color: C.purple, fontSize: 12.5 }}>
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
              style={{ background: C.surface, border: `1px solid ${C.fieldBorder}`, borderRadius: 9, padding: '5px 9px', fontSize: 12, color: C.purple, fontFamily: FONT_UI, cursor: 'pointer', outline: 'none' }}
            >
              <option value="">Minha conta</option>
              {memberships.map((m) => (
                <option key={m.tenantUid} value={m.tenantUid}>{m.tenantName}</option>
              ))}
            </select>
          </div>
        )}
        <Topbar />
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', background: C.panel }}>
          {header && <PageHeader title={header.title} subtitle={header.subtitle} />}
          <Outlet />
        </div>
      </main>
    </div>
  )
}
