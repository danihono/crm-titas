import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { config } from './config.js'

// Admin SDK — IGNORA as security rules do Firestore de propósito: o daemon escreve
// tanto no subtree admin-only (whatsappSessions/**, chaves/creds do Signal) quanto no
// subtree do tenant (users/{uid}/...). Por isso todo comando DEVE derivar o uid do PATH
// do doc na fila (users/{uid}/waCommands/...) antes de tocar em qualquer caminho — a rule
// `allow write: if owner(uid)` garante que só o dono conseguiu escrever ali.
if (!getApps().length) {
  initializeApp({
    projectId: config.projectId,
    storageBucket: config.storageBucket,
    // Application Default Credentials: numa VM da GCP vem do metadata server (sem chave
    // em disco); fora dela, de GOOGLE_APPLICATION_CREDENTIALS apontando para o JSON da
    // service account. Com emulador (FIRESTORE_EMULATOR_HOST): sem credencial nenhuma.
    ...(config.useEmulator ? {} : { credential: applicationDefault() }),
  })
}

export const db = getFirestore()
export const bucket = getStorage().bucket()
