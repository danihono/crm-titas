import { bucket, db } from './firebase.js'
import { config } from './config.js'
import { logger } from './logger.js'
import { saveToStorage, StorageWriteError } from './storage.js'

/** Busca a URL da foto de perfil de um JID no WhatsApp. undefined = sem foto/privacidade. */
export type ProfilePhotoFetcher = (jid: string) => Promise<string | undefined>

export interface StoreProfilePhotoOptions {
  /** true ignora o override do usuário (ação explícita de "puxar do WhatsApp"). */
  force?: boolean
}

/**
 * Migra a foto de perfil do WhatsApp de um contato para o CRM: baixa a imagem e a
 * guarda no Storage (`users/{uid}/contacts/{id}/profile/...`), apontando o contato para
 * ela via `photoUrl`/`photoPath` com `photoSource:'whatsapp'`.
 *
 * Respeita override do usuário: se o contato já tem `photoSource` 'manual' ou 'removed',
 * NÃO sobrescreve (a menos que `force`). Falha de rede/privacidade é silenciosa (retorna
 * false) — nunca derruba a ingestão de mensagens. NUNCA loga conteúdo.
 *
 * Retorna true quando uma foto foi encontrada e gravada.
 */
export async function fetchAndStoreContactPhoto(
  uid: string,
  contactId: string,
  jid: string,
  fetchProfilePhoto: ProfilePhotoFetcher,
  opts: StoreProfilePhotoOptions = {},
): Promise<boolean> {
  const contactRef = db.collection('users').doc(uid).collection('contacts').doc(contactId)
  const snap = await contactRef.get()
  if (!snap.exists) return false

  const source = snap.get('photoSource')
  if (!opts.force && (source === 'manual' || source === 'removed')) return false

  let remoteUrl: string | undefined
  try {
    remoteUrl = await fetchProfilePhoto(jid)
  } catch (err) {
    // Socket desconectado/timeout devem propagar (endpoint responde 409/504) — engolir
    // viraria um falso "contato sem foto". Sem foto/privacidade não propaga.
    if (err instanceof Error && (err.message === 'whatsapp_not_connected' || err.message === 'photo_timeout')) {
      throw err
    }
    remoteUrl = undefined
  }
  if (!remoteUrl) return false

  try {
    const res = await fetch(remoteUrl, { signal: AbortSignal.timeout(config.photoDownloadTimeoutMs) })
    if (!res.ok) return false
    const buffer = Buffer.from(await res.arrayBuffer())
    const contentType = res.headers.get('content-type') || 'image/jpeg'

    const oldPath = typeof snap.get('photoPath') === 'string' ? (snap.get('photoPath') as string) : ''
    const path = `users/${uid}/contacts/${contactId}/profile/photo_${Date.now()}.jpg`
    const photoUrl = await saveToStorage(path, buffer, contentType)

    await contactRef.set({ photoUrl, photoPath: path, photoSource: 'whatsapp' }, { merge: true })

    // Remove o arquivo antigo (evita órfãos no Storage).
    if (oldPath && oldPath !== path) {
      await bucket.file(oldPath).delete({ ignoreNotFound: true }).catch(() => {})
    }
    return true
  } catch (err) {
    // Download que estourou o teto vira 'photo_timeout' (o endpoint traduz em 504);
    // return false aqui significaria "contato sem foto", que não é o caso.
    if (err instanceof DOMException && err.name === 'TimeoutError') throw new Error('photo_timeout')
    // Falha do Storage é problema de INFRAESTRUTURA e cai no mesmo 403 que derruba a mídia
    // das mensagens — merece nível 'error' e nome próprio, senão vira "contato sem foto" e
    // a causa real (IAM da service account) passa despercebida.
    if (err instanceof StorageWriteError) {
      logger.error(
        { err, uid, contactId, stage: err.stage, code: err.code, bucket: config.storageBucket },
        'falha ao SALVAR foto de perfil no Storage',
      )
      return false
    }
    logger.warn({ err, uid, contactId }, 'falha ao migrar foto de perfil do WhatsApp')
    return false
  }
}
