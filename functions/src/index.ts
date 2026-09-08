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
 * App Check exigido? UMA chave para as quatro callables.
 *
 * Estava pela metade e o resultado era o pior dos dois mundos: as funções de IA com
 * `false` (sem defesa contra o token de um usuário ser usado fora do site) e a
 * `excluirCliente` com `true` — exigindo um token que a build de produção NUNCA enviou,
 * porque `VITE_RECAPTCHA_SITE_KEY` nunca foi configurada. Ou seja: a exclusão de cliente
 * está quebrada no ar desde então, e um caminho destrutivo que nunca roda é um caminho
 * que nunca foi testado.
 *
 * Agora as quatro seguem a mesma chave, e ligar é um passo de configuração, não de código:
 *
 *   1. reCAPTCHA v3 no console + secret key em Firebase Console → App Check
 *   2. `VITE_RECAPTCHA_SITE_KEY` no .env.local e rebuild do site
 *   3. `TITA_APP_CHECK_ENFORCED=true` em functions/.env e redeploy das functions
 *
 * A ordem importa: inverter 2 e 3 derruba as chamadas do site. No emulador nunca é
 * exigido — lá o app roda sem reCAPTCHA e toda chamada voltaria 401.
 *
 * Isto NÃO é a autorização: quem decide quem pode o quê são o `request.auth`, a allowlist
 * e as security rules. O App Check é a camada que impede o token válido de ser usado fora
 * do site — num endpoint que gasta API paga, risco real.
 */
const APP_CHECK_EXIGIDO =
  process.env.TITA_APP_CHECK_ENFORCED === 'true' && !process.env.FUNCTIONS_EMULATOR

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
    enforceAppCheck: APP_CHECK_EXIGIDO,
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
    enforceAppCheck: APP_CHECK_EXIGIDO,
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
    enforceAppCheck: APP_CHECK_EXIGIDO,
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
    // A autorização de verdade é a allowlist logo abaixo, não o App Check.
    enforceAppCheck: APP_CHECK_EXIGIDO,
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

// ---------------------------------------------------------------------------
// Métricas agregadas do painel SUPER TITAN
// ---------------------------------------------------------------------------

/**
 * Callable: devolve SÓ NÚMEROS sobre os clientes — total do pipeline, faturamento e
 * contagens. Nenhum documento de cliente atravessa.
 *
 * Existe porque o painel fazia isso pelo navegador, com quatro `collectionGroup` abertos
 * sobre `deals`, `invoices`, `contacts` e `activities` de TODOS os tenants. A tela mostrava
 * apenas somas, mas o navegador do dono do sistema recebia os documentos inteiros: nome da
 * empresa, contato e valor de cada negócio; cliente, valor, vencimento, forma de pagamento e
 * observações de cada nota; nome, telefone e última mensagem de cada contato. O README e as
 * próprias regras afirmam que esse dado está fora do alcance dele — e não estava.
 *
 * Agora a conta é feita aqui, onde os dados não saem do servidor, e as regras de
 * collectionGroup que davam esse acesso foram removidas do firestore.rules.
 */
export const estatisticasClientes = onCall(
  {
    region: 'southamerica-east1',
    maxInstances: MAX_INSTANCIAS,
    enforceAppCheck: APP_CHECK_EXIGIDO,
    cors: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Faça login para continuar.')
    }
    const callerEmail = String(request.auth.token.email || '').toLowerCase()
    if (!OWNER_EMAILS.includes(callerEmail)) {
      throw new HttpsError('permission-denied', 'Apenas o dono do sistema vê estas métricas.')
    }

    const db = getFirestore()
    const agora = Date.now()

    // Teto de segurança: o painel é de dezenas de clientes, não de milhares. Sem limite,
    // um crescimento inesperado viraria timeout e conta alta sem ninguém perceber.
    const clientes = await db.collection('users').limit(500).get()

    let pipelineTotal = 0
    let dealCount = 0
    let faturado = 0
    let aReceber = 0
    let vencido = 0
    let contactsCount = 0
    let activitiesCount = 0
    const perClient: Record<string, { pipeline: number; deals: number }> = {}

    await Promise.all(
      clientes.docs.map(async (cliente) => {
        const email = String(cliente.get('email') || '').toLowerCase()
        // Contas de dono do sistema não são clientes — não entram nos números.
        if (email && OWNER_EMAILS.includes(email)) return

        const [deals, invoices, contatos, atividades] = await Promise.all([
          cliente.ref.collection('deals').get(),
          cliente.ref.collection('invoices').get(),
          cliente.ref.collection('contacts').count().get(),
          cliente.ref.collection('activities').count().get(),
        ])

        let pipeline = 0
        deals.forEach((d) => {
          const valor = Number(d.get('value') ?? 0)
          if (Number.isFinite(valor)) pipeline += valor
        })
        pipelineTotal += pipeline
        dealCount += deals.size
        perClient[cliente.id] = { pipeline, deals: deals.size }

        invoices.forEach((iv) => {
          const valor = Number(iv.get('value') ?? 0)
          if (!Number.isFinite(valor)) return
          if (iv.get('status') === 'Paga') { faturado += valor; return }
          // Mesma regra do cliente (invoiceStatus): sem baixa, o vencimento decide.
          const due = iv.get('dueAt')
          const dueMs = due && typeof due.toMillis === 'function' ? due.toMillis() : 0
          if (dueMs && dueMs < agora) vencido += valor
          else aReceber += valor
        })

        contactsCount += contatos.data().count
        activitiesCount += atividades.data().count
      }),
    )

    return {
      pipelineTotal, dealCount, faturado, aReceber, vencido,
      contactsCount, activitiesCount, perClient,
    }
  },
)

// ---------------------------------------------------------------------------
// Revogação de acesso
// ---------------------------------------------------------------------------

/**
 * Callable: derruba as sessões abertas de um atendente ao desativá-lo ou removê-lo.
 *
 * Sem isto, "bloquear" era só `active: false` no vínculo. As security rules passam a
 * recusar na hora seguinte à mudança, mas o token de ID que a pessoa já tem na aba aberta
 * continua válido por até uma hora, e o refresh token continua renovando indefinidamente —
 * quem foi desligado seguia com o CRM aberto e funcionando. `revokeRefreshTokens` é a única
 * coisa que corta isso, e só o Admin SDK pode chamá-la.
 *
 * A autorização é refeita aqui do zero, contra o Firestore: quem administra o ambiente é o
 * titular da conta ou quem tem papel `dono` nele — os mesmos de firestore.rules.
 */
export const revogarAcesso = onCall(
  {
    region: 'southamerica-east1',
    maxInstances: MAX_INSTANCIAS,
    enforceAppCheck: APP_CHECK_EXIGIDO,
    cors: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Faça login para continuar.')
    }
    const { tenantUid, memberUid } = (request.data || {}) as {
      tenantUid?: unknown
      memberUid?: unknown
    }
    const tenant = String(tenantUid || '').trim()
    const alvo = String(memberUid || '').trim()
    if (!tenant || !alvo) {
      throw new HttpsError('invalid-argument', 'Ambiente ou pessoa não informados.')
    }

    const db = getFirestore()
    const quem = request.auth.uid

    if (quem !== tenant) {
      const vinculo = await db.doc(`users/${tenant}/members/${quem}`).get()
      const ativo = vinculo.exists && vinculo.get('active') !== false
      if (!ativo || vinculo.get('role') !== 'dono') {
        throw new HttpsError('permission-denied', 'Apenas quem administra o ambiente pode revogar acessos.')
      }
    }

    // O titular do ambiente não se derruba por aqui — seria um jeito silencioso de
    // travar o dono fora da própria conta.
    if (alvo === tenant) {
      throw new HttpsError('failed-precondition', 'O titular do ambiente não pode ter o acesso revogado.')
    }

    try {
      await getAuth().revokeRefreshTokens(alvo)
    } catch (err) {
      if ((err as { code?: string }).code === 'auth/user-not-found') return { ok: true }
      console.error('[revogarAcesso] falha ao revogar:', err)
      throw new HttpsError('internal', 'Não foi possível encerrar as sessões desta pessoa.')
    }

    console.info(`[revogarAcesso] sessões de ${alvo} encerradas em ${tenant} por ${quem}`)
    return { ok: true }
  },
)
