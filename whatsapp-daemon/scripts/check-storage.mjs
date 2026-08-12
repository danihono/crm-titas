// Diagnóstico do Firebase Storage visto PELO DAEMON: diz qual identidade está agindo, em
// qual bucket, e se ela consegue de fato gravar/ler/apagar um arquivo.
//
// Existe porque a falha real é assimétrica e engana: sem permissão de Storage o daemon sobe
// normalmente, mensagem de TEXTO continua chegando (Firestore é outra permissão) e só a mídia
// some. O sintoma aparece dias depois, parecendo problema do WhatsApp.
//
// As três etapas são testadas SEPARADAMENTE de propósito: `save()` fala com a API do GCS e
// `getDownloadURL()` fala com a do Firebase Storage — outro host, outra autorização. Uma sonda
// que só testasse a gravação daria verde com a ingestão real quebrada.
//
// Uso: node scripts/check-storage.mjs
// Não depende do lib/ compilado — roda antes de qualquer `npm run build`. NÃO escreve nada
// fora do objeto de sonda, que é apagado no fim.
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getStorage, getDownloadURL } from 'firebase-admin/storage'

const projectId =
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCLOUD_PROJECT ||
  process.env.FIREBASE_PROJECT_ID ||
  'titas-c8967'

// Mesma resolução de config.ts — se divergirem, a sonda testaria um bucket que o daemon não usa.
const storageBucket =
  process.env.FIREBASE_STORAGE_BUCKET ||
  process.env.GCLOUD_STORAGE_BUCKET ||
  `${projectId}.firebasestorage.app`

/** Identidade que o Admin SDK vai usar — é o que a permissão do IAM precisa acertar. */
function identity() {
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (!keyPath) return 'metadata server (ADC sem arquivo de chave)'
  try {
    const json = JSON.parse(readFileSync(keyPath, 'utf8'))
    return `${json.client_email ?? '(sem client_email)'}  [${keyPath}]`
  } catch (err) {
    return `NÃO FOI POSSÍVEL LER ${keyPath}: ${err.message}`
  }
}

/** Erro cru, do jeito que o cliente do GCS entrega — é o texto que identifica a causa. */
function describe(err) {
  const parts = [`code=${err?.code ?? '-'}`, `message=${err?.message ?? String(err)}`]
  const reason = err?.errors?.[0]?.reason
  if (reason) parts.push(`reason=${reason}`)
  return parts.join(' | ')
}

function hint(err) {
  const code = Number(err?.code)
  if (code === 403 || code === 401) {
    return 'Falta permissão. Conceda roles/storage.objectAdmin À IDENTIDADE ACIMA (veja §5 do\n' +
      '  docs/whatsapp-selfhost-hetzner.md). Confira se o principal do add-iam-policy-binding\n' +
      '  é exatamente o client_email impresso aqui — conceder ao errado é a falha mais comum.'
  }
  if (code === 404) {
    return 'Bucket não encontrado. Ou FIREBASE_STORAGE_BUCKET está errado, ou o Firebase Storage\n' +
      '  nunca foi habilitado neste projeto (Console > Storage > Começar).'
  }
  return 'Sem causa conhecida para este código — o erro cru acima é o que vale.'
}

console.log('projeto: ', projectId)
console.log('bucket:  ', storageBucket)
console.log('agindo como:', identity())
console.log('')

initializeApp({ credential: applicationDefault(), projectId, storageBucket })
const bucket = getStorage().bucket()

try {
  const [exists] = await bucket.exists()
  console.log(exists ? '[ok]    bucket existe' : '[FALHA] bucket NÃO existe')
  if (!exists) {
    console.log('\n' + hint({ code: 404 }))
    process.exit(1)
  }
} catch (err) {
  console.log('[FALHA] não deu para consultar o bucket:', describe(err))
  console.log('\n' + hint(err))
  process.exit(1)
}

const path = `whatsappDaemon/preflight/${randomUUID()}.probe`
const file = bucket.file(path)

// Etapa 1 — gravação (API do GCS).
try {
  await file.save(Buffer.from('probe'), {
    resumable: false,
    metadata: {
      contentType: 'text/plain',
      metadata: { firebaseStorageDownloadTokens: randomUUID() },
    },
  })
  console.log('[ok]    save() — gravou', path)
} catch (err) {
  console.log('[FALHA] save() —', describe(err))
  console.log('\n' + hint(err))
  process.exit(1)
}

// Etapa 2 — URL de download (API do Firebase Storage: OUTRO host, pode falhar sozinha).
try {
  await getDownloadURL(file)
  console.log('[ok]    getDownloadURL()')
} catch (err) {
  console.log('[FALHA] getDownloadURL() —', describe(err))
  // Não deixa a sonda virar lixo no bucket.
  await file.delete({ ignoreNotFound: true }).catch(() => {})
  console.log('\n' + hint(err))
  process.exit(1)
}

// Etapa 3 — remoção (o expurgo LGPD depende dela).
try {
  await file.delete({ ignoreNotFound: true })
  console.log('[ok]    delete()')
} catch (err) {
  console.log('[FALHA] delete() —', describe(err))
  console.log('  (gravar funciona, apagar não: o expurgo de conversas vai falhar)')
  console.log('\n' + hint(err))
  process.exit(1)
}

console.log('\nStorage OK — o daemon consegue salvar mídia de WhatsApp com esta identidade.')
process.exit(0)
