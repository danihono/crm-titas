/**
 * Regras das integrações de anúncio, exercitadas nos emuladores.
 *
 * O que se protege aqui: o token que mexe no dinheiro do cliente (ninguém lê, nem o dono
 * do ambiente, nem o dono do sistema), a origem do lead (ninguém inventa, senão o ROI por
 * campanha vira ficção) e o registro de conversão enviada (ninguém apaga, senão a mesma
 * venda vai duas vezes para a Meta).
 */
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, deleteField, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore'
import {
  criarAmbiente, semearDados, comoUsuario,
  TENANT_A, UID_GESTOR, UID_ATENDENTE, UID_DONO_SISTEMA,
  EMAIL_DONO_A, EMAIL_GESTOR, EMAIL_ATENDENTE, EMAIL_DONO_SISTEMA,
} from './helpers'

let env: RulesTestEnvironment

beforeAll(async () => { env = await criarAmbiente() })
afterAll(async () => { await env?.cleanup() })
beforeEach(async () => {
  await env.clearFirestore()
  await semearDados(env)
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, `integrationSecrets/${TENANT_A}`), { meta: { token: 'v1:cifrado' }, metaAtivo: true })
    await setDoc(doc(db, 'leadWebhooks/abc'), { tenantUid: TENANT_A, active: true })
    await setDoc(doc(db, `users/${TENANT_A}/integrations/meta`), { conectado: true, adAccountId: 'act_1', tokenFim: '1234' })
    await setDoc(doc(db, `users/${TENANT_A}/adCampaigns/meta_1`), { provider: 'meta', name: 'Black Friday' })
    await setDoc(doc(db, `users/${TENANT_A}/adDaily/meta_1_2026-10-01`), { campaignKey: 'meta_1', date: '2026-10-01', spend: 100 })
    await setDoc(doc(db, `users/${TENANT_A}/deals/meta_99`), {
      company: 'Lead', contact: 'Lead', value: 0, initials: 'L', tag: 'Ads',
      boardId: 'leads', columnId: 'novo', order: -1,
      source: { channel: 'meta', campaignKey: 'meta_1', leadId: '99' },
      conversionsSent: { qualificado: { status: 'ok' } },
    })
  })
})

const dono = () => comoUsuario(env, TENANT_A, EMAIL_DONO_A).firestore()
const gestor = () => comoUsuario(env, UID_GESTOR, EMAIL_GESTOR).firestore()
const atendente = () => comoUsuario(env, UID_ATENDENTE, EMAIL_ATENDENTE).firestore()
const donoSistema = () => comoUsuario(env, UID_DONO_SISTEMA, EMAIL_DONO_SISTEMA).firestore()

describe('cofre dos tokens', () => {
  it('nem o dono do ambiente lê o token', async () => {
    await assertFails(getDoc(doc(dono(), `integrationSecrets/${TENANT_A}`)))
  })
  it('nem o dono do sistema', async () => {
    await assertFails(getDoc(doc(donoSistema(), `integrationSecrets/${TENANT_A}`)))
  })
  it('ninguém grava no cofre pelo navegador', async () => {
    await assertFails(setDoc(doc(dono(), `integrationSecrets/${TENANT_A}`), { meta: { token: 'x' } }))
  })
  it('o índice de chaves do webhook é fechado', async () => {
    await assertFails(getDoc(doc(dono(), 'leadWebhooks/abc')))
    await assertFails(setDoc(doc(dono(), 'leadWebhooks/nova'), { tenantUid: TENANT_A }))
  })
})

describe('config visível e métricas', () => {
  it('dono e gestor leem', async () => {
    await assertSucceeds(getDoc(doc(dono(), `users/${TENANT_A}/integrations/meta`)))
    await assertSucceeds(getDocs(collection(gestor(), `users/${TENANT_A}/adCampaigns`)))
    await assertSucceeds(getDocs(collection(gestor(), `users/${TENANT_A}/adDaily`)))
  })
  it('atendente não lê gasto nem config', async () => {
    await assertFails(getDoc(doc(atendente(), `users/${TENANT_A}/integrations/meta`)))
    await assertFails(getDocs(collection(atendente(), `users/${TENANT_A}/adCampaigns`)))
    await assertFails(getDocs(collection(atendente(), `users/${TENANT_A}/adDaily`)))
  })
  it('ninguém escreve pelo navegador — quem escreve é a callable', async () => {
    await assertFails(setDoc(doc(dono(), `users/${TENANT_A}/integrations/meta`), { conectado: false }))
    await assertFails(setDoc(doc(dono(), `users/${TENANT_A}/adCampaigns/meta_2`), { name: 'x' }))
    await assertFails(setDoc(doc(dono(), `users/${TENANT_A}/adDaily/x`), { spend: 0 }))
  })
})

describe('origem do lead e conversões enviadas', () => {
  it('ninguém cria card com origem inventada', async () => {
    await assertFails(setDoc(doc(dono(), `users/${TENANT_A}/deals/falso`), {
      company: 'X', contact: 'X', value: 0, initials: 'X', tag: 'Ads', boardId: 'leads', columnId: 'novo', order: 0,
      source: { channel: 'meta', campaignKey: 'meta_1' },
    }))
  })
  it('ninguém troca a origem de um lead', async () => {
    await assertFails(updateDoc(doc(gestor(), `users/${TENANT_A}/deals/meta_99`), { 'source.campaignKey': 'meta_2' }))
  })
  it('ninguém apaga o registro de conversão enviada', async () => {
    await assertFails(updateDoc(doc(dono(), `users/${TENANT_A}/deals/meta_99`), { conversionsSent: deleteField() }))
  })

  // Não pode regredir: o card que veio de anúncio continua andando pelo funil e sendo
  // editado como qualquer outro.
  it('atendente arrasta o card de anúncio entre etapas', async () => {
    await assertSucceeds(updateDoc(doc(atendente(), `users/${TENANT_A}/deals/meta_99`), {
      columnId: 'contato', order: 3, 'reachedAt.contato': new Date(),
    }))
  })
  it('atendente edita valor e nome do card de anúncio', async () => {
    await assertSucceeds(updateDoc(doc(atendente(), `users/${TENANT_A}/deals/meta_99`), {
      company: 'Empresa certa', contact: 'Ana', value: 5000, initials: 'A', tag: 'Ads', contactId: '',
    }))
  })
})
