import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import Anthropic from '@anthropic-ai/sdk'

// Chave da Anthropic — no Secret Manager, NUNCA no bundle do cliente.
// Definir com:  firebase functions:secrets:set ANTHROPIC_API_KEY
const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY')

// Modelo configurável por env (default Opus 4.8). Para baratear: claude-haiku-4-5.
const MODEL = process.env.TITA_MODEL || 'claude-opus-4-8'

// Modelo do gerador de fluxogramas. Separado do chat de propósito: a tarefa é
// estruturada e barata, então dá para trocar por um modelo menor sem mexer no
// Titã IA. Para baratear: claude-haiku-4-5.
const FLOW_MODEL = process.env.TITA_FLOW_MODEL || 'claude-opus-5'

interface AskData {
  system?: string
  history?: { role: 'user' | 'assistant'; content: string }[]
  question?: string
}

// Tetos de entrada (defesa de custo): o cliente legítimo envia ≤8 turnos de
// histórico e um system enxuto; qualquer coisa muito acima disso é abuso.
const MAX_HISTORY_ITEMS = 16
const MAX_CONTENT_CHARS = 4_000
const MAX_SYSTEM_CHARS = 20_000

/**
 * Callable: recebe { system, history, question } montados no cliente (single-tenant)
 * e retorna { reply }. Exige autenticação + App Check.
 */
export const askTitaIA = onCall(
  {
    region: 'southamerica-east1',
    secrets: [ANTHROPIC_API_KEY],
    enforceAppCheck: true,
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

    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() })

    const messages = [
      ...(Array.isArray(history) ? history : [])
        .slice(-MAX_HISTORY_ITEMS)
        .map((m) => ({
          role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
          content: String(m.content ?? '').slice(0, MAX_CONTENT_CHARS),
        })),
      { role: 'user' as const, content: question },
    ]

    try {
      const msg = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: (system || 'Você é um assistente comercial. Responda em português do Brasil, de forma objetiva.').slice(0, MAX_SYSTEM_CHARS),
        messages,
      })
      const reply = msg.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim()
      return { reply }
    } catch (err) {
      console.error('[askTitaIA] erro Anthropic:', err)
      throw new HttpsError('internal', 'Não foi possível consultar o Titã IA agora.')
    }
  },
)

// ---------------------------------------------------------------------------
// Gerador de fluxogramas (aba "Fluxos" do Pipeline)
// ---------------------------------------------------------------------------

const MAX_DESC_CHARS = 2_000
const MAX_NODES = 40
const MAX_EDGES = 80
const MAX_TITLE_CHARS = 60
const MAX_SUBTITLE_CHARS = 120

const NODE_KINDS = ['start', 'step', 'decision', 'end'] as const

/**
 * Structured outputs: garante JSON no formato certo, sem pedir "responda só
 * JSON" e torcer. Regras do recurso que moldam este schema: todo objeto precisa
 * de `additionalProperties: false` e de `required` listando TODAS as
 * propriedades — então "opcionais" (subtitle, label) são obrigatórios aceitando
 * string vazia. Restrições numéricas/de tamanho não são suportadas.
 *
 * Não pedimos x/y: o modelo posiciona mal e gasta tokens à toa. O layout sai do
 * autoLayout() no cliente.
 */
const FLOW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'nodes', 'edges'],
  properties: {
    name: { type: 'string', description: 'Nome curto do fluxo, em português do Brasil.' },
    nodes: {
      type: 'array',
      description: 'As etapas do processo, em ordem lógica.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'title', 'subtitle', 'kind'],
        properties: {
          id: { type: 'string', description: 'Identificador curto e único, ex.: n1, n2.' },
          title: { type: 'string', description: 'Título da etapa, curto (até ~40 caracteres).' },
          subtitle: { type: 'string', description: 'Detalhe de uma linha. String vazia quando não houver.' },
          kind: {
            type: 'string',
            enum: NODE_KINDS,
            description: 'start para o início, end para o encerramento, decision quando há ramificação, step no resto.',
          },
        },
      },
    },
    edges: {
      type: 'array',
      description: 'As setas ligando as etapas.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['from', 'to', 'label'],
        properties: {
          from: { type: 'string', description: 'id da etapa de origem.' },
          to: { type: 'string', description: 'id da etapa de destino.' },
          label: { type: 'string', description: 'Rótulo da seta; use em saídas de decisão (ex.: "sim"/"não"). Vazio quando não precisar.' },
        },
      },
    },
  },
}

const FLOW_SYSTEM = [
  'Você desenha fluxogramas de processos comerciais para um CRM brasileiro.',
  'A partir da descrição do usuário, produza um fluxo claro e executável, em português do Brasil.',
  'Regras: comece por uma etapa "start" e termine em pelo menos uma "end";',
  'use "decision" quando o processo se ramifica, e rotule as setas que saem dela;',
  'todas as etapas devem estar conectadas; prefira de 5 a 12 etapas, no máximo ' + MAX_NODES + '.',
  'Títulos curtos e concretos ("Enviar proposta"), não genéricos ("Etapa 2").',
].join(' ')

interface RawFlowNode { id?: unknown; title?: unknown; subtitle?: unknown; kind?: unknown }
interface RawFlowEdge { from?: unknown; to?: unknown; label?: unknown }

function trimTo(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

/**
 * O schema garante a FORMA, não a sanidade: o modelo ainda pode devolver 200
 * etapas ou uma seta apontando para um id que não existe. Cortamos aqui, antes
 * de o cliente gravar isso no Firestore.
 */
function sanitizeFlow(raw: unknown): { name: string; nodes: object[]; edges: object[] } {
  const d = (raw ?? {}) as { name?: unknown; nodes?: unknown; edges?: unknown }

  const rawNodes = Array.isArray(d.nodes) ? d.nodes.slice(0, MAX_NODES) : []
  const seen = new Set<string>()
  const nodes = rawNodes.flatMap((n: RawFlowNode) => {
    const id = trimTo(n?.id, 40)
    if (!id || seen.has(id)) return []
    seen.add(id)
    const kind = NODE_KINDS.includes(n?.kind as typeof NODE_KINDS[number])
      ? (n.kind as string)
      : 'step'
    return [{
      id,
      title: trimTo(n?.title, MAX_TITLE_CHARS) || 'Etapa',
      subtitle: trimTo(n?.subtitle, MAX_SUBTITLE_CHARS),
      kind,
    }]
  })

  const rawEdges = Array.isArray(d.edges) ? d.edges.slice(0, MAX_EDGES) : []
  const edges = rawEdges.flatMap((e: RawFlowEdge) => {
    const from = trimTo(e?.from, 40)
    const to = trimTo(e?.to, 40)
    if (!from || !to || from === to) return []
    if (!seen.has(from) || !seen.has(to)) return []
    return [{ from, to, label: trimTo(e?.label, 40) }]
  })

  return { name: trimTo(d.name, MAX_TITLE_CHARS) || 'Fluxo gerado', nodes, edges }
}

/**
 * Callable: recebe { descricao } e devolve { name, nodes, edges } para a aba
 * Fluxos montar o quadro. Exige autenticação + App Check.
 */
export const gerarFluxoIA = onCall(
  {
    region: 'southamerica-east1',
    secrets: [ANTHROPIC_API_KEY],
    enforceAppCheck: true,
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

    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() })

    try {
      const msg = await client.messages.create({
        model: FLOW_MODEL,
        // Folgado de propósito: no Opus 5 o thinking vem ligado por padrão e o
        // max_tokens limita raciocínio + resposta juntos — apertado, trunca o JSON.
        max_tokens: 16_000,
        system: FLOW_SYSTEM,
        output_config: {
          effort: 'low',
          format: { type: 'json_schema', schema: FLOW_SCHEMA },
        },
        messages: [{ role: 'user', content: descricao.trim() }],
      })

      const text = msg.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim()

      if (!text) {
        throw new HttpsError('internal', 'O Titã IA não conseguiu montar o fluxo agora.')
      }
      return sanitizeFlow(JSON.parse(text))
    } catch (err) {
      if (err instanceof HttpsError) throw err
      console.error('[gerarFluxoIA] erro Anthropic:', err)
      throw new HttpsError('internal', 'Não foi possível gerar o fluxo agora.')
    }
  },
)
