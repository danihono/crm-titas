// Relatório SOMENTE LEITURA do estado dos contatos espelhados: quantos ainda estão presos
// ao endereçamento @lid (duplicatas em potencial) e quantos ficaram com o nome genérico.
//
// Serve para medir antes/depois do conserto de LID: rode agora, deixe o daemon rodar, e
// rode de novo — os números de `lid_` e "Contato WhatsApp" devem cair conforme as conversas
// recebem mensagem e o daemon funde as duplicatas.
//
// Uso: node scripts/lid-report.mjs <email|uid>
// Requer credencial (GOOGLE_APPLICATION_CREDENTIALS ou ADC). NÃO escreve nada.
import 'dotenv/config'
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

const target = process.argv[2]
if (!target) {
  console.error('uso: node scripts/lid-report.mjs <email|uid>')
  process.exit(1)
}

initializeApp({
  credential: applicationDefault(),
  projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || 'titas-c8967',
})

const uid = target.includes('@') ? (await getAuth().getUserByEmail(target)).uid : target
const db = getFirestore()

const contacts = await db.collection('users').doc(uid).collection('contacts').get()
const agenda = await db.collection('users').doc(uid).collection('waAgenda').get()

const lidBound = []
const generic = []
const byDigits = new Map()

for (const c of contacts.docs) {
  const name = String(c.get('name') ?? '')
  const digits = String(c.get('whatsappDigits') ?? '').replace(/\D/g, '')
  if (c.id.startsWith('lid_')) lidBound.push({ id: c.id, name })
  if (name === 'Contato WhatsApp') generic.push({ id: c.id, name })
  if (digits) byDigits.set(digits, [...(byDigits.get(digits) ?? []), { id: c.id, name }])
}

// Mesmo número em mais de um doc = histórico partido entre duas entradas.
const duplicated = [...byDigits.entries()].filter(([, docs]) => docs.length > 1)

console.log(`uid: ${uid}`)
console.log(`contatos no total ............ ${contacts.size}`)
console.log(`nomes de agenda guardados .... ${agenda.size}`)
console.log(`presos ao @lid (lid_*) ....... ${lidBound.length}`)
console.log(`com nome "Contato WhatsApp" .. ${generic.length}`)
console.log(`números em contato duplicado . ${duplicated.length}`)

if (lidBound.length) {
  console.log('\npresos ao @lid (primeiros 15):')
  for (const c of lidBound.slice(0, 15)) console.log(`  ${c.id}  ${c.name}`)
}
if (duplicated.length) {
  console.log('\nnúmeros com mais de um contato (primeiros 15):')
  for (const [digits, docs] of duplicated.slice(0, 15)) {
    console.log(`  +${digits}: ${docs.map((d) => `${d.id}(${d.name})`).join('  |  ')}`)
  }
}

process.exit(0)
