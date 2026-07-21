import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import { useTenantStore } from '../store/tenantStore'

export type WhatsappConnState =
  | 'disconnected'
  | 'qr'
  | 'connecting'
  | 'connected'
  | 'loggedOut'

export interface WhatsappStatus {
  status: WhatsappConnState
  /** QR já renderizado como data URL (o daemon gera). */
  qr: string | null
  phoneNumber: string | null
  lastError: string | null
}

const INITIAL: WhatsappStatus = { status: 'disconnected', qr: null, phoneNumber: null, lastError: null }

/**
 * Status da conexão de WhatsApp do tenant efetivo, em tempo real
 * (whatsappStatus/{uid}). Nada de polling — só onSnapshot.
 */
export function useWhatsappStatus(): WhatsappStatus {
  const { user } = useAuth()
  const tenantUid = useTenantStore((s) => s.tenantUid)
  const [st, setSt] = useState<WhatsappStatus>(INITIAL)

  useEffect(() => {
    const uid = tenantUid ?? user?.uid
    if (!uid) {
      setSt(INITIAL)
      return
    }
    return onSnapshot(
      doc(db, 'whatsappStatus', uid),
      (snap) => {
        const d = snap.data()
        if (!d) {
          setSt(INITIAL)
          return
        }
        setSt({
          status: (d.status ?? 'disconnected') as WhatsappConnState,
          qr: d.qr ?? null,
          phoneNumber: d.phoneNumber ?? null,
          lastError: d.lastError ?? null,
        })
      },
      (err) => {
        // eslint-disable-next-line no-console
        console.error('[useWhatsappStatus]', err)
      },
    )
  }, [user?.uid, tenantUid])

  return st
}
