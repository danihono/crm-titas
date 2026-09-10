import { HttpsError } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'

/**
 * Cota de uso da IA — módulo próprio, e não dentro de index.ts, para quebrar o ciclo de
 * import: `assistente.ts` precisa dela e `index.ts` reexporta as funções de `assistente.ts`.
 * Ciclo em CommonJS costuma "funcionar" enquanto a chamada estiver dentro do corpo de uma
 * função, e quebrar com undefined no dia em que alguém mover uma linha.
 */

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
export const MAX_INSTANCIAS = 10

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
export const APP_CHECK_EXIGIDO =
  process.env.TITA_APP_CHECK_ENFORCED === 'true' && !process.env.FUNCTIONS_EMULATOR

/**
 * Consome uma unidade da cota do usuário, ou recusa.
 *
 * A janela vive no Firestore (e não em memória) porque cada instância da função é um
 * processo novo: um contador local zeraria a cada chamada fria e não valeria nada.
 * `aiUsage` não tem regra em firestore.rules — cai no default-deny, então só o Admin SDK
 * escreve e ninguém zera a própria cota pelo navegador.
 */
export async function consomeCota(uid: string): Promise<void> {
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
