import { useEffect, useState } from 'react'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { selfRef } from '../lib/paths'
import { prefsFromDoc } from '../lib/converters'
import { useAuth } from '../contexts/AuthContext'
import type { UserPrefs } from '../types'

/** Perfil da CONTA logada — nome, assinatura, telefone e mensagem de finalização. */
export interface SelfProfile {
  displayName: string
  signature: string
  phone: string
  closingMessage: string
  closingEnabled: boolean
  prefs: UserPrefs
}

const EMPTY: SelfProfile = {
  displayName: '',
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
