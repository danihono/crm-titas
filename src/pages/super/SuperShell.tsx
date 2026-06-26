import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import MaterialIcon from '../../components/common/MaterialIcon'

/** Moldura comum das telas SUPER TITAN — fundo escuro + header com logo e logout. */
export default function SuperShell({ title, back, children }: { title?: string; back?: boolean; children: ReactNode }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const name = user?.displayName || user?.email || 'Dono'

  return (
    <div
      className="min-h-screen w-full text-[#ece6f0]"
      style={{ background: 'radial-gradient(1200px 600px at 80% -10%, rgba(122,82,160,0.25), transparent 60%), linear-gradient(180deg,#0c0912,#07050b)' }}
    >
      <header className="flex items-center gap-3 px-6 h-[68px] border-b border-[rgba(176,148,210,0.10)]">
        {back && (
          <button
            onClick={() => navigate('/super')}
            className="w-10 h-10 rounded-xl grid place-items-center bg-[rgba(255,255,255,0.04)] border border-[rgba(176,148,210,0.14)] text-[#b9aec6] hover:bg-[rgba(255,255,255,0.08)]"
            title="Voltar ao SUPER TITAN"
          >
            <MaterialIcon name="arrow_back" size={20} />
          </button>
        )}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-[11px] grid place-items-center" style={{ background: 'linear-gradient(150deg,#9a6fb8,#5a3a7e)', boxShadow: '0 6px 18px rgba(120,70,160,0.4)' }}>
            <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 600, color: '#fff' }}>T</span>
          </div>
          <div className="leading-none">
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 18, fontWeight: 700, letterSpacing: '.16em', color: '#f3eef6' }}>TITÃS</div>
            <div className="text-[9px] tracking-[.34em] text-[#9a6fb8] font-bold mt-[3px]">S U P E R&nbsp;&nbsp;T I T A N</div>
          </div>
        </div>
        {title && <div className="ml-2 text-sm text-[#8a7d97] hidden sm:block">· {title}</div>}
        <div className="flex-1" />
        <div className="text-right hidden sm:block">
          <div className="text-[13px] font-semibold text-[#ece6f0] leading-tight">{name}</div>
          <div className="text-[11px] text-[#7d7388]">Dono do sistema</div>
        </div>
        <button
          onClick={() => logout()}
          className="w-10 h-10 rounded-xl grid place-items-center bg-[rgba(255,255,255,0.04)] border border-[rgba(176,148,210,0.14)] text-[#b9aec6] hover:bg-[rgba(255,255,255,0.08)]"
          title="Sair"
        >
          <MaterialIcon name="logout" size={19} />
        </button>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
    </div>
  )
}
