import { initializeApp } from 'firebase/app'
import { getAuth, connectAuthEmulator } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore'
import { getStorage, connectStorageEmulator } from 'firebase/storage'
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions'
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check'

// Config do Firebase Web. Esses valores são PÚBLICOS por design (vão no bundle
// do front-end); a segurança vem das Security Rules + App Check. Ficam aqui como
// padrão para o app funcionar em qualquer clone sem precisar de .env.local.
// As variáveis de ambiente (VITE_*), se definidas, têm prioridade — útil para
// apontar para outro projeto ou ligar os emuladores locais.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyBIuVawGVQ1VIiNl4o0c3vnB1HnIwoHFV0',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'titas-c8967.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'titas-c8967',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'titas-c8967.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '280388387709',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:280388387709:web:98ca1c450aa3f717be0214',
}

export const app = initializeApp(firebaseConfig)

const useEmulators = import.meta.env.VITE_USE_EMULATORS === 'true'

// App Check (reCAPTCHA v3) — apenas em produção e com site key configurada.
// Em dev contra emuladores o App Check é dispensado.
if (!useEmulators && import.meta.env.VITE_RECAPTCHA_SITE_KEY) {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(import.meta.env.VITE_RECAPTCHA_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  })
}

export const auth = getAuth(app)
export const db = getFirestore(app)
export const storage = getStorage(app)
export const functions = getFunctions(app, import.meta.env.VITE_FUNCTIONS_REGION || 'southamerica-east1')

if (useEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  connectStorageEmulator(storage, '127.0.0.1', 9199)
  connectFunctionsEmulator(functions, '127.0.0.1', 5001)
  // eslint-disable-next-line no-console
  console.info('[firebase] Conectado aos EMULADORES locais (Auth/Firestore/Storage/Functions).')
}
