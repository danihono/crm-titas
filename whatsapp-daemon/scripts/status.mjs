// Lê o doc de status de uma conexão. Uso: node scripts/status.mjs <uid>
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

initializeApp({ credential: applicationDefault(), projectId: process.env.GOOGLE_CLOUD_PROJECT || 'titas-c8967' })
const uid = process.argv[2]
const snap = await getFirestore().doc(`whatsappStatus/${uid}`).get()
const d = snap.data() || {}
console.log('status:', d.status, '| temQR:', !!d.qr, '| qrLen:', (d.qr || '').length, '| phone:', d.phoneNumber ?? '-', '| lastError:', d.lastError ?? '-')
process.exit(0)
