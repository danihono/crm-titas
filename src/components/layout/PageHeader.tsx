import type { ReactNode } from 'react'
import { C, FONT_DISPLAY } from '../../styles/sx'

/**
 * Título da tela, dentro do conteúdo.
 *
 * O topo da aplicação deixou de carregar o nome da tela (ele agora só tem busca,
 * tema, configurações e perfil). Sem isto, as telas que não têm cabeçalho próprio
 * ficariam sem rótulo nenhum.
 */
export default function PageHeader({ title, subtitle, right }: {
  title: string
  subtitle?: string
  right?: ReactNode
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, padding: '28px 30px 0' }}>
      <div style={{ minWidth: 0 }}>
        <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: 27, fontWeight: 700, letterSpacing: '-0.025em', color: C.ink, margin: 0, lineHeight: 1.15 }}>
          {title}
        </h1>
        {subtitle && (
          <div style={{ fontSize: 13, color: C.sub, marginTop: 5, lineHeight: 1.5 }}>{subtitle}</div>
        )}
      </div>
      {right}
    </div>
  )
}
