import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  Timestamp,
  type DocumentReference,
} from 'firebase/firestore'
import { auth, db } from './firebase'

/**
 * Canal de comandos com o daemon de WhatsApp — via Firestore, não HTTP.
 *
 * O daemon é self-hosted (PC/VM caseira, atrás de NAT) e não tem URL pública: o CRM
 * escreve um doc em `users/{uid}/waCommands/{id}` e o daemon, que escuta essa coleção,
 * executa e devolve o resultado no próprio doc. Assim o daemon precisa apenas de
 * internet de SAÍDA — sem porta aberta, sem HTTPS, sem domínio, sem CORS.
 *
 * A autorização é a própria security rule: `users/{uid}/{document=**}` só aceita escrita
 * do dono, então o daemon confia no PATH do doc para saber de quem é o comando.
 *
 * O QR e o estado da conexão continuam vindo de `whatsappStatus/{uid}` (useWhatsappStatus).
 */

/**
 * KILL-SWITCH GLOBAL do WhatsApp.
 *
 * Enquanto `true`, TODA a funcionalidade some do app: o botão "Conectar" desaparece e nenhum
 * comando é enfileirado. Foi ligado quando o daemon rodava no Cloud Run como instância
 * always-on — o que dominava a fatura — e desligado depois que o daemon virou self-hosted
 * (custo zero, ver docs/whatsapp-selfhost.md).
 *
 * NÃO é ele que trata "o daemon está fora do ar": para isso existe o heartbeat abaixo, que
 * mostra "Serviço de WhatsApp offline" sem esconder a UI. Este switch é só para desativar a
 * feature por completo — trocar para `true` + `npm run build && firebase deploy --only hosting`.
 * O pareamento no WhatsApp continua intacto de qualquer forma.
 */
const WHATSAPP_KILL_SWITCH = false

/** WhatsApp está ligado no app? Falso enquanto o kill-switch estiver ativo. */
export function whatsappEnabled(): boolean {
  return !WHATSAPP_KILL_SWITCH
}

const WA_COMMANDS = 'waCommands'

/** Validade do doc de comando — casada com o TTL nativo configurado em `expireAt`. */
const COMMAND_TTL_MS = 3_600_000

type WaCommandType =
  | 'session.consent'
  | 'session.connect'
  | 'session.disconnect'
  | 'message.send'
  | 'message.sendMedia'
  | 'history.fetch'
  | 'contact.purge'
  | 'contact.photoRefresh'
  | 'contact.mediaRetry'

/** Erro de comando; `code` é estável para lógica, `isTimeout` marca o que vale reintentar. */
interface WaError extends Error {
  code?: string
  isTimeout?: boolean
}

function waErr(code: string | undefined, message: string, isTimeout = false): WaError {
  const err = new Error(message) as WaError
  err.code = code
  err.isTimeout = isTimeout
  return err
}

/**
 * Código estável de um erro devolvido por um comando ('daemon_offline', 'timeout',
 * 'whatsapp_not_connected'...). Existe para o chamador decidir o que fazer sem depender
 * do texto da mensagem, que é escrito para o usuário e muda.
 */
export function waErrorCode(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined
  const code = (err as WaError).code
  return typeof code === 'string' && code ? code : undefined
}

// ---------------------------------------------------------------------------
// Heartbeat do daemon
//
// Com HTTP, um daemon fora do ar dava erro de conexão na hora. Numa fila o comando
// apenas fica parado — então o app precisa de outro sinal para não prender o usuário
// num spinner (e para o fallback local de expurgo continuar funcionando).
// ---------------------------------------------------------------------------

/** Batidas a cada 30s no daemon; 120s de folga cobre uma perdida + atraso de rede. */
const HEARTBEAT_STALE_MS = 120_000

let lastBeatMs = 0
/** null = ainda não sabemos se o daemon consegue gravar arquivo. */
let lastStorageOk: boolean | null = null
let lastStorageCode: string | null = null
let beatKnown = false
let beatUnsub: (() => void) | null = null
const beatListeners = new Set<() => void>()

/** Assina o heartbeat (ref-counted: um único listener para todos os componentes). */
export function subscribeDaemonHeartbeat(cb: () => void): () => void {
  beatListeners.add(cb)
  if (!beatUnsub) {
    beatUnsub = onSnapshot(
      doc(db, 'whatsappDaemon', 'heartbeat'),
      (snap) => {
        const d = snap.data()
        const ts = d?.updatedAt
        lastBeatMs = ts instanceof Timestamp ? ts.toMillis() : 0
        // Ausente = daemon anterior a esta versão, ou sonda ainda não concluída. Fica `null`
        // ("não sei") de propósito: tratar como falha acenderia o aviso sem motivo.
        lastStorageOk = typeof d?.storageOk === 'boolean' ? d.storageOk : null
        lastStorageCode = typeof d?.storageCode === 'string' ? d.storageCode : null
        beatKnown = true
        for (const l of beatListeners) l()
      },
      () => {
        // Sem leitura confiável, seguimos "sem saber" de propósito: assim runCommand não
        // bloqueia por engano e o comando cai no timeout normal.
        for (const l of beatListeners) l()
      },
    )
  }
  return () => {
    beatListeners.delete(cb)
    if (beatListeners.size === 0 && beatUnsub) {
      beatUnsub()
      beatUnsub = null
      beatKnown = false
    }
  }
}

/** Há um daemon vivo do outro lado da fila? */
export function daemonOnline(): boolean {
  return Date.now() - lastBeatMs < HEARTBEAT_STALE_MS
}

/** Já recebemos alguma leitura do heartbeat? Se não, não dá para afirmar que está offline. */
export function heartbeatKnown(): boolean {
  return beatKnown
}

/**
 * O daemon consegue gravar arquivo no Storage? `null` = não sabemos.
 *
 * Sem permissão de Storage o daemon segue de pé e a mensagem de TEXTO continua chegando —
 * só a mídia some, sem aviso nenhum. Este sinal existe para o CRM dizer isso na cara, em vez
 * de deixar o usuário achando que o WhatsApp quebrou. Com o daemon fora do ar o veredito
 * está velho e não vale nada, então vira `null`.
 */
export function daemonStorageOk(): boolean | null {
  if (!daemonOnline()) return null
  return lastStorageOk
}

/** Detalhe do problema de Storage ('permission_denied' | 'not_found' | 'failed'). */
export function daemonStorageCode(): string | null {
  return lastStorageCode
}

// ---------------------------------------------------------------------------
// Execução de comandos
// ---------------------------------------------------------------------------

/** Cancela o comando se o daemon ainda não o tiver pegado (não aborta algo em execução). */
async function cancelIfPending(ref: DocumentReference): Promise<void> {
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists() || snap.get('status') !== 'pending') return
    tx.update(ref, { status: 'canceled' })
  }).catch(() => {})
}

/**
 * Enfileira um comando e resolve quando o daemon grava o resultado — mantendo a mesma
 * interface de Promise que as chamadas HTTP tinham, para os call-sites não mudarem.
 */
async function runCommand(
  type: WaCommandType,
  args: Record<string, unknown>,
  timeoutMs: number,
): Promise<Record<string, unknown>> {
  if (WHATSAPP_KILL_SWITCH) {
    throw new Error('O WhatsApp está temporariamente desativado.')
  }
  const user = auth.currentUser
  if (!user) throw new Error('Sem usuário autenticado.')

  // Falha rápida quando sabemos que não há daemon: evita esperar o timeout inteiro.
  if (heartbeatKnown() && !daemonOnline()) {
    throw waErr('daemon_offline', 'O serviço de WhatsApp está fora do ar. Inicie-o e tente de novo.')
  }

  // Sempre o uid do usuário autenticado — nunca o tenant impersonado pelo super-owner,
  // que cairia num path onde a rule nega a escrita.
  const ref = await addDoc(collection(db, 'users', user.uid, WA_COMMANDS), {
    type,
    args,
    status: 'pending',
    attempts: 0,
    createdAt: serverTimestamp(),
    expireAt: Timestamp.fromMillis(Date.now() + COMMAND_TTL_MS),
  })

  return new Promise<Record<string, unknown>>((resolve, reject) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let unsub: (() => void) | undefined

    const settle = (fn: () => void, remove: boolean) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      if (unsub) unsub()
      // Limpeza imediata do caso feliz; o TTL/sweep cobre o resto.
      if (remove) void deleteDoc(ref).catch(() => {})
      fn()
    }

    timer = setTimeout(() => {
      void cancelIfPending(ref).finally(() =>
        settle(
          () => reject(waErr('timeout', 'O serviço de WhatsApp demorou a responder. Tente novamente.', true)),
          false,
        ),
      )
    }, timeoutMs)

    unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.metadata.hasPendingWrites) return // eco local da própria escrita
        const data = snap.data()
        if (!snap.exists() || !data) return
        if (data.status === 'done') {
          settle(() => resolve((data.result ?? {}) as Record<string, unknown>), true)
          return
        }
        if (data.status === 'error') {
          const code = data.error?.code as string | undefined
          settle(
            () => reject(waErr(code, data.error?.message ?? 'Falha no serviço de WhatsApp.', code === 'photo_timeout')),
            true,
          )
        }
      },
      (err) => settle(() => reject(err), false),
    )
  })
}

// ---------------------------------------------------------------------------
// API pública — assinaturas idênticas às do transporte HTTP anterior
// ---------------------------------------------------------------------------

/** Registra o consentimento LGPD + retenção (obrigatório antes de conectar). */
export function giveConsent(retentionDays = 0): Promise<Record<string, unknown>> {
  return runCommand('session.consent', { retentionDays }, 20_000)
}

/** Inicia (ou retoma) a sessão de WhatsApp do usuário. O QR chega por whatsappStatus/{uid}. */
export function connectWhatsapp(): Promise<Record<string, unknown>> {
  return runCommand('session.connect', {}, 45_000)
}

/** Desconecta; com purge=true, expurga todos os dados espelhados (LGPD). */
export function disconnectWhatsapp(purge = false): Promise<Record<string, unknown>> {
  return runCommand('session.disconnect', { purge }, 150_000)
}

/** Envia uma mensagem real pelo WhatsApp conectado ao daemon. */
export function sendWhatsappMessage(contactId: string, text: string): Promise<Record<string, unknown>> {
  return runCommand('message.send', { contactId, text }, 45_000)
}

/** Mídia já no Storage, pronta para o daemon baixar e mandar pelo WhatsApp. */
export interface OutgoingMedia {
  mediaType: 'image' | 'video' | 'audio' | 'document'
  /** Caminho no Storage (users/{uid}/contacts/{contactId}/outgoing/...). */
  mediaPath: string
  /** URL pública com token — o daemon grava na mensagem, então o CRM não rebaixa nada. */
  mediaUrl: string
  mimeType: string
  fileName: string
  caption?: string
  sizeBytes?: number
}

/**
 * Envia um anexo pelo WhatsApp: o arquivo já subiu ao Storage e o daemon o baixa de lá.
 *
 * Timeout maior que o do texto porque o daemon faz duas transferências (Storage → daemon →
 * WhatsApp) antes de responder.
 */
export function sendWhatsappMedia(contactId: string, media: OutgoingMedia): Promise<Record<string, unknown>> {
  return runCommand('message.sendMedia', { contactId, ...media }, 120_000)
}

/**
 * Dispara a recuperação do histórico antigo de um contato (on-demand, auto-paginado).
 * `maxDays` limita a janela; omitido = máximo que der. Retorna assim que o pedido é
 * aceito — as mensagens chegam de forma assíncrona e aparecem ao vivo pela conversa.
 */
export function fetchWhatsappHistory(contactId: string, maxDays?: number): Promise<Record<string, unknown>> {
  return runCommand('history.fetch', { contactId, ...(maxDays ? { maxDays } : {}) }, 60_000)
}

/**
 * Puxa (ou re-puxa) a foto de perfil do WhatsApp do contato para o CRM.
 *
 * Na era LID há contas em que só uma combinação de endereço/modo responde e as demais
 * penduram; quando nenhuma responde, o daemon devolve `photo_timeout` com o trace das
 * tentativas.
 *
 * SEM repetição automática. Havia um retry após 6 s, e ele fazia mal: o daemon tentava 5
 * combinações de 6 s cada, então a falha já custava 30 s de espera — o retry dobrava isso
 * para mais de um minuto e, no log de 12/08, nunca mudou o resultado (a segunda rodada
 * falhou idêntica à primeira, nas cinco combinações). Quem quiser insistir clica de novo.
 */
export function refreshWhatsappPhoto(contactId: string): Promise<Record<string, unknown>> {
  return runCommand('contact.photoRefresh', { contactId }, 90_000)
}

/**
 * Expurgo TOTAL de um contato via daemon (Firestore recursivo + Storage por prefixo +
 * marcador anti-replay). `keepContact=true` limpa só a conversa, mantendo o cadastro.
 */
export function purgeWhatsappContact(contactId: string, keepContact = false): Promise<Record<string, unknown>> {
  return runCommand('contact.purge', { contactId, keepContact }, 150_000)
}

/**
 * Manda o daemon rebaixar as mídias desta conversa que ficaram sem arquivo.
 *
 * Volta assim que o pedido é aceito (`{ eligible, legacy }`): os downloads rodam em segundo
 * plano e o andamento chega pelo contato, em `mediaRecovery`. `legacy` conta as mensagens
 * que quebraram antes de o daemon passar a guardar o material de retentativa — essas não
 * têm como voltar.
 */
export function retryWhatsappMedia(contactId: string): Promise<Record<string, unknown>> {
  return runCommand('contact.mediaRetry', { contactId }, 60_000)
}
