import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { isOwnerEmail } from '../lib/owners'

export interface Client {
  uid: string
  displayName: string
  role: string
  email?: string
  createdAt?: Date
}

/** Lista todos os tenants (clientes) — apenas donos têm permissão de ler. */
export function useClients() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        const list = snap.docs
          .map((d) => {
            const data = d.data()
            return {
              uid: d.id,
              displayName: data.displayName || '(sem nome)',
              role: data.role || '',
              email: data.email,
              createdAt: data.createdAt?.toDate?.(),
            } as Client
          })
          .filter((c) => !isOwnerEmail(c.email))
          .sort((a, b) => a.displayName.localeCompare(b.displayName))
        setClients(list)
        setLoading(false)
      },
      (err) => {
        console.error('[useClients]', err)
        setLoading(false)
      },
    )
    return unsub
  }, [])

  return { clients, loading }
}
