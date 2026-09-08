import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import {
  montarFluxo, perguntar, sugerirTarefa, RespostaVazia,
  MAX_CONTENT_CHARS, MAX_DESC_CHARS, MAX_MENSAGENS_SUGESTAO,
} from './ia'

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

// ---------------------------------------------------------------------------
// Cota de uso da IA
// ---------------------------------------------------------------------------

/**
 * Teto por usuário por hora. É a ÚNICA coisa que separa "assistente do CRM" de "proxy do
 * Gemini pago por conta da casa": o cadastro é aberto, então criar conta e chamar estas
 * funções em laço custa segundos para quem quiser, e a fatura é do projeto. `request.auth`
 * sozinho nunca foi controle de custo — só de identidade.
 *
 * Generoso de propósito: quem usa o Titã IA de verdade num dia cheio não chega perto.
 */
const MAX_IA_POR_HORA = 40
const JANELA_COTA_MS = 60 * 60 * 1000

/** Teto de instâncias simultâneas — trava de gasto mesmo se a cota por usuário falhar. */
const MAX_INSTANCIAS = 10

/**
 * Consome uma unidade da cota do usuário, ou recusa.
 *
 * A janela vive no Firestore (e não em memória) porque cada instância da função é um
 * processo novo: um contador local zeraria a cada chamada fria e não valeria nada.
 * `aiUsage` não tem regra em firestore.rules — cai no default-deny, então só o Admin SDK
 * escreve e ninguém zera a própria cota pelo navegador.
 */
async function consomeCota(uid: string): Promise<void> {
  const ref = getFirestore().doc(`aiUsage/${uid}`)
  const agora = Date.now()
  try {
    await getFirestore().runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      const inicio = Number(snap.get('windowStart') ?? 0)
      const usados = Number(snap.get('count') ?? 0)
      const janelaViva = agora - inicio < JANELA_COTA_MS
      if (janelaViva && usados >= MAX_IA_POR_HORA) {
        throw new HttpsError(
          'resource-exhausted',
          'Você já usou o Titã IA muitas vezes nesta hora. Tente de novo mais tarde.',
        )
      }
      tx.set(ref, {
        windowStart: janelaViva ? inicio : agora,
        count: janelaViva ? usados + 1 : 1,
        lastAt: agora,
      })
    })
  } catch (err) {
    if (err instanceof HttpsError) throw err
    // Falha de infraestrutura no contador não pode derrubar a funcionalidade — mas fica
    // registrada, porque cota que falha calada é cota que não existe.
    console.error('[consomeCota] falha ao contabilizar uso:', err)
  }
}

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
    maxInstances: MAX_INSTANCIAS,
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
    await consomeCota(request.auth.uid)
    const { system, history, question } = (request.data || {}) as AskData
    // O corte de verdade acontece em ./ia; aqui é só para um array absurdo não chegar a
    // ser percorrido — recusar é mais barato do que cortar.
    if (Array.isArray(history) && history.length > 200) {
      throw new HttpsError('invalid-argument', 'Histórico grande demais.')
    }
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

interface SugerirData {
  mensagens?: { de?: unknown; texto?: unknown }[]
  tipos?: { id?: unknown; label?: unknown }[]
  cliente?: unknown
  hoje?: unknown
}

const DIA_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Callable: lê as últimas mensagens de um atendimento e devolve UMA tarefa
 * sugerida — tipo, título, dia e hora — para o modal de nova atividade abrir
 * preenchido. Não grava nada: quem confirma é a pessoa.
 *
 * O `hoje` vem do cliente porque o servidor roda em UTC e não sabe o fuso de
 * quem está atendendo; "amanhã" calculado no fuso errado marca a tarefa no dia
 * errado, que é justamente o tipo de erro que ninguém percebe.
 */
export const sugerirTarefaIA = onCall(
  {
    region: 'southamerica-east1',
    secrets: [GEMINI_API_KEY],
    maxInstances: MAX_INSTANCIAS,
    // Mesma decisão do askTitaIA: quem segura a porta é o request.auth.
    enforceAppCheck: false,
    cors: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Faça login para usar o Titã IA.')
    }
    await consomeCota(request.auth.uid)
    const { mensagens, tipos, cliente, hoje } = (request.data || {}) as SugerirData

    if (!Array.isArray(mensagens) || mensagens.length === 0) {
      throw new HttpsError('invalid-argument', 'Conversa vazia — não há o que sugerir.')
    }
    if (mensagens.length > 500) {
      throw new HttpsError('invalid-argument', 'Conversa grande demais.')
    }
    if (!Array.isArray(tipos) || tipos.length === 0) {
      throw new HttpsError('invalid-argument', 'Nenhum tipo de atividade disponível.')
    }
    if (typeof hoje !== 'string' || !DIA_RE.test(hoje)) {
      throw new HttpsError('invalid-argument', 'Data de hoje ausente ou fora do formato.')
    }

    // Defesa de custo: o cliente legítimo manda no máximo o teto; o resto é corte.
    const limpas = mensagens
      .slice(-MAX_MENSAGENS_SUGESTAO)
      .flatMap((m) => {
        const texto = typeof m?.texto === 'string' ? m.texto.trim().slice(0, 600) : ''
        if (!texto) return []
        return [{ de: m?.de === 'cliente' ? ('cliente' as const) : ('atendente' as const), texto }]
      })
    if (limpas.length === 0) {
      throw new HttpsError('invalid-argument', 'Conversa sem texto — não há o que sugerir.')
    }

    const tiposLimpos = tipos
      .slice(0, 20)
      .flatMap((t) => {
        const id = typeof t?.id === 'string' ? t.id.trim().slice(0, 60) : ''
        if (!id) return []
        return [{ id, label: typeof t?.label === 'string' ? t.label.trim().slice(0, 60) : id }]
      })
    if (tiposLimpos.length === 0) {
      throw new HttpsError('invalid-argument', 'Nenhum tipo de atividade válido.')
    }

    try {
      const tarefa = await sugerirTarefa(GEMINI_API_KEY.value(), {
        mensagens: limpas,
        tipos: tiposLimpos,
        cliente: typeof cliente === 'string' ? cliente.trim().slice(0, 120) : 'o cliente',
        hoje,
      })
      return { tarefa }
    } catch (err) {
      if (err instanceof RespostaVazia) {
        console.warn('[sugerirTarefaIA]', err.message)
        throw new HttpsError('internal', 'O Titã IA não conseguiu sugerir uma tarefa para esta conversa.')
      }
      console.error('[sugerirTarefaIA] erro Gemini:', err)
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
    maxInstances: MAX_INSTANCIAS,
    // Desligado pelo mesmo motivo do askTitaIA — ver o comentário longo lá em cima.
    enforceAppCheck: false,
    cors: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Faça login para usar o Titã IA.')
    }
    await consomeCota(request.auth.uid)
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
