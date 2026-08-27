import { useEffect, useState } from 'react'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { auth, db, storage } from '../lib/firebase'
import { selfRef } from '../lib/paths'
import { prefsFromDoc } from '../lib/converters'
import { useAuth } from '../contexts/AuthContext'
import type { UserPrefs } from '../types'

/** Perfil da CONTA logada — nome, cargo, foto, assinatura, telefone e finalização. */
export interface SelfProfile {
  displayName: string
  /** Cargo livre ("Gerente Comercial"), exibido no rodapé da sidebar. */
  role: string
  photoUrl: string
  /** Caminho no Storage — guardado para conseguir apagar a foto antiga. */
  photoPath: string
  signature: string
  phone: string
  closingMessage: string
  closingEnabled: boolean
  prefs: UserPrefs
}

const EMPTY: SelfProfile = {
  displayName: '',
  role: '',
  photoUrl: '',
  photoPath: '',
  signature: '',
  phone: '',
  closingMessage: '',
  closingEnabled: false,
  prefs: { notifyDesktop: true, notifySound: true },
}

/**
 * Lê users/{authUid} — a conta logada, NÃO o tenant ativo. Um atendente convidado edita
 * o próprio perfil, e não o do dono da equipe em que está atendendo.
 */
export function useSelfProfile(): SelfProfile {
  const { user } = useAuth()
  const [profile, setProfile] = useState<SelfProfile>(EMPTY)

  useEffect(() => {
    if (!user?.uid) {
      setProfile(EMPTY)
      return
    }
    return onSnapshot(doc(db, 'users', user.uid), (snap) => {
      const d = snap.data() ?? {}
      setProfile({
        displayName: d.displayName ?? '',
        role: d.role ?? '',
        photoUrl: d.photoUrl ?? '',
        photoPath: d.photoPath ?? '',
        signature: d.signature ?? '',
        phone: d.phone ?? '',
        closingMessage: d.closingMessage ?? '',
        closingEnabled: !!d.closingEnabled,
        prefs: prefsFromDoc(d.prefs),
      })
    })
  }, [user?.uid])

  return profile
}

export async function saveSelfProfile(patch: Partial<Omit<SelfProfile, 'prefs'>>): Promise<void> {
  await setDoc(selfRef(), patch, { merge: true })
}

export async function saveSelfPrefs(prefs: Partial<UserPrefs>): Promise<void> {
  await setDoc(selfRef(), { prefs }, { merge: true })
}

const MAX_PHOTO_BYTES = 2 * 1024 * 1024

/** uid da CONTA logada — a foto é da pessoa, não do tenant que ela está atendendo. */
function selfUid(): string {
  const u = auth.currentUser
  if (!u) throw new Error('Sem usuário autenticado')
  return u.uid
}

/** Apaga um arquivo do Storage ignorando "já não existe". */
async function deleteStoragePath(path: string): Promise<void> {
  await deleteObject(storageRef(storage, path)).catch((err) => {
    if ((err as { code?: string }).code !== 'storage/object-not-found') throw err
  })
}

/** Sobe a foto de perfil e grava url + caminho no doc da conta. */
export async function uploadSelfPhoto(file: File, oldPath?: string): Promise<void> {
  if (!file.type.startsWith('image/')) throw new Error('Escolha um arquivo de imagem (PNG, JPG…).')
  if (file.size > MAX_PHOTO_BYTES) throw new Error('A imagem precisa ter no máximo 2 MB.')
  const path = `users/${selfUid()}/profile/${Date.now()}_${file.name}`
  await uploadBytes(storageRef(storage, path), file, { contentType: file.type })
  const photoUrl = await getDownloadURL(storageRef(storage, path))
  await setDoc(selfRef(), { photoUrl, photoPath: path }, { merge: true })
  if (oldPath && oldPath !== path) await deleteStoragePath(oldPath)
}

/** Remove a foto de perfil (volta às iniciais). */
export async function removeSelfPhoto(oldPath?: string): Promise<void> {
  await setDoc(selfRef(), { photoUrl: '', photoPath: '' }, { merge: true })
  if (oldPath) await deleteStoragePath(oldPath)
}

/**
 * Junta a assinatura ao texto, se houver. Sem duplicar: reenviar um texto que já termina
 * com a assinatura (rascunho recuperado, reenvio) não pode colá-la duas vezes.
 */
export function withSignature(text: string, signature: string): string {
  const sig = signature.trim()
  if (!sig) return text
  if (text.trimEnd().endsWith(sig)) return text
  return `${text}\n\n${sig}`
}
