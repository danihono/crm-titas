/**
 * Marca dos Titãs desenhada inline — SVG no documento imprime em vetor. Um <img> apontando
 * para arquivo externo às vezes é omitido pelo navegador na impressão.
 *
 * `id` do gradiente é parametrizável porque dois documentos na mesma página com o mesmo id
 * fariam um deles pintar com o gradiente do outro.
 */
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
      <text x="32" y="44" fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" fontSize="40"
        fontWeight="600" textAnchor="middle" fill="#ffffff">T</text>
    </svg>
  )
}
