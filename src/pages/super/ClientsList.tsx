import { useState } from 'react'
import { motion } from 'framer-motion'
import SuperShell from './SuperShell'
import ClientEditModal from './ClientEditModal'
import ClientDeleteModal from './ClientDeleteModal'
import { useClients, type Client } from '../../hooks/useClients'
import { useOwnerStats } from '../../hooks/useOwnerStats'
import { brandGradient, brandShadow } from '../../lib/clientBrand'
import { fmtMoney } from '../../lib/format'
import MaterialIcon from '../../components/common/MaterialIcon'
import RingButton from '../../components/common/RingButton'
import { FONT_DISPLAY } from '../../styles/sx'

export default function ClientsList() {
  const { clients, loading } = useClients()
  const stats = useOwnerStats()
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Client | null>(null)
  const [deleting, setDeleting] = useState<Client | null>(null)

  const filtered = clients.filter((c) => c.displayName.toLowerCase().includes(q.toLowerCase()) || (c.email || '').toLowerCase().includes(q.toLowerCase()))

  return (
    <SuperShell title="Clientes" back>
      <div className="flex items-center gap-3 mb-4">
        <h1 style={{ fontFamily: FONT_DISPLAY }} className="text-[28px] font-bold text-[#f3eef6]">Clientes</h1>
        <span className="text-[12px] text-[#9a6fb8] font-bold bg-[rgba(150,110,200,0.14)] rounded-full px-2.5 py-0.5">{clients.length}</span>
        <div className="flex-1" />
        <div className="flex items-center gap-2 bg-[rgba(255,255,255,0.04)] border border-[rgba(176,148,210,0.14)] rounded-xl px-3 h-10 w-64 max-w-full">
          <MaterialIcon name="search" size={18} color="#7d7388" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente..." className="bg-transparent outline-none text-[13px] text-[#e8e2ee] w-full" />
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-xl px-4 py-3 mb-6 bg-[rgba(150,110,200,0.10)] border border-[rgba(150,110,200,0.22)] text-[12.5px] text-[#c3aad6]">
        <MaterialIcon name="lock" size={17} color="#c9a6e0" />
        <span>
          Você administra a <b>ficha</b> de cada cliente — nome, cor e logo — e pode excluir a conta.
          Os dados de atendimento (conversas, contatos e arquivos) são confidenciais e não ficam acessíveis daqui.
        </span>
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
                <div
                  className="w-11 h-11 rounded-full grid place-items-center overflow-hidden shrink-0 text-[14px] font-bold text-[#160f1d]"
                  style={{ background: brandGradient(c.brandColor) }}
                >
                  {c.logoUrl
                    ? <img src={c.logoUrl} alt="" className="w-full h-full object-cover" />
                    : (c.displayName[0] || '?').toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-bold text-[#f1ecf5] truncate">{c.displayName}</div>
                  <div className="text-[11.5px] text-[#9a8fa8] truncate">{c.email || c.role || '—'}</div>
                </div>
                <button
                  onClick={() => setDeleting(c)}
                  title="Excluir cliente"
                  className="w-9 h-9 rounded-xl grid place-items-center text-[#a8899a] hover:text-[#e8a9be] hover:bg-[rgba(193,77,119,0.14)] transition-colors"
                >
                  <MaterialIcon name="delete" size={19} />
                </button>
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
                onClick={() => setEditing(c)}
                className="h-10 text-[13px] font-bold text-[#f4eefa] flex items-center justify-center gap-1.5"
                style={{ background: brandGradient(c.brandColor, 140), boxShadow: brandShadow(c.brandColor) }}
              >
                <MaterialIcon name="edit" size={17} /> Editar cliente
              </RingButton>
            </motion.div>
          )
        })}
      </div>

      {editing && <ClientEditModal client={editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <ClientDeleteModal
          client={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => setDeleting(null)}
        />
      )}
    </SuperShell>
  )
}
