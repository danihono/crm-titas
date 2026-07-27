import { FieldValue } from 'firebase-admin/firestore'
import { db } from './firebase.js'
import { logger } from './logger.js'
import { config } from './config.js'
import { sendTextToPhone, startSession, stopSession, fetchProfilePhotoSmart } from './sessionManager.js'
import { writeStatus } from './status.js'
import { purgeConnection, purgeContact } from './purge.js'
import { saveOutgoingTextMessage } from './messages.js'
import { startHistoryImport } from './history.js'
import { fetchAndStoreContactPhoto } from './photo.js'

/**
 * As sete operações que o CRM pode pedir ao daemon, independentes de transporte.
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
  'history.fetch',
  'contact.purge',
  'contact.photoRefresh',
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

/** Inteiro de dias limitado — não amarrado às opções da UI, mas sempre finito e são. */
function retentionArg(args: Args): number {
  if (args.retentionDays == null) return config.defaultRetentionDays
  const n = Number(args.retentionDays)
  if (!Number.isInteger(n) || n < 0 || n > 3650) {
    throw new CommandError('invalid_args', 'Período de retenção inválido.')
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
}
