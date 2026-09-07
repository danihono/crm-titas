import { useEffect, useRef, useState } from 'react'

/**
 * A largura de um elemento, acompanhando o redimensionamento.
 *
 * Os gráficos de Relatórios recebem `width` como número e desenham o SVG nessa
 * medida — no painel de widgets isso não serve: a pessoa escolhe quantas colunas
 * o bloco ocupa, e um `width` fixo cortaria os rótulos de valor. Esticar o SVG
 * por `preserveAspectRatio` resolveria a largura mas deformaria o texto junto.
 * Medir e repassar mantém a tipografia no tamanho certo em qualquer largura.
 */
export function useElementWidth<T extends HTMLElement>(padrao = 600): [React.RefObject<T>, number] {
  const ref = useRef<T>(null)
  const [largura, setLargura] = useState(padrao)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entrada]) => {
      const w = Math.round(entrada.contentRect.width)
      // Zero acontece enquanto o elemento está oculto; manter o valor anterior
      // evita o gráfico piscar em largura 0 ao trocar de aba.
      if (w > 0) setLargura(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return [ref, largura]
}
