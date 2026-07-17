import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import SuperShell from './SuperShell'
import { useClients } from '../../hooks/useClients'
import { useOwnerStats } from '../../hooks/useOwnerStats'
import { useTenantStore } from '../../store/tenantStore'
import { fmtMoney } from '../../lib/format'
import MaterialIcon from '../../components/common/MaterialIcon'
import RingButton from '../../components/common/RingButton'

export default function ClientsList() {
  const navigate = useNavigate()
  const { clients, loading } = useClients()
  const stats = useOwnerStats()
  const enterClient = useTenantStore((s) => s.enterClient)
  const [q, setQ] = useState('')

  function open(uid: string, name: string) {
    enterClient({ uid, name })
    navigate('/')
  }

  const filtered = clients.filter((c) => c.displayName.toLowerCase().includes(q.toLowerCase()) || (c.email || '').toLowerCase().includes(q.toLowerCase()))

  return (
    <SuperShell title="Clientes" back>
      <div className="flex items-center gap-3 mb-6">
        <h1 style={{ fontFamily: "'Cormorant Garamond',serif" }} className="text-[28px] font-bold text-[#f3eef6]">Clientes</h1>
        <span className="text-[12px] text-[#9a6fb8] font-bold bg-[rgba(150,110,200,0.14)] rounded-full px-2.5 py-0.5">{clients.length}</span>
        <div className="flex-1" />
        <div className="flex items-center gap-2 bg-[rgba(255,255,255,0.04)] border border-[rgba(176,148,210,0.14)] rounded-xl px-3 h-10 w-64 max-w-full">
          <MaterialIcon name="search" size={18} color="#7d7388" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente..." className="bg-transparent outline-none text-[13px] text-[#e8e2ee] w-full" />
        </div>
      </div>

      {loading && <div className="text-sm text-[#8a7d97]">Carregando clientes…</div>}
      {!loading && clients.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[rgba(176,148,210,0.18)] p-12 text-center text-[#8a7d97]">
          Nenhum cliente cadastrado ainda. Quando contas de clientes se cadastrarem, elas aparecem aqui.
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((c, i) => {
          const pc = stats.perClient[c.uid]
          return (
            <motion.div
              key={c.uid}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.3), duration: 0.3 }}
              className="rounded-2xl p-5 border border-[rgba(176,148,210,0.12)] bg-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.05)] transition-colors"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 rounded-full grid place-items-center text-[14px] font-bold text-[#160f1d]" style={{ background: 'linear-gradient(150deg,#b692d6,#6f4d92)' }}>
                  {(c.displayName[0] || '?').toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-[14px] font-bold text-[#f1ecf5] truncate">{c.displayName}</div>
                  <div className="text-[11.5px] text-[#9a8fa8] truncate">{c.email || c.role || '—'}</div>
                </div>
              </div>
              <div className="flex gap-2 mb-4">
                <div className="flex-1 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(176,148,210,0.10)] p-2.5">
                  <div className="text-[15px] font-extrabold text-[#ece6f0]">R$ {fmtMoney(pc?.pipeline ?? 0)}</div>
                  <div className="text-[10.5px] text-[#9a8fa8]">pipeline</div>
                </div>
                <div className="flex-1 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(176,148,210,0.10)] p-2.5">
                  <div className="text-[15px] font-extrabold text-[#ece6f0]">{pc?.deals ?? 0}</div>
                  <div className="text-[10.5px] text-[#9a8fa8]">negócios</div>
                </div>
              </div>
              <RingButton
                radius={12}
                block
                onClick={() => open(c.uid, c.displayName)}
                className="h-10 text-[13px] font-bold text-[#f4eefa] flex items-center justify-center gap-1.5"
                style={{ background: 'linear-gradient(140deg,#7a52a0,#553578)', boxShadow: '0 8px 20px rgba(110,65,150,0.3)' }}
              >
                Abrir CRM <MaterialIcon name="arrow_forward" size={17} />
              </RingButton>
            </motion.div>
          )
        })}
      </div>
    </SuperShell>
  )
}
