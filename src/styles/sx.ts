import type { CSSProperties } from 'react'

// Tokens visuais reutilizáveis extraídos dos estilos inline do protótipo.
// Cores-chave da identidade (roxo/escuro + painéis claros).

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
  ink: '#1d1726',
  sub: '#6e6780',
  muted: '#9c95a8',
  faint: '#a39bb0',
  line: '#ececf3',
  lineSoft: '#eeebf3',
  panel: '#f5f3f8',
  field: '#f7f5fa',
  fieldBorder: '#e6e3ee',
  purple: '#7a52a0',
  purpleDeep: '#553578',
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
  /** Fundo escuro no claro, claro no escuro — botão "Novo quadro", tooltip. */
  inverse: 'var(--c-inverse)',

  // acentos
  purple: 'var(--c-purple)',
  purpleDeep: 'var(--c-purple-deep)',
  purpleSoft: 'var(--c-purple-soft)',
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

  // cromagem (menu lateral e topo) — escura nos dois temas
  darkA: 'var(--c-chrome-sidebar)',
  darkB: 'var(--c-chrome-topbar)',
  chromeInk: 'var(--c-chrome-ink)',
  chromeDim: 'var(--c-chrome-dim)',
  chromeLabel: 'var(--c-chrome-label)',
  chromeHairline: 'var(--c-chrome-hairline)',
  chromeFill: 'var(--c-chrome-fill)',
  chromeBorder: 'var(--c-chrome-border)',
  chromePop: 'var(--c-chrome-pop)',
  chromeSel: 'var(--c-chrome-sel)',
  chromeSelInk: 'var(--c-chrome-sel-ink)',
  chromeSelBar: 'var(--c-chrome-sel-bar)',
}

export const primaryGradient = 'var(--c-purple-grad)'
export const purpleAvatar = 'var(--c-avatar-grad)'

/** Pilha tipográfica do sistema (San Francisco na Apple, equivalente no resto). */
export const FONT_UI = 'var(--font-ui)'
export const FONT_DISPLAY = 'var(--font-display)'

const card: CSSProperties = {
  background: C.surface,
  border: `1px solid ${C.line}`,
  borderRadius: 18,
  boxShadow: 'var(--c-shadow-card)',
}

const btnPrimary: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  background: primaryGradient,
  border: '1px solid rgba(200,160,230,0.3)',
  borderRadius: 11,
  padding: '9px 16px',
  // Texto sobre roxo: claro nos DOIS temas, por isso não é C.ink invertido.
  color: C.onAccent,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  boxShadow: 'var(--c-shadow-purple)',
}

const btnGhost: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  background: C.surface,
  border: `1px solid ${C.fieldBorder}`,
  borderRadius: 11,
  padding: '9px 14px',
  color: C.strong,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  boxShadow: 'var(--c-shadow-sm)',
}

const input: CSSProperties = {
  width: '100%',
  background: C.field,
  border: `1px solid ${C.fieldBorder}`,
  borderRadius: 11,
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
 * Antes era Cormorant Garamond. A marca passou para a tipografia do sistema
 * (San Francisco na Apple): título agora é a MESMA família, com peso e tracking
 * negativo — o jeito Apple de fazer display.
 */
const serif: CSSProperties = {
  fontFamily: FONT_DISPLAY,
  letterSpacing: '-0.02em',
}

export const sx = { card, btnPrimary, btnGhost, input, label, modalOverlay, modalBox, serif }
