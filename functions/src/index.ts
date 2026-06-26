import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import Anthropic from '@anthropic-ai/sdk'

// Chave da Anthropic — no Secret Manager, NUNCA no bundle do cliente.
// Definir com:  firebase functions:secrets:set ANTHROPIC_API_KEY
const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY')

// Modelo configurável por env (default Opus 4.8). Para baratear: claude-haiku-4-5.
const MODEL = process.env.TITA_MODEL || 'claude-opus-4-8'

interface AskData {
  system?: string
  history?: { role: 'user' | 'assistant'; content: string }[]
  question?: string
}

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

    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() })

    const messages = [
      ...(Array.isArray(history) ? history : []).map((m) => ({
        role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
        content: m.content,
      })),
      { role: 'user' as const, content: question },
    ]

    try {
      const msg = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: system || 'Você é um assistente comercial. Responda em português do Brasil, de forma objetiva.',
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
