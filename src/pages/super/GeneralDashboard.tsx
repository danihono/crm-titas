import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import SuperShell from './SuperShell'
import { useOwnerStats } from '../../hooks/useOwnerStats'
import { useClients } from '../../hooks/useClients'
import { useTenantStore } from '../../store/tenantStore'
import { fmtBRL, fmtMoney } from '../../lib/format'
import MaterialIcon from '../../components/common/MaterialIcon'

export default function GeneralDashboard() {
  const navigate = useNavigate()
  const stats = useOwnerStats()
  const { clients } = useClients()
  const enterClient = useTenantStore((s) => s.enterClient)

  const kpis = [
    { icon: 'groups', c: '#7a52a0', label: 'Clientes', value: String(clients.length) },
    { icon: 'payments', c: '#2f9e6f', label: 'Pipeline total', value: fmtBRL(stats.pipelineTotal) },
    { icon: 'handshake', c: '#b3801f', label: 'Negócios ativos', value: String(stats.dealCount) },
    { icon: 'hourglass_top', c: '#4f7fc0', label: 'A receber', value: fmtBRL(stats.aReceber) },
    { icon: 'warning', c: '#c14d77', label: 'Vencido', value: fmtBRL(stats.vencido) },
    { icon: 'paid', c: '#2f9e6f', label: 'Faturado (pago)', value: fmtBRL(stats.faturado) },
    { icon: 'forum', c: '#4f7fc0', label: 'Contatos', value: String(stats.contactsCount) },
    { icon: 'task_alt', c: '#b3801f', label: 'Atividades', value: String(stats.activitiesCount) },
  ]

  const ranking = clients
    .map((c) => ({ ...c, pipeline: stats.perClient[c.uid]?.pipeline ?? 0, deals: stats.perClient[c.uid]?.deals ?? 0 }))
    .sort((a, b) => b.pipeline - a.pipeline)
    .slice(0, 8)
  const maxPipe = Math.max(1, ...ranking.map((r) => r.pipeline))

  return (
    <SuperShell title="Visão Geral" back>
      <h1 style={{ fontFamily: "'Cormorant Garamond',serif" }} className="text-[28px] font-bold text-[#f3eef6] mb-1">Panorama de todos os clientes</h1>
      <p className="text-[#8a7d97] text-sm mb-6">Métricas agregadas em tempo real {stats.loading && '· carregando…'}</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {kpis.map((k, i) => (
          <motion.div
            key={k.label}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04, duration: 0.35 }}
            className="rounded-2xl p-5 border border-[rgba(176,148,210,0.12)] bg-[rgba(255,255,255,0.03)]"
          >
            <div className="w-10 h-10 rounded-xl grid place-items-center mb-3" style={{ background: k.c + '22' }}>
              <MaterialIcon name={k.icon} size={20} color={k.c} />
            </div>
            <div className="text-[22px] font-extrabold text-[#f1ecf5] leading-none">{k.value}</div>
            <div className="text-[12.5px] text-[#9a8fa8] mt-2">{k.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="rounded-2xl p-6 border border-[rgba(176,148,210,0.12)] bg-[rgba(255,255,255,0.03)]">
        <div className="flex items-center justify-between mb-4">
          <div className="text-[15px] font-bold text-[#f1ecf5]">Ranking de clientes por pipeline</div>
          <button onClick={() => navigate('/super/clientes')} className="text-[12px] text-[#c9a6e0] font-semibold">Ver todos</button>
        </div>
        {ranking.length === 0 && <div className="text-sm text-[#8a7d97] py-6 text-center">Nenhum cliente com dados ainda.</div>}
        <div className="flex flex-col gap-3">
          {ranking.map((r) => (
            <div
              key={r.uid}
              onClick={() => { enterClient({ uid: r.uid, name: r.displayName }); navigate('/') }}
              className="flex items-center gap-3 cursor-pointer group"
            >
              <div className="w-9 h-9 rounded-full grid place-items-center text-[12px] font-bold text-[#160f1d] shrink-0" style={{ background: 'linear-gradient(150deg,#b692d6,#6f4d92)' }}>
                {(r.displayName[0] || '?').toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between text-[13px] mb-1">
                  <span className="text-[#ece6f0] font-semibold truncate group-hover:text-[#c9a6e0]">{r.displayName}</span>
                  <span className="text-[#9a8fa8]">R$ {fmtMoney(r.pipeline)} · {r.deals} neg.</span>
                </div>
                <div className="h-2 rounded bg-[rgba(255,255,255,0.06)] overflow-hidden">
                  <div className="h-full rounded" style={{ width: `${Math.round((r.pipeline / maxPipe) * 100)}%`, background: 'linear-gradient(90deg,#9a6fb8,#7a52a0)' }} />
                </div>
              </div>
              <MaterialIcon name="chevron_right" size={20} color="#6f6579" />
            </div>
          ))}
        </div>
      </div>
    </SuperShell>
  )
}
