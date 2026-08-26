// Identidade visual que o DONO DO SISTEMA atribui a cada cliente no painel SUPER TITAN
// (nome, cor e logo). É só para ele se localizar na lista — o CRM do cliente não usa nada
// disto. Os campos moram em users/{uid}: brandColor, logoUrl, logoPath.

/** Mesma família de cores oferecida em setores/etiquetas (settings/primitives.tsx). */
export const CLIENT_COLORS = [
  '#7a52a0', '#4f7fc0', '#2f9e6f', '#b3801f', '#c14d77', '#5fa9c9', '#cf9b6f', '#6e6780',
]

export const DEFAULT_CLIENT_COLOR = '#7a52a0'

const HEX = /^#[0-9a-fA-F]{6}$/

export function isHexColor(v: unknown): v is string {
  return typeof v === 'string' && HEX.test(v)
}

/** Normaliza o que veio do Firestore (ou de um input) para um hex utilizável. */
export function clientColor(v: unknown): string {
  return isHexColor(v) ? (v as string).toLowerCase() : DEFAULT_CLIENT_COLOR
}

/** Clareia (pct > 0) ou escurece (pct < 0) um hex. pct em -1..1. */
export function shade(hex: string, pct: number): string {
  const h = clientColor(hex).slice(1)
  const to = pct < 0 ? 0 : 255
  const p = Math.abs(pct)
  const ch = (i: number) => {
    const v = parseInt(h.slice(i, i + 2), 16)
    return Math.round(v + (to - v) * p).toString(16).padStart(2, '0')
  }
  return `#${ch(0)}${ch(2)}${ch(4)}`
}

/** Gradiente do avatar/botão do cliente — mesma inclinação do purpleAvatar original. */
export function brandGradient(color: unknown, angle = 150): string {
  const c = clientColor(color)
  return `linear-gradient(${angle}deg,${shade(c, 0.28)},${shade(c, -0.3)})`
}

/** Sombra suave na cor do cliente, para o botão primário do card. */
export function brandShadow(color: unknown): string {
  const c = clientColor(color)
  return `0 8px 20px ${c}4d`
}
