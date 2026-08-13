import { FieldValue } from 'firebase-admin/firestore'
import { bucket, db } from './firebase.js'
import { logger } from './logger.js'
import { config } from './config.js'
import { sendTextToPhone, sendMediaToPhone, startSession, stopSession, fetchProfilePhotoSmart, hasSession } from './sessionManager.js'
import { writeStatus } from './status.js'
import { purgeConnection, purgeContact } from './purge.js'
import { saveOutgoingTextMessage, saveOutgoingMediaMessage } from './messages.js'
import { startHistoryImport } from './history.js'
import { fetchAndStoreContactPhoto } from './photo.js'
import { startMediaRetry } from './mediaRetry.js'

/**
 * As operações que o CRM pode pedir ao daemon, independentes de transporte.
 *
 * Antes viviam dentro dos handlers Express; hoje são chamadas pelo dispatcher da fila
 * (commands.ts). Mantê-las aqui é o que permitiu deletar o servidor HTTP sem duplicar
 * uma linha de lógica — e é aqui que moram as mensagens de erro em PT-BR que o front exibe.
 */

/** Erro de negócio de um comando: `code` é estável para lógica, `message` vai ao usuário. */
export class CommandError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'CommandError'
  }
}

export const WA_COMMAND_TYPES = [
  'session.consent',
  'session.connect',
  'session.disconnect',
  'message.send',
  'message.sendMedia',
  'history.fetch',
  'contact.purge',
  'contact.photoRefresh',
  'contact.mediaRetry',
] as const

export type WaCommandType = (typeof WA_COMMAND_TYPES)[number]

export function isWaCommandType(v: unknown): v is WaCommandType {
  return typeof v === 'string' && (WA_COMMAND_TYPES as readonly string[]).includes(v)
}

type Args = Record<string, unknown>
type ActionResult = Record<string, unknown>

// ---------------------------------------------------------------------------
// Validação dos args
//
// OBRIGATÓRIA: as security rules do Firestore são união PERMISSIVA, então não é
// possível restringir o schema de users/{uid}/waCommands por rule (uma regra aninhada
// mais estrita não revoga o `allow write: if owner(uid)` recursivo). O daemon é a única
// barreira entre um doc arbitrário e a execução.
// ---------------------------------------------------------------------------

function phoneDigits(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '')
}

/** contactId é um doc-id do Firestore: sem barras, sem tamanho absurdo. */
function contactIdArg(args: Args): string {
  const raw = String(args.contactId ?? '').trim()
  if (!raw || raw.length > 200 || !/^[A-Za-z0-9_-]+$/.test(raw)) {
    throw new CommandError('invalid_args', 'Contato inválido.')
  }
  return raw
}

function textArg(args: Args): string {
  const raw = String(args.text ?? '').trim()
  if (!raw) throw new CommandError('invalid_args', 'Mensagem vazia.')
  if (raw.length > 4096) throw new CommandError('invalid_args', 'Mensagem longa demais (máx. 4096 caracteres).')
  return raw
}

/**
 * Teto do anexo que o daemon carrega em memória para enviar. Folgado em relação ao limite do
 * CRM (10 MB, imposto por storage.rules): é uma trava de segurança contra um caminho apontando
 * para um arquivo enorme, não o limite que o usuário enxerga.
 */
const MAX_OUTGOING_MEDIA_BYTES = 16 * 1024 * 1024

const OUTGOING_MEDIA_TYPES = ['image', 'video', 'audio', 'document'] as const
type OutgoingMediaType = (typeof OUTGOING_MEDIA_TYPES)[number]

function mediaTypeArg(args: Args): OutgoingMediaType {
  const raw = String(args.mediaType ?? '')
  if (!(OUTGOING_MEDIA_TYPES as readonly string[]).includes(raw)) {
    throw new CommandError('invalid_args', 'Tipo de anexo inválido.')
  }
  return raw as OutgoingMediaType
}

/**
 * Caminho do arquivo no Storage, AMARRADO ao dono e ao contato.
 *
 * O daemon lê o bucket com credencial de admin, então um caminho arbitrário vindo da fila
 * daria ao tenant a chance de mandar o daemon buscar arquivo de qualquer lugar. O prefixo
 * exigido aqui é exatamente o que as storage.rules já permitiriam ao próprio usuário.
 */
function mediaPathArg(args: Args, uid: string, contactId: string): string {
  const raw = String(args.mediaPath ?? '').trim()
  const prefix = `users/${uid}/contacts/${contactId}/`
  if (!raw || raw.length > 1024 || raw.includes('..') || !raw.startsWith(prefix)) {
    throw new CommandError('invalid_args', 'Arquivo inválido.')
  }
  return raw
}

/** URL de download já gerada no upload — é ela que fica gravada na mensagem. */
function mediaUrlArg(args: Args): string {
  const raw = String(args.mediaUrl ?? '').trim()
  if (!raw || raw.length > 2048 || !/^https?:\/\//i.test(raw)) {
    throw new CommandError('invalid_args', 'Endereço do arquivo inválido.')
  }
  return raw
}

/** Legenda do anexo. Opcional; o teto é o mesmo do WhatsApp. */
function captionArg(args: Args): string | undefined {
  const raw = String(args.caption ?? '').trim()
  if (!raw) return undefined
  if (raw.length > 1024) throw new CommandError('invalid_args', 'Legenda longa demais (máx. 1024 caracteres).')
  return raw
}

/** Texto curto e sem quebra de linha (mimeType/fileName). Vazio vira undefined. */
function shortTextArg(value: unknown, max: number): string | undefined {
  const raw = String(value ?? '').replace(/[\r\n]/g, ' ').trim()
  return raw ? raw.slice(0, max) : undefined
}

/** Inteiro de dias limitado — não amarrado às opções da UI, mas sempre finito e são. */
function retentionArg(args: Args): number {
  if (args.retentionDays == null) return config.defaultRetentionDays
  const n = Number(args.retentionDays)
  if (!Number.isInteger(n) || n < 0 || n > 3650) {
    throw new CommandError('invalid_args', 'Período de retenção inválido.')
  }
  return n
}

/** Teto de mensagens tocadas numa rodada de recuperação. Não amarrado à UI, mas sempre finito. */
function maxDocsArg(args: Args): number | undefined {
  if (args.max == null) return undefined
  const n = Number(args.max)
  if (!Number.isInteger(n) || n <= 0 || n > 200) {
    throw new CommandError('invalid_args', 'Quantidade inválida.')
  }
  return n
}

function maxDaysArg(args: Args): number | undefined {
  if (args.maxDays == null) return undefined
  const n = Number(args.maxDays)
  if (!Number.isInteger(n) || n <= 0 || n > 3650) {
    throw new CommandError('invalid_args', 'Janela de dias inválida.')
  }
  return n
}

/** Resolve o contato e o número, ou lança o erro de negócio correspondente. */
async function requireContact(uid: string, contactId: string) {
  const ref = db.collection('users').doc(uid).collection('contacts').doc(contactId)
  const snap = await ref.get()
  if (!snap.exists) throw new CommandError('contact_not_found', 'Contato não encontrado.')
  const digits =
    phoneDigits(snap.get('whatsappDigits')) ||
    phoneDigits(snap.get('whatsapp')) ||
    phoneDigits(snap.get('phone'))
  const storedJid = typeof snap.get('waJid') === 'string' ? (snap.get('waJid') as string) : ''
  return { ref, snap, digits, storedJid }
}

// ---------------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------------

export const actions: Record<WaCommandType, (uid: string, args: Args) => Promise<ActionResult>> = {
  /** Registra o consentimento LGPD + retenção (obrigatório antes de conectar). */
  'session.consent': async (uid, args) => {
    const retentionDays = retentionArg(args)
    await db
      .collection('whatsappSessions')
      .doc(uid)
      .set({ consentAt: FieldValue.serverTimestamp(), retentionDays }, { merge: true })
    return { retentionDays }
  },

  /** Inicia (ou retoma) a sessão do uid. Exige consentimento prévio. */
  'session.connect': async (uid) => {
    const sessionDoc = await db.collection('whatsappSessions').doc(uid).get()
    if (!sessionDoc.get('consentAt')) {
      throw new CommandError('consent_required', 'Aceite o aviso de privacidade antes de conectar.')
    }

    await db.collection('whatsappSessions').doc(uid).set({ desiredState: 'connected' }, { merge: true })
    await writeStatus(db, uid, { status: 'connecting', qr: null, lastError: null })

    try {
      await startSession(uid)
      return { ok: true }
    } catch (err) {
      // Lease ocupada: outro processo do daemon já segura esta conexão. Abrir aqui
      // deslogaria os dois no WhatsApp — por isso é recusa explícita, não falha genérica.
      if (err instanceof Error && err.message === 'session_lease_taken') {
        await writeStatus(db, uid, { status: 'disconnected', lastError: 'lease_taken' })
        throw new CommandError(
          'session_lease_taken',
          'Outra cópia do serviço de WhatsApp já está usando esta conexão. Encerre-a e tente de novo.',
        )
      }
      logger.error({ err, uid }, 'connect falhou')
      await writeStatus(db, uid, { status: 'disconnected', lastError: 'connect failed' })
      throw new CommandError('connect_failed', 'Falha ao conectar ao WhatsApp.')
    }
  },

  /**
   * Desconecta e, com purge, expurga todos os dados espelhados (LGPD).
   * Sempre 'logout': desvincula o aparelho (próxima conexão exige QR novo).
   */
  'session.disconnect': async (uid, args) => {
    const purge = args.purge === true
    await stopSession(uid, 'logout')
    if (purge) await purgeConnection(uid)
    return { purged: purge }
  },

  'message.send': async (uid, args) => {
    const contactId = contactIdArg(args)
    const text = textArg(args)
    const { ref: contactRef, digits } = await requireContact(uid, contactId)
    if (digits.length < 8) {
      throw new CommandError('invalid_phone', 'Este contato não tem um número de WhatsApp válido.')
    }

    await contactRef.set({ whatsappDigits: digits, waJid: `${digits}@s.whatsapp.net` }, { merge: true })

    try {
      const sent = await sendTextToPhone(uid, digits, text)
      const remoteJid = sent.key.remoteJid || `${digits}@s.whatsapp.net`
      await contactRef.set({ whatsappDigits: digits, waJid: remoteJid }, { merge: true })
      await saveOutgoingTextMessage(
        uid,
        contactId,
        sent.key.id!,
        text,
        remoteJid,
        Number(sent.messageTimestamp ?? 0) || undefined,
      )
      return { id: sent.key.id, remoteJid }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'whatsapp_send_failed'
      if (msg === 'whatsapp_not_connected') {
        throw new CommandError('whatsapp_not_connected', 'WhatsApp não está conectado.')
      }
      if (msg === 'whatsapp_recipient_not_found') {
        throw new CommandError('whatsapp_recipient_not_found', 'Este número não foi encontrado no WhatsApp.')
      }
      logger.warn({ err, uid, contactId }, 'envio WhatsApp falhou')
      throw new CommandError('send_failed', 'Falha ao enviar pelo WhatsApp.')
    }
  },

  /**
   * Envia um anexo que o CRM já subiu ao Storage (foto, vídeo, áudio ou documento).
   *
   * O arquivo NÃO trafega pela fila — o doc de comando carrega só o caminho, e o daemon
   * baixa do bucket. Documento do Firestore tem 1 MiB de teto, então mandar bytes por ali
   * simplesmente não caberia; e o arquivo já precisa estar no Storage de qualquer forma,
   * porque é de lá que o CRM exibe a mídia depois.
   */
  'message.sendMedia': async (uid, args) => {
    const contactId = contactIdArg(args)
    const mediaType = mediaTypeArg(args)
    const mediaPath = mediaPathArg(args, uid, contactId)
    const mediaUrl = mediaUrlArg(args)
    const caption = captionArg(args)
    const mimeType = shortTextArg(args.mimeType, 200)
    const fileName = shortTextArg(args.fileName, 200)

    const { ref: contactRef, digits } = await requireContact(uid, contactId)
    if (digits.length < 8) {
      throw new CommandError('invalid_phone', 'Este contato não tem um número de WhatsApp válido.')
    }
    // Antes de baixar: sem sessão o envio falharia de qualquer jeito, e o download seria
    // megabytes gastos à toa.
    if (!hasSession(uid)) {
      throw new CommandError('whatsapp_not_connected', 'WhatsApp não está conectado.')
    }

    const file = bucket.file(mediaPath)
    let buffer: Buffer
    try {
      const [meta] = await file.getMetadata()
      const size = Number(meta.size ?? 0)
      if (size > MAX_OUTGOING_MEDIA_BYTES) {
        throw new CommandError('media_too_large', 'Arquivo grande demais para enviar pelo WhatsApp.')
      }
      const [data] = await file.download()
      buffer = data
    } catch (err) {
      if (err instanceof CommandError) throw err
      logger.error({ err, uid, contactId, mediaPath }, 'falha ao ler o anexo no Storage')
      throw new CommandError('media_not_found', 'Não foi possível ler o arquivo enviado. Tente de novo.')
    }

    await contactRef.set({ whatsappDigits: digits, waJid: `${digits}@s.whatsapp.net` }, { merge: true })

    try {
      const sent = await sendMediaToPhone(uid, digits, { mediaType, buffer, mimeType, fileName, caption })
      const remoteJid = sent.key.remoteJid || `${digits}@s.whatsapp.net`
      await contactRef.set({ whatsappDigits: digits, waJid: remoteJid }, { merge: true })
      await saveOutgoingMediaMessage(
        uid,
        contactId,
        sent.key.id!,
        { mediaType, mediaPath, mediaUrl, mimeType, fileName, caption, sizeBytes: buffer.byteLength },
        remoteJid,
        Number(sent.messageTimestamp ?? 0) || undefined,
      )
      return { id: sent.key.id, remoteJid }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'whatsapp_send_failed'
      if (msg === 'whatsapp_not_connected') {
        throw new CommandError('whatsapp_not_connected', 'WhatsApp não está conectado.')
      }
      if (msg === 'whatsapp_recipient_not_found') {
        throw new CommandError('whatsapp_recipient_not_found', 'Este número não foi encontrado no WhatsApp.')
      }
      logger.warn({ err, uid, contactId, mediaType }, 'envio de anexo pelo WhatsApp falhou')
      throw new CommandError('send_failed', 'Falha ao enviar o anexo pelo WhatsApp.')
    }
  },

  /**
   * Recupera o histórico antigo de um contato (on-demand, auto-paginado). As mensagens
   * chegam de forma assíncrona e a UI acompanha por onSnapshot (contact.historyImport).
   */
  'history.fetch': async (uid, args) => {
    const contactId = contactIdArg(args)
    const maxDays = maxDaysArg(args)
    await requireContact(uid, contactId)

    try {
      await startHistoryImport(uid, contactId, maxDays)
      return { ok: true }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'history_failed'
      if (msg === 'whatsapp_not_connected') {
        throw new CommandError('whatsapp_not_connected', 'Conecte o WhatsApp primeiro.')
      }
      if (msg === 'no_anchor') {
        throw new CommandError(
          'no_anchor',
          'Envie ou receba ao menos uma mensagem com este contato antes de recuperar o histórico.',
        )
      }
      logger.error({ err, uid, contactId }, 'recuperação de histórico falhou')
      throw new CommandError('history_failed', 'Falha ao recuperar histórico.')
    }
  },

  /**
   * Expurgo total de um contato (keepContact=true limpa só a conversa, mantendo o cadastro).
   * Marca o expurgo para que replays de mensagens antigas não ressuscitem a conversa.
   */
  'contact.purge': async (uid, args) => {
    const contactId = contactIdArg(args)
    const keepContact = args.keepContact === true

    try {
      await purgeContact(uid, contactId, keepContact)
      return { ok: true }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'purge_failed'
      if (msg === 'contact_not_found') {
        throw new CommandError('contact_not_found', 'Contato não encontrado.')
      }
      logger.error({ err, uid, contactId }, 'expurgo de contato falhou')
      throw new CommandError('purge_failed', 'Falha ao apagar os dados do contato.')
    }
  },

  /** Puxa (ou re-puxa) a foto de perfil do WhatsApp. Ação explícita do usuário → força. */
  'contact.photoRefresh': async (uid, args) => {
    const contactId = contactIdArg(args)
    const { digits, storedJid } = await requireContact(uid, contactId)
    if (!digits && !storedJid) {
      throw new CommandError('invalid_phone', 'Este contato não tem um número de WhatsApp válido.')
    }

    try {
      // Busca multi-candidato (JID resolvido, @lid e waJid salvo, em 'image' e 'preview') —
      // na era LID só uma dessas combinações costuma responder. O jid abaixo é só para log.
      const jidLog = digits ? `${digits}@s.whatsapp.net` : storedJid
      const found = await fetchAndStoreContactPhoto(
        uid,
        contactId,
        jidLog,
        () => fetchProfilePhotoSmart(uid, digits, storedJid),
        { force: true },
      )
      return { found }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'photo_refresh_failed'
      if (msg === 'whatsapp_not_connected') {
        throw new CommandError('whatsapp_not_connected', 'Conecte o WhatsApp primeiro.')
      }
      if (msg === 'photo_timeout') {
        // O trace vai na mensagem de propósito: o alerta do front o exibe, e um print
        // do usuário mostra qual endereço/modo o WhatsApp ignorou.
        const trace = (err as { trace?: string }).trace
        throw new CommandError(
          'photo_timeout',
          `O WhatsApp não respondeu a tempo. Tente novamente em instantes.${trace ? ` [diag: ${trace}]` : ''}`,
        )
      }
      logger.error({ err, uid, contactId }, 'refresh de foto do WhatsApp falhou')
      throw new CommandError('photo_refresh_failed', 'Falha ao puxar a foto do WhatsApp.')
    }
  },

  /**
   * Rebaixa as mídias que ficaram sem arquivo. Assíncrono, como o history.fetch: enumera,
   * dispara e volta — a fila é serial por uid, e segurar aqui travaria o envio de mensagens
   * do tenant. O andamento vai para contact.mediaRecovery, acompanhado por onSnapshot.
   */
  'contact.mediaRetry': async (uid, args) => {
    const contactId = contactIdArg(args)
    const max = maxDocsArg(args)
    await requireContact(uid, contactId)

    try {
      const { eligible, legacy } = await startMediaRetry(uid, contactId, max)
      return { eligible, legacy }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'media_retry_failed'
      if (msg === 'whatsapp_not_connected') {
        throw new CommandError('whatsapp_not_connected', 'Conecte o WhatsApp primeiro.')
      }
      if (msg === 'media_retry_running') {
        throw new CommandError('media_retry_running', 'Já há uma recuperação de mídia em andamento aqui.')
      }
      logger.error({ err, uid, contactId }, 'recuperação de mídia falhou')
      throw new CommandError('media_retry_failed', 'Falha ao recuperar as mídias.')
    }
  },
}
