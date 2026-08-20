import { deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { db } from './firebase'
import { col, ref } from './paths'
import { inviteFromDoc, memberFromDoc } from './converters'
import type { MemberRole } from '../types'

/**
 * Um vínculo do usuário logado — o tenant de outra pessoa em que ele atende.
 *
 * Estas funções vivem aqui, e não em hooks/useTeam.ts, porque o AuthContext precisa
 * delas no login: importar o módulo de hooks de lá fecharia um ciclo
 * (AuthContext → useTeam → useCollection → AuthContext).
 */
export interface Membership {
  tenantUid: string
  tenantName: string
  role: MemberRole
}

export function emailKey(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * Convida um atendente por e-mail. O doc fica em invites/{email} e é o próprio
 * convidado quem cria o vínculo ao entrar (ver acceptPendingInvite) — o tenant não
 * tem como criar users/{tenant}/members/{uid} sem conhecer o uid dele.
 */
export async function inviteMember(
  tenantUid: string,
  tenantName: string,
  email: string,
  role: MemberRole,
  sectorIds: string[] = [],
): Promise<void> {
  const key = emailKey(email)
  if (!key) throw new Error('Informe um e-mail.')
  await setDoc(doc(db, 'invites', key), {
    email: key,
    tenantUid,
    tenantName,
    role,
    sectorIds,
    createdAt: serverTimestamp(),
  })
}

export async function cancelInvite(email: string): Promise<void> {
  await deleteDoc(doc(db, 'invites', emailKey(email)))
}

export async function updateMemberRole(memberUid: string, role: MemberRole): Promise<void> {
  await updateDoc(ref(`members/${memberUid}`), { role })
}

export async function updateMemberSectors(memberUid: string, sectorIds: string[]): Promise<void> {
  await updateDoc(ref(`members/${memberUid}`), { sectorIds })
}

/**
 * Desativa/reativa em vez de apagar: as conversas e os relatórios guardam o uid do
 * atendente, e remover o doc deixaria esse histórico apontando para o vazio.
 */
export async function setMemberActive(memberUid: string, active: boolean): Promise<void> {
  await updateDoc(ref(`members/${memberUid}`), { active })
}

/**
 * Garante o vínculo do DONO no próprio tenant. Sem ele o dono não aparece na lista de
 * atendentes e não dá para atribuir conversa a si mesmo.
 */
export async function ensureOwnerMember(uid: string, name: string, email: string): Promise<void> {
  const r = doc(db, 'users', uid, 'members', uid)
  if ((await getDoc(r)).exists()) return
  await setDoc(r, {
    name: name || email,
    email: emailKey(email),
    role: 'dono',
    sectorIds: [],
    active: true,
    createdAt: serverTimestamp(),
  })
}

/**
 * Aceita o convite endereçado ao e-mail do usuário logado, se houver: cria o próprio
 * doc de membro e apaga o convite. Devolve o tenant em que entrou, ou null.
 *
 * O papel é copiado do convite porque a regra do Firestore exige que sejam iguais —
 * é o que impede alguém de se criar como `dono` do tenant alheio.
 */
export async function acceptPendingInvite(
  uid: string,
  name: string,
  email: string,
): Promise<Membership | null> {
  const key = emailKey(email)
  if (!key) return null
  const inviteRef = doc(db, 'invites', key)
  const snap = await getDoc(inviteRef)
  if (!snap.exists()) return null

  const invite = inviteFromDoc(snap.id, snap.data())
  if (!invite.tenantUid || invite.tenantUid === uid) return null

  await setDoc(doc(db, 'users', invite.tenantUid, 'members', uid), {
    name: name || key,
    email: key,
    role: invite.role,
    sectorIds: invite.sectorIds,
    active: true,
    tenantName: invite.tenantName,
    createdAt: serverTimestamp(),
  })
  // Best-effort: o vínculo já existe, e um convite órfão só polui a lista de pendentes.
  await deleteDoc(inviteRef).catch(() => {})

  return { tenantUid: invite.tenantUid, tenantName: invite.tenantName || 'Equipe', role: invite.role }
}

/** Nomes dos atendentes por uid — para rotular conversas e relatórios sem N leituras. */
export async function fetchMemberNames(): Promise<Record<string, string>> {
  const snap = await getDocs(col('members'))
  const out: Record<string, string> = {}
  snap.docs.forEach((d) => {
    out[d.id] = memberFromDoc(d.id, d.data()).name
  })
  return out
}
