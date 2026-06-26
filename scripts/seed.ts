/**
 * Semeia o Firestore (emulador por padrão) com os dados de exemplo.
 * Cria/garante um usuário demo no Auth e grava tudo em users/{uid}/...
 *
 * Uso:  npm run seed            (aponta para os emuladores)
 * Credenciais demo:  demo@titas.crm / titas123   (sobrescreva com SEED_EMAIL/SEED_PASSWORD)
 */
import admin from 'firebase-admin'
import * as data from './seed-data'
import type { At } from './seed-data'
import { defaultActTypes, defaultAgentConfig } from '../src/lib/theme'

// --- Emuladores (a menos que já definidos no ambiente) ---
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080'
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099'

const projectId = process.env.GCLOUD_PROJECT || process.env.VITE_FIREBASE_PROJECT_ID || 'demo-titas-crm'
const EMAIL = process.env.SEED_EMAIL || 'demo@titas.crm'
const PASSWORD = process.env.SEED_PASSWORD || 'titas123'
const DISPLAY_NAME = process.env.SEED_NAME || 'Rafael Andrade'

admin.initializeApp({ projectId })
const auth = admin.auth()
const db = admin.firestore()
const { Timestamp } = admin.firestore

const now = new Date()
function pad2(n: number) { return String(n).padStart(2, '0') }
function resolveAt(a: At): Date {
  if (a.hh < 0) return new Date(now.getTime() + a.hh * 3600_000) // "há N horas"
  const dt = new Date(now)
  dt.setDate(now.getDate() + a.d)
  dt.setHours(a.hh, a.mm, 0, 0)
  return dt
}
function ts(a: At) { return Timestamp.fromDate(resolveAt(a)) }
function dateKey(d: Date) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) }
function hhmm(d: Date) { return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) }

async function ensureUser(): Promise<string> {
  try {
    const u = await auth.getUserByEmail(EMAIL)
    return u.uid
  } catch {
    const u = await auth.createUser({ email: EMAIL, password: PASSWORD, displayName: DISPLAY_NAME })
    return u.uid
  }
}

async function main() {
  const uid = await ensureUser()
  const root = db.collection('users').doc(uid)
  const batch = db.batch()

  // perfil + agente
  batch.set(root, {
    displayName: DISPLAY_NAME,
    role: 'Gerente Comercial',
    agent: defaultAgentConfig,
    createdAt: Timestamp.fromDate(now),
  }, { merge: true })

  // tipos de atividade
  for (const t of defaultActTypes) {
    batch.set(root.collection('actTypes').doc(t.id), {
      label: t.label, icon: t.icon, color: t.color, bg: t.bg, evColor: t.evColor,
    })
  }

  // boards (colunas embutidas)
  for (const b of data.boards) {
    batch.set(root.collection('boards').doc(b.id), {
      name: b.name, icon: b.icon, columns: b.columns, createdAt: Timestamp.fromDate(now),
    })
  }

  // deals (cards normalizados)
  for (const d of data.deals) {
    batch.set(root.collection('deals').doc(d.id), {
      company: d.company, contact: d.contact, value: d.value, initials: d.initials,
      tag: d.tag, boardId: d.boardId, columnId: d.columnId, order: d.order,
      createdAt: Timestamp.fromDate(now),
    })
  }

  // contatos + mensagens + arquivos
  for (const c of data.contacts) {
    batch.set(root.collection('contacts').doc(c.id), {
      name: c.name, company: c.company, initials: c.initials, online: c.online,
      role: c.role, email: c.email, phone: c.phone, whatsapp: c.whatsapp,
      status: c.status, lastMessage: c.lastMessage, lastMessageAt: ts(c.lastMessageAt),
      createdAt: Timestamp.fromDate(now),
    })
    const msgs = data.threads[c.id] || []
    msgs.forEach((m, i) => {
      batch.set(root.collection('contacts').doc(c.id).collection('messages').doc(`${c.id}-m${i}`), {
        fromMe: m.fromMe, text: m.text, sentAt: ts(m.at),
      })
    })
    const fs = data.files[c.id] || []
    for (const f of fs) {
      batch.set(root.collection('contacts').doc(c.id).collection('files').doc(f.id), {
        name: f.name, type: f.type, sizeBytes: f.sizeBytes,
        storagePath: `seed/${f.name}`, downloadURL: '', uploadedAt: ts(f.at),
      })
    }
  }

  // atividades
  for (const a of data.activities) {
    batch.set(root.collection('activities').doc(a.id), {
      type: a.type, title: a.title, contact: a.contact, dueAt: ts(a.due),
      done: a.done, createdAt: Timestamp.fromDate(now),
    })
  }

  // faturamento
  for (const iv of data.invoices) {
    batch.set(root.collection('invoices').doc(iv.id), {
      num: iv.num, client: iv.client, value: iv.value, dueAt: ts(iv.due),
      status: iv.status, createdAt: Timestamp.fromDate(now),
    })
  }

  // agenda
  for (const e of data.events) {
    const d = resolveAt(e.at)
    batch.set(root.collection('events').doc(e.id), {
      title: e.title, date: Timestamp.fromDate(d), dateKey: dateKey(d), time: hhmm(d),
      color: e.color, subtitle: e.subtitle, createdAt: Timestamp.fromDate(now),
    })
  }

  // leads
  for (const l of data.leads) {
    batch.set(root.collection('leads').doc(l.id), {
      name: l.name, company: l.company, initials: l.initials, source: l.source,
      value: l.value, createdAt: ts(l.createdAt),
    })
  }

  await batch.commit()

  console.log('✅ Seed concluído para uid:', uid)
  console.log('   Projeto:', projectId)
  console.log('   Login demo:', EMAIL, '/', PASSWORD)
  console.log('   Boards:', data.boards.length, '| Deals:', data.deals.length, '| Contatos:', data.contacts.length, '| Atividades:', data.activities.length, '| Notas:', data.invoices.length, '| Eventos:', data.events.length, '| Leads:', data.leads.length)
}

main().then(() => process.exit(0)).catch((e) => { console.error('❌ Seed falhou:', e); process.exit(1) })
