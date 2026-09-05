import type { CSSProperties } from 'react'

interface Props {
  name: string
  size?: number
  color?: string
  style?: CSSProperties
  className?: string
  /** Dica ao passar o mouse (o `title` nativo) — usado nos ícones de informação. */
  title?: string
  onClick?: (e: React.MouseEvent<HTMLSpanElement>) => void
}

/** Ícone Material Symbols Rounded (classe .ms). Porta o `<span class="ms">` do protótipo. */
export default function MaterialIcon({ name, size = 20, color, style, className, title, onClick }: Props) {
  return (
    <span
      className={'ms' + (className ? ' ' + className : '')}
      onClick={onClick}
      title={title}
      style={{ fontSize: size, color, ...style }}
    >
      {name}
    </span>
  )
}
