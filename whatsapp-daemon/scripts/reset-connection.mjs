// Zera a conexão de um usuário: limpa auth (creds+chaves) e o status.
//
// APAGA A IDENTIDADE DO APARELHO no WhatsApp: o número precisa ser pareado de novo pelo
// QR, e ninguém do ambiente troca mensagem até isso acontecer. Por isso exige --apply —
// um uid digitado errado desconectava o WhatsApp de outro cliente sem uma pergunta sequer.
//
// Uso: GOOGLE_CLOUD_PROJECT=titas-c8967 node scripts/reset-connection.mjs <uid> --apply
// NÃO rode com uma sessão viva segurando esse uid.
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

initializeApp({ credential: applicationDefault(), projectId: process.env.GOOGLE_CLOUD_PROJECT || 'titas-c8967' })
const uid = process.argv[2]
const aplicar = process.argv.includes('--apply')
if (!uid || uid.startsWith('--')) {
  console.error('uso: node scripts/reset-connection.mjs <uid> --apply')
  process.exit(1)
}

const db = getFirestore()

if (!aplicar) {
  const sessao = await db.collection('whatsappSessions').doc(uid).get()
  const status = await db.doc(`whatsappStatus/${uid}`).get()
  console.log(`\nPRÉVIA — nada foi alterado.`)
  console.log(`  ambiente ........ ${uid}`)
  console.log(`  sessão existe ... ${sessao.exists ? 'sim' : 'não'}`)
  console.log(`  status atual .... ${status.get('status') ?? '(sem doc)'}`)
  console.log(`  telefone ........ ${status.get('phoneNumber') ?? '—'}`)
  console.log(`\nIsto apagaria as credenciais do aparelho: o número teria de ser pareado de novo pelo QR.`)
  console.log(`Rode de novo com --apply para valer.\n`)
  process.exit(0)
}
const sessionRef = db.collection('whatsappSessions').doc(uid)
await db.recursiveDelete(sessionRef.collection('keys'))
await sessionRef.set({ creds: FieldValue.delete(), desiredState: 'disconnected' }, { merge: true })
await db.doc(`whatsappStatus/${uid}`).set(
  { status: 'disconnected', qr: null, lastError: null, updatedAt: FieldValue.serverTimestamp() },
  { merge: true },
)
console.log('conexão resetada (auth limpo + status disconnected):', uid)
process.exit(0)
