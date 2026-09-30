import { useEffect, useState } from 'react'
import { collection, collectionGroup, doc, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import { inviteFromDoc, memberFromDoc } from '../lib/converters'
import { emailKey, type Membership } from '../lib/team'
import { useCollection } from './useCollection'
import type { Invite, Member } from '../types'

/** Atendentes do tenant ativo. */
export function useMembers(opts: { enabled?: boolean } = {}) {
  const enabled = opts.enabled !== false
  return useCollection<Member>(
    (uid) => (enabled ? query(collection(db, `users/${uid}/members`), orderBy('name')) : null),
    memberFromDoc,
    [enabled],
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

/**
 * O ambiente de trabalho do DONO DO SISTEMA — o tenant em que ele foi convidado como
 * `dono`. É o que o card "Meu Ambiente" do SUPER TITAN abre.
 *
 * O dono do sistema não usa a própria conta como ambiente: os dados ficam no tenant que
 * já existia (o da conta antiga dele), e o vínculo `dono` é o que dá acesso sem mover
 * nada. Se houver mais de um, vale o primeiro.
 */
export function useOwnerEnvironment(): {
  environment: Membership | null
  ownerTenantUids: string[]
  /** Vínculos ativos com OUTRO papel — o convite saiu como atendente/gestor. */
  outros: Membership[]
  loading: boolean
} {
  const { memberships, loading } = useMemberships()
  const donos = memberships.filter((m) => m.role === 'dono')
  return {
    environment: donos[0] ?? null,
    ownerTenantUids: donos.map((m) => m.tenantUid),
    outros: memberships.filter((m) => m.role !== 'dono'),
    loading,
  }
}

/**
 * Convite ainda não aceito endereçado ao e-mail do usuário logado.
 *
 * O aceite normal acontece no login (settleSession). Isto existe para o que ele não
 * alcança: convite criado com a sessão já aberta, ou parado esperando a confirmação do
 * e-mail — o aviso disso mora no Layout do CRM, onde o dono do sistema não entra.
 */
export function useMyPendingInvite(): Invite | null {
  const [invite, setInvite] = useState<Invite | null>(null)
  const email = auth.currentUser?.email ?? null

  useEffect(() => {
    if (!email) {
      setInvite(null)
      return
    }
    return onSnapshot(
      doc(db, 'invites', emailKey(email)),
      (snap) => setInvite(snap.exists() ? inviteFromDoc(snap.id, snap.data()) : null),
      (err) => {
        console.error('[useMyPendingInvite]', err)
        setInvite(null)
      },
    )
  }, [email])

  return invite
}
