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
