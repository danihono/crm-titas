import { randomUUID } from 'node:crypto'
import { bucket } from './firebase.js'
import { config } from './config.js'
import { logger } from './logger.js'

/**
 * Gravação no Firebase Storage num lugar só — e, principalmente, classificação HONESTA da
 * falha.
 *
 * O motivo de existir: uma gravação de mídia passa por duas APIs DIFERENTES. `file.save()`
 * fala com a API JSON do GCS; `getDownloadURL()` fala com `firebasestorage.googleapis.com`,
 * outro host e outra autorização — e pode falhar sozinho, com o upload perfeito. Antes as
 * duas viviam dentro do mesmo `try` do download do WhatsApp, então um 403 de permissão era
 * gravado como "falha ao baixar mídia" e mandava a investigação para o lado errado. Isso
 * custou semanas uma vez (ver docs/whatsapp-selfhost-hetzner.md, §5).
 */

/** Etapa da gravação — é o que diz se o problema é escrita, leitura de URL ou remoção. */
export type StorageStage = 'save' | 'downloadUrl' | 'delete'

/** Código gravado em `mediaError` na mensagem espelhada. */
export type StorageErrorCode = 'storage_denied' | 'storage_failed'

/** Veredito da sonda, publicado no heartbeat. Vocabulário próprio: descreve o DAEMON, não uma mensagem. */
export type StorageHealthCode = 'permission_denied' | 'not_found' | 'failed'

/** Falha de gravação já classificada, com a etapa em que aconteceu. */
export class StorageWriteError extends Error {
  constructor(
    public readonly code: StorageErrorCode,
    public readonly stage: StorageStage,
    cause: unknown,
  ) {
    super(`storage_${stage}_failed`, { cause })
    this.name = 'StorageWriteError'
  }
}

function statusOf(err: unknown): number | undefined {
  const raw = (err as { code?: unknown } | null | undefined)?.code
  if (typeof raw === 'number') return raw
  if (typeof raw === 'string' && /^\d+$/.test(raw)) return Number(raw)
  return undefined
}

/**
 * 403/401 (ou o `reason` equivalente do ApiError do @google-cloud/storage) = falta permissão:
 * tentar de novo não adianta, alguém precisa mexer no IAM. O resto é falha transitória.
 */
export function classifyStorageError(err: unknown): StorageErrorCode {
  const status = statusOf(err)
  if (status === 401 || status === 403) return 'storage_denied'
  const reason = (err as { errors?: { reason?: string }[] } | null | undefined)?.errors?.[0]?.reason
  if (reason === 'forbidden' || reason === 'accessDenied') return 'storage_denied'
  return 'storage_failed'
}

/** Mesma classificação, no vocabulário do heartbeat (404 = bucket errado/Storage não habilitado). */
function classifyHealth(err: unknown): StorageHealthCode {
  const status = statusOf(err)
  if (status === 404) return 'not_found'
  return classifyStorageError(err) === 'storage_denied' ? 'permission_denied' : 'failed'
}

const FIREBASE_STORAGE_ENDPOINT = (process.env.STORAGE_EMULATOR_HOST || 'https://firebasestorage.googleapis.com') + '/v0'

/**
 * Monta a URL pública de download a partir do token que NÓS geramos.
 *
 * Deliberadamente NÃO usa `getDownloadURL()` do firebase-admin. Aquilo faz um GET autenticado
 * em `firebasestorage.googleapis.com` só para ler de volta o `firebaseStorageDownloadTokens`
 * que acabamos de gravar, e então monta exatamente esta string. Como o token sai daqui, a ida
 * à rede é pura perda — e cara: é outra API, com autorização própria (o `objectAdmin` não a
 * cobre), então ela derrubava toda a mídia com 403 mesmo com a gravação funcionando.
 *
 * O formato é o mesmo que o firebase-admin produz, então as URLs novas ficam idênticas às
 * que já estão gravadas nas mensagens antigas.
 */
function downloadUrlFor(path: string, token: string): string {
  return `${FIREBASE_STORAGE_ENDPOINT}/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`
}

/**
 * Grava um arquivo e devolve a URL pública com token de download.
 *
 * O token (`firebaseStorageDownloadTokens`) é o que permite ao `<img src>` do CRM buscar o
 * arquivo sem passar pelo SDK autenticado — as storage.rules são contornadas por ele de
 * propósito, é o mesmo desenho de sempre.
 */
export async function saveToStorage(path: string, buffer: Buffer, contentType: string): Promise<string> {
  const token = randomUUID()

  try {
    await bucket.file(path).save(buffer, {
      resumable: false,
      metadata: {
        contentType,
        metadata: { firebaseStorageDownloadTokens: token },
      },
    })
  } catch (err) {
    const code = classifyStorageError(err)
    noteStorageOutcome(false, code)
    throw new StorageWriteError(code, 'save', err)
  }

  noteStorageOutcome(true)
  return downloadUrlFor(path, token)
}

// ---------------------------------------------------------------------------
// Saúde do Storage
// ---------------------------------------------------------------------------

/** null = ainda não sabemos (nenhuma sonda concluída). */
let healthOk: boolean | null = null
let healthCode: StorageHealthCode | null = null
let lastProbeMs = 0
let probing: Promise<void> | null = null

/** Intervalo mínimo entre sondas disparadas por falha de gravação. */
const REPROBE_THROTTLE_MS = 300_000

/** Estado atual, lido pelo heartbeat a cada batida. */
export function storageHealth(): { ok: boolean | null; code: StorageHealthCode | null } {
  return { ok: healthOk, code: healthCode }
}

/**
 * Registra o resultado de uma gravação real.
 *
 * Um save bem-sucedido devolve a saúde a `ok` na hora, sem sonda: é a prova mais forte que
 * existe. Uma falha de permissão agenda uma sonda (com throttle) para confirmar — assim o
 * aviso no CRM some sozinho quando o IAM for corrigido, sem reiniciar o daemon.
 */
export function noteStorageOutcome(ok: boolean, code?: StorageErrorCode): void {
  if (ok) {
    if (healthOk !== true) logger.info('Storage voltou a aceitar gravação')
    healthOk = true
    healthCode = null
    return
  }
  if (code === 'storage_denied' && Date.now() - lastProbeMs > REPROBE_THROTTLE_MS) {
    void probeStorageWrite().catch(() => {})
  }
}

/**
 * Sonda: grava, lê a URL e apaga um objeto minúsculo, reportando a etapa que falhar.
 *
 * Roda no boot porque a falha é MUDA na ingestão — o texto continua chegando e só a mídia
 * some, então sem isto o sintoma aparece dias depois parecendo problema do WhatsApp.
 *
 * O caminho fica FORA de `users/**` de propósito: as storage.rules só casam
 * `/users/{uid}/{allPaths=**}`, então a sonda cai no default-deny para qualquer cliente.
 */
export async function probeStorageWrite(): Promise<void> {
  if (probing) return probing
  lastProbeMs = Date.now()

  probing = (async () => {
    const path = `whatsappDaemon/preflight/${config.instanceId}-${randomUUID()}.probe`
    const file = bucket.file(path)
    const token = randomUUID()
    let stage: StorageStage = 'save'
    try {
      await file.save(Buffer.from('probe'), {
        resumable: false,
        metadata: {
          contentType: 'text/plain',
          metadata: { firebaseStorageDownloadTokens: token },
        },
      })

      // Busca a URL como o NAVEGADOR busca: GET sem autenticação, só com o token. É o que o
      // `<img src>` do CRM faz, então é a única prova que interessa — mais honesta do que
      // consultar metadado pela API autenticada, que exige permissão que a mídia não usa.
      stage = 'downloadUrl'
      const res = await fetch(downloadUrlFor(path, token), { signal: AbortSignal.timeout(15_000) })
      if (!res.ok) throw Object.assign(new Error(`download devolveu HTTP ${res.status}`), { code: res.status })

      stage = 'delete'
      await file.delete({ ignoreNotFound: true })

      healthOk = true
      healthCode = null
      logger.info({ bucket: config.storageBucket }, 'preflight do Storage OK')
    } catch (err) {
      if (stage !== 'save') await file.delete({ ignoreNotFound: true }).catch(() => {})
      healthOk = false
      healthCode = classifyHealth(err)
      // Nível error e mensagem explícita: daqui em diante o journal diz o que está errado
      // sem ninguém precisar deduzir a partir de mídia que não carrega.
      logger.error(
        { err, stage, code: healthCode, bucket: config.storageBucket },
        'preflight do Storage FALHOU — mídia do WhatsApp NÃO será salva',
      )
    }
  })()

  try {
    await probing
  } finally {
    probing = null
  }
}
