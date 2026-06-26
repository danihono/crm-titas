import type { CSSProperties } from 'react'

interface Props {
  name: string
  size?: number
  color?: string
  style?: CSSProperties
  className?: string
  onClick?: (e: React.MouseEvent<HTMLSpanElement>) => void
}

/** Ícone Material Symbols Rounded (classe .ms). Porta o `<span class="ms">` do protótipo. */
export default function MaterialIcon({ name, size = 20, color, style, className, onClick }: Props) {
  return (
    <span
      className={'ms' + (className ? ' ' + className : '')}
      onClick={onClick}
      style={{ fontSize: size, color, ...style }}
    >
      {name}
    </span>
  )
}
