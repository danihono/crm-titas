/**
 * Base dos testes de Security Rules.
 *
 * Os testes rodam contra os EMULADORES (nunca produção) e exercitam os arquivos
 * `firestore.rules` e `storage.rules` deste repositório. Cada teste afirma o
 * comportamento DESEJADO — então, antes das correções da auditoria, os que
 * cobrem uma falha reprovam de propósito: é essa reprovação que serve de
 * evidência no relatório.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
  type RulesTestContext,
} from '@firebase/rules-unit-testing'
import { ref, uploadBytes } from 'firebase/storage'

const raiz = resolve(__dirname, '../..')

/** E-mail da allowlist SUPER TITAN — o mesmo de src/lib/owners.ts. */
export const EMAIL_DONO_SISTEMA = 'danielboy200627@gmail.com'

// Tenant A é o ambiente sob teste; o B existe para provar que ninguém atravessa.
export const TENANT_A = 'tenantA'
export const TENANT_B = 'tenantB'

export const UID_GESTOR = 'gestorA'
export const UID_ATENDENTE = 'atendenteA'
export const UID_BLOQUEADO = 'bloqueadoA'
export const UID_ESTRANHO = 'estranho'
export const UID_DONO_SISTEMA = 'donoSistema'

export const EMAIL_DONO_A = 'dono@a.com'
export const EMAIL_GESTOR = 'gestor@a.com'
export const EMAIL_ATENDENTE = 'atendente@a.com'
export const EMAIL_BLOQUEADO = 'bloqueado@a.com'
export const EMAIL_ESTRANHO = 'estranho@fora.com'

export async function criarAmbiente(): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: 'demo-titas-rules',
    firestore: {
      rules: readFileSync(resolve(raiz, 'firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
    storage: {
      rules: readFileSync(resolve(raiz, 'storage.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 9199,
    },
  })
}

/**
 * Contexto autenticado com e-mail VERIFICADO — o caso normal.
 *
 * `email_verified` é passado explicitamente porque é exatamente o claim que as
 * regras precisam passar a exigir (achado C2): deixá-lo implícito esconderia a falha.
 */
export function comoUsuario(
  env: RulesTestEnvironment,
  uid: string,
  email: string,
  emailVerificado = true,
): RulesTestContext {
  return env.authenticatedContext(uid, { email, email_verified: emailVerificado })
}

export function comoVisitante(env: RulesTestEnvironment): RulesTestContext {
  return env.unauthenticatedContext()
}

/**
 * Popula dois tenants completos com as regras desligadas.
 *
 * Precisa refletir o formato real dos documentos que o app grava — um seed
 * fantasioso faria os testes aprovarem regras que quebram em produção.
 */
export async function semearDados(env: RulesTestEnvironment): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()

    for (const [tenant, email] of [[TENANT_A, EMAIL_DONO_A], [TENANT_B, 'dono@b.com']] as const) {
      await db.doc(`users/${tenant}`).set({
        displayName: `Empresa ${tenant}`,
        email,
        role: 'Gerente Comercial',
        createdAt: new Date(),
      })
      await db.doc(`users/${tenant}/members/${tenant}`).set({
        name: 'Titular', email, role: 'dono', sectorIds: [], active: true,
      })
      await db.doc(`users/${tenant}/contacts/c1`).set({
        name: 'Contato Um', phone: '11999990000', status: 'contato novo', createdAt: new Date(),
      })
      await db.doc(`users/${tenant}/contacts/c1/messages/m1`).set({
        text: 'oi', de: 'cliente', createdAt: new Date(),
      })
      await db.doc(`users/${tenant}/conversations/cv1`).set({
        contactId: 'c1', assignedTo: tenant, assignedName: 'Titular',
        sectorId: 's1', openedAt: new Date(),
      })
      await db.doc(`users/${tenant}/deals/d1`).set({
        company: 'Cliente Um', value: 1000, boardId: 'b1', order: 0,
      })
      await db.doc(`users/${tenant}/boards/b1`).set({ name: 'Funil', order: 0 })
      await db.doc(`users/${tenant}/invoices/i1`).set({
        num: '001', client: 'Cliente Um', value: 5000, status: 'Pendente',
      })
      await db.doc(`users/${tenant}/sectors/s1`).set({ name: 'Comercial' })
      await db.doc(`users/${tenant}/activities/a1`).set({ title: 'Ligar', done: false })
      await db.doc(`users/${tenant}/knowledge/k1`).set({ title: 'Manual', content: 'segredo' })
    }

    // Equipe do tenant A: um gestor, um atendente e um atendente DESATIVADO.
    await db.doc(`users/${TENANT_A}/members/${UID_GESTOR}`).set({
      name: 'Gestor', email: EMAIL_GESTOR, role: 'gestor', sectorIds: ['s1'], active: true,
    })
    await db.doc(`users/${TENANT_A}/members/${UID_ATENDENTE}`).set({
      name: 'Atendente', email: EMAIL_ATENDENTE, role: 'atendente', sectorIds: ['s1'], active: true,
    })
    await db.doc(`users/${TENANT_A}/members/${UID_BLOQUEADO}`).set({
      name: 'Bloqueado', email: EMAIL_BLOQUEADO, role: 'atendente', sectorIds: ['s1'], active: false,
    })
  })
}

export const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/**
 * Arquivo dentro do prefixo do tenant, gravado sem passar pelas regras.
 *
 * `withSecurityRulesDisabled` entrega o SDK de CLIENTE com as regras suspensas —
 * não o Admin SDK — então o upload aqui é o mesmo `uploadBytes` dos testes.
 */
export async function semearArquivo(
  env: RulesTestEnvironment,
  caminho: string,
  contentType = 'image/png',
): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await uploadBytes(ref(ctx.storage(), caminho), PNG, { contentType })
  })
}
