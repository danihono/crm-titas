import { onSchedule } from 'firebase-functions/v2/scheduler'
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore'
import { defineSecret } from 'firebase-functions/params'
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore'
import { perguntar } from './ia'
import {
  TZ_PADRAO, agoraNoFuso, dentroDaJanela, blocosPermitidos, montarResumo, RODAPE,
  type BlocosResumo, type DadosResumo, type ItemAgenda, type ItemConversa,
  type ItemFatura, type ItemTarefa,
} from './resumo'
import { consomeCota } from './cota'

/**
 * A ASSISTENTE — o resumo diário no WhatsApp.
 *
 * Este arquivo é o CÉREBRO; o daemon é só o transporte. A divisão não é organizacional: a
 * GEMINI_API_KEY vive no Secret Manager e não desce para a VPS que hospeda o WhatsApp.
 * O contrato entre os dois são duas coleções no Firestore — `assistantOutbox` (daqui para
 * o daemon) e `users/{tenant}/agentChat` (do daemon para cá).
 *
 * As agregações abaixo repetem regras que já existem em src/lib e src/hooks. Não é
 * descuido: `functions/` é um pacote npm separado, com o próprio tsconfig, e não alcança
 * `../src`. A regra aqui é pequena o bastante para caber; se crescer, aí vale um pacote
 * compartilhado de verdade.
 */

const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY')

// ---------------------------------------------------------------------------
// Leitura do Firestore
// ---------------------------------------------------------------------------

const DIA_MS = 24 * 60 * 60 * 1000

function paraData(v: unknown): Date | null {
  if (v instanceof Timestamp) return v.toDate()
  if (v instanceof Date) return v
  return null
}

/** Dias inteiros entre `quando` e agora. Positivo = passado (atrasado/vencido). */
function diasDesde(quando: Date, agora: Date): number {
  return Math.floor((agora.getTime() - quando.getTime()) / DIA_MS)
}

/**
 * Junta o que entra no resumo de um ambiente.
 *
 * Cada consulta é deliberadamente rasa e filtrada em memória. `status == 'Pendente'` e
 * `done == false` PARECEM mais eficientes, mas o Firestore exclui da consulta os documentos
 * que não têm o campo — e nota antiga sem `status`, ou atividade sem `done`, sumiria do
 * resumo em silêncio. É o mesmo raciocínio do comentário em src/hooks/useInvoices.ts sobre
 * não usar orderBy por um campo que pode faltar.
 */
export async function coletarDados(uid: string, hojeKey: string, agora: Date): Promise<DadosResumo> {
  const db = getFirestore()
  const tenant = db.collection('users').doc(uid)
  const fimDoDia = Timestamp.fromMillis(agora.getTime() + DIA_MS)
  const limiteFatura = Timestamp.fromMillis(agora.getTime() + 7 * DIA_MS)

  const [evSnap, atSnap, nfSnap, ctSnap] = await Promise.all([
    tenant.collection('events').where('dateKey', '==', hojeKey).limit(50).get(),
    tenant.collection('activities').where('dueAt', '<=', fimDoDia).orderBy('dueAt').limit(50).get(),
    tenant.collection('invoices').where('dueAt', '<=', limiteFatura).orderBy('dueAt').limit(50).get(),
    tenant.collection('contacts').where('conv.status', '==', 'entrada').limit(50).get(),
  ])

  const agenda: ItemAgenda[] = evSnap.docs
    .map((d) => ({ time: String(d.get('time') ?? ''), title: String(d.get('title') ?? '') }))
    .filter((e) => e.title)
    .sort((a, b) => a.time.localeCompare(b.time))

  const tarefasHoje: ItemTarefa[] = []
  const tarefasAtrasadas: ItemTarefa[] = []
  for (const d of atSnap.docs) {
    if (d.get('done') === true) continue
    const dueAt = paraData(d.get('dueAt'))
    const title = String(d.get('title') ?? '')
    if (!dueAt || !title) continue
    const dias = diasDesde(dueAt, agora)
    // Vencida = o prazo já passou. O dia do vencimento inteiro ainda é "para hoje" —
    // mesma decisão de src/hooks/useInvoices.ts, senão tudo vira atrasado depois do meio-dia.
    if (dueAt.getTime() < agora.getTime() && dias >= 1) tarefasAtrasadas.push({ title, atrasadaDias: dias })
    else tarefasHoje.push({ title, atrasadaDias: 0 })
  }

  const faturasVencidas: ItemFatura[] = []
  const faturasAVencer: ItemFatura[] = []
  for (const d of nfSnap.docs) {
    // 'Vencida' NÃO existe no banco: o status persistido é 'Paga' ou 'Pendente', e o
    // vencimento é derivado (src/hooks/useInvoices.ts). Consultar por 'Vencida' voltaria
    // sempre vazio, e o bloco de faturas nasceria mudo.
    if (d.get('status') === 'Paga') continue
    const dueAt = paraData(d.get('dueAt'))
    if (!dueAt) continue
    const item: ItemFatura = {
      num: String(d.get('num') ?? 's/nº'),
      client: String(d.get('client') ?? ''),
      value: Number(d.get('value') ?? 0),
      diasVencida: diasDesde(dueAt, agora),
    }
    if (item.diasVencida >= 1) faturasVencidas.push(item)
    else faturasAVencer.push(item)
  }

  const conversas: ItemConversa[] = ctSnap.docs
    .map((d) => ({
      name: String(d.get('name') ?? ''),
      lastMessage: String(d.get('lastMessage') ?? ''),
      at: paraData(d.get('lastMessageAt'))?.getTime() ?? 0,
    }))
    .filter((c) => c.name && c.lastMessage)
    .sort((a, b) => b.at - a.at)
    .map(({ name, lastMessage }) => ({ name, lastMessage }))

  return { agenda, tarefasHoje, tarefasAtrasadas, faturasVencidas, faturasAVencer, conversas }
}

// ---------------------------------------------------------------------------
// A saudação — a ÚNICA parte escrita pelo modelo
// ---------------------------------------------------------------------------

const SAUDACAO_PADRAO = 'Bom dia! Aqui está o seu resumo de hoje.'
const SAUDACAO_TIMEOUT_MS = 10_000

/**
 * Uma linha de abertura com a cara da persona configurada.
 *
 * Falhou, demorou ou veio vazia: sai a fixa. O resumo NUNCA deixa de ser enviado por causa
 * disto — os dados já estão montados, e uma saudação genérica não custa nada a ninguém.
 * O teto de tempo é obrigatório: `perguntar` não tem timeout próprio, e uma chamada
 * pendurada travaria a rodada inteira, que processa os ambientes em sequência.
 */
async function saudacao(apiKey: string, nome: string, persona: string): Promise<string> {
  try {
    const texto = await Promise.race([
      perguntar(apiKey, {
        system: `Você é "${nome}", ${persona}. Escreva APENAS uma saudação matinal curta (máx. 12 palavras), em português do Brasil, calorosa e profissional. Sem emojis no fim, sem listas, sem aspas.`,
        question: 'Escreva a saudação de hoje.',
      }),
      new Promise<string>((_, rej) => setTimeout(() => rej(new Error('timeout')), SAUDACAO_TIMEOUT_MS)),
    ])
    const limpa = texto.trim().split('\n')[0].slice(0, 120)
    return limpa || SAUDACAO_PADRAO
  } catch (err) {
    console.warn('[assistente] saudação caiu para o texto fixo:', err)
    return SAUDACAO_PADRAO
  }
}

// ---------------------------------------------------------------------------
// A função agendada
// ---------------------------------------------------------------------------

function digitosDe(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '')
}

/** Enfileira para o daemon enviar. Id determinístico = a trava real contra duplicidade. */
async function enfileirar(id: string, tenantUid: string, toDigits: string, texto: string): Promise<boolean> {
  try {
    await getFirestore().collection('assistantOutbox').doc(id).create({
      tenantUid,
      toDigits,
      text: texto,
      kind: 'daily',
      status: 'pending',
      attempts: 0,
      dueAt: Timestamp.now(),
      createdAt: FieldValue.serverTimestamp(),
    })
    return true
  } catch {
    // `create` falha se o doc já existe — que é exatamente o caso "já mandei hoje".
    // Retry do Cloud Scheduler e instância concorrente caem aqui, e é o resultado certo.
    return false
  }
}

/**
 * Resumo diário: roda de 15 em 15 minutos e envia para quem chegou na hora marcada.
 *
 * De 15 em 15, e não uma vez por dia, porque cada ambiente escolhe o próprio horário no
 * próprio fuso — uma execução diária só serviria a um horário único para todo mundo.
 */
export const resumoDiario = onSchedule(
  {
    schedule: 'every 15 minutes',
    timeZone: 'America/Sao_Paulo',
    region: 'southamerica-east1',
    secrets: [GEMINI_API_KEY],
    maxInstances: 2,
  },
  async () => {
    const db = getFirestore()
    const agora = new Date()

    const snap = await db.collection('users').where('agent.whatsapp.enabled', '==', true).get()
    if (snap.empty) return

    for (const doc of snap.docs) {
      const uid = doc.id
      try {
        const agent = (doc.get('agent') ?? {}) as Record<string, unknown>
        const wa = (agent.whatsapp ?? {}) as Record<string, unknown>
        if (wa.optOut === true) continue

        const tz = String((doc.get('businessHours') as Record<string, unknown> | undefined)?.timezone ?? '') || TZ_PADRAO
        const { dateKey, minutos } = agoraNoFuso(agora, tz)

        if (wa.lastSentDateKey === dateKey) continue
        if (!dentroDaJanela(String(wa.sendAt ?? ''), minutos)) continue

        const digits = digitosDe(wa.phone) || digitosDe(doc.get('phone'))
        if (digits.length < 8) {
          console.warn(`[assistente] ${uid} tem o resumo ligado mas nenhum telefone válido`)
          continue
        }

        // O destinatário é o DONO do ambiente — é o telefone do doc do tenant. O papel entra
        // explícito mesmo assim: é ele, e não o que a consulta conseguiu ler, que decide se
        // faturamento sai por WhatsApp. Ver `blocosPermitidos`.
        const blocks = blocosPermitidos(
          {
            agenda: wa.blocks ? (wa.blocks as BlocosResumo).agenda !== false : true,
            tarefas: wa.blocks ? (wa.blocks as BlocosResumo).tarefas !== false : true,
            faturas: wa.blocks ? (wa.blocks as BlocosResumo).faturas !== false : true,
            conversas: wa.blocks ? (wa.blocks as BlocosResumo).conversas !== false : true,
          },
          'dono',
        )

        const dados = await coletarDados(uid, dateKey, agora)
        const abertura = await saudacao(
          GEMINI_API_KEY.value(),
          String(agent.name ?? 'Assistente'),
          String(agent.persona ?? 'assistente comercial'),
        )
        const texto = `${abertura}\n\n${montarResumo(dados, blocks)}\n\n${RODAPE}`

        const enfileirou = await enfileirar(`${uid}_${dateKey}`, uid, digits, texto)
        if (!enfileirou) continue

        // Espelho legível para a tela. A trava contra repetir é o id acima; se esta escrita
        // falhar, o `create` do próximo tick recusa de novo e nada sai duas vezes.
        await doc.ref.set({ agent: { whatsapp: { lastSentDateKey: dateKey } } }, { merge: true })
      } catch (err) {
        // Um ambiente com dado torto não pode derrubar o resumo dos outros: a rodada
        // processa em sequência, e um throw aqui pararia a fila no meio.
        console.error(`[assistente] falha ao montar o resumo de ${uid}:`, err)
      }
    }
  },
)

// ---------------------------------------------------------------------------
// Mão dupla — o dono responde no WhatsApp
// ---------------------------------------------------------------------------

/**
 * Índice telefone → ambiente, mantido a cada escrita no doc do tenant.
 *
 * Existe porque o daemon precisa saber, a CADA mensagem recebida, de quem é aquele número.
 * Sem o índice ele varreria a coleção `users` inteira por mensagem. Fica sem regra em
 * firestore.rules (default-deny): é uma lista de telefones de donos de empresa, e não tem
 * por que existir fora do Admin SDK.
 */
export const indexarAssinante = onDocumentWritten(
  { document: 'users/{uid}', region: 'southamerica-east1' },
  async (event) => {
    const db = getFirestore()
    const uid = event.params.uid
    const antes = event.data?.before?.data() ?? {}
    const depois = event.data?.after?.data() ?? {}

    const digitosDoDoc = (d: Record<string, unknown>): string => {
      const wa = ((d.agent as Record<string, unknown> | undefined)?.whatsapp ?? {}) as Record<string, unknown>
      return digitosDe(wa.phone) || digitosDe(d.phone)
    }
    const ligado = (d: Record<string, unknown>): boolean => {
      const wa = ((d.agent as Record<string, unknown> | undefined)?.whatsapp ?? {}) as Record<string, unknown>
      return wa.enabled === true && wa.optOut !== true
    }

    const antigo = digitosDoDoc(antes)
    const novo = digitosDoDoc(depois)
    const ativo = ligado(depois) && novo.length >= 8

    // Telefone trocado (ou resumo desligado): o índice antigo tem de sair, senão o número
    // anterior continuaria conversando com o ambiente de quem não é mais dono dele.
    if (antigo && antigo !== novo) {
      const velho = await db.collection('assistantSubscribers').doc(antigo).get()
      if (velho.exists && velho.get('tenantUid') === uid) await velho.ref.delete()
    }

    if (!ativo) {
      if (novo) {
        const doc = await db.collection('assistantSubscribers').doc(novo).get()
        if (doc.exists && doc.get('tenantUid') === uid) await doc.ref.delete()
      }
      return
    }

    // Um telefone aponta para UM ambiente. Sem esta guarda, cadastrar o número de outra
    // pessoa passaria a entregar a ela os dados do ambiente dela — e a esconder os do dono.
    const atual = await db.collection('assistantSubscribers').doc(novo).get()
    if (atual.exists && atual.get('tenantUid') !== uid) {
      console.warn(`[assistente] telefone já vinculado a outro ambiente; ${uid} não foi indexado`)
      return
    }

    await db.collection('assistantSubscribers').doc(novo).set(
      {
        tenantUid: uid,
        enabled: true,
        // Quem recebe é o titular da conta — é o telefone do doc do tenant. O papel viaja
        // junto para o gate de faturamento não depender de suposição na hora de responder.
        papel: 'dono',
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )
  },
)

/** Últimos turnos da conversa, no formato que `perguntar` espera. */
async function historico(uid: string): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
  const snap = await getFirestore()
    .collection('users').doc(uid).collection('agentChat')
    .orderBy('createdAt', 'desc').limit(9).get()
  return snap.docs
    .reverse()
    .slice(0, 8)
    .map((d) => ({
      role: (d.get('role') === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: String(d.get('text') ?? ''),
    }))
    .filter((t) => t.content)
}

/** Base de conhecimento do ambiente — espelha knowledgeContext em src/hooks/useLibrary.ts. */
async function conhecimento(uid: string): Promise<string> {
  const snap = await getFirestore().collection('users').doc(uid).collection('knowledge').limit(20).get()
  const partes: string[] = []
  let usado = 0
  for (const d of snap.docs) {
    if (d.get('enabled') !== true) continue
    const conteudo = String(d.get('content') ?? '').trim()
    if (!conteudo) continue
    const bloco = `\n### ${String(d.get('title') ?? '')}\n${conteudo}\n`
    if (usado + bloco.length > 6_000) break
    usado += bloco.length
    partes.push(bloco)
  }
  if (!partes.length) return ''
  return `\nBASE DE CONHECIMENTO (material da empresa — prefira estas informações às suas suposições):\n${partes.join('')}`
}

/** O contexto do CRM em texto, com o MESMO gate de papel do resumo diário. */
function contextoDoCrm(dados: DadosResumo, blocks: BlocosResumo): string {
  return `\nDADOS DO CRM (hoje):\n${montarResumo(dados, blocks)}`
}

const RESPOSTA_MAX_CHARS = 900

/**
 * Responde, pelo WhatsApp, a pergunta que o dono mandou de lá.
 *
 * O gatilho é o próprio documento que o daemon grava na conversa do ambiente. Ele SÓ age em
 * `channel === 'whatsapp'`: a mesma coleção guarda o chat da tela, e sem esse discriminador
 * cada linha digitada no navegador viraria uma mensagem no celular do usuário. As security
 * rules impedem o cliente de escrever esse valor — aqui é a outra metade da mesma trava.
 */
export const responderPeloWhatsapp = onDocumentCreated(
  {
    document: 'users/{uid}/agentChat/{msgId}',
    region: 'southamerica-east1',
    secrets: [GEMINI_API_KEY],
    maxInstances: 5,
  },
  async (event) => {
    const doc = event.data
    if (!doc) return
    if (doc.get('channel') !== 'whatsapp' || doc.get('role') !== 'user') return

    const uid = event.params.uid
    const pergunta = String(doc.get('text') ?? '').trim()
    if (!pergunta) return

    const db = getFirestore()
    const tenant = await db.collection('users').doc(uid).get()
    const agent = (tenant.get('agent') ?? {}) as Record<string, unknown>
    const wa = (agent.whatsapp ?? {}) as Record<string, unknown>
    const digits = digitosDe(wa.phone) || digitosDe(tenant.get('phone'))
    if (digits.length < 8) return

    const responder = (texto: string) => enfileirarResposta(uid, digits, texto)

    // Mesma cota do Titã IA na tela (aiUsage/{uid}, 40/hora). Sem ela, quem tem o número
    // da Assistente tem um proxy do Gemini pago pela casa, uma chamada por mensagem.
    try {
      await consomeCota(uid)
    } catch {
      await responder('Você me fez muitas perguntas nesta hora. Tenta de novo mais tarde? 🙂')
      return
    }

    try {
      const tz = String((tenant.get('businessHours') as Record<string, unknown> | undefined)?.timezone ?? '') || TZ_PADRAO
      const agora = new Date()
      const { dateKey } = agoraNoFuso(agora, tz)

      // Quem responde é o dono — é o telefone do doc do ambiente que chegou até aqui.
      // O gate entra explícito de novo: Admin SDK lê faturamento de qualquer ambiente.
      const blocks = blocosPermitidos(
        { agenda: true, tarefas: true, faturas: true, conversas: true },
        'dono',
      )
      const dados = await coletarDados(uid, dateKey, agora)

      const system =
        `${String(agent.instructions ?? '')}\n` +
        `Você é "${String(agent.name ?? 'Assistente')}", persona: ${String(agent.persona ?? 'assistente comercial')}.\n` +
        'Você está respondendo por WhatsApp: seja MUITO objetivo (máx. ~80 palavras), sem markdown de título e sem listas longas. ' +
        'Responda em português do Brasil, usando os dados reais abaixo.\n' +
        `${await conhecimento(uid)}${contextoDoCrm(dados, blocks)}`

      const resposta = (await perguntar(GEMINI_API_KEY.value(), {
        system,
        history: await historico(uid),
        question: pergunta,
      })).trim().slice(0, RESPOSTA_MAX_CHARS)

      if (!resposta) {
        await responder('Não consegui responder isso agora. Pode reformular?')
        return
      }

      // A resposta entra na MESMA conversa da tela — é o que faz o histórico ser um só.
      await db.collection('users').doc(uid).collection('agentChat').add({
        role: 'agent',
        text: resposta,
        channel: 'whatsapp',
        createdAt: FieldValue.serverTimestamp(),
      })
      await responder(resposta)
    } catch (err) {
      console.error(`[assistente] falha ao responder ${uid}:`, err)
      // Silêncio depois de uma pergunta parece sistema quebrado. Uma linha honesta custa
      // um envio e evita o usuário ficar repetindo a pergunta.
      await responder('Tive um problema para consultar seus dados agora. Tenta de novo em alguns minutos?')
    }
  },
)

/** Enfileira uma resposta para o daemon enviar. */
async function enfileirarResposta(tenantUid: string, toDigits: string, texto: string): Promise<void> {
  await getFirestore().collection('assistantOutbox').add({
    tenantUid,
    toDigits,
    text: texto,
    kind: 'reply',
    status: 'pending',
    attempts: 0,
    dueAt: Timestamp.now(),
    createdAt: FieldValue.serverTimestamp(),
  })
}
