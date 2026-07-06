// Zera a conexão de um usuário: limpa auth (creds+chaves) e o status.
// Uso: GOOGLE_CLOUD_PROJECT=titas-c8967 node scripts/reset-connection.mjs <uid>
// NÃO rode com uma sessão viva segurando esse uid.
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

initializeApp({ credential: applicationDefault(), projectId: process.env.GOOGLE_CLOUD_PROJECT || 'titas-c8967' })
const uid = process.argv[2]
if (!uid) { console.error('uso: node scripts/reset-connection.mjs <uid>'); process.exit(1) }

const db = getFirestore()
const sessionRef = db.collection('whatsappSessions').doc(uid)
await db.recursiveDelete(sessionRef.collection('keys'))
await sessionRef.set({ creds: FieldValue.delete(), desiredState: 'disconnected' }, { merge: true })
await db.doc(`whatsappStatus/${uid}`).set(
  { status: 'disconnected', qr: null, lastError: null, updatedAt: FieldValue.serverTimestamp() },
  { merge: true },
)
console.log('conexão resetada (auth limpo + status disconnected):', uid)
process.exit(0)
