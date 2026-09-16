import { create } from 'zustand'
import type { Idioma } from '../types'

export type { Idioma }

const KEY = 'titas.locale'

/** O que vai no atributo lang do <html> — o mesmo mapa do script do index.html. */
const HTML_LANG: Record<Idioma, string> = { pt: 'pt-BR', es: 'es', en: 'en' }

/**
 * Idioma da interface.
 *
 * Vive num store separado, ao lado do themeStore e pelo mesmo motivo: o uiStore
 * é 100% efêmero e não persiste nada.
 *
 * A FONTE DA VERDADE É O localStorage, não o doc do usuário no Firestore: o
 * idioma precisa valer na tela de login — antes de existir usuário — e não pode
 * mostrar a tela em português por um instante esperando o snapshot chegar. O
 * Firestore é só o espelho, para o idioma seguir a pessoa de um dispositivo
 * para o outro (ver src/hooks/useProfile.ts).
 *
 * Dispositivo que nunca escolheu segue o navegador. A detecção NÃO é gravada de
 * propósito: enquanto não houver escolha explícita, o idioma da conta ainda pode
 * semear este aparelho (adotarDoPerfil). Gravar o palpite fecharia essa porta.
 */

export function ehIdioma(v: unknown): v is Idioma {
  return v === 'pt' || v === 'es' || v === 'en'
}

/** Idioma do navegador, quando é um dos três. 'pt-PT' e 'es-AR' contam. */
function doNavegador(): Idioma {
  if (typeof navigator === 'undefined') return 'pt'
  for (const tag of navigator.languages ?? [navigator.language]) {
    const base = String(tag).slice(0, 2).toLowerCase()
    if (ehIdioma(base)) return base
  }
  return 'pt'
}

/** localStorage LANÇA no Safari privado. Mesma cautela do themeStore. */
function ler(): Idioma {
  try {
    const v = localStorage.getItem(KEY)
    if (ehIdioma(v)) return v
  } catch {
    /* modo privado: cai na detecção */
  }
  return doNavegador()
}

function gravar(idioma: Idioma): void {
  try {
    localStorage.setItem(KEY, idioma)
  } catch {
    /* sem persistência, mas a sessão continua no idioma escolhido */
  }
}

/** Escreve no <html>. É o mesmo que o script do index.html faz antes da pintura. */
function aplicar(idioma: Idioma): void {
  // O guarda é para o teste unitário, que roda em node: sem ele, exercitar a
  // troca de idioma fora do navegador quebraria numa linha que é cosmética.
  if (typeof document === 'undefined') return
  document.documentElement.lang = HTML_LANG[idioma]
}

interface LocaleState {
  idioma: Idioma
  setIdioma: (i: Idioma) => void
  /** Adota o idioma salvo no perfil — só num dispositivo que ainda não escolheu. */
  adotarDoPerfil: (i: Idioma) => void
}

const inicial = ler()

export const useLocaleStore = create<LocaleState>((set, get) => ({
  idioma: inicial,
  setIdioma: (idioma) => {
    aplicar(idioma)
    gravar(idioma)
    set({ idioma })
  },
  adotarDoPerfil: (idioma) => {
    // Só quando o dispositivo ainda não tem escolha própria. Sem essa assimetria,
    // duas abas com preferências diferentes ficam se sobrescrevendo a cada
    // snapshot do Firestore.
    let temLocal = false
    try {
      temLocal = localStorage.getItem(KEY) !== null
    } catch {
      temLocal = false
    }
    if (temLocal || idioma === get().idioma) return
    aplicar(idioma)
    set({ idioma })
  },
}))

/**
 * O idioma para quem NÃO é componente React.
 *
 * As funções de formatação (src/lib/format.ts) são puras e chamadas de todo
 * lado, inclusive fora de render. Ler o store direto evita ter que passar o
 * idioma por 40 assinaturas.
 */
export function idiomaAtual(): Idioma {
  return useLocaleStore.getState().idioma
}

/** Tag BCP-47 para Intl e localeCompare. */
export function tagIntl(idioma: Idioma = idiomaAtual()): string {
  return HTML_LANG[idioma]
}
