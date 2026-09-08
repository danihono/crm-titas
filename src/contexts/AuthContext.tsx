import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth'
import { doc, getDoc, setDoc, writeBatch, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import { defaultAgentConfig, defaultActTypes } from '../lib/theme'
import { isOwnerEmail } from '../lib/owners'
import { useTenantStore } from '../store/tenantStore'
import { acceptPendingInvite, ensureOwnerMember } from '../lib/team'

interface AuthContextValue {
  user: User | null
  loading: boolean
  /** true se o usuário logado é um dono do sistema (SUPER TITAN). */
  isOwner: boolean
  /**
   * Existe um convite esperando esta pessoa, mas o e-mail dela ainda não foi confirmado.
   * O aceite só acontece depois da confirmação — ver acceptPendingInvite.
   */
  conviteAguardandoVerificacao: boolean
  reenviarVerificacao: () => Promise<void>
  signUp: (name: string, email: string, password: string) => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/** Cria o doc users/{uid} (perfil + agente) e os tipos de atividade padrão na 1ª vez. */
async function bootstrapUserDoc(uid: string, displayName: string) {
  const ref = doc(db, 'users', uid)
  const snap = await getDoc(ref)
  if (snap.exists()) return
  await setDoc(ref, {
    displayName,
    role: 'Gerente Comercial',
    agent: defaultAgentConfig,
    createdAt: serverTimestamp(),
  })
  const batch = writeBatch(db)
  for (const t of defaultActTypes) {
    batch.set(doc(db, 'users', uid, 'actTypes', t.id), {
      label: t.label,
      icon: t.icon,
      color: t.color,
      bg: t.bg,
      evColor: t.evColor,
    })
  }
  await batch.commit()
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [conviteAguardandoVerificacao, setConviteAguardando] = useState(false)
  /** uid já preparado nesta sessão — trava o settleSession contra reentrada. */
  const settledUid = useRef<string | null>(null)

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u)
      setLoading(false)
      if (!u) {
        // ao deslogar, limpa o cliente selecionado por um dono (evita herança de tenant).
        settledUid.current = null
        setConviteAguardando(false)
        useTenantStore.getState().exitClient()
        return
      }
      // Sessão restaurada do navegador NÃO passa por signIn(), então é aqui que o
      // vínculo de dono é garantido. Sem isto, quem já estava logado quando os módulos
      // de atendimento subiram nunca ganha o doc em members — e some da lista de
      // atendentes, do seletor de responsável e dos relatórios por atendente.
      void settleSession(u.uid, u.displayName || u.email || '', u.email ?? '', u.emailVerified).catch((err) =>
        console.error('[settleSession]', err),
      )
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Passos comuns a toda sessão: doc base, vínculo de dono no próprio tenant e aceite
   * de um convite pendente. Se havia convite, o usuário já entra atendendo na equipe
   * que o chamou — é o único motivo de um atendente ter criado a conta.
   *
   * Roda uma vez por sessão: o listener de auth dispara também em renovação de token,
   * e repetir isto a cada renovação seria leitura paga à toa.
   */
  async function settleSession(uid: string, name: string, email: string, emailVerificado: boolean) {
    if (settledUid.current === uid) return
    settledUid.current = uid
    await bootstrapUserDoc(uid, name)
    // Backfill do e-mail no doc (permite a lista de clientes do dono filtrar donos).
    await setDoc(doc(db, 'users', uid), { email }, { merge: true })
    await ensureOwnerMember(uid, name, email)

    // Best-effort: sem convite (ou com ele já aceito noutra aba) o login segue normal.
    const joined = await acceptPendingInvite(uid, name, email, emailVerificado).catch((err) => {
      console.error('[acceptPendingInvite]', err)
      return null
    })
    if (joined === 'precisa-verificar') {
      setConviteAguardando(true)
      return
    }
    setConviteAguardando(false)
    if (joined) {
      useTenantStore.getState().enterMembership(
        { uid: joined.tenantUid, name: joined.tenantName },
        joined.role,
      )
    }
  }

  async function signUp(name: string, email: string, password: string) {
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    if (name) await updateProfile(cred.user, { displayName: name })
    // Best-effort: o cadastro não pode falhar porque o e-mail de confirmação não saiu. Sem
    // a confirmação a pessoa usa a própria conta normalmente — o que ela NÃO consegue é
    // aceitar um convite para o ambiente de outra pessoa (ver acceptPendingInvite).
    await sendEmailVerification(cred.user).catch((err) =>
      console.error('[sendEmailVerification]', err),
    )
    await settleSession(cred.user.uid, name || email, cred.user.email ?? email, cred.user.emailVerified)
    // O listener de auth dispara já na criação da conta, quando o displayName ainda não
    // foi gravado — nesse caso ele preparou a sessão usando o e-mail como nome. Reescreve
    // nos dois lugares que exibem o nome, em vez de disputar a corrida com ele.
    if (name) {
      const uid = cred.user.uid
      await setDoc(doc(db, 'users', uid), { displayName: name }, { merge: true })
      await setDoc(doc(db, 'users', uid, 'members', uid), { name }, { merge: true })
    }
  }

  async function signIn(email: string, password: string) {
    const cred = await signInWithEmailAndPassword(auth, email, password)
    // Garante o doc base caso a conta tenha sido criada fora do fluxo de signup.
    await settleSession(cred.user.uid, cred.user.displayName || email, cred.user.email ?? email, cred.user.emailVerified)
  }

  /** Reenvia a confirmação de e-mail para quem tem convite travado esperando por ela. */
  async function reenviarVerificacao() {
    const u = auth.currentUser
    if (!u) throw new Error('Sem usuário autenticado.')
    await sendEmailVerification(u)
  }

  function logout() {
    return signOut(auth)
  }

  return (
    <AuthContext.Provider value={{
      user, loading, isOwner: isOwnerEmail(user?.email),
      conviteAguardandoVerificacao, reenviarVerificacao,
      signUp, signIn, logout,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>')
  return ctx
}
