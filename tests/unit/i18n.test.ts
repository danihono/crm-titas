/**
 * Os três idiomas, sem navegador e sem Firebase.
 *
 * O que se testa aqui é o que erraria CALADO em produção. Um texto que sai em
 * português numa tela em inglês é feio e alguém reclama; estes quatro assuntos
 * não geram reclamação nenhuma, geram dado errado:
 *
 *  1. ler o valor digitado no campo de dinheiro (em inglês, "12,000.00" virava
 *     doze — um negócio de doze mil gravado como doze, sem erro no console);
 *  2. idioma torto gravado no perfil (build antiga, edição na mão) deixando a
 *     tela sem texto em vez de cair no português;
 *  3. traduzir o que a pessoa escreveu — apagar a palavra dela é pior do que
 *     não traduzir nada;
 *  4. a moeda mudar de país junto com o idioma.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { useLocaleStore } from '../../src/store/localeStore'
import { plural, t } from '../../src/i18n'
import { lerNumero, separadorDecimal } from '../../src/i18n/formato'
import { ehPlaceholderMidia, fmtBRL, fmtMoney, mediaLabel, parseValueBR, placeholderMidia } from '../../src/lib/format'
import { rotuloStatusNota, rotuloTipoAtividade, tituloEtapa } from '../../src/i18n/sistema'
import { prefsFromDoc } from '../../src/lib/converters'
import type { Idioma } from '../../src/types'

const IDIOMAS: Idioma[] = ['pt', 'es', 'en']

function em(idioma: Idioma): void {
  useLocaleStore.getState().setIdioma(idioma)
}

beforeEach(() => em('pt'))

describe('o valor que a pessoa digita no campo de dinheiro', () => {
  it('lê o formato do idioma em que ela está vendo o campo', () => {
    em('pt')
    expect(parseValueBR('12.000,50')).toBe(12000.5)
    em('es')
    expect(parseValueBR('12.000,50')).toBe(12000.5)
    em('en')
    expect(parseValueBR('12,000.50')).toBe(12000.5)
  })

  it('NÃO lê 12,000.00 como doze', () => {
    // O defeito que esta suíte existe para impedir: a versão antiga tirava todo
    // ponto e trocava vírgula por ponto, então em inglês o negócio de doze mil
    // era gravado como doze — calado, sem erro em lugar nenhum.
    em('en')
    expect(lerNumero('12,000.00')).toBe(12000)
    expect(lerNumero('1,234,567')).toBe(1234567)
  })

  it('número já numérico passa direto, em qualquer idioma', () => {
    for (const i of IDIOMAS) {
      em(i)
      expect(parseValueBR(4200)).toBe(4200)
    }
  })

  it('campo vazio ou lixo vale zero em vez de NaN', () => {
    for (const i of IDIOMAS) {
      em(i)
      expect(parseValueBR('')).toBe(0)
      expect(parseValueBR('   ')).toBe(0)
      expect(parseValueBR('abc')).toBe(0)
    }
  })

  it('o separador decimal de cada idioma é o que se espera', () => {
    expect(separadorDecimal('pt')).toBe(',')
    expect(separadorDecimal('es')).toBe(',')
    expect(separadorDecimal('en')).toBe('.')
  })

  it('o que sai do campo volta a entrar nele', () => {
    // Ida e volta: formatar e reler tem de dar o mesmo número, senão editar uma
    // nota já salva muda o valor dela sozinho.
    for (const i of IDIOMAS) {
      em(i)
      expect(parseValueBR(fmtMoney(284500))).toBe(284500)
    }
  })
})

describe('a moeda', () => {
  it('continua em real nos três idiomas — o dinheiro é do negócio, não de quem lê', () => {
    for (const i of IDIOMAS) {
      em(i)
      expect(fmtBRL(12000)).toContain('R$')
    }
  })

  it('só o separador segue o idioma', () => {
    em('pt')
    expect(fmtBRL(12000)).toBe('R$ 12.000')
    em('en')
    expect(fmtBRL(12000)).toBe('R$ 12,000')
  })
})

describe('idioma gravado no perfil', () => {
  it('inválido cai no português em vez de deixar a tela sem texto', () => {
    expect(prefsFromDoc({ idioma: 'jp' }).idioma).toBe('pt')
    expect(prefsFromDoc({ idioma: 42 }).idioma).toBe('pt')
    expect(prefsFromDoc({}).idioma).toBe('pt')
    expect(prefsFromDoc(undefined).idioma).toBe('pt')
  })

  it('válido é respeitado', () => {
    expect(prefsFromDoc({ idioma: 'es' }).idioma).toBe('es')
    expect(prefsFromDoc({ idioma: 'en' }).idioma).toBe('en')
  })

  it('gravar o idioma não apaga as outras preferências', () => {
    // `prefsFromDoc` reconstrói o objeto do zero; um campo esquecido some em
    // silêncio, e o tema voltaria ao padrão quando a pessoa trocasse de idioma.
    const p = prefsFromDoc({ idioma: 'en', theme: 'dark', notifySound: false })
    expect(p.theme).toBe('dark')
    expect(p.notifySound).toBe(false)
    expect(p.idioma).toBe('en')
  })
})

describe('plural', () => {
  it('zero e dois usam a forma plural; um usa a singular', () => {
    em('pt')
    expect(plural(1, 'diretorio.contato_1', 'diretorio.contato_n')).toBe(' contato')
    expect(plural(2, 'contatos.naoLida_1', 'contatos.naoLida_n')).toBe('2 mensagens não lidas')
    expect(plural(0, 'contatos.naoLida_1', 'contatos.naoLida_n')).toBe('0 mensagens não lidas')
    expect(plural(1, 'contatos.naoLida_1', 'contatos.naoLida_n')).toBe('1 mensagem não lida')
  })

  it('vale nos três idiomas', () => {
    em('es')
    expect(plural(2, 'contatos.naoLida_1', 'contatos.naoLida_n')).toBe('2 mensajes sin leer')
    em('en')
    expect(plural(1, 'contatos.naoLida_1', 'contatos.naoLida_n')).toBe('1 unread message')
    expect(plural(3, 'contatos.naoLida_1', 'contatos.naoLida_n')).toBe('3 unread messages')
  })
})

describe('a fronteira entre o que o sistema escreveu e o que a pessoa escreveu', () => {
  const qualificado = { id: 'qualificado', title: 'Qualificado', color: '#000', order: 2 }

  it('a etapa do quadro Leads é do sistema e traduz', () => {
    em('en')
    expect(tituloEtapa('leads', qualificado)).toBe('Qualified')
    em('es')
    expect(tituloEtapa('leads', qualificado)).toBe('Cualificado')
  })

  it('a MESMA palavra num quadro que a pessoa criou NÃO traduz', () => {
    // O quadro Leads é travado — ninguém escreveu aqueles nomes. Em qualquer
    // outro quadro o título é dela, e traduzi-lo apagaria a palavra dela.
    em('en')
    expect(tituloEtapa('meu-funil', qualificado)).toBe('Qualificado')
  })

  it('quadro criado em inglês nasce com etapas em inglês — e elas ficam', () => {
    // `addBoard` semeia as três etapas com estas chaves, no idioma ativo na hora
    // de criar. Esse é o único instante em que o sistema sabe em que língua a
    // pessoa está trabalhando sem adivinhar.
    em('en')
    const semeadas = [t('sistema.etapaAFazer'), t('sistema.etapaEmAndamento'), t('sistema.etapaConcluido')]
    expect(semeadas).toEqual(['To do', 'In progress', 'Done'])

    // Gravadas, viraram texto DELA. Voltar a tela para português não as traduz
    // de volta: o quadro não é o Leads, e ela pode ter renomeado qualquer uma.
    em('pt')
    const aFazer = { id: 'c1', title: 'To do', color: '#000', order: 0 }
    expect(tituloEtapa('meu-quadro', aFazer)).toBe('To do')
  })

  it('etapa com id desconhecido no Leads sai como está', () => {
    em('en')
    expect(tituloEtapa('leads', { ...qualificado, id: 'inventado' })).toBe('Qualificado')
  })

  it('o tipo de atividade semeado traduz', () => {
    em('en')
    expect(rotuloTipoAtividade({ id: 'call', label: 'Ligação' })).toBe('Call')
  })

  it('o tipo de atividade RENOMEADO pela pessoa não é traduzido de volta', () => {
    em('en')
    expect(rotuloTipoAtividade({ id: 'call', label: 'Prospecção ativa' })).toBe('Prospecção ativa')
  })

  it('tipo criado pela pessoa sai como ela escreveu', () => {
    em('en')
    expect(rotuloTipoAtividade({ id: 'aB3xY', label: 'Visita técnica' })).toBe('Visita técnica')
  })

  it('o status da nota traduz na tela mas o valor gravado não muda', () => {
    em('en')
    expect(rotuloStatusNota('Vencida')).toBe('Overdue')
    em('pt')
    expect(rotuloStatusNota('Vencida')).toBe('Vencida')
  })
})

describe('interpolação', () => {
  it('troca {nome} pelo valor', () => {
    em('pt')
    expect(t('combo.usar', { nome: 'Ana' })).toBe('Usar “Ana”')
  })

  it('token sem valor volta como veio, em vez de virar "undefined"', () => {
    em('pt')
    expect(t('combo.usar')).toBe('Usar “{nome}”')
  })
})

describe('o marcador de mídia gravado no histórico', () => {
  it('é sempre o canônico em português, em qualquer idioma', () => {
    // Este texto vai PARA o Firestore quando o CRM cria a mensagem sozinho, e é
    // o mesmo que o daemon grava na ingestão. Traduzi-lo deixaria o histórico
    // com marcadores em três idiomas, misturados por quem estava com qual tela
    // aberta — e a comparação de baixo passaria a falhar fora do português.
    for (const i of IDIOMAS) {
      em(i)
      expect(placeholderMidia('image')).toBe('[imagem]')
      expect(placeholderMidia('audio')).toBe('[áudio]')
    }
  })

  it('o rótulo DE TELA segue o idioma, e é outro', () => {
    em('en')
    expect(mediaLabel('image')).toBe('[image]')
    expect(placeholderMidia('image')).toBe('[imagem]')
  })

  it('reconhece o marcador gravado mesmo com a tela em outro idioma', () => {
    // O defeito que isto impede: com a tela em inglês, a legenda seria comparada
    // com '[image]', nunca casaria, e a tela repetiria "[imagem]" embaixo da
    // própria imagem.
    em('en')
    expect(ehPlaceholderMidia('[imagem]')).toBe(true)
    expect(ehPlaceholderMidia('Olha essa foto')).toBe(false)
  })
})
