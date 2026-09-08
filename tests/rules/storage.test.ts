/**
 * Regras do Cloud Storage, exercitadas nos emuladores.
 *
 * O ponto mais importante daqui: `storage.rules` consulta o Firestore para
 * saber quem é membro, então o emulador do Firestore precisa estar de pé com
 * o mesmo projeto — é o que `firebase emulators:exec` garante.
 */
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage'
import {
  criarAmbiente, semearDados, semearArquivo, comoUsuario, comoVisitante, PNG,
  TENANT_A, TENANT_B, UID_GESTOR, UID_ATENDENTE, UID_BLOQUEADO, UID_ESTRANHO, UID_DONO_SISTEMA,
  EMAIL_DONO_A, EMAIL_GESTOR, EMAIL_ATENDENTE, EMAIL_BLOQUEADO, EMAIL_ESTRANHO, EMAIL_DONO_SISTEMA,
} from './helpers'

let env: RulesTestEnvironment

beforeAll(async () => { env = await criarAmbiente() })
afterAll(async () => { await env?.cleanup() })
beforeEach(async () => {
  await env.clearFirestore()
  await env.clearStorage()
  await semearDados(env)
  await semearArquivo(env, `users/${TENANT_A}/contacts/c1/whatsapp/m1_foto.jpg`, 'image/jpeg')
  await semearArquivo(env, `users/${TENANT_A}/brand/logo.png`, 'image/png')
  await semearArquivo(env, `users/${TENANT_B}/contacts/c1/whatsapp/m1_foto.jpg`, 'image/jpeg')
})

const dono = () => comoUsuario(env, TENANT_A, EMAIL_DONO_A).storage()
const gestor = () => comoUsuario(env, UID_GESTOR, EMAIL_GESTOR).storage()
const atendente = () => comoUsuario(env, UID_ATENDENTE, EMAIL_ATENDENTE).storage()
const bloqueado = () => comoUsuario(env, UID_BLOQUEADO, EMAIL_BLOQUEADO).storage()
const estranho = () => comoUsuario(env, UID_ESTRANHO, EMAIL_ESTRANHO).storage()
const donoSistema = () => comoUsuario(env, UID_DONO_SISTEMA, EMAIL_DONO_SISTEMA).storage()
const visitante = () => comoVisitante(env).storage()

const MIDIA = `users/${TENANT_A}/contacts/c1/whatsapp/m1_foto.jpg`
const MIDIA_B = `users/${TENANT_B}/contacts/c1/whatsapp/m1_foto.jpg`

describe('acesso sem autenticação', () => {
  it('não baixa mídia de conversa', async () => {
    await assertFails(getBytes(ref(visitante(), MIDIA)))
  })
  it('não sobe arquivo', async () => {
    await assertFails(uploadBytes(ref(visitante(), `users/${TENANT_A}/contacts/c1/whatsapp/x.png`), PNG))
  })
})

describe('isolamento entre tenants', () => {
  it('atendente do A não baixa arquivo do B', async () => {
    await assertFails(getBytes(ref(atendente(), MIDIA_B)))
  })
  it('atendente do A não sobe arquivo no B', async () => {
    await assertFails(uploadBytes(ref(atendente(), `users/${TENANT_B}/contacts/c1/whatsapp/x.png`), PNG))
  })
  it('estranho não alcança nada', async () => {
    await assertFails(getBytes(ref(estranho(), MIDIA)))
  })
})

describe('C5 — membro desativado perde o Storage junto com o Firestore', () => {
  it('não baixa mais', async () => {
    await assertFails(getBytes(ref(bloqueado(), MIDIA)))
  })
  it('não sobe mais', async () => {
    await assertFails(uploadBytes(ref(bloqueado(), `users/${TENANT_A}/contacts/c1/whatsapp/novo.png`), PNG))
  })
  it('não sobrescreve arquivo existente', async () => {
    await assertFails(uploadBytes(ref(bloqueado(), MIDIA), PNG))
  })
  it('não apaga arquivo', async () => {
    await assertFails(deleteObject(ref(bloqueado(), MIDIA)))
  })
})

describe('exclusão de arquivo por papel', () => {
  it('atendente NÃO apaga mídia da conversa', async () => {
    await assertFails(deleteObject(ref(atendente(), MIDIA)))
  })
  it('gestor apaga (não pode regredir)', async () => {
    await assertSucceeds(deleteObject(ref(gestor(), MIDIA)))
  })
})

describe('M10 — validação do upload', () => {
  const alvo = (n: string) => `users/${TENANT_A}/contacts/c1/whatsapp/${n}`

  it('recusa HTML disfarçado', async () => {
    await assertFails(uploadBytes(ref(atendente(), alvo('pagina.html')), PNG, { contentType: 'text/html' }))
  })
  it('recusa SVG (vetor de script)', async () => {
    await assertFails(uploadBytes(ref(atendente(), alvo('x.svg')), PNG, { contentType: 'image/svg+xml' }))
  })
  it('recusa executável', async () => {
    await assertFails(uploadBytes(ref(atendente(), alvo('x.exe')), PNG, { contentType: 'application/x-msdownload' }))
  })
  it('recusa arquivo sem contentType declarado', async () => {
    await assertFails(uploadBytes(ref(atendente(), alvo('x.bin')), PNG, { contentType: 'application/octet-stream' }))
  })
  it('aceita imagem, PDF e áudio (não pode regredir)', async () => {
    await assertSucceeds(uploadBytes(ref(atendente(), alvo('foto.png')), PNG, { contentType: 'image/png' }))
    await assertSucceeds(uploadBytes(ref(atendente(), alvo('doc.pdf')), PNG, { contentType: 'application/pdf' }))
    await assertSucceeds(uploadBytes(ref(atendente(), alvo('audio.ogg')), PNG, { contentType: 'audio/ogg' }))
  })
  it('foto de perfil só aceita imagem', async () => {
    const p = `users/${TENANT_A}/contacts/c1/profile/foto`
    await assertSucceeds(uploadBytes(ref(atendente(), p), PNG, { contentType: 'image/jpeg' }))
    await assertFails(uploadBytes(ref(atendente(), `${p}2`), PNG, { contentType: 'application/pdf' }))
  })
})

describe('pasta de marca (SUPER TITAN)', () => {
  it('dono do sistema grava a logo (não pode regredir)', async () => {
    await assertSucceeds(uploadBytes(ref(donoSistema(), `users/${TENANT_A}/brand/logo2.png`), PNG, { contentType: 'image/png' }))
  })
  it('dono do sistema NÃO alcança a mídia da conversa', async () => {
    await assertFails(getBytes(ref(donoSistema(), MIDIA)))
  })
  it('dono do sistema NÃO sobe nada fora de brand/', async () => {
    await assertFails(uploadBytes(ref(donoSistema(), `users/${TENANT_A}/contacts/c1/whatsapp/x.png`), PNG, { contentType: 'image/png' }))
  })
  it('o titular lê a própria logo (não pode regredir)', async () => {
    await assertSucceeds(getBytes(ref(dono(), `users/${TENANT_A}/brand/logo.png`)))
  })
  it('atendente não substitui a logo', async () => {
    await assertFails(uploadBytes(ref(atendente(), `users/${TENANT_A}/brand/logo.png`), PNG, { contentType: 'image/png' }))
  })
})

describe('uso legítimo não pode regredir', () => {
  it('atendente baixa a mídia da conversa', async () => {
    await assertSucceeds(getBytes(ref(atendente(), MIDIA)))
  })
  it('atendente envia anexo', async () => {
    await assertSucceeds(uploadBytes(
      ref(atendente(), `users/${TENANT_A}/contacts/c1/outgoing/${Date.now()}_a.png`), PNG, { contentType: 'image/png' },
    ))
  })
  it('dono do ambiente alimenta a biblioteca de mídias', async () => {
    await assertSucceeds(uploadBytes(ref(dono(), `users/${TENANT_A}/library/x.png`), PNG, { contentType: 'image/png' }))
  })
})
