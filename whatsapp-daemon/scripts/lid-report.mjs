// Relatório SOMENTE LEITURA do estado dos contatos espelhados: quantos ainda estão presos
// ao endereçamento @lid (duplicatas em potencial) e quantos ficaram com o nome genérico.
//
// Serve para medir antes/depois do conserto de LID: rode agora, deixe o daemon rodar, e
// rode de novo — os números de `lid_` e "Contato WhatsApp" devem cair conforme as conversas
// recebem mensagem e o daemon funde as duplicatas.
//
// Uso: node scripts/lid-report.mjs [email|uid]
// Sem argumento (ou quando o uid dado não tem contatos), lista as contas que TÊM sessão de
// WhatsApp ou contatos espelhados — o CRM é multi-tenant e o dono dos dados nem sempre é a
// conta com que se faz login.
// Requer credencial (GOOGLE_APPLICATION_CREDENTIALS ou ADC). NÃO escreve nada.
import 'dotenv/config'
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

initializeApp({
  credential: applicationDefault(),
  projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || 'titas-c8967',
})

const db = getFirestore()

/** Contas com sessão de WhatsApp ou contatos, com um rótulo legível para escolher. */
async function listCandidates() {
  const uids = new Set()
  for (const col of ['whatsappSessions', 'whatsappStatus']) {
    const snap = await db.collection(col).get()
    for (const d of snap.docs) uids.add(d.id)
  }
  const users = await db.collection('users').listDocuments()
  for (const u of users) uids.add(u.id)

  const rows = []
  for (const id of uids) {
    const contacts = await db.collection('users').doc(id).collection('contacts').count().get()
    const n = contacts.data().count
    if (n === 0) continue
    let email = '(sem e-mail)'
    try {
      email = (await getAuth().getUser(id)).email ?? email
    } catch {
      /* conta pode ter sido removida do Auth; o uid ainda serve */
    }
    rows.push({ id, email, n })
  }
  return rows.sort((a, b) => b.n - a.n)
}

const target = process.argv[2]

if (!target) {
  const rows = await listCandidates()
  if (!rows.length) {
    console.log('nenhuma conta com contatos espelhados encontrada neste projeto.')
    process.exit(0)
  }
  console.log('contas com contatos espelhados:\n')
  for (const r of rows) console.log(`  ${r.n.toString().padStart(5)} contatos   ${r.email}   ${r.id}`)
  console.log('\nrode de novo passando um desses: node scripts/lid-report.mjs <uid>')
  process.exit(0)
}

const uid = target.includes('@') ? (await getAuth().getUserByEmail(target)).uid : target

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

if (contacts.size === 0) {
  console.log('\nEste uid não tem contato nenhum — provavelmente não é a conta dona dos dados.')
  const rows = await listCandidates()
  if (rows.length) {
    console.log('Contas que TÊM contatos espelhados:\n')
    for (const r of rows) console.log(`  ${r.n.toString().padStart(5)} contatos   ${r.email}   ${r.id}`)
    console.log('\nrode de novo com um desses: node scripts/lid-report.mjs <uid>')
  }
  process.exit(0)
}

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
