import { httpsCallable } from 'firebase/functions'
import { functions } from '../lib/firebase'
import { dateKeyOf } from '../lib/format'
import type { ActType, Message } from '../types'

/** O que a IA devolve — já saneado do outro lado (functions/src/ia.ts). */
export interface TarefaSugerida {
  type: string
  title: string
  date: string
  time: string
  motivo: string
}

interface SugerirRequest {
  mensagens: { de: 'cliente' | 'atendente'; texto: string }[]
  tipos: { id: string; label: string }[]
  cliente: string
  hoje: string
}
interface SugerirResponse { tarefa: TarefaSugerida }

/** Quantas mensagens do fim da conversa entram no palpite. */
export const JANELA_SUGESTAO = 30

/**
 * Pede ao Titã IA o próximo passo desta conversa.
 *
 * `hoje` sai DAQUI, e não do servidor: a função roda em UTC e não conhece o fuso
 * de quem atende. "Amanhã" calculado no fuso errado marca a tarefa no dia errado
 * — erro que ninguém percebe até o compromisso passar.
 */
export async function sugerirTarefa(messages: Message[], types: ActType[], cliente: string): Promise<TarefaSugerida> {
  const mensagens = messages
    .slice(-JANELA_SUGESTAO)
    .flatMap((m) => {
      const texto = (m.text ?? '').trim()
      if (!texto) return []
      return [{ de: m.fromMe ? ('atendente' as const) : ('cliente' as const), texto }]
    })

  const fn = httpsCallable<SugerirRequest, SugerirResponse>(functions, 'sugerirTarefaIA')
  const res = await fn({
    mensagens,
    tipos: types.map((t) => ({ id: t.id, label: t.label })),
    cliente,
    hoje: dateKeyOf(new Date()),
  })
  return res.data.tarefa
}

/** Há texto suficiente para a IA ter no que se apoiar? */
export function daParaSugerir(messages: Message[]): boolean {
  return messages.some((m) => (m.text ?? '').trim().length > 0)
}
