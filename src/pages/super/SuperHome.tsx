import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import SuperShell from './SuperShell'
import { t } from '../../i18n'
import { useClients } from '../../hooks/useClients'
import { useAuth } from '../../contexts/AuthContext'
import { useMyPendingInvite, useOwnerEnvironment } from '../../hooks/useTeam'
import { acceptPendingInvite } from '../../lib/team'
import { auth } from '../../lib/firebase'
import { useTenantStore } from '../../store/tenantStore'
import MaterialIcon from '../../components/common/MaterialIcon'
import { FONT_DISPLAY } from '../../styles/sx'
import type { MemberRole } from '../../types'

const PAPEL = { dono: 'equipe.dono', gestor: 'equipe.gestor', atendente: 'equipe.atendente' } as const
const papel = (r: MemberRole) => t(PAPEL[r]).toLowerCase()

export default function SuperHome() {
  const navigate = useNavigate()
  const { user, reenviarVerificacao } = useAuth()
  const { clients } = useClients()
  const { environment, outros, loading: loadingEnv } = useOwnerEnvironment()
  const convite = useMyPendingInvite()
  const enterOwnerEnv = useTenantStore((s) => s.enterOwnerEnv)
  const [aceitando, setAceitando] = useState(false)
  const [aviso, setAviso] = useState('')

  /**
   * Aceita aqui o convite que o login não aceitou (sessão já aberta, ou e-mail que acabou
   * de ser confirmado). O reload + token novo é o que faz a regra de `members` enxergar
   * `email_verified` — o token da sessão ainda carrega o valor de quando foi emitido.
   */
  async function aceitarConvite() {
    const u = auth.currentUser
    if (!u || aceitando) return
    setAceitando(true)
    setAviso('')
    try {
      await u.reload()
      await u.getIdToken(true)
      const r = await acceptPendingInvite(u.uid, u.displayName || u.email || '', u.email ?? '', u.emailVerified)
      if (r === 'precisa-verificar') {
        await reenviarVerificacao().catch(() => {})
        setAviso(t('super.meuAmbienteVerificar'))
      } else if (r) {
        enterOwnerEnv({ uid: r.tenantUid, name: r.tenantName })
        navigate('/')
      }
    } catch (err) {
      setAviso(t('super.meuAmbienteFalha', { erro: err instanceof Error ? err.message : String(err) }))
    } finally {
      setAceitando(false)
    }
  }

  // O que o card diz e faz quando ainda não há vínculo `dono`. Cada caso aponta o passo
  // que falta — "nenhum ambiente vinculado" sozinho não dizia se o convite nem existia,
  // se esperava aceite ou se tinha saído com o papel errado.
  let meuDesc = ''
  let meuClick: (() => void) | undefined
  if (environment) {
    meuDesc = t('super.meuAmbienteSub', { nome: environment.tenantName })
    meuClick = () => {
      enterOwnerEnv({ uid: environment.tenantUid, name: environment.tenantName })
      navigate('/')
    }
  } else if (convite && convite.role === 'dono') {
    meuDesc = t('super.meuAmbienteConvite', { nome: convite.tenantName })
    meuClick = () => { void aceitarConvite() }
  } else if (convite) {
    meuDesc = t('super.meuAmbienteConviteOutroPapel', { nome: convite.tenantName, papel: papel(convite.role) })
  } else if (outros[0]) {
    meuDesc = t('super.meuAmbientePapelErrado', { nome: outros[0].tenantName, papel: papel(outros[0].role) })
  } else if (!loadingEnv) {
    meuDesc = t('super.meuAmbienteSemVinculo')
  }
  if (aviso) meuDesc = aviso
  const first = (user?.displayName || '').split(' ')[0]

  const cards: {
    key: string
    icon: string
    title: string
    desc: string
    accent: string
    onClick?: () => void
  }[] = [
    {
      key: '/super/geral',
      onClick: () => navigate('/super/geral'),
      icon: 'insights',
      title: t('super.visaoGeralSistema'),
      desc: t('super.visaoGeralSub'),
      accent: 'linear-gradient(140deg,#7a52a0,#553578)',
    },
    {
      key: '/super/clientes',
      onClick: () => navigate('/super/clientes'),
      icon: 'groups',
      title: t('super.clientes'),
      desc: t('super.clientesSub') + (clients.length ? t('super.clientesContagem', { n: clients.length }) : '') + '.',
      accent: 'linear-gradient(140deg,#4f7fc0,#2e4f86)',
    },
    {
      key: '/super/assistente',
      onClick: () => navigate('/super/assistente'),
      icon: 'auto_awesome',
      title: t('assistente.titulo'),
      desc: t('super.assistenteSub'),
      accent: 'linear-gradient(140deg,#9a6fb8,#5a3a7e)',
    },
    {
      key: 'meu-ambiente',
      icon: 'home_work',
      title: t('super.meuAmbiente'),
      desc: meuDesc,
      accent: 'linear-gradient(140deg,#c08a4f,#86562e)',
      onClick: aceitando ? undefined : meuClick,
    },
  ]

  return (
    <SuperShell>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="text-[#8a7d97] text-sm">Bem-vindo{first ? `, ${first}` : ''}</div>
        <h1 style={{ fontFamily: FONT_DISPLAY }} className="text-[38px] font-normal text-[#f3eef6] leading-snug">
          O que você quer ver hoje?
        </h1>
        <p className="text-[#8a7d97] mt-1 max-w-xl">{t('super.homeDica')}</p>
      </motion.div>

      <div className="grid sm:grid-cols-2 gap-5 mt-8">
        {cards.map((c, i) => (
          <motion.button
            key={c.key}
            onClick={c.onClick}
            disabled={!c.onClick}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.1, duration: 0.5 }}
            whileHover={c.onClick ? { y: -4 } : undefined}
            className="text-left rounded-3xl p-7 border border-[rgba(176,148,210,0.14)] bg-[rgba(255,255,255,0.03)] enabled:hover:bg-[rgba(255,255,255,0.05)] disabled:opacity-60 disabled:cursor-default transition-colors"
            style={{ boxShadow: '0 20px 60px rgba(8,5,12,0.45)' }}
          >
            <div className="w-14 h-14 rounded-2xl grid place-items-center mb-5" style={{ background: c.accent, boxShadow: '0 10px 28px rgba(110,65,150,0.4)' }}>
              <MaterialIcon name={c.icon} size={28} color="#fff" />
            </div>
            <div className="text-[19px] font-bold text-[#f1ecf5]">{c.title}</div>
            <div className="text-[13.5px] text-[#9a8fa8] mt-2 leading-relaxed">{c.desc}</div>
            {c.onClick && (
              <div className="mt-5 inline-flex items-center gap-1 text-[#c9a6e0] text-[13px] font-semibold">
                Abrir <MaterialIcon name="arrow_forward" size={17} />
              </div>
            )}
          </motion.button>
        ))}
      </div>
    </SuperShell>
  )
}
