import { useEffect, useState } from 'react'
import { collection, collectionGroup, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import { inviteFromDoc, memberFromDoc } from '../lib/converters'
import type { Membership } from '../lib/team'
import { useCollection } from './useCollection'
import type { Invite, Member } from '../types'

/** Atendentes do tenant ativo. */
export function useMembers() {
  return useCollection<Member>(
    (uid) => query(collection(db, `users/${uid}/members`), orderBy('name')),
    memberFromDoc,
    [],
  )
}

/**
 * Tenants em que o usuário logado foi convidado a atender.
 *
 * Vem de um collectionGroup filtrado pelo próprio e-mail — o filtro NÃO é enfeite:
 * é ele que faz a consulta casar com a regra `resource.data.email == token.email`,
 * sem a qual o Firestore recusa a query inteira.
 */
export function useMemberships(): { memberships: Membership[]; loading: boolean } {
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [loading, setLoading] = useState(true)
  const email = auth.currentUser?.email ?? null
  const uid = auth.currentUser?.uid ?? null

  useEffect(() => {
    if (!email) {
      setMemberships([])
      setLoading(false)
      return
    }
    const q = query(collectionGroup(db, 'members'), where('email', '==', email))
    return onSnapshot(
      q,
      (snap) => {
        setMemberships(
          snap.docs.flatMap((d) => {
            const m = memberFromDoc(d.id, d.data())
            // users/{tenantUid}/members/{uid} → o avô é o doc do tenant.
            const tenantUid = d.ref.parent.parent?.id
            // O vínculo do próprio dono na conta dele não é "outra equipe".
            if (!tenantUid || tenantUid === uid || !m.active) return []
            return [{ tenantUid, tenantName: m.tenantName || 'Equipe', role: m.role }]
          }),
        )
        setLoading(false)
      },
      (err) => {
        console.error('[useMemberships]', err)
        setLoading(false)
      },
    )
  }, [email, uid])

  return { memberships, loading }
}

/** Convites em aberto emitidos por este tenant (chaveados pelo e-mail do convidado). */
export function usePendingInvites(tenantUid: string | null): Invite[] {
  const [invites, setInvites] = useState<Invite[]>([])
  useEffect(() => {
    if (!tenantUid) {
      setInvites([])
      return
    }
    const q = query(collection(db, 'invites'), where('tenantUid', '==', tenantUid))
    return onSnapshot(
      q,
      (snap) => setInvites(snap.docs.map((d) => inviteFromDoc(d.id, d.data()))),
      (err) => console.error('[usePendingInvites]', err),
    )
  }, [tenantUid])
  return invites
}
