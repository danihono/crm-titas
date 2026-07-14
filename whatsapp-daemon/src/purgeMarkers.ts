import { Timestamp } from 'firebase-admin/firestore'
import { db } from './firebase.js'

/**
 * Marcadores de expurgo por interlocutor: quando o usuário apaga um contato/conversa,
 * gravamos `users/{uid}/waPurges/{digitsKey}` com o instante do expurgo. Replays de
 * mensagens ANTIGAS (timestamp <= purgedAt) são ignorados na ingestão — a conversa
 * apagada não ressuscita —, mas mensagem nova de verdade passa e recria o contato
 * (comportamento de espelho). `digitsKey` segue o mesmo esquema do contactCache:
 * telefone em dígitos, ou `lid:<id>` quando não há número.
 */

/** Cache em memória digitsKey→purgedAtMs (0 = sem marcador). Daemon é instância única. */
const markerCache = new Map<string, number>()

function cacheKeyOf(uid: string, digitsKey: string): string {
  return `${uid}:${digitsKey}`
}

function markerRef(uid: string, digitsKey: string) {
  // digitsKey pode conter ':' (lid:...) — válido como doc-id do Firestore ('/' é o proibido).
  return db.collection('users').doc(uid).collection('waPurges').doc(digitsKey.replace(/\//g, '_'))
}

/** Registra o expurgo de agora para este interlocutor (sobrescreve marcador anterior). */
export async function setPurgeMarker(uid: string, digitsKey: string, contactId: string): Promise<void> {
  const purgedAt = Timestamp.now()
  await markerRef(uid, digitsKey).set({ purgedAt, contactId })
  markerCache.set(cacheKeyOf(uid, digitsKey), purgedAt.toMillis())
}

/** true se existe marcador de expurgo e a mensagem é anterior (ou igual) a ele. */
export async function isPurgedAt(uid: string, digitsKey: string, tsMs: number): Promise<boolean> {
  const key = cacheKeyOf(uid, digitsKey)
  let purgedAtMs = markerCache.get(key)
  if (purgedAtMs === undefined) {
    const snap = await markerRef(uid, digitsKey).get()
    const at = snap.get('purgedAt')
    purgedAtMs = at instanceof Timestamp ? at.toMillis() : 0
    markerCache.set(key, purgedAtMs)
  }
  return purgedAtMs > 0 && tsMs <= purgedAtMs
}
