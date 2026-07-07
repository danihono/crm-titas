// Repairs WhatsApp contacts that were auto-created with the account owner's name.
// Usage: GOOGLE_CLOUD_PROJECT=titas-c8967 node scripts/repair-contact-names.mjs <email|uid> [--dry-run]
// Requires ADC (gcloud auth application-default login) with access to the project.
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

const target = process.argv[2]
const dryRun = process.argv.includes('--dry-run')

if (!target) {
  console.error('uso: node scripts/repair-contact-names.mjs <email|uid> [--dry-run]')
  process.exit(1)
}

initializeApp({
  credential: applicationDefault(),
  projectId: process.env.GOOGLE_CLOUD_PROJECT || 'titas-c8967',
})

const db = getFirestore()
const auth = getAuth()

async function resolveUser(value) {
  if (value.includes('@')) {
    const user = await auth.getUserByEmail(value)
    return { uid: user.uid, authDisplayName: user.displayName || '' }
  }
  const user = await auth.getUser(value).catch(() => null)
  return { uid: value, authDisplayName: user?.displayName || '' }
}

function sameName(a, b) {
  return String(a || '').trim() === String(b || '').trim()
}

function displayPhone(value) {
  const digits = String(value || '').replace(/\D/g, '')
  return digits ? `+${digits}` : ''
}

function initialsOf(name) {
  const digits = name.replace(/\D/g, '')
  if (digits) return digits.slice(0, 2)

  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?'
}

const { uid, authDisplayName } = await resolveUser(target)
const userSnap = await db.doc(`users/${uid}`).get()
const ownerName = String(userSnap.get('displayName') || authDisplayName || '').trim()

if (!ownerName) {
  console.error(`Nao foi possivel descobrir displayName para uid ${uid}.`)
  process.exit(1)
}

const contacts = await db
  .collection('users')
  .doc(uid)
  .collection('contacts')
  .where('source', '==', 'whatsapp')
  .get()

let repaired = 0
let skippedName = 0
let skippedPhone = 0

for (const doc of contacts.docs) {
  const data = doc.data()
  if (!sameName(data.name, ownerName)) {
    skippedName += 1
    continue
  }

  const name = displayPhone(data.whatsapp) || displayPhone(data.phone)
  if (!name) {
    skippedPhone += 1
    continue
  }

  repaired += 1
  console.log(`${dryRun ? 'DRY-RUN' : 'OK'} ${doc.id}: "${data.name}" -> "${name}"`)

  if (!dryRun) {
    await doc.ref.update({
      name,
      initials: initialsOf(name),
      nameSource: 'phone',
    })
  }
}

console.log(
  `Concluido para uid ${uid}. reparados=${repaired}, ignorados_nome=${skippedName}, ignorados_sem_numero=${skippedPhone}`,
)
process.exit(0)
