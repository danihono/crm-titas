/**
 * Regras do Firestore, exercitadas nos emuladores.
 *
 * Todo teste afirma o comportamento DESEJADO. Os que cobrem um achado da
 * auditoria reprovam antes da correção — a reprovação É a evidência.
 * Os blocos "não pode regredir" existem para o inverso: provar que o aperto
 * das regras não tirou de ninguém o que a pessoa legitimamente precisa fazer.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import {
  addDoc, collection, collectionGroup, deleteDoc, doc, getDoc, getDocs,
  query, serverTimestamp, setDoc, updateDoc, where,
} from 'firebase/firestore'
import {
  criarAmbiente, semearDados, comoUsuario, comoVisitante,
  TENANT_A, TENANT_B, UID_GESTOR, UID_ATENDENTE, UID_BLOQUEADO, UID_ESTRANHO, UID_DONO_SISTEMA,
  EMAIL_DONO_A, EMAIL_GESTOR, EMAIL_ATENDENTE, EMAIL_BLOQUEADO, EMAIL_ESTRANHO, EMAIL_DONO_SISTEMA,
} from './helpers'

let env: RulesTestEnvironment

beforeAll(async () => { env = await criarAmbiente() })
afterAll(async () => { await env?.cleanup() })
beforeEach(async () => {
  await env.clearFirestore()
  await semearDados(env)
})

const dono = () => comoUsuario(env, TENANT_A, EMAIL_DONO_A).firestore()
const gestor = () => comoUsuario(env, UID_GESTOR, EMAIL_GESTOR).firestore()
const atendente = () => comoUsuario(env, UID_ATENDENTE, EMAIL_ATENDENTE).firestore()
const bloqueado = () => comoUsuario(env, UID_BLOQUEADO, EMAIL_BLOQUEADO).firestore()
const estranho = () => comoUsuario(env, UID_ESTRANHO, EMAIL_ESTRANHO).firestore()
const donoSistema = () => comoUsuario(env, UID_DONO_SISTEMA, EMAIL_DONO_SISTEMA).firestore()
const visitante = () => comoVisitante(env).firestore()

describe('acesso sem autenticação', () => {
  it('não lê o doc do tenant', async () => {
    await assertFails(getDoc(doc(visitante(), `users/${TENANT_A}`)))
  })
  it('não lista contatos', async () => {
    await assertFails(getDocs(collection(visitante(), `users/${TENANT_A}/contacts`)))
  })
  it('não lê mensagens por link direto', async () => {
    await assertFails(getDoc(doc(visitante(), `users/${TENANT_A}/contacts/c1/messages/m1`)))
  })
  it('não escreve nada', async () => {
    await assertFails(setDoc(doc(visitante(), `users/${TENANT_A}/contacts/novo`), { name: 'x' }))
  })
  it('não alcança as credenciais do WhatsApp', async () => {
    await assertFails(getDoc(doc(visitante(), `whatsappSessions/${TENANT_A}`)))
  })
})

describe('isolamento entre tenants', () => {
  it('atendente do A não lê o tenant B', async () => {
    await assertFails(getDoc(doc(atendente(), `users/${TENANT_B}`)))
  })
  it('atendente do A não lista contatos do B', async () => {
    await assertFails(getDocs(collection(atendente(), `users/${TENANT_B}/contacts`)))
  })
  it('autenticado sem vínculo não lê nada do A', async () => {
    await assertFails(getDoc(doc(estranho(), `users/${TENANT_A}/contacts/c1`)))
  })
  it('estranho não escreve no A', async () => {
    await assertFails(setDoc(doc(estranho(), `users/${TENANT_A}/deals/x`), { value: 1 }))
  })
  it('ninguém lê as credenciais do Signal, nem o titular', async () => {
    await assertFails(getDoc(doc(dono(), `whatsappSessions/${TENANT_A}`)))
  })
})

describe('membro desativado (conta bloqueada)', () => {
  it('não lê mais os contatos', async () => {
    await assertFails(getDocs(collection(bloqueado(), `users/${TENANT_A}/contacts`)))
  })
  it('não escreve mais', async () => {
    await assertFails(setDoc(doc(bloqueado(), `users/${TENANT_A}/contacts/c2`), { name: 'x' }))
  })
})

describe('C2 — convite exige e-mail verificado', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('invites/convidado@a.com').set({
        email: 'convidado@a.com', tenantUid: TENANT_A, tenantName: 'Empresa A',
        role: 'atendente', sectorIds: [],
      })
    })
  })

  it('com e-mail verificado, o convidado entra', async () => {
    const db = comoUsuario(env, 'novoUid', 'convidado@a.com', true).firestore()
    await assertSucceeds(setDoc(doc(db, `users/${TENANT_A}/members/novoUid`), {
      name: 'Convidado', email: 'convidado@a.com', role: 'atendente',
      sectorIds: [], active: true, createdAt: serverTimestamp(),
    }))
  })

  it('com e-mail NÃO verificado, o convidado é barrado', async () => {
    const db = comoUsuario(env, 'invasor', 'convidado@a.com', false).firestore()
    await assertFails(setDoc(doc(db, `users/${TENANT_A}/members/invasor`), {
      name: 'Invasor', email: 'convidado@a.com', role: 'atendente',
      sectorIds: [], active: true, createdAt: serverTimestamp(),
    }))
  })

  it('o convidado não se promove no aceite', async () => {
    const db = comoUsuario(env, 'novoUid', 'convidado@a.com', true).firestore()
    await assertFails(setDoc(doc(db, `users/${TENANT_A}/members/novoUid`), {
      name: 'Convidado', email: 'convidado@a.com', role: 'dono',
      sectorIds: [], active: true, createdAt: serverTimestamp(),
    }))
  })
})

describe('C4 — gestor não se promove a dono pelo convite', () => {
  it('gestor convida atendente (legítimo)', async () => {
    await assertSucceeds(setDoc(doc(gestor(), 'invites/novo@a.com'), {
      email: 'novo@a.com', tenantUid: TENANT_A, tenantName: 'Empresa A',
      role: 'atendente', sectorIds: [], createdAt: serverTimestamp(),
    }))
  })
  it('gestor NÃO convida ninguém como dono', async () => {
    await assertFails(setDoc(doc(gestor(), 'invites/comparsa@a.com'), {
      email: 'comparsa@a.com', tenantUid: TENANT_A, tenantName: 'Empresa A',
      role: 'dono', sectorIds: [], createdAt: serverTimestamp(),
    }))
  })
  it('o dono do ambiente pode convidar como dono', async () => {
    await assertSucceeds(setDoc(doc(dono(), 'invites/socio@a.com'), {
      email: 'socio@a.com', tenantUid: TENANT_A, tenantName: 'Empresa A',
      role: 'dono', sectorIds: [], createdAt: serverTimestamp(),
    }))
  })
  it('papel inventado é recusado', async () => {
    await assertFails(setDoc(doc(dono(), 'invites/x@a.com'), {
      email: 'x@a.com', tenantUid: TENANT_A, tenantName: 'Empresa A',
      role: 'superadmin', sectorIds: [], createdAt: serverTimestamp(),
    }))
  })
  it('ninguém convida para o tenant alheio', async () => {
    await assertFails(setDoc(doc(gestor(), 'invites/alvo@b.com'), {
      email: 'alvo@b.com', tenantUid: TENANT_B, tenantName: 'Empresa B',
      role: 'dono', sectorIds: [], createdAt: serverTimestamp(),
    }))
  })
})

describe('escalonamento de papel pelo navegador', () => {
  it('atendente não muda o próprio papel', async () => {
    await assertFails(updateDoc(doc(atendente(), `users/${TENANT_A}/members/${UID_ATENDENTE}`), { role: 'dono' }))
  })
  it('atendente não se reativa depois de bloqueado', async () => {
    await assertFails(updateDoc(doc(bloqueado(), `users/${TENANT_A}/members/${UID_BLOQUEADO}`), { active: true }))
  })
  it('atendente não muda o papel de outra pessoa', async () => {
    await assertFails(updateDoc(doc(atendente(), `users/${TENANT_A}/members/${UID_GESTOR}`), { role: 'atendente' }))
  })
  it('gestor não promove ninguém a dono direto no vínculo', async () => {
    await assertFails(updateDoc(doc(gestor(), `users/${TENANT_A}/members/${UID_GESTOR}`), { role: 'dono' }))
  })
  it('atendente ainda edita o próprio nome (não pode regredir)', async () => {
    await assertSucceeds(updateDoc(doc(atendente(), `users/${TENANT_A}/members/${UID_ATENDENTE}`), { name: 'Novo Nome' }))
  })
})

describe('C1 — fila de comandos do WhatsApp', () => {
  // `by` amarra o comando a quem pediu — a regra exige que seja o próprio uid.
  const cmd = (type: string, by: string, args: Record<string, unknown> = {}) => ({
    type, args, by, status: 'pending', attempts: 0,
    createdAt: serverTimestamp(), expireAt: new Date(Date.now() + 3600e3),
  })
  const fila = (tenant: string) => `waCommands/${tenant}/queue`

  it('atendente NÃO enfileira contact.purge', async () => {
    await assertFails(addDoc(collection(atendente(), fila(TENANT_A)), cmd('contact.purge', UID_ATENDENTE, { contactId: 'c1' })))
  })
  it('atendente NÃO enfileira session.disconnect', async () => {
    await assertFails(addDoc(collection(atendente(), fila(TENANT_A)), cmd('session.disconnect', UID_ATENDENTE, { purge: true })))
  })
  it('atendente NÃO define a retenção LGPD', async () => {
    await assertFails(addDoc(collection(atendente(), fila(TENANT_A)), cmd('session.consent', UID_ATENDENTE, { retentionDays: 0 })))
  })
  it('atendente ainda envia mensagem (não pode regredir)', async () => {
    await assertSucceeds(addDoc(collection(atendente(), fila(TENANT_A)), cmd('message.send', UID_ATENDENTE, { contactId: 'c1', text: 'oi' })))
  })
  it('gestor pode purgar', async () => {
    await assertSucceeds(addDoc(collection(gestor(), fila(TENANT_A)), cmd('contact.purge', UID_GESTOR, { contactId: 'c1' })))
  })
  it('tipo de comando inventado é recusado', async () => {
    await assertFails(addDoc(collection(gestor(), fila(TENANT_A)), cmd('shell.exec', UID_GESTOR, { cmd: 'rm -rf' })))
  })
  it('ninguém enfileira na fila de outro tenant', async () => {
    await assertFails(addDoc(collection(gestor(), fila(TENANT_B)), cmd('message.send', UID_GESTOR, { contactId: 'c1', text: 'oi' })))
  })
  it('não dá para enfileirar em nome de outra pessoa', async () => {
    await assertFails(addDoc(collection(atendente(), fila(TENANT_A)), cmd('message.send', UID_GESTOR, { contactId: 'c1', text: 'oi' })))
  })

  // A fila ANTIGA vivia em users/{uid}/waCommands, dentro do `allow write` recursivo:
  // qualquer membro escrevia qualquer comando. Estes testes provam que o caminho velho
  // morreu — sem eles, mover a fila deixaria a porta antiga aberta.
  it('o caminho antigo users/{uid}/waCommands não aceita mais nada', async () => {
    await assertFails(addDoc(collection(atendente(), `users/${TENANT_A}/waCommands`), cmd('contact.purge', UID_ATENDENTE, { contactId: 'c1' })))
    await assertFails(addDoc(collection(gestor(), `users/${TENANT_A}/waCommands`), cmd('message.send', UID_GESTOR, { contactId: 'c1', text: 'oi' })))
    await assertFails(addDoc(collection(dono(), `users/${TENANT_A}/waCommands`), cmd('session.disconnect', TENANT_A, { purge: true })))
  })

  describe('comando já enfileirado', () => {
    beforeEach(async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore().doc(`waCommands/${TENANT_A}/queue/x1`).set(cmd('message.send', UID_GESTOR))
      })
    })
    it('o cliente não marca um comando como concluído', async () => {
      await assertFails(updateDoc(doc(gestor(), `waCommands/${TENANT_A}/queue/x1`), { status: 'done' }))
    })
    it('quem pediu pode cancelar enquanto está pendente (não pode regredir)', async () => {
      await assertSucceeds(updateDoc(doc(gestor(), `waCommands/${TENANT_A}/queue/x1`), { status: 'canceled' }))
    })
    it('membro lê a fila do próprio ambiente (não pode regredir)', async () => {
      await assertSucceeds(getDocs(collection(atendente(), fila(TENANT_A))))
    })
  })
})

describe('M2 — exclusão em massa', () => {
  it('atendente NÃO apaga contato', async () => {
    await assertFails(deleteDoc(doc(atendente(), `users/${TENANT_A}/contacts/c1`)))
  })
  it('atendente NÃO apaga negócio', async () => {
    await assertFails(deleteDoc(doc(atendente(), `users/${TENANT_A}/deals/d1`)))
  })
  it('atendente NÃO apaga quadro', async () => {
    await assertFails(deleteDoc(doc(atendente(), `users/${TENANT_A}/boards/b1`)))
  })
  it('gestor apaga contato (não pode regredir)', async () => {
    await assertSucceeds(deleteDoc(doc(gestor(), `users/${TENANT_A}/contacts/c1`)))
  })
})

describe('M4 — leitura segregada dentro do tenant', () => {
  it('atendente NÃO lê faturamento', async () => {
    await assertFails(getDocs(collection(atendente(), `users/${TENANT_A}/invoices`)))
  })
  it('gestor lê faturamento (não pode regredir)', async () => {
    await assertSucceeds(getDocs(collection(gestor(), `users/${TENANT_A}/invoices`)))
  })
  it('atendente ainda lê a equipe, para atribuir conversa (não pode regredir)', async () => {
    await assertSucceeds(getDocs(collection(atendente(), `users/${TENANT_A}/members`)))
  })
  // Estes três faltavam, e foi por isso que a restrição errada passou: `variables` e
  // `knowledge` são uso diário do atendente, não material sigiloso.
  it('atendente lê as variáveis das respostas rápidas (não pode regredir)', async () => {
    await assertSucceeds(getDocs(collection(atendente(), `users/${TENANT_A}/variables`)))
  })
  it('atendente lê a base de conhecimento que alimenta a IA (não pode regredir)', async () => {
    await assertSucceeds(getDocs(collection(atendente(), `users/${TENANT_A}/knowledge`)))
  })
  it('mas segue sem enxergar faturamento', async () => {
    await assertFails(getDocs(collection(atendente(), `users/${TENANT_A}/invoices`)))
  })

  it('atendente ainda lê contatos e mensagens (não pode regredir)', async () => {
    await assertSucceeds(getDocs(collection(atendente(), `users/${TENANT_A}/contacts`)))
    await assertSucceeds(getDocs(collection(atendente(), `users/${TENANT_A}/contacts/c1/messages`)))
  })
})

describe('M1 — validação dos dados gravados', () => {
  it('não aceita responsável que não é da equipe', async () => {
    await assertFails(updateDoc(doc(atendente(), `users/${TENANT_A}/conversations/cv1`), {
      assignedTo: 'uid-que-nao-existe', assignedName: 'Fantasma',
    }))
  })
  it('aceita responsável que é da equipe (não pode regredir)', async () => {
    await assertSucceeds(updateDoc(doc(atendente(), `users/${TENANT_A}/conversations/cv1`), {
      assignedTo: UID_GESTOR, assignedName: 'Gestor',
    }))
  })
  it('não aceita setor inexistente', async () => {
    await assertFails(updateDoc(doc(atendente(), `users/${TENANT_A}/conversations/cv1`), { sectorId: 'setor-inventado' }))
  })
  it('não aceita status fora da lista', async () => {
    await assertFails(updateDoc(doc(gestor(), `users/${TENANT_A}/invoices/i1`), { status: 'Perdoada' }))
  })
  it('não aceita valor de negócio como texto', async () => {
    await assertFails(updateDoc(doc(atendente(), `users/${TENANT_A}/deals/d1`), { value: 'muito' }))
  })
  it('não aceita campo desconhecido no negócio', async () => {
    await assertFails(updateDoc(doc(atendente(), `users/${TENANT_A}/deals/d1`), { isAdmin: true }))
  })
  it('não deixa reescrever createdAt', async () => {
    await assertFails(updateDoc(doc(atendente(), `users/${TENANT_A}/contacts/c1`), {
      createdAt: new Date('2000-01-01'),
    }))
  })
  it('atendente ainda cria contato e negócio normais (não pode regredir)', async () => {
    await assertSucceeds(addDoc(collection(atendente(), `users/${TENANT_A}/contacts`), {
      name: 'Novo Contato', phone: '11988887777', status: 'contato novo', createdAt: serverTimestamp(),
    }))
    await assertSucceeds(addDoc(collection(atendente(), `users/${TENANT_A}/deals`), {
      company: 'Nova', value: 250, boardId: 'b1', order: 1, createdAt: serverTimestamp(),
    }))
  })
})

describe('M5 — o dono do sistema não enxerga o conteúdo do cliente', () => {
  it('não lista contatos de um cliente', async () => {
    await assertFails(getDocs(collection(donoSistema(), `users/${TENANT_A}/contacts`)))
  })
  it('não lista contatos por consulta de grupo', async () => {
    await assertFails(getDocs(query(collectionGroup(donoSistema(), 'contacts'))))
  })
  it('não lê faturamento de um cliente', async () => {
    await assertFails(getDocs(collection(donoSistema(), `users/${TENANT_A}/invoices`)))
  })
  it('não lê conversas nem mensagens', async () => {
    await assertFails(getDocs(query(collectionGroup(donoSistema(), 'conversations'))))
    await assertFails(getDocs(query(collectionGroup(donoSistema(), 'messages'))))
  })
  it('ainda lista a ficha administrativa dos clientes (não pode regredir)', async () => {
    await assertSucceeds(getDocs(collection(donoSistema(), 'users')))
  })
  it('ainda edita nome, cor e logo (não pode regredir)', async () => {
    await assertSucceeds(updateDoc(doc(donoSistema(), `users/${TENANT_A}`), {
      displayName: 'Empresa A Renomeada', brandColor: '#123456',
    }))
  })
  it('não escreve fora da ficha administrativa', async () => {
    await assertFails(updateDoc(doc(donoSistema(), `users/${TENANT_A}`), { agent: { tom: 'invadido' } }))
  })
  it('não entra no atendimento do cliente', async () => {
    await assertFails(setDoc(doc(donoSistema(), `users/${TENANT_A}/contacts/c9`), { name: 'x' }))
  })
})

describe('configurações do tenant', () => {
  it('gestor NÃO altera setores', async () => {
    await assertFails(setDoc(doc(gestor(), `users/${TENANT_A}/sectors/s2`), { name: 'Novo' }))
  })
  it('dono do ambiente altera setores (não pode regredir)', async () => {
    await assertSucceeds(setDoc(doc(dono(), `users/${TENANT_A}/sectors/s2`), { name: 'Novo' }))
  })
  it('gestor administra a equipe (não pode regredir)', async () => {
    await assertSucceeds(updateDoc(doc(dono(), `users/${TENANT_A}/members/${UID_ATENDENTE}`), { active: false }))
  })
  it('atendente NÃO altera a configuração do agente', async () => {
    await assertFails(updateDoc(doc(atendente(), `users/${TENANT_A}`), { agent: { tom: 'x' } }))
  })
})

describe('convites — leitura e cancelamento', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('invites/convidado@a.com').set({
        email: 'convidado@a.com', tenantUid: TENANT_A, tenantName: 'Empresa A',
        role: 'atendente', sectorIds: [],
      })
    })
  })
  it('a pessoa lê o próprio convite (não pode regredir)', async () => {
    const db = comoUsuario(env, 'novoUid', 'convidado@a.com').firestore()
    await assertSucceeds(getDoc(doc(db, 'invites/convidado@a.com')))
  })
  it('terceiro não lê convite alheio', async () => {
    await assertFails(getDoc(doc(estranho(), 'invites/convidado@a.com')))
  })
  it('gestor lista os convites pendentes do tenant (não pode regredir)', async () => {
    await assertSucceeds(getDocs(query(collection(gestor(), 'invites'), where('tenantUid', '==', TENANT_A))))
  })
  it('gestor cancela convite do próprio tenant (não pode regredir)', async () => {
    await assertSucceeds(deleteDoc(doc(gestor(), 'invites/convidado@a.com')))
  })
})

describe('status do WhatsApp', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`whatsappStatus/${TENANT_A}`).set({ state: 'open', phoneNumber: '5511999990000' })
    })
  })
  it('membro lê o status do próprio ambiente (não pode regredir)', async () => {
    await assertSucceeds(getDoc(doc(atendente(), `whatsappStatus/${TENANT_A}`)))
  })
  it('ninguém escreve o status pelo navegador', async () => {
    await assertFails(setDoc(doc(dono(), `whatsappStatus/${TENANT_A}`), { state: 'open' }))
  })
  it('estranho não lê o status alheio', async () => {
    await assertFails(getDoc(doc(estranho(), `whatsappStatus/${TENANT_A}`)))
  })
})

describe('Assistente — canal do chat', () => {
  // `channel` decide se a Cloud Function responde pelo WhatsApp. Se o cliente puder
  // gravá-lo, qualquer atendente vira um disparador de mensagem (e de chamada paga).
  it('atendente cria mensagem normal no chat (não pode regredir)', async () => {
    await assertSucceeds(
      addDoc(collection(atendente(), `users/${TENANT_A}/agentChat`), { role: 'user', text: 'oi' }),
    )
  })
  it('atendente cria mensagem marcada como app (não pode regredir)', async () => {
    await assertSucceeds(
      addDoc(collection(atendente(), `users/${TENANT_A}/agentChat`), { role: 'user', text: 'oi', channel: 'app' }),
    )
  })
  it('NINGUÉM do lado do cliente forja channel: whatsapp — nem o dono', async () => {
    await assertFails(
      addDoc(collection(dono(), `users/${TENANT_A}/agentChat`), { role: 'user', text: 'oi', channel: 'whatsapp' }),
    )
    await assertFails(
      addDoc(collection(atendente(), `users/${TENANT_A}/agentChat`), { role: 'user', text: 'oi', channel: 'whatsapp' }),
    )
  })
})

describe('Assistente — o número da plataforma', () => {
  it('dono do sistema lê o status/QR do número da Assistente', async () => {
    await assertSucceeds(getDoc(doc(donoSistema(), 'whatsappStatus/_assistente')))
  })
  it('dono de um ambiente NÃO lê o status do número da Assistente', async () => {
    await assertFails(getDoc(doc(dono(), 'whatsappStatus/_assistente')))
    await assertFails(getDoc(doc(atendente(), 'whatsappStatus/_assistente')))
  })
  it('dono do sistema pede a conexão do número', async () => {
    await assertSucceeds(
      addDoc(collection(donoSistema(), 'waCommands/_assistente/queue'), {
        type: 'session.connect', args: {}, status: 'pending', attempts: 0,
        createdAt: serverTimestamp(), expireAt: serverTimestamp(), by: UID_DONO_SISTEMA,
      }),
    )
  })
  it('dono de ambiente NÃO enfileira comando no número da Assistente', async () => {
    await assertFails(
      addDoc(collection(dono(), 'waCommands/_assistente/queue'), {
        type: 'session.connect', args: {}, status: 'pending', attempts: 0,
        createdAt: serverTimestamp(), expireAt: serverTimestamp(), by: TENANT_A,
      }),
    )
  })
  it('nem o dono do sistema manda mensagem avulsa por essa fila', async () => {
    // O que a Assistente envia sai de `assistantOutbox`, montada no servidor.
    await assertFails(
      addDoc(collection(donoSistema(), 'waCommands/_assistente/queue'), {
        type: 'message.send', args: {}, status: 'pending', attempts: 0,
        createdAt: serverTimestamp(), expireAt: serverTimestamp(), by: UID_DONO_SISTEMA,
      }),
    )
  })
})

describe('Assistente — filas do servidor', () => {
  it('a fila de saída é só do Admin SDK: ninguém escreve, e só o dono do sistema lê', async () => {
    await assertFails(getDocs(collection(dono(), 'assistantOutbox')))
    await assertFails(
      addDoc(collection(donoSistema(), 'assistantOutbox'), { tenantUid: TENANT_A, text: 'oi' }),
    )
    await assertSucceeds(getDocs(collection(donoSistema(), 'assistantOutbox')))
  })
  it('o índice telefone → ambiente não é legível por ninguém', async () => {
    // Ele revelaria o telefone do dono de cada ambiente. Nem o dono do sistema lê.
    await assertFails(getDoc(doc(dono(), 'assistantSubscribers/5511999998888')))
    await assertFails(getDoc(doc(donoSistema(), 'assistantSubscribers/5511999998888')))
  })
})
