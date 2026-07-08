import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { getStorage } from 'firebase-admin/storage'
import { config } from './config.js'

// Admin SDK — IGNORA as security rules do Firestore de propósito: o daemon escreve
// tanto no subtree admin-only (whatsappSessions/**, chaves/creds do Signal) quanto no
// subtree do tenant (users/{uid}/...). Por isso todo endpoint de controle DEVE resolver
// o uid a partir de um ID token verificado antes de tocar em qualquer path.
if (!getApps().length) {
  initializeApp({
    projectId: config.projectId,
    storageBucket: config.storageBucket,
    // Em Cloud Run: Application Default Credentials da service account do runtime.
    // Com emulador (FIRESTORE_EMULATOR_HOST): sem credencial — o SDK usa o emulador.
    ...(config.useEmulator ? {} : { credential: applicationDefault() }),
  })
}

export const db = getFirestore()
export const adminAuth = getAuth()
export const bucket = getStorage().bucket()
