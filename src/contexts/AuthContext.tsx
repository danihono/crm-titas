import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
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

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u)
      setLoading(false)
      // ao deslogar, limpa o cliente selecionado por um dono (evita herança de tenant).
      if (!u) useTenantStore.getState().exitClient()
    })
  }, [])

  /**
   * Passos comuns a login e cadastro: doc base, vínculo de dono no próprio tenant e
   * aceite de um convite pendente. Se havia convite, o usuário já entra atendendo na
   * equipe que o chamou — é o único motivo de um atendente ter criado a conta.
   */
  async function settleSession(uid: string, name: string, email: string) {
    await bootstrapUserDoc(uid, name)
    // Backfill do e-mail no doc (permite a lista de clientes do dono filtrar donos).
    await setDoc(doc(db, 'users', uid), { email }, { merge: true })
    await ensureOwnerMember(uid, name, email)

    // Best-effort: sem convite (ou com ele já aceito noutra aba) o login segue normal.
    const joined = await acceptPendingInvite(uid, name, email).catch((err) => {
      console.error('[acceptPendingInvite]', err)
      return null
    })
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
    await settleSession(cred.user.uid, name || email, cred.user.email ?? email)
  }

  async function signIn(email: string, password: string) {
    const cred = await signInWithEmailAndPassword(auth, email, password)
    // Garante o doc base caso a conta tenha sido criada fora do fluxo de signup.
    await settleSession(cred.user.uid, cred.user.displayName || email, cred.user.email ?? email)
  }

  function logout() {
    return signOut(auth)
  }

  return (
    <AuthContext.Provider value={{ user, loading, isOwner: isOwnerEmail(user?.email), signUp, signIn, logout }}>
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
