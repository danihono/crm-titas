// Identidade visual que o DONO DO SISTEMA atribui a cada cliente no painel SUPER TITAN
// (nome, cor e logo). É só para ele se localizar na lista — o CRM do cliente não usa nada
// disto. Os campos moram em users/{uid}: brandColor, logoUrl, logoPath.
//
// A matemática de cor mora em lib/color.ts, compartilhada com o Kanban.

import { colorGradient, colorShadow, safeColor } from './color'

export { isHexColor } from './color'

/** Mesma família de cores oferecida em setores/etiquetas (settings/primitives.tsx). */
export const CLIENT_COLORS = [
  '#7a52a0', '#4f7fc0', '#2f9e6f', '#b3801f', '#c14d77', '#5fa9c9', '#cf9b6f', '#6e6780',
]

export const DEFAULT_CLIENT_COLOR = '#7a52a0'

/** Cor do cliente, com o roxo da casa como padrão. */
export function clientColor(v: unknown): string {
  return safeColor(v, DEFAULT_CLIENT_COLOR)
}

/** Gradiente do avatar/botão do cliente. */
export function brandGradient(color: unknown, angle = 150): string {
  return colorGradient(clientColor(color), angle)
}

/** Sombra suave na cor do cliente, para o botão primário do card. */
export function brandShadow(color: unknown): string {
  return colorShadow(clientColor(color))
}
