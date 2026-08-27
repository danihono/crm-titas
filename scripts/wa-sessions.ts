/**
 * Acha e remove sessões de WhatsApp ÓRFÃS.
 *
 * Antes de a fila de comandos virar por ambiente, o "conectar" de um membro convidado criava
 * uma sessão sob o uid DELE — um segundo aparelho vinculado ao mesmo número da empresa, que
 * disputava o pareamento e derrubava a conexão do ambiente. E o daemon sobe uma sessão para
 * CADA doc de whatsappSessions (boot.ts), então a órfã continua reconectando para sempre
 * mesmo depois da correção no app. Este script limpa o que ficou para trás.
 *
 * Órfã = a sessão é de um uid que NÃO é dono de um ambiente com dados (não tem contatos nem
 * negócios) mas É membro do ambiente de outra pessoa. Só isso é apagado — a sessão de um
 * ambiente de verdade nunca entra na lista.
 *
 * Uso:
 *   npm run wa:sessions            lista o que seria apagado (dry-run, não muda nada)
 *   npm run wa:sessions -- --apply apaga de fato
 *
 * Contra o projeto REAL, exporte as credenciais do Admin SDK e o GCLOUD_PROJECT antes;
 * sem isso ele fala com os emuladores locais.
 *
 * Depois de aplicar, REINICIE O DAEMON: as sessões que ele subiu no boot seguem em memória.
 */
import admin from 'firebase-admin'

const APPLY = process.argv.includes('--apply')
const REAL = !!process.env.GOOGLE_APPLICATION_CREDENTIALS || !!process.env.FIRESTORE_EMULATOR_HOST

if (!REAL) {
  process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080'
  process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099'
}

const projectId = process.env.GCLOUD_PROJECT || process.env.VITE_FIREBASE_PROJECT_ID || 'demo-titas-crm'
admin.initializeApp({ projectId })
const db = admin.firestore()

/** O uid tem ambiente próprio? Sessão de ambiente de verdade nunca é apagada. */
async function temAmbienteProprio(uid: string): Promise<boolean> {
  const root = db.collection('users').doc(uid)
  if (!(await root.get()).exists) return false

  // Operação de verdade dentro do ambiente.
  for (const sub of ['contacts', 'deals']) {
    if (!(await root.collection(sub).limit(1).get()).empty) return true
  }

  // `members` sozinho NÃO serve como sinal: todo login cria users/{uid}/members/{uid} para a
  // própria pessoa (ensureOwnerMember), então a subcoleção existe até em conta que nunca foi
  // usada. O que indica ambiente é ter convidado ALGUÉM — mais de um membro.
  const membros = await root.collection('members').limit(2).get()
  return membros.size > 1
}

/** O uid é membro do ambiente de outra pessoa? Devolve os tenants encontrados. */
async function tenantsOndeEMembro(uid: string): Promise<string[]> {
  const snap = await db.collectionGroup('members').get()
  return snap.docs
    .filter((d) => d.id === uid && d.ref.parent.parent?.id !== uid)
    .map((d) => d.ref.parent.parent!.id)
}

async function main() {
  const sessoes = await db.collection('whatsappSessions').listDocuments()
  console.log(`${sessoes.length} sessão(ões) em whatsappSessions · projeto ${projectId}`)
  console.log(APPLY ? 'MODO: --apply (vai apagar)\n' : 'MODO: dry-run (nada será alterado)\n')

  const orfas: { uid: string; tenants: string[] }[] = []
  for (const ref of sessoes) {
    const uid = ref.id
    if (await temAmbienteProprio(uid)) {
      console.log(`  manter  ${uid} — ambiente próprio`)
      continue
    }
    const tenants = await tenantsOndeEMembro(uid)
    if (tenants.length === 0) {
      // Sem ambiente e sem vínculo: não é a assinatura do defeito. Deixa quieto e avisa.
      console.log(`  ?       ${uid} — sem ambiente e sem vínculo; não vou mexer (confira à mão)`)
      continue
    }
    console.log(`  ÓRFÃ    ${uid} — é membro de ${tenants.join(', ')}`)
    orfas.push({ uid, tenants })
  }

  if (orfas.length === 0) {
    console.log('\nNenhuma sessão órfã. Nada a fazer.')
    return
  }
  if (!APPLY) {
    console.log(`\n${orfas.length} órfã(s). Rode de novo com --apply para apagar.`)
    return
  }

  for (const { uid } of orfas) {
    await db.recursiveDelete(db.collection('whatsappSessions').doc(uid))
    await db.collection('whatsappStatus').doc(uid).delete().catch(() => {})
    console.log(`  apagada ${uid}`)
  }
  console.log(`\n${orfas.length} sessão(ões) removida(s). REINICIE O DAEMON para ele soltar as que já subiu.`)
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err)
  process.exit(1)
})
