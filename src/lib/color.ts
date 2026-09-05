// Utilitários de cor compartilhados: normalização de hex, clarear/escurecer e gradiente.
// Vivem aqui, e não em clientBrand.ts, porque tanto o painel SUPER TITAN quanto o Kanban
// (cor do quadro e da etapa) precisam da mesma matemática.

const HEX = /^#[0-9a-fA-F]{6}$/

export function isHexColor(v: unknown): v is string {
  return typeof v === 'string' && HEX.test(v)
}

/** Normaliza o que veio do Firestore (ou de um input) para um hex utilizável. */
export function safeColor(v: unknown, fallback: string): string {
  return isHexColor(v) ? v.toLowerCase() : fallback
}

/** Clareia (pct > 0) ou escurece (pct < 0) um hex. pct em -1..1. */
export function shade(hex: string, pct: number): string {
  const h = safeColor(hex, '#000000').slice(1)
  const to = pct < 0 ? 0 : 255
  const p = Math.abs(pct)
  const ch = (i: number) => {
    const v = parseInt(h.slice(i, i + 2), 16)
    return Math.round(v + (to - v) * p).toString(16).padStart(2, '0')
  }
  return `#${ch(0)}${ch(2)}${ch(4)}`
}

/** Gradiente a partir de uma cor só — mesma inclinação do purpleAvatar original. */
export function colorGradient(color: string, angle = 150): string {
  return `linear-gradient(${angle}deg,${shade(color, 0.28)},${shade(color, -0.3)})`
}

/** Sombra suave na própria cor, para botões coloridos. */
export function colorShadow(color: string): string {
  return `0 8px 20px ${safeColor(color, '#000000')}4d`
}

/** Alfa como sufixo hex de 8 dígitos — o mesmo truque de `t.color + '1f'`. */
export function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
  return safeColor(hex, '#000000') + a.toString(16).padStart(2, '0')
}

/** Trio (texto, fundo, borda) de um chip pintado com cor escolhida pelo usuário. */
export interface ChipColors {
  fg: string
  bg: string
  border: string
}

/**
 * Cor de banco (Tag.color, Column.color, ActType.color…) legível na superfície
 * do tema atual.
 *
 * No CLARO devolve exatamente o que o código já fazia — a cor crua com os
 * sufixos '1f'/'3a' —, byte a byte, para o tema claro não mudar de aparência.
 *
 * No ESCURO clareia a cor: os hexes gravados foram escolhidos olhando fundo
 * branco, e tom médio sobre #191320 fica ilegível. E a tinta engorda, porque
 * 12% de qualquer cor sobre o card escuro é indistinguível do próprio card.
 */
export function chipColors(hex: string, dark: boolean): ChipColors {
  const c = safeColor(hex, '#7a52a0')
  if (!dark) return { fg: c, bg: c + '1f', border: c + '3a' }
  const claro = shade(c, 0.42)
  return { fg: claro, bg: withAlpha(claro, 0.2), border: withAlpha(claro, 0.34) }
}
