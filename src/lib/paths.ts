import { collection, doc } from 'firebase/firestore'
import { auth, db } from './firebase'
import { useTenantStore } from '../store/tenantStore'

/**
 * uid do tenant ativo (cliente selecionado por um dono, senão o próprio usuário).
 * Lança se não houver sessão. Mutações de dono em clientes são bloqueadas pelas
 * security rules (somente leitura) — a UI também esconde os botões de escrita.
 */
export function uid(): string {
  const tenant = useTenantStore.getState().tenantUid
  if (tenant) return tenant
  const u = auth.currentUser
  if (!u) throw new Error('Sem usuário autenticado')
  return u.uid
}

/** Coleção sob users/{uid}/<path>. Ex.: col('deals'), col(`contacts/${id}/messages`). */
export function col(path: string) {
  return collection(db, `users/${uid()}/${path}`)
}

/** Documento sob users/{uid}/<path> (path inclui o id). */
export function ref(path: string) {
  return doc(db, `users/${uid()}/${path}`)
}

/** Referência ao doc do próprio usuário (perfil + agente). */
export function userRef() {
  return doc(db, 'users', uid())
}
