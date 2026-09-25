import type { ReactNode } from 'react'
import { C, FONT_DISPLAY, sx } from '../../styles/sx'

/**
 * Título da tela, dentro do conteúdo.
 *
 * Em dois tons: a primeira linha diz o que é a tela, em tinta; a segunda, no
 * mesmo corpo e em cinza, diz o que ela resolve. É uma frase só, lida de uma
 * vez — por isso o ponto final no título e a segunda linha curta. A etiqueta em
 * pílula acima (`eyebrow`) é opcional e carrega contexto: a data, uma contagem.
 */
export default function PageHeader({ title, subtitle, eyebrow, right }: {
  title: string
  subtitle?: string
  eyebrow?: ReactNode
  right?: ReactNode
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', padding: '22px 30px 4px' }}>
      <div style={{ minWidth: 0 }}>
        {eyebrow && <span style={{ ...sx.eyebrow, marginBottom: 12 }}>{eyebrow}</span>}
        <h1 style={{
          fontFamily: FONT_DISPLAY, fontWeight: 500, color: C.ink, margin: 0,
          fontSize: 'clamp(26px, 2.6vw, 34px)', lineHeight: 1.1, letterSpacing: '-0.035em',
          textWrap: 'balance',
        } as React.CSSProperties}>
          {title.endsWith('.') ? title : `${title}.`}
          {subtitle && <span style={{ display: 'block', color: C.headlineDim }}>{subtitle}</span>}
        </h1>
      </div>
      {right}
    </div>
  )
}
