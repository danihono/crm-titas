import { FieldValue, type Firestore } from 'firebase-admin/firestore'

export type WhatsappStatus =
  | 'disconnected'
  | 'qr'
  | 'connecting'
  | 'connected'
  | 'loggedOut'

export interface StatusPatch {
  status?: WhatsappStatus
  /** QR já renderizado como data URL PNG (o frontend só faz <img src>). null limpa o anterior. */
  qr?: string | null
  phoneNumber?: string | null
  lastError?: string | null
  connectedAt?: FieldValue
}

/**
 * Escreve o doc de status legível pelo cliente: `whatsappStatus/{uid}`.
 * Coleção top-level (fora de users/{uid}/**) para as rules imporem READ-ONLY ao
 * cliente de forma limpa — o Admin SDK escreve, o cliente só lê.
 * Contém APENAS QR + estado da conexão — NUNCA creds/chaves do Signal
 * (essas vivem em whatsappSessions/**, negado a todos os clientes).
 */
export async function writeStatus(db: Firestore, uid: string, patch: StatusPatch): Promise<void> {
  await db.collection('whatsappStatus').doc(uid).set(
    { ...patch, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  )
}
