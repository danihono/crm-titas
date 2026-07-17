import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AuroraBackground } from '@/components/ui/aurora-background'
import { useAuth } from '../contexts/AuthContext'
import RingButton from '../components/common/RingButton'
import { sx } from '../styles/sx'

export default function Login() {
  const { user, signIn, signUp } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to="/" replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (mode === 'signup') await signUp(name.trim(), email.trim(), password)
      else await signIn(email.trim(), password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    // `dark` ancestor ativa as variantes dark: do AuroraBackground (gradiente preto);
    // `login-aurora` recolore o efeito para roxo (ver src/index.css).
    <div className="dark">
      <AuroraBackground className="login-aurora">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.8, ease: 'easeInOut' }}
          style={{ position: 'relative', zIndex: 10, padding: 20, maxWidth: '100%' }}
        >
          <div
            style={{
              width: 380,
              maxWidth: '100%',
              background: 'rgba(255,255,255,0.03)',
              backdropFilter: 'blur(6px)',
          border: '1px solid rgba(176,148,210,0.12)',
          borderRadius: 22,
          padding: '34px 32px',
          boxShadow: '0 30px 80px rgba(8,5,12,0.5)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 26 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 13,
              background: 'linear-gradient(150deg,#9a6fb8,#5a3a7e)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 6px 18px rgba(120,70,160,0.4)',
            }}
          >
            <span style={{ ...sx.serif, fontSize: 30, fontWeight: 600, color: '#fff', lineHeight: 1, letterSpacing: '.04em' }}>T</span>
          </div>
          <div>
            <div style={{ ...sx.serif, fontWeight: 600, fontSize: 25, letterSpacing: '.18em', color: '#f3eef6', lineHeight: 1 }}>TITÃS</div>
            <div style={{ fontSize: 9, letterSpacing: '.42em', color: '#8a7d97', marginTop: 3, fontWeight: 600 }}>C R M</div>
          </div>
        </div>

        <div style={{ fontSize: 18, fontWeight: 700, color: '#f1ecf5', marginBottom: 4 }}>
          {mode === 'login' ? 'Entrar na sua conta' : 'Criar conta'}
        </div>
        <div style={{ fontSize: 13, color: '#8a7d97', marginBottom: 22 }}>
          {mode === 'login' ? 'Use seu e-mail e senha.' : 'Preencha os dados para começar.'}
        </div>

        <form onSubmit={onSubmit}>
          {mode === 'signup' && (
            <Field label="Nome" value={name} onChange={setName} placeholder="Seu nome" autoComplete="name" />
          )}
          <Field label="E-mail" type="email" value={email} onChange={setEmail} placeholder="voce@empresa.com" autoComplete="email" />
          <Field label="Senha" type="password" value={password} onChange={setPassword} placeholder="••••••••" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />

          {error && (
            <div style={{ fontSize: 12.5, color: '#e58aab', background: 'rgba(217,138,171,0.12)', border: '1px solid rgba(217,138,171,0.25)', borderRadius: 10, padding: '9px 12px', marginBottom: 14 }}>
              {error}
            </div>
          )}

          <RingButton
            radius={12}
            block
            type="submit"
            disabled={busy}
            style={{
              background: 'linear-gradient(140deg,#7a52a0,#553578)',
              border: '1px solid rgba(200,160,230,0.3)',
              padding: '13px',
              color: '#f4eefa',
              fontSize: 14,
              fontWeight: 700,
              cursor: busy ? 'default' : 'pointer',
              opacity: busy ? 0.7 : 1,
              boxShadow: '0 6px 18px rgba(110,65,150,0.35)',
            }}
          >
            {busy ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar conta'}
          </RingButton>
        </form>

        <div style={{ fontSize: 12.5, color: '#8a7d97', marginTop: 18, textAlign: 'center' }}>
          {mode === 'login' ? 'Não tem conta? ' : 'Já tem conta? '}
          <span
            onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError('') }}
            style={{ color: '#c9a6e0', fontWeight: 700, cursor: 'pointer' }}
          >
            {mode === 'login' ? 'Criar conta' : 'Entrar'}
          </span>
        </div>
          </div>
        </motion.div>
      </AuroraBackground>
    </div>
  )
}

function Field(props: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  autoComplete?: string
}) {
  return (
    <label style={{ display: 'block', marginBottom: 14 }}>
      <span style={{ fontSize: 12, color: '#a99fb8', fontWeight: 600 }}>{props.label}</span>
      <input
        type={props.type || 'text'}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        autoComplete={props.autoComplete}
        required
        style={{
          width: '100%',
          marginTop: 6,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(176,148,210,0.18)',
          borderRadius: 11,
          padding: '12px 14px',
          color: '#ece6f0',
          fontSize: 14,
          outline: 'none',
        }}
      />
    </label>
  )
}

function friendlyError(err: unknown): string {
  const code = (err as { code?: string })?.code || ''
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'E-mail ou senha incorretos.'
    case 'auth/email-already-in-use':
      return 'Este e-mail já está em uso.'
    case 'auth/weak-password':
      return 'A senha precisa ter pelo menos 6 caracteres.'
    case 'auth/invalid-email':
      return 'E-mail inválido.'
    default:
      return 'Não foi possível concluir. Tente novamente.'
  }
}
