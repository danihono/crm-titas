import { useEffect, useState } from 'react'
import { collection, deleteField, doc, onSnapshot, setDoc } from 'firebase/firestore'
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { httpsCallable } from 'firebase/functions'
import { db, functions, storage } from '../lib/firebase'
import { isOwnerEmail } from '../lib/owners'
import { clientColor } from '../lib/clientBrand'

export interface Client {
  uid: string
  displayName: string
  role: string
  email?: string
  createdAt?: Date
  /** Cor da ficha no painel SUPER TITAN (hex). Sempre normalizada. */
  brandColor: string
  /** Logo do cliente, se o dono do sistema tiver enviado uma. */
  logoUrl?: string
  /** Caminho no Storage — guardado para conseguir apagar a imagem antiga. */
  logoPath?: string
}

/** Lista todos os tenants (clientes) — apenas donos têm permissão de ler. */
export function useClients() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        const list = snap.docs
          .map((d) => {
            const data = d.data()
            return {
              uid: d.id,
              displayName: data.displayName || '(sem nome)',
              role: data.role || '',
              email: data.email,
              createdAt: data.createdAt?.toDate?.(),
              brandColor: clientColor(data.brandColor),
              logoUrl: typeof data.logoUrl === 'string' ? data.logoUrl : undefined,
              logoPath: typeof data.logoPath === 'string' ? data.logoPath : undefined,
            } as Client
          })
          .filter((c) => !isOwnerEmail(c.email))
          .sort((a, b) => a.displayName.localeCompare(b.displayName))
        setClients(list)
        setLoading(false)
      },
      (err) => {
        console.error('[useClients]', err)
        setLoading(false)
      },
    )
    return unsub
  }, [])

  return { clients, loading }
}

// ---------------------------------------------------------------------------
// Administração da ficha do cliente — só o dono do sistema chega aqui.
// As security rules limitam a escrita do dono a estes quatro campos; a UI não é
// a trava. Nada disto entra no tenant do cliente: os dados dele seguem fechados.
// ---------------------------------------------------------------------------

export interface ClientBrandingPatch {
  displayName?: string
  brandColor?: string
  /** null remove a logo (apaga os dois campos no doc). */
  logo?: { url: string; path: string } | null
}

/** Grava nome/cor/logo em users/{uid}. */
export async function saveClientBranding(uid: string, patch: ClientBrandingPatch): Promise<void> {
  const data: Record<string, unknown> = {}
  if (patch.displayName !== undefined) data.displayName = patch.displayName
  if (patch.brandColor !== undefined) data.brandColor = clientColor(patch.brandColor)
  if (patch.logo === null) {
    data.logoUrl = deleteField()
    data.logoPath = deleteField()
  } else if (patch.logo) {
    data.logoUrl = patch.logo.url
    data.logoPath = patch.logo.path
  }
  if (Object.keys(data).length === 0) return
  await setDoc(doc(db, 'users', uid), data, { merge: true })
}

const MAX_LOGO_BYTES = 2 * 1024 * 1024

/**
 * Sobe a logo em users/{uid}/brand/ e devolve url + caminho. Não grava no Firestore —
 * quem decide salvar é o modal, junto com o resto do formulário.
 */
export async function uploadClientLogo(uid: string, file: File): Promise<{ url: string; path: string }> {
  if (!file.type.startsWith('image/')) throw new Error('Escolha um arquivo de imagem (PNG, JPG, SVG…).')
  if (file.size > MAX_LOGO_BYTES) throw new Error('A imagem precisa ter no máximo 2 MB.')
  const ext = (file.name.split('.').pop() || 'png').toLowerCase().slice(0, 5)
  const path = `users/${uid}/brand/logo-${Date.now()}.${ext}`
  const sref = storageRef(storage, path)
  await uploadBytes(sref, file, { contentType: file.type })
  return { url: await getDownloadURL(sref), path }
}

/** Apaga um arquivo de logo do Storage. Falha silenciosa: o doc é a fonte da verdade. */
export async function deleteClientLogoFile(path?: string): Promise<void> {
  if (!path) return
  try {
    await deleteObject(storageRef(storage, path))
  } catch (err) {
    console.warn('[deleteClientLogoFile]', err)
  }
}

/**
 * Exclusão DEFINITIVA do cliente. Roda na Cloud Function `excluirCliente` (Admin SDK):
 * o navegador não tem como varrer as subcoleções nem apagar a conta no Auth.
 */
export async function deleteClientAccount(uid: string): Promise<void> {
  const fn = httpsCallable<{ uid: string }, { ok: boolean }>(functions, 'excluirCliente')
  await fn({ uid })
}

/**
 * Traduz o código da callable em algo acionável. Mesmo motivo do agentErrorHint:
 * sem isto, função não publicada e App Check barrando viram o mesmo erro mudo.
 */
export function clientDeleteErrorHint(code: string, fallback: string): string {
  switch (code) {
    case 'functions/not-found':
      return 'A Cloud Function excluirCliente não está publicada neste projeto — falta `firebase deploy --only functions`.'
    case 'functions/unauthenticated':
    case 'functions/permission-denied':
      return 'A chamada foi barrada (App Check ou conta sem permissão de dono do sistema).'
    case 'functions/failed-precondition':
      return fallback || 'Esta conta não pode ser excluída.'
    case 'functions/internal':
      return 'A exclusão falhou no servidor. Confira os logs da função excluirCliente.'
    default:
      return fallback || 'Não foi possível excluir o cliente agora.'
  }
}
