import type { ReactNode } from 'react'
import { sx } from '../../styles/sx'

/** Overlay + caixa central. Fecha ao clicar no fundo; conteúdo não propaga o clique. */
export default function Modal({ width = 480, onClose, children }: { width?: number; onClose: () => void; children: ReactNode }) {
  return (
    <div onClick={onClose} style={sx.modalOverlay}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...sx.modalBox, width }}>
        {children}
      </div>
    </div>
  )
}
