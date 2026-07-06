import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import type { Features } from '../types'

/**
 * Feature-flags por tenant (campo `features` em users/{uid}), em tempo real.
 * Usado para subir o WhatsApp "no escuro" — só aparece se features.whatsapp === true.
 */
export function useFeatures(): Features {
  const { user } = useAuth()
  const [feats, setFeats] = useState<Features>({})

  useEffect(() => {
    const uid = user?.uid
    if (!uid) {
      setFeats({})
      return
    }
    return onSnapshot(doc(db, 'users', uid), (snap) => {
      setFeats((snap.data()?.features ?? {}) as Features)
    })
  }, [user?.uid])

  return feats
}
