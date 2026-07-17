import { randomUUID } from 'node:crypto'

/** Configuração do daemon, resolvida a partir do ambiente (Cloud Run injeta a maioria). */
export const config = {
  port: Number(process.env.PORT ?? 8080),

  projectId:
    process.env.GOOGLE_CLOUD_PROJECT ??
    process.env.GCLOUD_PROJECT ??
    process.env.FIREBASE_PROJECT_ID ??
    'titas-c8967',

  region: process.env.WA_REGION ?? 'southamerica-east1',

  /** Identidade única deste processo — usada no lease por sessão (anti-overlap em deploy). */
  instanceId: `${process.env.K_REVISION ?? 'local'}-${randomUUID().slice(0, 8)}`,

  /** Concorrência da rehidratação no boot (evita thundering-herd de handshakes). */
  rehydrateConcurrency: Number(process.env.WA_REHYDRATE_CONCURRENCY ?? 3),

  /** Retenção padrão (dias) de novas conexões. 0 = guardar para sempre. */
  defaultRetentionDays: Number(process.env.WA_DEFAULT_RETENTION_DAYS ?? 0),

  /** Mensagens pedidas por página na recuperação de histórico on-demand (cap prático ~50). */
  historyPageSize: Number(process.env.WA_HISTORY_PAGE_SIZE ?? 50),

  /** Teto de páginas por importação de histórico (evita loop infinito). ~20 → ~1000 msgs. */
  historyMaxPages: Number(process.env.WA_HISTORY_MAX_PAGES ?? 20),

  /** Tempo máx. (ms) esperando a resposta ON_DEMAND do WhatsApp antes de marcar erro. */
  historyResponseTimeoutMs: Number(process.env.WA_HISTORY_RESPONSE_TIMEOUT_MS ?? 45000),

  /** Janela (ms) pós-conexão em que o sync inicial do WhatsApp pode preencher o buraco
   *  de mensagens do período desconectado (gap-fill). Depois disso, volta a ser ignorado. */
  gapFillWindowMs: Number(process.env.WA_GAP_FILL_WINDOW_MS ?? 300_000),

  /** Tempo máx. (ms) POR TENTATIVA da consulta de foto de perfil (são até 4 tentativas). */
  photoQueryTimeoutMs: Number(process.env.WA_PHOTO_TIMEOUT_MS ?? 8000),

  /** Tempo máx. (ms) do download da imagem de perfil a partir da CDN do WhatsApp. */
  photoDownloadTimeoutMs: Number(process.env.WA_PHOTO_DOWNLOAD_TIMEOUT_MS ?? 10000),

  /** Bucket do Firebase Storage usado para anexos de WhatsApp. */
  storageBucket:
    process.env.FIREBASE_STORAGE_BUCKET ??
    process.env.GCLOUD_STORAGE_BUCKET ??
    `${process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT ?? process.env.FIREBASE_PROJECT_ID ?? 'titas-c8967'}.firebasestorage.app`,

  /** true quando apontado a um emulador do Firestore (dev local sem credenciais reais). */
  useEmulator: !!process.env.FIRESTORE_EMULATOR_HOST,
}
