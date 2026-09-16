import { useEffect, useState, type DependencyList } from 'react'
import { onSnapshot, type DocumentData, type Query } from 'firebase/firestore'
import { useAuth } from '../contexts/AuthContext'
import { useTenantStore } from '../store/tenantStore'

/**
 * Assina uma query Firestore em tempo real (onSnapshot), com unsubscribe
 * automático ao trocar de módulo/uid. `build` recebe o uid e retorna a Query
 * (ou null para não assinar). `deps` controlam a re-assinatura.
 */
export function useCollection<T>(
  build: (uid: string) => Query<DocumentData> | null,
  mapper: (id: string, data: DocumentData) => T,
  deps: DependencyList = [],
): { docs: T[]; loading: boolean } {
  const { user } = useAuth()
  const tenantUid = useTenantStore((s) => s.tenantUid)
  const [docs, setDocs] = useState<T[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // tenant efetivo: cliente selecionado por um dono, senão o próprio usuário.
    const u = tenantUid ?? user?.uid
    if (!u) {
      setDocs([])
      setLoading(false)
      return
    }
    setLoading(true)
    const q = build(u)
    if (!q) {
      setDocs([])
      setLoading(false)
      return
    }
    const unsub = onSnapshot(
      q,
      (snap) => {
        // `serverTimestamps: 'estimate'` porque `serverTimestamp()` chega NULO no eco
        // local da própria escrita — o valor só existe depois do servidor confirmar. Sem
        // a estimativa, a mensagem recém-enviada aparecia carimbada na época Unix
        // (21:00 em UTC-3) até o ACK chegar. Só afeta documento nosso ainda pendente:
        // em qualquer outro caso o campo já é um Timestamp de verdade.
        setDocs(snap.docs.map((d) => mapper(d.id, d.data({ serverTimestamps: 'estimate' }))))
        setLoading(false)
      },
      (err) => {
        console.error('[useCollection]', err)
        setLoading(false)
      },
    )
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, tenantUid, ...deps])

  return { docs, loading }
}
