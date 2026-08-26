import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import MaterialIcon from '../../components/common/MaterialIcon'

/**
 * Caixa de diálogo do painel SUPER TITAN. O Modal de components/modals é branco
 * (sx.modalBox), feito para o CRM; aqui o fundo é escuro e o visual precisa combinar
 * com o SuperShell.
 */
export default function SuperModal({ title, subtitle, icon, width = 460, onClose, children }: {
  title: string
  subtitle?: string
  icon?: string
  width?: number
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(10,6,16,0.66)', backdropFilter: 'blur(5px)' }}
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.22 }}
        style={{ width, maxWidth: '100%', background: 'linear-gradient(180deg,#171021,#100b18)', boxShadow: '0 30px 90px rgba(6,3,12,0.7)' }}
        className="rounded-2xl border border-[rgba(176,148,210,0.16)] max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-start gap-3 px-6 pt-6 pb-4">
          {icon && (
            <div className="w-10 h-10 rounded-xl grid place-items-center shrink-0 bg-[rgba(150,110,200,0.14)]">
              <MaterialIcon name={icon} size={20} color="#c9a6e0" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-[16px] font-bold text-[#f1ecf5]">{title}</div>
            {subtitle && <div className="text-[12.5px] text-[#9a8fa8] mt-1 leading-relaxed">{subtitle}</div>}
          </div>
          <button
            onClick={onClose}
            title="Fechar"
            className="w-8 h-8 rounded-lg grid place-items-center text-[#8a7d97] hover:bg-[rgba(255,255,255,0.06)]"
          >
            <MaterialIcon name="close" size={18} />
          </button>
        </div>
        <div className="px-6 pb-6">{children}</div>
      </motion.div>
    </div>
  )
}

/** Campo rotulado, no tom escuro do painel. */
export function SuperField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-semibold text-[#9a8fa8]">{label}</span>
      {children}
      {hint && <span className="text-[11.5px] text-[#7d7388]">{hint}</span>}
    </label>
  )
}

export const superInputClass =
  'w-full bg-[rgba(255,255,255,0.04)] border border-[rgba(176,148,210,0.16)] rounded-xl px-3.5 h-11 text-[13.5px] text-[#ece6f0] outline-none focus:border-[rgba(176,148,210,0.4)]'
