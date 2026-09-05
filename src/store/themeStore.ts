import { create } from 'zustand'

export type ThemeMode = 'light' | 'dark' | 'system'
export type Resolved = 'light' | 'dark'

const KEY = 'titas.theme'

/**
 * Tema claro/escuro.
 *
 * Vive num store separado do uiStore de propósito: o uiStore é 100% efêmero
 * (modal aberto, aba ativa) e não persiste nada. Misturar persistência ali
 * contamina um arquivo que hoje é trivial.
 *
 * A FONTE DE VERDADE PARA PINTAR é o localStorage, não o doc do usuário no
 * Firestore: o tema precisa valer na tela de login — antes de existir usuário —
 * e não pode piscar branco esperando o snapshot chegar. O Firestore é só o
 * espelho, para o tema seguir a pessoa de um dispositivo para o outro
 * (ver src/hooks/useProfile.ts).
 */

/** localStorage LANÇA no Safari privado. Mesma cautela de ExportModal.tsx. */
function ler(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    /* modo privado: cai no padrão */
  }
  return 'system'
}

function gravar(mode: ThemeMode): void {
  try {
    localStorage.setItem(KEY, mode)
  } catch {
    /* sem persistência, mas a sessão continua com o tema escolhido */
  }
}

export function prefereEscuro(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function resolver(mode: ThemeMode): Resolved {
  if (mode === 'system') return prefereEscuro() ? 'dark' : 'light'
  return mode
}

/** Escreve no <html>. É o mesmo que o script anti-flash do index.html faz. */
function aplicar(resolved: Resolved): void {
  const html = document.documentElement
  if (resolved === 'dark') html.setAttribute('data-theme', 'dark')
  else html.removeAttribute('data-theme')
  html.style.colorScheme = resolved
}

interface ThemeState {
  mode: ThemeMode
  resolved: Resolved
  setMode: (m: ThemeMode) => void
  /** Claro ⇄ escuro direto, para o par sol/lua do topo. */
  toggle: () => void
  /** Adota o tema salvo no perfil — só num dispositivo que ainda não escolheu. */
  adotarDoPerfil: (m: ThemeMode) => void
}

const inicial = ler()

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: inicial,
  resolved: resolver(inicial),
  setMode: (mode) => {
    const resolved = resolver(mode)
    aplicar(resolved)
    gravar(mode)
    set({ mode, resolved })
  },
  toggle: () => get().setMode(get().resolved === 'dark' ? 'light' : 'dark'),
  adotarDoPerfil: (mode) => {
    // Só quando o dispositivo ainda não tem escolha própria. Sem essa assimetria,
    // duas abas com preferências diferentes ficam se sobrescrevendo a cada
    // snapshot do Firestore.
    let temLocal = false
    try {
      temLocal = localStorage.getItem(KEY) !== null
    } catch {
      temLocal = false
    }
    if (temLocal || mode === get().mode) return
    const resolved = resolver(mode)
    aplicar(resolved)
    set({ mode, resolved })
  },
}))

/** Segue o SO enquanto o modo for 'system'. Chamado uma vez, no App. */
export function ouvirSistema(): () => void {
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const onChange = () => {
    const { mode, setMode } = useThemeStore.getState()
    if (mode === 'system') setMode('system')
  }
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

/** Açúcar para componentes que precisam decidir cor no JS (gráficos, chips). */
export function useIsDark(): boolean {
  return useThemeStore((s) => s.resolved === 'dark')
}
