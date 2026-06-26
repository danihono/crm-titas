import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import SuperShell from './SuperShell'
import { useClients } from '../../hooks/useClients'
import { useAuth } from '../../contexts/AuthContext'
import MaterialIcon from '../../components/common/MaterialIcon'

export default function SuperHome() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { clients } = useClients()
  const first = (user?.displayName || '').split(' ')[0]

  const cards = [
    {
      to: '/super/geral',
      icon: 'insights',
      title: 'Visão Geral do Sistema',
      desc: 'Dashboards agregados de todos os clientes — pipeline, faturamento, atividades e ranking.',
      accent: 'linear-gradient(140deg,#7a52a0,#553578)',
    },
    {
      to: '/super/clientes',
      icon: 'groups',
      title: 'Clientes',
      desc: `Acesse o CRM de cada cliente individualmente${clients.length ? ` · ${clients.length} cliente(s)` : ''}.`,
      accent: 'linear-gradient(140deg,#4f7fc0,#2e4f86)',
    },
  ]

  return (
    <SuperShell>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="text-[#8a7d97] text-sm">Bem-vindo{first ? `, ${first}` : ''}</div>
        <h1 style={{ fontFamily: "'Cormorant Garamond',serif" }} className="text-[34px] font-bold text-[#f3eef6] leading-tight">
          O que você quer ver hoje?
        </h1>
        <p className="text-[#8a7d97] mt-1 max-w-xl">Como dono do sistema, você pode olhar o panorama geral de todos os clientes ou entrar no CRM de um cliente específico.</p>
      </motion.div>

      <div className="grid sm:grid-cols-2 gap-5 mt-8">
        {cards.map((c, i) => (
          <motion.button
            key={c.to}
            onClick={() => navigate(c.to)}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.1, duration: 0.5 }}
            whileHover={{ y: -4 }}
            className="text-left rounded-3xl p-7 border border-[rgba(176,148,210,0.14)] bg-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.05)] transition-colors"
            style={{ boxShadow: '0 20px 60px rgba(8,5,12,0.45)' }}
          >
            <div className="w-14 h-14 rounded-2xl grid place-items-center mb-5" style={{ background: c.accent, boxShadow: '0 10px 28px rgba(110,65,150,0.4)' }}>
              <MaterialIcon name={c.icon} size={28} color="#fff" />
            </div>
            <div className="text-[19px] font-bold text-[#f1ecf5]">{c.title}</div>
            <div className="text-[13.5px] text-[#9a8fa8] mt-2 leading-relaxed">{c.desc}</div>
            <div className="mt-5 inline-flex items-center gap-1 text-[#c9a6e0] text-[13px] font-semibold">
              Abrir <MaterialIcon name="arrow_forward" size={17} />
            </div>
          </motion.button>
        ))}
      </div>
    </SuperShell>
  )
}
