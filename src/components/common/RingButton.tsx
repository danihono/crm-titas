import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, CSSProperties } from 'react'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Raio da borda do botão (px) — o anel acompanha esse raio. */
  radius?: number
  /** Anel sempre girando (para abas/chips selecionados). */
  active?: boolean
  /** Anel só aparece no hover (abas/chips não selecionados). */
  quiet?: boolean
  /** Ocupa 100% da largura do contêiner. */
  block?: boolean
  /** Estilo do wrapper externo. */
  wrapStyle?: CSSProperties
}

/**
 * Envolve um botão com o anel roxo giratório (mesmo efeito da aba ativa da
 * sidebar) como borda animada. O anel acende no hover; com `active` fica
 * sempre girando. Repassa todos os props/estilo ao <button> interno.
 */
const RingButton = forwardRef<HTMLButtonElement, Props>(function RingButton(
  { radius = 11, active = false, quiet = false, block = false, wrapStyle, style, className, children, ...rest },
  ref,
) {
  return (
    <span
      className={`ring-btn${active ? ' is-active' : ''}${quiet ? ' ring-quiet' : ''}`}
      style={{
        ['--rr' as string]: `${radius}px`,
        ...(block ? { display: 'flex', width: '100%' } : null),
        ...wrapStyle,
      }}
    >
      <span className="ring-btn__glow" aria-hidden />
      <span className="ring-btn__anim" aria-hidden />
      <button
        ref={ref}
        className={className}
        style={{ borderRadius: radius, ...(block ? { width: '100%' } : null), ...style }}
        {...rest}
      >
        {children}
      </button>
    </span>
  )
})

export default RingButton
