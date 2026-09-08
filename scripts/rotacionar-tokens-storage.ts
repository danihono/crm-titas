/**
 * Revoga as URLs de download já compartilhadas de um ambiente.
 *
 * POR QUE ISTO EXISTE
 * Todo upload do CRM chama `getDownloadURL()` e grava a URL no Firestore. Essa URL carrega
 * um `?token=` que é uma CREDENCIAL AO PORTADOR: ela ignora `storage.rules` por completo —
 * sem sessão, sem vínculo, sem validade. Quem tiver o link baixa o arquivo para sempre,
 * mesmo depois de sair da empresa, mesmo com a conta bloqueada. Um print compartilhado, o
 * histórico do navegador ou um `Referer` vazado bastam.
 *
 * A única revogação possível é TROCAR o token do objeto no Storage. Fazer isso sozinho
 * quebraria a tela, porque as URLs antigas continuam gravadas no Firestore — então este
 * script troca o token E reescreve o campo correspondente em cada documento.
 *
 * QUANDO USAR
 * Incidente: alguém saiu com links, um documento vazou, um cliente pediu descarte. Não é
 * rotina — cada objeto tocado invalida qualquer link que alguém legítimo tenha guardado.
 *
 * USO
 *   GOOGLE_APPLICATION_CREDENTIALS=/caminho/sa.json \
 *   GCLOUD_PROJECT=titas-c8967 npx tsx scripts/rotacionar-tokens-storage.ts <uid>
 *   ... e de novo com --apply quando a prévia estiver do seu gosto.
 *
 * Sem `--apply` ele só mostra o que faria. É o padrão de propósito: a operação não tem volta.
 */
import { randomUUID } from 'node:crypto'
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'

const uid = process.argv[2]
const aplicar = process.argv.includes('--apply')

if (!uid || uid.startsWith('--')) {
  console.error('uso: tsx scripts/rotacionar-tokens-storage.ts <uid-do-ambiente> [--apply]')
  process.exit(1)
}
const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID
if (!projectId) {
  console.error('Defina GCLOUD_PROJECT (e GOOGLE_APPLICATION_CREDENTIALS, fora da GCP).')
  process.exit(1)
}

initializeApp({ projectId, credential: applicationDefault(), storageBucket: process.env.TITA_STORAGE_BUCKET })
const db = getFirestore()
const bucket = getStorage().bucket()

/** Monta a URL pública do objeto — o mesmo formato que o SDK do navegador devolve. */
function urlDe(caminho: string, token: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(caminho)}?alt=media&token=${token}`
}

/** Troca o token do objeto e devolve a URL nova. Devolve null se o objeto não existe mais. */
async function rotacionar(caminho: string): Promise<string | null> {
  const file = bucket.file(caminho)
  const [existe] = await file.exists()
  if (!existe) return null
  const token = randomUUID()
  if (aplicar) {
    await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: token } })
  }
  return urlDe(caminho, token)
}

/**
 * Os pares (campo com o caminho, campo com a URL) que o app grava. Se um upload novo
 * aparecer no CRM sem entrar nesta lista, ele fica com o token velho — e o script
 * silenciosamente não revoga nada dele.
 */
const ALVOS: { rotulo: string; docs: () => Promise<FirebaseFirestore.QueryDocumentSnapshot[]>; caminho: string; url: string }[] = [
  {
    rotulo: 'mediaLibrary',
    docs: async () => (await db.collection(`users/${uid}/mediaLibrary`).get()).docs,
    caminho: 'storagePath',
    url: 'downloadURL',
  },
]

async function subcolecoesDeContatos(sub: 'files' | 'messages') {
  const contatos = await db.collection(`users/${uid}/contacts`).get()
  const out: FirebaseFirestore.QueryDocumentSnapshot[] = []
  for (const c of contatos.docs) out.push(...(await c.ref.collection(sub).get()).docs)
  return out
}

async function main() {
  console.log(`\nAmbiente: ${uid}   Projeto: ${projectId}   Bucket: ${bucket.name}`)
  console.log(aplicar ? '>>> APLICANDO (sem volta)\n' : '>>> PRÉVIA — nada será alterado. Use --apply para valer.\n')

  const grupos = [
    ...ALVOS,
    { rotulo: 'contacts/*/files', docs: () => subcolecoesDeContatos('files'), caminho: 'storagePath', url: 'downloadURL' },
    { rotulo: 'contacts/*/messages', docs: () => subcolecoesDeContatos('messages'), caminho: 'mediaPath', url: 'mediaUrl' },
    { rotulo: 'contacts (foto)', docs: async () => (await db.collection(`users/${uid}/contacts`).get()).docs, caminho: 'photoPath', url: 'photoUrl' },
  ]

  let rotacionados = 0
  let ausentes = 0

  for (const g of grupos) {
    const docs = await g.docs()
    let n = 0
    for (const d of docs) {
      const caminho = d.get(g.caminho)
      if (typeof caminho !== 'string' || !caminho) continue
      const nova = await rotacionar(caminho)
      if (!nova) { ausentes++; continue }
      if (aplicar) await d.ref.update({ [g.url]: nova })
      n++
    }
    rotacionados += n
    console.log(`  ${g.rotulo.padEnd(22)} ${n} arquivo(s)`)
  }

  // O doc do próprio ambiente: foto de perfil e logo do painel SUPER TITAN.
  const userDoc = await db.doc(`users/${uid}`).get()
  for (const [caminho, url] of [['photoPath', 'photoUrl'], ['logoPath', 'logoUrl']] as const) {
    const p = userDoc.get(caminho)
    if (typeof p !== 'string' || !p) continue
    const nova = await rotacionar(p)
    if (!nova) { ausentes++; continue }
    if (aplicar) await userDoc.ref.update({ [url]: nova })
    rotacionados++
    console.log(`  users/${uid}.${url}`)
  }

  console.log(`\n${rotacionados} arquivo(s) ${aplicar ? 'revogados' : 'a revogar'}; ${ausentes} referência(s) apontando para arquivo inexistente.`)
  if (!aplicar) console.log('Rode de novo com --apply para valer.\n')
  else console.log('Os links antigos deixaram de funcionar. Quem tiver a tela aberta precisa recarregar.\n')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
