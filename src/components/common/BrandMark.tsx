/**
 * Marca dos Titãs desenhada inline — SVG no documento imprime em vetor. Um <img> apontando
 * para arquivo externo às vezes é omitido pelo navegador na impressão.
 *
 * `id` do gradiente é parametrizável porque dois documentos na mesma página com o mesmo id
 * fariam um deles pintar com o gradiente do outro.
 */

/**
 * Contorno do "T" da Maharlika, o mesmo desenho de public/favicon.svg.
 *
 * É contorno e não <text fontFamily="Maharlika"> de propósito: esta marca sai na
 * IMPRESSÃO, e depender do carregamento de uma webfont no momento em que o
 * navegador monta o PDF é justamente onde a letra volta a ser a do sistema sem
 * ninguém perceber. O caminho não depende de fonte nenhuma.
 *
 * Extraído do glifo T de public/fonts/Maharlika-Regular.woff2 (unitsPerEm 1000,
 * capitular 729, tinta em x 20→720).
 */
const T_PATH =
  'M20 540 53 729H687L720 540H707Q698 590 679.0 624.0Q660 658 633.0 678.5Q606 699 572.0 707.5Q538 716 497 716H425V67Q425 32 442.0 22.5Q459 13 495 13V0H246V13Q282 13 298.5 22.5Q315 32 315 67V716H242Q202 716 168.0 707.5Q134 699 107.0 678.5Q80 658 61.0 624.0Q42 590 33 540Z'

export default function BrandMark({ size = 40, gradientId = 'titas-mark' }: {
  size?: number
  gradientId?: string
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-label="Titãs CRM">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9a6fb8" />
          <stop offset="1" stopColor="#5a3a7e" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${gradientId})`} />
      {/* O scale negativo em Y inverte o eixo: na fonte o Y sobe, no SVG ele desce. */}
      <g transform="translate(14.74 49) scale(0.04664 -0.04664)">
        <path d={T_PATH} fill="#ffffff" />
      </g>
    </svg>
  )
}
