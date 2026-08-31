import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { montarFluxo, perguntar, RespostaVazia, MAX_CONTENT_CHARS, MAX_DESC_CHARS } from './ia'

// Admin SDK — usado pela exclusão de cliente (varre Firestore, Storage e Auth).
initializeApp()

// Chave do Gemini — no Secret Manager, NUNCA no bundle do cliente.
// Definir com:  firebase functions:secrets:set GEMINI_API_KEY
//
// A chave PRECISA ser de um projeto com billing vinculado. No tier gratuito o
// Google pode usar prompt e resposta para treinar os produtos dele, e aqui
// trafega conversa de cliente — o mesmo dado que as security rules escondem até
// do dono do sistema. O pago custa centavos e encerra esse uso.
const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY')

interface AskData {
  system?: string
  history?: { role: 'user' | 'assistant'; content: string }[]
  question?: string
}

// Os tetos de entrada e o corte de histórico vivem em ./ia — aqui só o que
// barra a requisição antes de gastar chamada.

/**
 * Callable: recebe { system, history, question } montados no cliente (single-tenant)
 * e retorna { reply }. Exige autenticação.
 */
export const askTitaIA = onCall(
  {
    region: 'southamerica-east1',
    secrets: [GEMINI_API_KEY],
    // App Check DESLIGADO por decisão consciente, não por descuido: a build de
    // produção nunca recebeu VITE_RECAPTCHA_SITE_KEY, então o App Check sequer era
    // inicializado no site (ver src/lib/firebase.ts) e TODA chamada morria antes de
    // chegar ao Gemini.
    //
    // Quem segura a porta é o `request.auth` abaixo: anônimo não passa. O que se
    // perde é a defesa contra o token de um usuário logado ser usado FORA do site —
    // num endpoint que gasta API paga, isso é risco real, não teórico. Para voltar
    // atrás: registrar o reCAPTCHA v3, pôr a site key no .env.local, rebuildar e
    // devolver este `true`. O excluirCliente NÃO foi afrouxado.
    enforceAppCheck: false,
    cors: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Faça login para usar o Titã IA.')
    }
    const { system, history, question } = (request.data || {}) as AskData
    if (!question || !question.trim()) {
      throw new HttpsError('invalid-argument', 'Pergunta vazia.')
    }
    if (question.length > MAX_CONTENT_CHARS) {
      throw new HttpsError('invalid-argument', 'Pergunta longa demais.')
    }

    try {
      const reply = await perguntar(GEMINI_API_KEY.value(), { system, history, question })
      return { reply }
    } catch (err) {
      if (err instanceof RespostaVazia) {
        console.warn('[askTitaIA]', err.message)
        throw new HttpsError('internal', 'O Titã IA não conseguiu responder isso. Tente reformular a pergunta.')
      }
      console.error('[askTitaIA] erro Gemini:', err)
      throw new HttpsError('internal', 'Não foi possível consultar o Titã IA agora.')
    }
  },
)

/**
 * Callable: recebe { descricao } e devolve { name, nodes, edges } para a aba
 * Fluxos montar o quadro. Exige autenticação.
 */
export const gerarFluxoIA = onCall(
  {
    region: 'southamerica-east1',
    secrets: [GEMINI_API_KEY],
    // Desligado pelo mesmo motivo do askTitaIA — ver o comentário longo lá em cima.
    enforceAppCheck: false,
    cors: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Faça login para usar o Titã IA.')
    }
    const { descricao } = (request.data || {}) as { descricao?: string }
    if (!descricao || !descricao.trim()) {
      throw new HttpsError('invalid-argument', 'Descreva o fluxo que você quer.')
    }
    if (descricao.length > MAX_DESC_CHARS) {
      throw new HttpsError('invalid-argument', 'Descrição longa demais.')
    }

    try {
      return await montarFluxo(GEMINI_API_KEY.value(), descricao)
    } catch (err) {
      if (err instanceof RespostaVazia) {
        console.warn('[gerarFluxoIA]', err.message)
        throw new HttpsError('internal', 'O Titã IA não conseguiu montar o fluxo agora.')
      }
      console.error('[gerarFluxoIA] erro Gemini:', err)
      throw new HttpsError('internal', 'Não foi possível gerar o fluxo agora.')
    }
  },
)

// ---------------------------------------------------------------------------
// Exclusão de cliente (painel SUPER TITAN → Clientes)
// ---------------------------------------------------------------------------

/**
 * Donos do sistema. Espelha src/lib/owners.ts e a allowlist do firestore.rules —
 * as três listas precisam andar juntas.
 */
const OWNER_EMAILS = [
  'danielboy200627@gmail.com',
  // 'dono2@exemplo.com',
  // 'dono3@exemplo.com',
].map((e) => e.toLowerCase())

/** Roda o passo e só registra a falha: um erro no Storage não pode abortar o resto. */
async function step(label: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn()
  } catch (err) {
    console.error(`[excluirCliente] falha em ${label}:`, err)
  }
}

/**
 * Callable: apaga DEFINITIVAMENTE o tenant users/{uid} — subcoleções, arquivos no
 * Storage, convites, vínculos de equipe e a conta no Auth.
 *
 * O navegador não conseguiria fazer isso: as regras nem deixam o dono do sistema ler as
 * subcoleções do cliente (dados confidenciais), quanto mais varrê-las. Aqui a autorização
 * é refeita do zero contra a allowlist — não se confia em nada vindo do cliente além do uid.
 */
export const excluirCliente = onCall(
  {
    region: 'southamerica-east1',
    // Exigido em produção; dispensado no emulador, onde o app roda sem reCAPTCHA e a
    // chamada voltaria 401 — o que deixaria a exclusão sem como ser testada localmente.
    // A autorização de verdade é a allowlist logo abaixo, não o App Check.
    enforceAppCheck: !process.env.FUNCTIONS_EMULATOR,
    cors: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Faça login para continuar.')
    }
    const callerEmail = String(request.auth.token.email || '').toLowerCase()
    if (!OWNER_EMAILS.includes(callerEmail)) {
      throw new HttpsError('permission-denied', 'Apenas o dono do sistema pode excluir clientes.')
    }

    const uid = String((request.data || {}).uid || '').trim()
    if (!uid) {
      throw new HttpsError('invalid-argument', 'uid do cliente não informado.')
    }
    if (uid === request.auth.uid) {
      throw new HttpsError('failed-precondition', 'Você não pode excluir a própria conta por aqui.')
    }

    const db = getFirestore()
    const userRef = db.doc(`users/${uid}`)

    // E-mail do alvo: primeiro o Auth (fonte da verdade), com o doc como reserva.
    let targetEmail = ''
    try {
      targetEmail = String((await getAuth().getUser(uid)).email || '').toLowerCase()
    } catch {
      const snap = await userRef.get()
      targetEmail = String(snap.data()?.email || '').toLowerCase()
    }
    if (targetEmail && OWNER_EMAILS.includes(targetEmail)) {
      throw new HttpsError('failed-precondition', 'Contas de dono do sistema não podem ser excluídas por aqui.')
    }

    await step('storage', async () => {
      const bucket = process.env.TITA_STORAGE_BUCKET
        ? getStorage().bucket(process.env.TITA_STORAGE_BUCKET)
        : getStorage().bucket()
      await bucket.deleteFiles({ prefix: `users/${uid}/` })
    })

    // recursiveDelete cuida das subcoleções (contacts/messages, deals, conversations…),
    // que é justamente o que o SDK do navegador não alcança.
    await step('firestore/users', () => db.recursiveDelete(userRef))
    await step('firestore/whatsappStatus', () => db.recursiveDelete(db.doc(`whatsappStatus/${uid}`)))
    await step('firestore/whatsappSessions', () => db.recursiveDelete(db.doc(`whatsappSessions/${uid}`)))

    await step('firestore/invites', async () => {
      const snap = await db.collection('invites').where('tenantUid', '==', uid).get()
      await Promise.all(snap.docs.map((d) => d.ref.delete()))
    })

    // Vínculos que este e-mail tinha como atendente em OUTROS tenants — senão sobra um
    // convidado fantasma na equipe de quem o convidou.
    if (targetEmail) {
      await step('firestore/members', async () => {
        const snap = await db.collectionGroup('members').where('email', '==', targetEmail).get()
        await Promise.all(snap.docs.map((d) => d.ref.delete()))
      })
    }

    await step('auth', async () => {
      try {
        await getAuth().deleteUser(uid)
      } catch (err) {
        if ((err as { code?: string }).code !== 'auth/user-not-found') throw err
      }
    })

    console.info(`[excluirCliente] cliente ${uid} excluído por ${callerEmail}`)
    return { ok: true }
  },
)
