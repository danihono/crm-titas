/**
 * A tradução dos leads de anúncio, sem Firebase e sem rede.
 *
 * Tudo aqui erra CALADO em produção: um campo com nome inesperado vira card sem telefone
 * (o lead chega e ninguém consegue responder), um id instável vira card duplicado a cada
 * poll, e uma decisão de conversão frouxa manda a mesma venda duas vezes para a Meta —
 * que passa a otimizar a campanha por um número inflado.
 */
import { describe, expect, it } from 'vitest'
import {
  campaignKeyDe, dataGoogle, dealIdDoLead, decidirEnvio, ehGoogleLeadForm, ehPago, hashesPessoais,
  leadUtil, linhaGoogle, linhaMeta, normalizarEmail, normalizarGoogle, normalizarMeta,
  normalizarSite, normalizarTelefone, sha256,
} from '../../functions/src/anuncios/normalizar'
import { cifrar, decifrar, finalDe, hashChave, novaChaveWebhook } from '../../functions/src/anuncios/cofre'

describe('telefone e e-mail', () => {
  it('põe o 55 no número brasileiro digitado sem DDI — senão o WhatsApp nunca casa a conversa', () => {
    expect(normalizarTelefone('(11) 99999-8888')).toBe('5511999998888')
    expect(normalizarTelefone('11 3333-4444')).toBe('551133334444')
    expect(normalizarTelefone('011 99999-8888')).toBe('5511999998888')
  })

  it('mantém o número que já vem com DDI', () => {
    expect(normalizarTelefone('+55 11 99999-8888')).toBe('5511999998888')
    expect(normalizarTelefone('+1 415 555 0100')).toBe('14155550100')
    expect(normalizarTelefone('0044 20 7946 0958')).toBe('442079460958')
  })

  it('descarta lixo em vez de gravar meio número', () => {
    expect(normalizarTelefone('abc')).toBe('')
    expect(normalizarTelefone('123')).toBe('')
  })

  it('e-mail em minúsculo e só se for e-mail', () => {
    expect(normalizarEmail('  Ana@Exemplo.COM ')).toBe('ana@exemplo.com')
    expect(normalizarEmail('ana@')).toBe('')
  })
})

describe('Meta Lead Ads', () => {
  const bruto = {
    id: '123456789',
    created_time: '2026-10-20T14:00:00+0000',
    campaign_id: '2385', campaign_name: 'Black Friday',
    adset_id: '9', adset_name: 'Lookalike', ad_id: '77', ad_name: 'Vídeo 1', form_id: '555',
    field_data: [
      { name: 'full_name', values: ['Ana Souza'] },
      { name: 'email', values: ['ANA@exemplo.com'] },
      { name: 'phone_number', values: ['+5511999998888'] },
      { name: 'company_name', values: ['Souza Ltda'] },
      { name: 'qual_o_seu_orçamento?', values: ['Até R$ 5 mil'] },
    ],
  }

  it('reconhece os campos padrão e guarda o resto como resposta', () => {
    const l = normalizarMeta(bruto)!
    expect(l.name).toBe('Ana Souza')
    expect(l.email).toBe('ana@exemplo.com')
    expect(l.phone).toBe('5511999998888')
    expect(l.company).toBe('Souza Ltda')
    expect(l.fields).toEqual({ 'qual_o_seu_orçamento?': 'Até R$ 5 mil' })
    expect(l.campaignName).toBe('Black Friday')
    expect(l.leadId).toBe('123456789')
    expect(l.createdAt?.toISOString()).toBe('2026-10-20T14:00:00.000Z')
  })

  it('o id do card é o id do lead — o mesmo lead em dois polls não duplica', () => {
    const a = normalizarMeta(bruto)!
    const b = normalizarMeta({ ...bruto, field_data: [] })!
    expect(dealIdDoLead(a)).toBe('meta_123456789')
    expect(dealIdDoLead(a)).toBe(dealIdDoLead(b))
  })

  it('monta o nome a partir de primeiro + último quando não há full_name', () => {
    const l = normalizarMeta({ id: '1', field_data: [{ name: 'first_name', values: ['Ana'] }, { name: 'last_name', values: ['Lima'] }] })!
    expect(l.name).toBe('Ana Lima')
  })

  it('lead sem id não entra', () => {
    expect(normalizarMeta({ field_data: [] })).toBeNull()
  })
})

describe('Google Ads — formulário de lead', () => {
  const corpo = {
    lead_id: 'TeSter-123-ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    api_version: '1.0',
    form_id: 40000000000,
    campaign_id: 20000000000,
    gcl_id: 'TeSter-123-gclid',
    google_key: 'chave',
    is_test: true,
    user_column_data: [
      { column_id: 'FULL_NAME', string_value: 'Bruno Dias', column_name: 'Full Name' },
      { column_id: 'EMAIL', string_value: 'bruno@exemplo.com' },
      { column_id: 'PHONE_NUMBER', string_value: '+5521988887777' },
      { column_id: '123', column_name: 'Qual serviço?', string_value: 'Consultoria' },
    ],
  }

  it('é reconhecido pelo formato do corpo', () => {
    expect(ehGoogleLeadForm(corpo)).toBe(true)
    expect(ehGoogleLeadForm({ nome: 'x' })).toBe(false)
  })

  it('traduz as colunas e guarda o gclid para a conversão offline', () => {
    const l = normalizarGoogle(corpo)!
    expect(l.name).toBe('Bruno Dias')
    expect(l.email).toBe('bruno@exemplo.com')
    expect(l.phone).toBe('5521988887777')
    expect(l.fields).toEqual({ 'Qual serviço?': 'Consultoria' })
    expect(l.gclid).toBe('TeSter-123-gclid')
    expect(l.campaignId).toBe('20000000000')
    expect(l.isTest).toBe(true)
    expect(campaignKeyDe(l)).toBe('google_20000000000')
  })
})

describe('formulário do site', () => {
  it('lê nomes de campo em português e as utm', () => {
    const l = normalizarSite({
      nome: 'Carla', email: 'carla@x.com', telefone: '(31) 98888-7777', empresa: 'Acme',
      mensagem: 'Quero orçamento', utm_source: 'facebook', utm_medium: 'cpc', utm_campaign: 'Verão',
      fbclid: 'IwAR123', page: 'https://site.com/lp', _event_id: 'evt-1',
    })
    expect(l.name).toBe('Carla')
    expect(l.phone).toBe('5531988887777')
    expect(l.company).toBe('Acme')
    expect(l.fields).toEqual({ mensagem: 'Quero orçamento' })
    expect(l.utm).toEqual({ source: 'facebook', medium: 'cpc', campaign: 'Verão' })
    expect(l.fbclid).toBe('IwAR123')
    expect(l.externalId).toBe('evt-1')
    // utm_source=facebook: a campanha é da Meta, mesmo tendo chegado pelo site.
    expect(campaignKeyDe(l)).toBe('meta_utm_ver_o')
    expect(ehPago(l)).toBe(true)
  })

  it('sem _event_id, o duplo clique em Enviar não vira dois cards', () => {
    const t0 = Date.UTC(2026, 9, 1, 12, 0)
    const a = normalizarSite({ nome: 'Davi', email: 'd@x.com' }, t0)
    const b = normalizarSite({ nome: 'Davi', email: 'd@x.com' }, t0 + 5_000)
    expect(a.externalId).toBe(b.externalId)
  })

  it('não confunde campo de controle com resposta', () => {
    const l = normalizarSite({ nome: 'E', _hp: '', k: 'chave', gclid: 'g1' })
    expect(l.fields).toEqual({})
    expect(l.gclid).toBe('g1')
  })

  it('orgânico é Inbound, e lead vazio não serve', () => {
    expect(ehPago(normalizarSite({ nome: 'F', utm_source: 'newsletter', utm_medium: 'email' }))).toBe(false)
    expect(leadUtil(normalizarSite({ mensagem: 'oi' }))).toBe(false)
  })

  it('corta campo gigante — o webhook é público', () => {
    const l = normalizarSite({ nome: 'x'.repeat(5000) })
    expect(l.name.length).toBeLessThanOrEqual(120)
  })
})

describe('métricas', () => {
  it('Meta: não soma lead e lead_grouped (é o mesmo lead contado duas vezes)', () => {
    const l = linhaMeta({
      campaign_id: '1', campaign_name: 'C', date_start: '2026-10-01',
      impressions: '1000', clicks: '50', spend: '123.45',
      actions: [{ action_type: 'lead', value: '7' }, { action_type: 'onsite_conversion.lead_grouped', value: '7' }],
    })!
    expect(l).toMatchObject({ campaignKey: 'meta_1', impressions: 1000, clicks: 50, spend: 123.45, platformLeads: 7 })
  })

  it('Google: custo vem em micros', () => {
    const l = linhaGoogle({
      campaign: { id: '99', name: 'Search' }, segments: { date: '2026-10-02' },
      metrics: { impressions: '10', clicks: '3', costMicros: '12345678', conversions: 2 },
    })!
    expect(l.spend).toBe(12.35)
    expect(l.campaignKey).toBe('google_99')
  })

  it('linha sem data válida é descartada', () => {
    expect(linhaMeta({ campaign_id: '1', date_start: 'ontem' })).toBeNull()
  })
})

describe('conversões de volta', () => {
  const cfg = { ativo: true, etapas: { qualificado: { meta: 'QualifiedLead' }, ganho: { meta: 'Purchase', google: '42' } } }
  const deMeta = { boardId: 'leads', source: { channel: 'meta' as const, leadId: '1' } }

  it('envia na primeira chegada a uma etapa mapeada', () => {
    expect(decidirEnvio({ columnId: 'contato' }, { ...deMeta, columnId: 'qualificado' }, cfg))
      .toEqual({ etapa: 'qualificado', meta: 'QualifiedLead' })
  })

  it('não reenvia a etapa que já foi enviada (voltar e avançar de novo)', () => {
    expect(decidirEnvio({ columnId: 'proposta' }, { ...deMeta, columnId: 'qualificado', conversionsSent: { qualificado: {} } }, cfg)).toBeNull()
  })

  it('não envia sem troca de coluna, desligado, fora do quadro Leads ou card manual', () => {
    expect(decidirEnvio({ columnId: 'ganho' }, { ...deMeta, columnId: 'ganho' }, cfg)).toBeNull()
    expect(decidirEnvio({ columnId: 'x' }, { ...deMeta, columnId: 'ganho' }, { ...cfg, ativo: false })).toBeNull()
    expect(decidirEnvio({ columnId: 'x' }, { ...deMeta, boardId: 'outro', columnId: 'ganho' }, cfg)).toBeNull()
    expect(decidirEnvio({ columnId: 'x' }, { boardId: 'leads', columnId: 'ganho' }, cfg)).toBeNull()
  })

  it('Google só com gclid', () => {
    expect(decidirEnvio({ columnId: 'x' }, { ...deMeta, columnId: 'ganho' }, cfg)).toEqual({ etapa: 'ganho', meta: 'Purchase' })
    expect(decidirEnvio({ columnId: 'x' }, { boardId: 'leads', columnId: 'ganho', source: { channel: 'google', gclid: 'g' } }, cfg))
      .toEqual({ etapa: 'ganho', google: '42' })
  })

  it('hash no formato da CAPI', () => {
    expect(hashesPessoais('Ana@X.com', '55 11 9999')).toEqual({ em: sha256('ana@x.com'), ph: sha256('55119999') })
  })

  it('data do Google com o fuso do cliente', () => {
    expect(dataGoogle(new Date('2026-10-20T15:04:05Z'), 'America/Sao_Paulo')).toBe('2026-10-20 12:04:05-03:00')
    expect(dataGoogle(new Date('2026-10-20T15:04:05Z'), 'UTC')).toBe('2026-10-20 15:04:05+00:00')
  })
})

describe('cofre', () => {
  const chave = 'uma-chave-de-teste-bem-comprida-123'

  it('cifra e decifra ida e volta', () => {
    const pacote = cifrar('EAAG-token-secreto', chave)
    expect(pacote).not.toContain('EAAG')
    expect(decifrar(pacote, chave)).toBe('EAAG-token-secreto')
  })

  it('chave errada não abre — e não devolve lixo calado', () => {
    const pacote = cifrar('segredo', chave)
    expect(() => decifrar(pacote, 'outra-chave-tambem-comprida-456')).toThrow()
  })

  it('a tela só vê o final do token', () => {
    expect(finalDe('EAAGabcdefgh1234')).toBe('1234')
    expect(finalDe('curto')).toBe('')
  })

  it('chave de webhook nova a cada vez, e o índice guarda só o hash', () => {
    const a = novaChaveWebhook()
    expect(a).not.toBe(novaChaveWebhook())
    expect(hashChave(a)).toMatch(/^[0-9a-f]{64}$/)
  })
})
