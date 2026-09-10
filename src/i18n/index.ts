import { useMemo } from 'react'
import { useLocaleStore, type Idioma } from '../store/localeStore'
import { CATALOGO } from './catalogo'

/**
 * Tradução da interface — pt-BR, espanhol e inglês.
 *
 * Sem biblioteca de propósito: o projeto tem dez dependências, todas
 * insubstituíveis, e o que se precisa aqui cabe em setenta linhas. O que uma
 * biblioteca daria a mais (carregamento sob demanda, ICU MessageFormat, plural
 * de russo) não tem uso num CRM com três idiomas de duas formas de plural cada.
 *
 * O catálogo (src/i18n/catalogo.ts) guarda os três idiomas na mesma linha, e o
 * tipo recusa uma tupla incompleta: tradução esquecida QUEBRA O BUILD, em vez
 * de aparecer como texto em português no meio de uma tela em inglês.
 *
 * POR QUE `t()` PODE SER CHAMADA DIRETO, SEM HOOK: trocar o idioma remonta a
 * árvore inteira, porque `App.tsx` põe uma `key` no RouterProvider. Sem essa
 * `key` o React descartaria a re-renderização das rotas — os elementos são
 * criados em escopo de módulo, então a referência não muda e ele pula o
 * subtree. Como a remontagem é garantida, `t()` ler o store fora do render é
 * seguro, e isso evitou espalhar um hook por 122 arquivos. Quem renderiza fora
 * da árvore do router usa `useT()`.
 */

export type Chave = keyof typeof CATALOGO

const COLUNA: Record<Idioma, 0 | 1 | 2> = { pt: 0, es: 1, en: 2 }

export type Vars = Record<string, string | number>

/** `{nome}` vira o valor. Token sem valor volta como veio — some, não quebra. */
function interpolar(texto: string, vars?: Vars): string {
  if (!vars) return texto
  return texto.replace(/\{(\w+)\}/g, (bruto, nome: string) => {
    const v = vars[nome]
    return v === undefined ? bruto : String(v)
  })
}

function traduzir(idioma: Idioma, chave: Chave, vars?: Vars): string {
  const linha: Tri = CATALOGO[chave]
  // O `|| linha[0]` cobre a tradução deixada em branco de propósito (texto que
  // é igual nos três idiomas ainda não revisado): cai no português em vez de
  // apagar a palavra da tela.
  return interpolar(linha[COLUNA[idioma]] || linha[0], vars)
}

type Tri = readonly [string, string, string]

export function t(chave: Chave, vars?: Vars): string {
  return traduzir(useLocaleStore.getState().idioma, chave, vars)
}

/**
 * Singular ou plural, com `{n}` já disponível na frase.
 *
 * Duas formas bastam: português, espanhol e inglês têm as mesmas duas. Zero
 * conta como plural nos três — "nenhum contato" é frase própria, não plural,
 * e quem precisa dela passa a chave direto.
 */
export function plural(n: number, um: Chave, muitos: Chave, vars?: Vars): string {
  return t(n === 1 ? um : muitos, { n, ...vars })
}

/** Assinatura explícita, para quem renderiza fora da árvore do router. */
export function useT(): (chave: Chave, vars?: Vars) => string {
  const idioma = useLocaleStore((s) => s.idioma)
  return useMemo(() => (chave: Chave, vars?: Vars) => traduzir(idioma, chave, vars), [idioma])
}
