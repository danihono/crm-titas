/**
 * Muda um ambiente INTEIRO de conta: tudo o que vive sob o uid de origem passa a viver
 * sob o uid de destino, e depois a origem é apagada.
 *
 * Existe para unificar o ambiente do dono do sistema na conta dele: os dados estavam na
 * conta de outro e-mail, e ele entrava por um vínculo de Dono. Depois disto sobra um
 * ambiente só, em nome de uma conta só.
 *
 * Duas fases, as duas em dry-run até receber --apply:
 *
 *   1. COPIAR (padrão) — com o daemon do WhatsApp PARADO:
 *      - users/{de}/** → users/{para}/**, trocando o uid de origem (e o de todo membro da
 *        origem) pelo do destino nos dados, e reescrevendo caminhos/URLs do Storage;
 *      - arquivos users/{de}/ → users/{para}/ no Storage (mesmo token de download);
 *      - sessão do WhatsApp whatsappSessions/{de} → {para} e o status junto;
 *      - assistantSubscribers que apontavam para a origem;
 *      - APAGA na hora a sessão, o status e a fila de comandos da origem: se o daemon
 *        subisse as duas, seriam dois aparelhos com a mesma credencial brigando.
 *   2. LIMPAR (--limpar) — depois de conferir o ambiente novo no app:
 *      - apaga users/{de}, arquivos, convites, vínculos e a CONTA no Auth;
 *      - --excluir <email> (repetível) faz a mesma exclusão completa em outras contas.
 *
 * Uso (projeto real — precisa de GOOGLE_APPLICATION_CREDENTIALS e GCLOUD_PROJECT):
 *   npm run ambiente:migrar -- --de velho@x.com --para novo@x.com --nome Honor
 *   npm run ambiente:migrar -- --de velho@x.com --para novo@x.com --nome Honor --apply
 *   npm run ambiente:migrar -- --de velho@x.com --para novo@x.com --limpar [--excluir outro@x.com] --apply
 *
 * O bucket vem de --bucket, TITA_STORAGE_BUCKET ou VITE_FIREBASE_STORAGE_BUCKET.
 * Nos emuladores locais: acrescente --emulator.
 */
import admin from 'firebase-admin'
import type { DocumentReference, Firestore } from 'firebase-admin/firestore'

// ---------------------------------------------------------------------------
// Argumentos
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2)
function arg(nome: string): string | undefined {
  const i = argv.indexOf(nome)
  return i >= 0 ? argv[i + 1] : undefined
}
function args(nome: string): string[] {
  return argv.flatMap((v, i) => (v === nome && argv[i + 1] ? [argv[i + 1]] : []))
}

const APPLY = argv.includes('--apply')
const LIMPAR = argv.includes('--limpar')
const EMULADOR = argv.includes('--emulator') || !!process.env.FIRESTORE_EMULATOR_HOST
const DE = (arg('--de') || '').trim().toLowerCase()
const PARA = (arg('--para') || '').trim().toLowerCase()
const NOME = (arg('--nome') || '').trim()
const EXCLUIR = args('--excluir').map((e) => e.trim().toLowerCase())

if (!DE || !PARA) {
  console.error('uso: npm run ambiente:migrar -- --de <email-origem> --para <email-destino> [--nome <nome>] [--limpar] [--excluir <email>] [--apply] [--emulator]')
  process.exit(1)
}

if (EMULADOR) {
  process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080'
  process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099'
  process.env.FIREBASE_STORAGE_EMULATOR_HOST ||= '127.0.0.1:9199'
} else if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error(`
Falta a credencial do projeto.

    Windows (cmd):  set GOOGLE_APPLICATION_CREDENTIALS=C:\\caminho\\chave.json
                    set GCLOUD_PROJECT=titas-c8967
    Linux/macOS:    export GOOGLE_APPLICATION_CREDENTIALS=/caminho/chave.json
                    export GCLOUD_PROJECT=titas-c8967

  A chave sai em: Console do Firebase > Configurações do projeto > Contas de serviço >
  "Gerar nova chave privada". É a mesma que o daemon do WhatsApp já usa.
`)
  process.exit(1)
}

const projectId = process.env.GCLOUD_PROJECT || process.env.VITE_FIREBASE_PROJECT_ID
  || (EMULADOR ? 'demo-titas-crm' : '')
const bucketName = arg('--bucket') || process.env.TITA_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET
  || (EMULADOR ? `${projectId}.appspot.com` : '')
if (!projectId || !bucketName) {
  console.error('Defina GCLOUD_PROJECT e o bucket (--bucket titas-c8967.firebasestorage.app, ou TITA_STORAGE_BUCKET).')
  process.exit(1)
}

admin.initializeApp({ projectId, storageBucket: bucketName })
const db: Firestore = admin.firestore()
const auth = admin.auth()
const bucket = admin.storage().bucket()

const modo = APPLY ? 'APLICANDO' : 'dry-run (nada será alterado)'

// ---------------------------------------------------------------------------
// Transformação dos dados
// ---------------------------------------------------------------------------

/**
 * Troca de identidade aplicada a cada valor copiado:
 *  - string IGUAL a um uid mapeado vira o uid de destino (assignedTo, by, conv.assignedTo…);
 *  - string que CONTÉM o caminho do tenant de origem tem o trecho trocado — cobre caminhos
 *    do Storage e as URLs de download (que levam o caminho com `/` codificada).
 * Só entra em objeto simples e array: Timestamp, GeoPoint e afins passam intactos.
 */
function criarTroca(de: string, para: string, uids: Set<string>) {
  const trechos: [string, string][] = [
    [`users/${de}/`, `users/${para}/`],
    [`users%2F${de}%2F`, `users%2F${para}%2F`],
  ]
  const troca = (v: unknown): unknown => {
    if (typeof v === 'string') {
      if (uids.has(v)) return para
      let s = v
      for (const [a, b] of trechos) if (s.includes(a)) s = s.split(a).join(b)
      return s
    }
    if (Array.isArray(v)) return v.map(troca)
    if (v instanceof admin.firestore.DocumentReference) {
      const novo = troca(v.path) as string
      return novo === v.path ? v : db.doc(novo)
    }
    if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
      const out: Record<string, unknown> = {}
      for (const [k, val] of Object.entries(v)) out[k] = troca(val)
      return out
    }
    return v
  }
  return troca
}

/**
 * Mensagem de WhatsApp da Assistente escrita pelo usuário. Criar uma cópia dispara o
 * trigger `responderPeloWhatsapp`, que responderia de novo pergunta antiga no WhatsApp.
 */
function disparaAssistente(caminho: string, data: FirebaseFirestore.DocumentData): boolean {
  return /\/agentChat\/[^/]+$/.test(caminho) && data.channel === 'whatsapp' && data.role === 'user'
}

// ---------------------------------------------------------------------------
// Varredura de árvore
// ---------------------------------------------------------------------------

/** Todos os documentos sob `ref` (subcoleções, recursivo), sem o próprio `ref`. */
async function* descendentes(ref: DocumentReference): AsyncGenerator<FirebaseFirestore.QueryDocumentSnapshot> {
  for (const col of await ref.listCollections()) {
    // listDocuments pega também doc "fantasma" (sem campos, só com subcoleções).
    for (const doc of await col.listDocuments()) {
      const snap = await doc.get()
      if (snap.exists) yield snap as FirebaseFirestore.QueryDocumentSnapshot
      yield* descendentes(doc)
    }
  }
}

/** Docs por subcoleção de 1º nível (inclui o que está aninhado nela). */
async function contarVarrendo(ref: DocumentReference): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  for await (const snap of descendentes(ref)) {
    const sub = snap.ref.path.slice(ref.path.length + 1).split('/')[0]
    out[sub] = (out[sub] ?? 0) + 1
  }
  return out
}

async function uidPorEmail(email: string): Promise<string> {
  try {
    return (await auth.getUserByEmail(email)).uid
  } catch {
    console.error(`Conta não encontrada no Auth: ${email}`)
    process.exit(1)
  }
}

// ---------------------------------------------------------------------------
// Fase 1 — copiar
// ---------------------------------------------------------------------------

async function copiar(de: string, para: string) {
  const origem = db.collection('users').doc(de)
  const destino = db.collection('users').doc(para)

  if (!(await origem.get()).exists) {
    console.error(`users/${de} não existe — nada para migrar.`)
    process.exit(1)
  }
  for (const sub of ['contacts', 'deals']) {
    if (!(await destino.collection(sub).limit(1).get()).empty) {
      console.error(`O destino já tem ${sub}. Esta migração não mistura ambientes — abortando.`)
      process.exit(1)
    }
  }

  // Todo membro da origem vira o destino: no ambiente novo só existe ele.
  const membros = await origem.collection('members').listDocuments()
  const uids = new Set<string>([de, ...membros.map((m) => m.id)].filter((u) => u !== para))
  const troca = criarTroca(de, para, uids)
  console.log(`uids trocados pelo destino: ${[...uids].join(', ')}`)

  const destUser = await auth.getUser(para)
  const writer = db.bulkWriter()
  let docs = 0
  let pulados = 0

  // 1. Índice telefone → ambiente, ANTES do doc raiz: o trigger indexarAssinante roda na
  //    escrita de users/{para} e recusa indexar telefone que aponte para outro ambiente.
  const subs = await db.collection('assistantSubscribers').where('tenantUid', '==', de).get()
  console.log(`assistantSubscribers: ${subs.size}`)
  if (APPLY) for (const s of subs.docs) await s.ref.update({ tenantUid: para })

  // 2. Doc raiz: a configuração da operação vem da origem; a identidade é do destino.
  const raiz = troca((await origem.get()).data() ?? {}) as Record<string, unknown>
  raiz.email = destUser.email
  if (destUser.displayName) raiz.displayName = destUser.displayName
  if (NOME) raiz.orgName = NOME
  if (APPLY) await destino.set(raiz, { merge: true })

  // 3. Subcoleções.
  for await (const snap of descendentes(origem)) {
    const rel = snap.ref.path.slice(origem.path.length + 1)
    if (/^members\/[^/]+$/.test(rel)) { pulados++; continue }
    const data = snap.data()
    if (disparaAssistente(snap.ref.path, data)) { pulados++; continue }
    const relNovo = rel.split('/').map((seg) => (uids.has(seg) ? para : seg)).join('/')
    docs++
    if (APPLY) writer.set(db.doc(`${destino.path}/${relNovo}`), troca(data) as FirebaseFirestore.DocumentData)
  }
  // O único membro do ambiente novo: o titular.
  if (APPLY) {
    writer.set(destino.collection('members').doc(para), {
      name: destUser.displayName || destUser.email || '',
      email: (destUser.email || '').toLowerCase(),
      role: 'dono',
      sectorIds: [],
      active: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    })
  }
  await writer.close()
  console.log(`documentos: ${docs} copiados, ${pulados} deixados de fora (vínculos de membro e perguntas antigas da Assistente)`)

  // 4. Storage. `copy` leva os metadados junto — inclusive o token de download, então as
  //    URLs reescritas no passo 3 continuam abrindo.
  const [arquivos] = await bucket.getFiles({ prefix: `users/${de}/` })
  console.log(`arquivos no Storage: ${arquivos.length}`)
  if (APPLY) {
    let n = 0
    for (const f of arquivos) {
      await f.copy(bucket.file(`users/${para}/${f.name.slice(`users/${de}/`.length)}`))
      if (++n % 50 === 0) console.log(`  ${n}/${arquivos.length}`)
    }
  }

  // 5. Sessão do WhatsApp (credenciais + chaves do Signal) e status.
  const sessao = db.collection('whatsappSessions').doc(de)
  const sessaoSnap = await sessao.get()
  let chaves = 0
  if (APPLY) {
    const w = db.bulkWriter()
    if (sessaoSnap.exists) {
      const { lock: _lock, ...resto } = sessaoSnap.data() ?? {}
      w.set(db.collection('whatsappSessions').doc(para), resto)
    }
    for await (const k of descendentes(sessao)) {
      chaves++
      w.set(db.doc(k.ref.path.replace(`whatsappSessions/${de}/`, `whatsappSessions/${para}/`)), k.data())
    }
    const status = await db.collection('whatsappStatus').doc(de).get()
    if (status.exists) w.set(db.collection('whatsappStatus').doc(para), status.data() ?? {})
    await w.close()
  } else {
    for await (const _k of descendentes(sessao)) chaves++
  }
  console.log(`sessão do WhatsApp: ${sessaoSnap.exists ? 'sim' : 'não'} · ${chaves} chave(s)`)

  // 6. A sessão antiga sai JÁ: o daemon sobe uma sessão por doc de whatsappSessions, e
  //    duas com a mesma credencial derrubam uma à outra.
  //    O vínculo de Dono do destino na origem sai também: é ele que faz o "Meu Ambiente"
  //    abrir o ambiente antigo. Sem ele, a conferência já acontece no ambiente novo.
  if (APPLY) {
    await db.recursiveDelete(sessao)
    await db.recursiveDelete(db.collection('whatsappStatus').doc(de))
    await db.recursiveDelete(db.collection('waCommands').doc(de))
    await origem.collection('members').doc(para).delete()
  }

  // 7. Conferência.
  if (APPLY) {
    const [a, b] = await Promise.all([contarVarrendo(origem), contarVarrendo(destino)])
    console.log('\nsubcoleção            origem   destino')
    for (const k of Object.keys({ ...a, ...b }).sort()) {
      console.log(`${k.padEnd(20)} ${String(a[k] ?? 0).padStart(7)} ${String(b[k] ?? 0).padStart(9)}`)
    }
    console.log(`
Cópia feita. Agora:
  1. religue o daemon do WhatsApp;
  2. entre com ${PARA} → SUPER TITAN → Meu Ambiente e confira contatos, mídias e o WhatsApp;
  3. só então rode de novo com --limpar --apply para apagar a conta de origem.`)
  } else {
    console.log('\nRode de novo com --apply para copiar (com o daemon do WhatsApp PARADO).')
  }
}

// ---------------------------------------------------------------------------
// Fase 2 — limpar
// ---------------------------------------------------------------------------

/** Exclusão completa de uma conta — o mesmo que a callable excluirCliente faz. */
async function excluirConta(uid: string, email: string) {
  console.log(`\n— excluir ${email} (${uid})`)
  const [arquivos] = await bucket.getFiles({ prefix: `users/${uid}/` })
  const convites = await db.collection('invites').where('tenantUid', '==', uid).get()
  const vinculos = await db.collectionGroup('members').where('email', '==', email).get()
  const subs = await db.collection('assistantSubscribers').where('tenantUid', '==', uid).get()
  console.log(`  arquivos ${arquivos.length} · convites ${convites.size} · vínculos em outros ambientes ${vinculos.size} · assinantes ${subs.size}`)
  if (!APPLY) return

  await bucket.deleteFiles({ prefix: `users/${uid}/` })
  for (const p of ['users', 'whatsappSessions', 'whatsappStatus', 'waCommands']) {
    await db.recursiveDelete(db.collection(p).doc(uid))
  }
  await Promise.all([...convites.docs, ...vinculos.docs, ...subs.docs].map((d) => d.ref.delete()))
  await db.collection('invites').doc(email).delete().catch(() => {})
  await auth.deleteUser(uid).catch((err) => {
    if ((err as { code?: string }).code !== 'auth/user-not-found') throw err
  })
  console.log('  excluída')
}

async function limpar(de: string, para: string) {
  const origem = db.collection('users').doc(de)
  const destino = db.collection('users').doc(para)

  // Trava: só apaga a origem se o destino tiver pelo menos o mesmo tanto de cada coisa.
  if ((await origem.get()).exists) {
    const [a, b] = await Promise.all([contarVarrendo(origem), contarVarrendo(destino)])
    // members e agentChat ficam menores de propósito (só o titular; sem as perguntas de
    // WhatsApp da Assistente, que re-disparariam respostas).
    const faltando = Object.keys(a).filter((k) => !['members', 'agentChat'].includes(k) && (b[k] ?? 0) < a[k])
    if (faltando.length) {
      console.error(`O destino tem menos documentos que a origem em: ${faltando.join(', ')}.`)
      console.error('Rode a cópia (sem --limpar) antes. Nada foi apagado.')
      process.exit(1)
    }
  }

  await excluirConta(de, DE)
  for (const email of EXCLUIR) {
    if (email === PARA) { console.error(`\nIgnorado: ${email} é o destino.`); continue }
    await excluirConta(await uidPorEmail(email), email)
  }

  if (!APPLY) console.log('\nRode de novo com --apply para apagar de verdade.')
  else console.log(`\nPronto. Sobrou só ${PARA}.`)
}

// ---------------------------------------------------------------------------

async function main() {
  const de = await uidPorEmail(DE)
  const para = await uidPorEmail(PARA)
  if (de === para) {
    console.error('Origem e destino são a mesma conta.')
    process.exit(1)
  }
  console.log(`projeto ${projectId} · bucket ${bucketName} · ${modo}`)
  console.log(`origem  ${DE} (${de})\ndestino ${PARA} (${para})\n`)
  if (LIMPAR) await limpar(de, para)
  else await copiar(de, para)
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err)
  process.exit(1)
})
