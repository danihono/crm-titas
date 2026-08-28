import { GoogleGenAI, ThinkingLevel } from '@google/genai'

/**
 * As chamadas de IA, sem Firebase em volta.
 *
 * Vivem aqui, e não dentro das callables, para poderem ser exercitadas contra a API
 * de verdade por um script (`npm run ia:teste`). Enquanto estavam presas ao onCall,
 * a única forma de saber se o modelo acertava era publicar e torcer — e "tem que
 * funcionar muito bem" não se verifica em produção.
 *
 * Aqui não há autenticação nem HttpsError de propósito: quem chama decide o que é
 * erro de usuário. Estas funções só sabem falar com o modelo.
 */

// Modelo do chat: o degrau mais barato do Gemini.
//
// Fixado numa versão, e não em 'gemini-flash-lite-latest', de propósito: o alias
// troca o modelo por baixo sem aviso, e aqui embaixo tem um gerador de JSON cuja
// qualidade foi medida. Quando a versão sai de linha a própria API avisa com 404
// dizendo qual usar — foi assim que o 2.5-flash-lite caiu.
export const MODEL = process.env.TITA_MODEL || 'gemini-3.5-flash-lite'

// Gerador de fluxogramas: mesmo modelo barato do chat, mas pensando mais (ver
// thinkingLevel lá embaixo). A forma da saída o schema garante; o SENTIDO não —
// seta apontando para etapa inexistente valida no schema e é lixo. Se o teste
// (`npm run ia:teste`) começar a reprovar, subir aqui é o primeiro remédio.
export const FLOW_MODEL = process.env.TITA_FLOW_MODEL || 'gemini-3.5-flash-lite'

// Tetos de entrada (defesa de custo): o cliente legítimo envia ≤8 turnos de
// histórico e um system enxuto; qualquer coisa muito acima disso é abuso.
export const MAX_HISTORY_ITEMS = 16
export const MAX_CONTENT_CHARS = 4_000
export const MAX_SYSTEM_CHARS = 20_000
export const MAX_DESC_CHARS = 2_000

export interface Turno { role: 'user' | 'assistant'; content: string }

/**
 * A IA respondeu 200 mas sem texto — filtro de segurança ou corte por tamanho.
 * É caso REAL, não exceção: sem distinguir, o usuário via um balão em branco e
 * achava que o CRM tinha travado.
 */
export class RespostaVazia extends Error {
  constructor(public motivo?: string) {
    super('a IA não devolveu texto' + (motivo ? ` (${motivo})` : ''))
  }
}

const SYSTEM_PADRAO = 'Você é um assistente comercial. Responda em português do Brasil, de forma objetiva.'

/** Uma pergunta ao Titã IA, com o histórico da conversa. Devolve o texto da resposta. */
export async function perguntar(apiKey: string, entrada: {
  system?: string
  history?: Turno[]
  question: string
}): Promise<string> {
  const ai = new GoogleGenAI({ apiKey })

  // No Gemini o turno do assistente se chama 'model', e o system NÃO entra no
  // histórico — vai em systemInstruction, fora dele.
  const contents = [
    ...(Array.isArray(entrada.history) ? entrada.history : [])
      .slice(-MAX_HISTORY_ITEMS)
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: String(m.content ?? '').slice(0, MAX_CONTENT_CHARS) }],
      })),
    { role: 'user', parts: [{ text: entrada.question }] },
  ]

  const res = await ai.models.generateContent({
    model: MODEL,
    contents,
    config: {
      systemInstruction: (entrada.system || SYSTEM_PADRAO).slice(0, MAX_SYSTEM_CHARS),
      maxOutputTokens: 1024,
      // Pergunta de CRM não precisa de raciocínio longo, e token de thinking é
      // cobrado igual. MINIMAL é o mínimo que dá: no Gemini 3.x thinking não
      // desliga — `thinkingBudget: 0` volta 400 (medido, não suposto).
      thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
    },
  })

  const reply = (res.text ?? '').trim()
  if (!reply) throw new RespostaVazia(String(res.candidates?.[0]?.finishReason ?? ''))
  return reply
}

// --- Gerador de fluxogramas (aba "Fluxos" do Pipeline) ---------------------

const MAX_NODES = 40
const MAX_EDGES = 80
const MAX_TITLE_CHARS = 60
const MAX_SUBTITLE_CHARS = 120

export interface FluxoGerado { name: string; nodes: object[]; edges: object[] }

const NODE_KINDS = ['start', 'step', 'decision', 'end'] as const

/**
 * Saída estruturada: garante JSON no formato certo, sem pedir "responda só JSON"
 * e torcer. Vai no `responseJsonSchema` do Gemini, que aceita um subconjunto do
 * JSON Schema — type, enum, items, properties, required, additionalProperties e
 * description entram; restrição numérica e de tamanho (minItems, maxLength) NÃO.
 * Por isso "opcionais" como subtitle e label seguem obrigatórios aceitando
 * string vazia, e os limites de quantidade são impostos no sanitizeFlow.
 *
 * Não pedimos x/y: o modelo posiciona mal e gasta tokens à toa. O layout sai do
 * autoLayout() no cliente.
 */
export const FLOW_SCHEMA = {
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

export const FLOW_SYSTEM = [
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
export function sanitizeFlow(raw: unknown): FluxoGerado {
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

/** Monta o fluxograma a partir da descrição. Já devolve o resultado saneado. */
export async function montarFluxo(apiKey: string, descricao: string): Promise<FluxoGerado> {
  const ai = new GoogleGenAI({ apiKey })

  const res = await ai.models.generateContent({
    model: FLOW_MODEL,
    contents: descricao.trim(),
    config: {
      systemInstruction: FLOW_SYSTEM,
      // Folgado de propósito: JSON truncado no meio não dá para consertar, e um
      // fluxo de 12 etapas passa fácil de 2k.
      maxOutputTokens: 8_000,
      responseMimeType: 'application/json',
      responseJsonSchema: FLOW_SCHEMA,
      // Aqui o raciocínio PAGA: amarrar as setas sem deixar etapa órfã é o que o
      // modelo barato erra. LOW em vez de MINIMAL — é a diferença entre o fluxo
      // fechar e vir um grafo quebrado.
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  })

  const text = (res.text ?? '').trim()
  if (!text) throw new RespostaVazia(String(res.candidates?.[0]?.finishReason ?? ''))

  // O parse fica aqui dentro: mesmo com schema, resposta cortada por
  // maxOutputTokens chega como JSON pela metade.
  return sanitizeFlow(JSON.parse(text))
}
