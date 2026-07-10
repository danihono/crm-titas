import { randomUUID } from 'node:crypto'
import { getDownloadURL } from 'firebase-admin/storage'
import { bucket, db } from './firebase.js'
import { logger } from './logger.js'

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
    // Socket desconectado deve propagar (endpoint responde 409); sem foto/privacidade não.
    if (err instanceof Error && err.message === 'whatsapp_not_connected') throw err
    remoteUrl = undefined
  }
  if (!remoteUrl) return false

  try {
    const res = await fetch(remoteUrl)
    if (!res.ok) return false
    const buffer = Buffer.from(await res.arrayBuffer())
    const contentType = res.headers.get('content-type') || 'image/jpeg'

    const oldPath = typeof snap.get('photoPath') === 'string' ? (snap.get('photoPath') as string) : ''
    const path = `users/${uid}/contacts/${contactId}/profile/photo_${Date.now()}.jpg`
    const file = bucket.file(path)
    const token = randomUUID()
    await file.save(buffer, {
      resumable: false,
      metadata: {
        contentType,
        metadata: { firebaseStorageDownloadTokens: token },
      },
    })

    await contactRef.set(
      {
        photoUrl: await getDownloadURL(file),
        photoPath: path,
        photoSource: 'whatsapp',
      },
      { merge: true },
    )

    // Remove o arquivo antigo (evita órfãos no Storage).
    if (oldPath && oldPath !== path) {
      await bucket.file(oldPath).delete({ ignoreNotFound: true }).catch(() => {})
    }
    return true
  } catch (err) {
    logger.warn({ err, uid, contactId }, 'falha ao migrar foto de perfil do WhatsApp')
    return false
  }
}
