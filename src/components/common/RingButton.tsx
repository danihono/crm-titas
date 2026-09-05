import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, CSSProperties } from 'react'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Raio da borda do botão (px). */
  radius?: number
  /** Estado selecionado — hoje só some com o hover; a cor vem do call site. */
  active?: boolean
  /** Ocupa 100% da largura do contêiner. */
  block?: boolean
  /** Estilo do wrapper externo. */
  wrapStyle?: CSSProperties
}

/**
 * Botão do sistema.
 *
 * Antes envolvia o botão num anel roxo giratório (o mesmo efeito da aba ativa
 * do menu). O anel saiu: em 24 botões ele virou ruído, e "selecionado" agora é
 * a pílula roxa clara — um padrão só, no menu, nas abas e nos chips.
 *
 * O componente continua existindo com a MESMA API porque os 24 call sites
 * passam estilo próprio por cima; trocar todos por <button> daria um diff
 * enorme para o mesmo resultado. O que sobrou do efeito é a elevação discreta
 * no hover (.btn-lift, em src/index.css).
 */
const RingButton = forwardRef<HTMLButtonElement, Props>(function RingButton(
  { radius = 11, active: _active, block = false, wrapStyle, style, className, children, ...rest },
  ref,
) {
  return (
    <span
      style={{
        display: block ? 'flex' : 'inline-flex',
        borderRadius: radius,
        ...(block ? { width: '100%' } : null),
        ...wrapStyle,
      }}
    >
      <button
        ref={ref}
        className={className ? `btn-lift ${className}` : 'btn-lift'}
        style={{ borderRadius: radius, ...(block ? { width: '100%' } : null), ...style }}
        {...rest}
      >
        {children}
      </button>
    </span>
  )
})

export default RingButton
