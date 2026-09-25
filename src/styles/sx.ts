import type { CSSProperties } from 'react'

// Tokens visuais reutilizáveis. Base neutra (off-white, branco, quase preto) e
// o roxo da marca como único acento — ver o topo de src/index.css.

/**
 * Hexes LITERAIS da marca.
 *
 * Use `BRAND` — e nunca `C` — em três situações, todas fora do alcance do CSS
 * da página:
 *   1. matemática de cor (`shade`, `colorGradient` em src/lib/color.ts), que
 *      faz parse do hex: `shade('var(--c-purple)', .28)` cai calado em #000000
 *      via safeColor(v,'#000000') e o mapa de calor vira uma grade preta;
 *   2. o que é serializado para fora do documento (canvas, SVG do svgToPng,
 *      ARGB do ExcelJS) — lá `var()` resolve para nada;
 *   3. valores gravados no Firestore.
 *
 * Para pintar elemento na tela, o certo é `C`.
 */
export const BRAND = {
  ink: '#141416',
  sub: '#6f6f75',
  muted: '#9a9aa0',
  faint: '#a9a9ae',
  line: '#ebeae6',
  lineSoft: '#eeede9',
  panel: '#f6f5f2',
  field: '#f7f6f3',
  fieldBorder: '#e4e3de',
  purple: '#7a52a0',
  purpleDeep: '#553578',
  purpleSoft: '#9a6fb8',
  green: '#2f9e6f',
  amber: '#b3801f',
  rose: '#c14d77',
  blue: '#4f7fc0',
  darkA: '#0d0a11',
  darkB: '#0a070d',
} as const

/**
 * Paleta da TELA — cada valor é uma variável CSS declarada em src/index.css,
 * que troca sozinha entre o tema claro e o escuro. Estilo inline lê `var()`
 * normalmente, então nenhum call site precisou mudar quando o tema entrou.
 */
export const C = {
  // texto
  ink: 'var(--c-ink)',
  sub: 'var(--c-sub)',
  muted: 'var(--c-muted)',
  faint: 'var(--c-faint)',
  strong: 'var(--c-strong)',
  /** A segunda linha, cinza, dos títulos em dois tons. */
  headlineDim: 'var(--c-headline-dim)',
  onAccent: 'var(--c-on-accent)',
  onInverse: 'var(--c-on-inverse)',

  // bordas
  line: 'var(--c-line)',
  lineSoft: 'var(--c-line-soft)',
  lineHair: 'var(--c-line-hair)',
  fieldBorder: 'var(--c-field-border)',
  divider: 'var(--c-divider)',

  // superfícies
  panel: 'var(--c-page)',
  surface: 'var(--c-surface)',
  raised: 'var(--c-raised)',
  surfaceAlt: 'var(--c-surface-alt)',
  field: 'var(--c-field)',
  column: 'var(--c-column)',
  chatBg: 'var(--c-chat-bg)',
  featured: 'var(--c-featured)',
  featuredBorder: 'var(--c-featured-border)',
  /** Fundo escuro no claro, claro no escuro — botão "Novo quadro", tooltip. */
  inverse: 'var(--c-inverse)',

  // acentos
  purple: 'var(--c-purple)',
  purpleDeep: 'var(--c-purple-deep)',
  purpleSoft: 'var(--c-purple-soft)',
  /** Roxo CHEIO para fundo com texto branco (botão, item selecionado). */
  purpleSolid: 'var(--c-purple-solid)',
  green: 'var(--c-green)',
  greenDeep: 'var(--c-green-deep)',
  waGreen: 'var(--c-wa-green)',
  amber: 'var(--c-amber)',
  amberDeep: 'var(--c-amber-deep)',
  rose: 'var(--c-rose)',
  roseDeep: 'var(--c-rose-deep)',
  blue: 'var(--c-blue)',

  // tintas translúcidas
  tintPurple: 'var(--c-tint-purple)',
  tintPurpleStrong: 'var(--c-tint-purple-strong)',
  tintPurpleWeak: 'var(--c-tint-purple-weak)',
  tintGreen: 'var(--c-tint-green)',
  tintAmber: 'var(--c-tint-amber)',
  tintRose: 'var(--c-tint-rose)',
  tintBlue: 'var(--c-tint-blue)',
  tintNeutral: 'var(--c-tint-neutral)',
  /** A tinta do SELECIONADO — menu, aba, chip. Um padrão só no sistema todo. */
  sel: 'var(--c-sel)',
  selBorder: 'var(--c-sel-border)',

  // cromagem (menu lateral e topo) — a própria página, nos dois temas
  darkA: 'var(--c-chrome-sidebar)',
  darkB: 'var(--c-chrome-topbar)',
  chromeInk: 'var(--c-chrome-ink)',
  chromeDim: 'var(--c-chrome-dim)',
  chromeLabel: 'var(--c-chrome-label)',
  chromeHairline: 'var(--c-chrome-hairline)',
  chromeFill: 'var(--c-chrome-fill)',
  chromeHover: 'var(--c-chrome-hover)',
  chromeBorder: 'var(--c-chrome-border)',
  chromePop: 'var(--c-chrome-pop)',
  chromeSel: 'var(--c-chrome-sel)',
  chromeSelInk: 'var(--c-chrome-sel-ink)',
  chromeSelBar: 'var(--c-chrome-sel-bar)',
}

export const primaryGradient = 'var(--c-purple-grad)'
export const purpleAvatar = 'var(--c-avatar-grad)'

/** Texto do app (Geist, com o sistema de reserva). */
export const FONT_UI = 'var(--font-ui)'
/** Títulos (Geist). Use com peso 500 e tracking negativo — ver `sx.serif`. */
export const FONT_DISPLAY = 'var(--font-display)'
/** Números de painel (Geist Mono, algarismos de mesma largura). */
export const FONT_MONO = 'var(--font-mono)'
/** A serif da logo (Maharlika) — SÓ para a palavra TITÃS e o monograma. Peso único 400. */
export const FONT_BRAND = 'var(--font-brand)'

const card: CSSProperties = {
  background: C.surface,
  border: `1px solid ${C.lineHair}`,
  borderRadius: 18,
  boxShadow: 'var(--c-shadow-card)',
}

const btnPrimary: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  // Roxo LISO, sem degradê: é o botão principal, e é o roxo que diz isso.
  background: C.purpleSolid,
  border: '1px solid transparent',
  borderRadius: 11,
  padding: '9px 16px',
  // Texto sobre roxo: claro nos DOIS temas, por isso não é C.ink invertido.
  color: C.onAccent,
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  boxShadow: 'var(--c-shadow-purple)',
}

const btnGhost: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  background: C.surface,
  border: `1px solid ${C.line}`,
  borderRadius: 11,
  padding: '9px 14px',
  color: C.ink,
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  boxShadow: 'var(--c-shadow-sm)',
}

const input: CSSProperties = {
  width: '100%',
  background: C.field,
  border: `1px solid ${C.fieldBorder}`,
  borderRadius: 10,
  padding: '11px 13px',
  color: C.ink,
  fontSize: 13.5,
  outline: 'none',
}

const label: CSSProperties = {
  fontSize: 12,
  color: C.sub,
  fontWeight: 600,
}

const modalOverlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'var(--c-overlay)',
  backdropFilter: 'blur(4px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 50,
}

const modalBox: CSSProperties = {
  width: 480,
  background: C.surface,
  border: `1px solid ${C.line}`,
  borderRadius: 20,
  padding: '26px 28px',
  boxShadow: 'var(--c-shadow-modal)',
}

/**
 * Estilo de título: Geist em peso 500 com tracking negativo.
 *
 * O nome ficou `serif` por histórico — era a Maharlika. Trocar o nome mexeria
 * em todo modal do app sem mudar nada na tela; a letra da marca agora é
 * `FONT_BRAND`, usada só no logo.
 */
const serif: CSSProperties = {
  fontFamily: FONT_DISPLAY,
  fontWeight: 500,
  letterSpacing: '-0.025em',
}

/**
 * Etiqueta em pílula acima de um título: data, contagem, estado. Caixa alta
 * pequena, com tracking — contexto sem disputar com o título.
 */
const eyebrow: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: '.09em',
  textTransform: 'uppercase',
  color: C.muted,
  background: C.surface,
  border: `1px solid ${C.line}`,
  borderRadius: 999,
  padding: '4px 10px',
  lineHeight: 1.4,
}

export const sx = { card, btnPrimary, btnGhost, input, label, modalOverlay, modalBox, serif, eyebrow }
