// Liga a feature-flag do WhatsApp para um usuário, por email.
// Uso: GOOGLE_CLOUD_PROJECT=titas-c8967 node scripts/enable-whatsapp.mjs <email>
// Requer ADC (gcloud auth application-default login) com acesso ao projeto.
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'

const email = process.argv[2]
if (!email) {
  console.error('uso: node scripts/enable-whatsapp.mjs <email>')
  process.exit(1)
}

initializeApp({
  credential: applicationDefault(),
  projectId: process.env.GOOGLE_CLOUD_PROJECT || 'titas-c8967',
})

const user = await getAuth().getUserByEmail(email)
await getFirestore().doc(`users/${user.uid}`).set({ features: { whatsapp: true } }, { merge: true })
console.log(`OK: features.whatsapp=true para ${email} (uid ${user.uid})`)
process.exit(0)
