import type { DayPoint, ReportRow } from '../../lib/reportData'

/**
 * Paleta dos gráficos.
 *
 * A ordem NÃO é decorativa: na ordem original da marca (roxo, azul, verde, âmbar, rosa)
 * o par roxo↔azul reprova na separação de cores — ΔE 12.6 em visão normal, abaixo do
 * mínimo 15, ou seja, nem quem enxerga todas as cores distingue os dois lado a lado.
 * Nesta ordem os cinco checks passam. Ao mexer aqui, revalidar antes de commitar.
 */
export const CHART_COLORS = ['#7a52a0', '#2f9e6f', '#b3801f', '#4f7fc0', '#c14d77']

/** Hue único para magnitude — comparação de tamanho é trabalho de escala, não de identidade. */
const MAGNITUDE = '#7a52a0'
const SURFACE = '#ffffff'
const GRID = '#e6e3ee'
const INK = '#1d1726'
const MUTED = '#9c95a8'
const SUB = '#6e6780'

const LABEL = { fontFamily: "'Manrope',sans-serif", fontWeight: 700 }

/** Retângulo com a ponta do dado arredondada e a base quadrada (barra horizontal). */
function barPath(x0: number, y: number, x1: number, h: number, r = 4): string {
  const w = x1 - x0
  if (w <= r) return `M${x0},${y} H${x1} V${y + h} H${x0} Z`
  return [
    `M${x0},${y}`,
    `H${x1 - r}`,
    `A${r},${r} 0 0 1 ${x1},${y + r}`,
    `V${y + h - r}`,
    `A${r},${r} 0 0 1 ${x1 - r},${y + h}`,
    `H${x0}`,
    'Z',
  ].join(' ')
}

/**
 * Conversas por dia. Série única — sem legenda de propósito: uma caixa com um único
 * quadradinho só repete o título e come espaço.
 */
export function TrendArea({ points, width = 720, height = 190 }: {
  points: DayPoint[]
  width?: number
  height?: number
}) {
  if (points.length === 0) return <EmptyPlot width={width} height={height} />

  const padL = 34
  const padR = 46
  const padT = 18
  const padB = 26
  const plotW = width - padL - padR
  const plotH = height - padT - padB

  const max = Math.max(1, ...points.map((p) => p.total))
  const stepX = points.length > 1 ? plotW / (points.length - 1) : 0
  const xOf = (i: number) => padL + (points.length > 1 ? i * stepX : plotW / 2)
  const yOf = (v: number) => padT + plotH - (v / max) * plotH

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(i)},${yOf(p.total)}`).join(' ')
  const area = `${line} L${xOf(points.length - 1)},${padT + plotH} L${xOf(0)},${padT + plotH} Z`

  const peakIdx = points.reduce((best, p, i) => (p.total > points[best].total ? i : best), 0)
  const lastIdx = points.length - 1
  // Rotula só o pico e o fim. Número em cima de todo ponto vira ruído e ninguém lê.
  const labelled = peakIdx === lastIdx ? [lastIdx] : [peakIdx, lastIdx]

  // Poucas datas no eixo: com 90 dias, um rótulo por dia viraria uma tarja preta.
  const tickIdx = points.length <= 8
    ? points.map((_, i) => i)
    : [0, Math.floor(lastIdx / 2), lastIdx]

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img"
      aria-label={`Conversas por dia, máximo de ${max}`}>
      {[0, 0.5, 1].map((t) => (
        <line key={t} x1={padL} x2={padL + plotW} y1={padT + plotH * t} y2={padT + plotH * t}
          stroke={GRID} strokeWidth={1} />
      ))}
      <text x={padL - 8} y={padT + 4} textAnchor="end" fontSize={10} fill={MUTED} style={LABEL}>{max}</text>
      <text x={padL - 8} y={padT + plotH + 4} textAnchor="end" fontSize={10} fill={MUTED} style={LABEL}>0</text>

      <path d={area} fill={MAGNITUDE} opacity={0.1} />
      <path d={line} fill="none" stroke={MAGNITUDE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

      {labelled.map((i) => (
        <g key={i}>
          <circle cx={xOf(i)} cy={yOf(points[i].total)} r={4.5} fill={MAGNITUDE} stroke={SURFACE} strokeWidth={2} />
          <text x={xOf(i)} y={yOf(points[i].total) - 10} textAnchor="middle" fontSize={11} fill={INK} style={LABEL}>
            {points[i].total}
          </text>
        </g>
      ))}

      {tickIdx.map((i) => (
        <text key={i} x={xOf(i)} y={height - 8} textAnchor={i === 0 ? 'start' : i === lastIdx ? 'end' : 'middle'}
          fontSize={10} fill={MUTED} style={LABEL}>
          {points[i].label}
        </text>
      ))}
    </svg>
  )
}

/**
 * Ranking por atendente / setor / etiqueta.
 *
 * Barras num hue só; a cor da entidade entra como PONTO ao lado do rótulo. Texto nunca
 * veste a cor do dado — uma etiqueta amarela clara é ilegível como texto, e a identidade
 * fica na marca colorida ao lado, não na palavra.
 */
export function RankedBars({ rows, width = 720, barH = 18, gap = 14 }: {
  rows: ReportRow[]
  width?: number
  barH?: number
  gap?: number
}) {
  if (rows.length === 0) return null

  const labelW = 168
  const valueW = 44
  const plotW = width - labelW - valueW
  const max = Math.max(1, ...rows.map((r) => r.total))
  const height = rows.length * (barH + gap)

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img"
      aria-label="Conversas por linha, ordenado do maior para o menor">
      {rows.map((r, i) => {
        const y = i * (barH + gap)
        const w = (r.total / max) * plotW
        return (
          <g key={r.key}>
            <circle cx={5} cy={y + barH / 2} r={4.5} fill={r.color} />
            <text x={17} y={y + barH / 2 + 4} fontSize={11.5} fill={SUB} style={LABEL}>
              {r.label.length > 24 ? `${r.label.slice(0, 23)}…` : r.label}
            </text>
            <rect x={labelW} y={y} width={plotW} height={barH} fill={GRID} opacity={0.35} rx={4} />
            <path d={barPath(labelW, y, labelW + Math.max(w, 2), barH)} fill={MAGNITUDE} />
            <text x={labelW + plotW + 8} y={y + barH / 2 + 4} fontSize={11.5} fill={INK} style={LABEL}>
              {r.total}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/**
 * Distribuição da fila agora — parte-do-todo em barra empilhada.
 * Os segmentos são separados por 2px na cor da superfície: é o vão que separa, nunca
 * um contorno (contorno adiciona tinta que não é dado).
 */
export function StatusStack({ fila, atendimento, esperando, width = 720 }: {
  fila: number
  atendimento: number
  esperando: number
  width?: number
}) {
  const segs = [
    { key: 'atendimento', label: 'Em atendimento', value: atendimento, color: '#2f9e6f' },
    { key: 'esperando', label: 'Esperando cliente', value: esperando, color: '#b3801f' },
    { key: 'fila', label: 'Na fila', value: fila, color: '#4f7fc0' },
  ]
  const total = segs.reduce((a, s) => a + s.value, 0)
  const h = 26

  if (total === 0) {
    return <div style={{ fontSize: 12.5, color: MUTED, padding: '10px 0' }}>Nenhuma conversa aberta no momento.</div>
  }

  let x = 0
  const placed = segs.filter((s) => s.value > 0).map((s) => {
    const w = (s.value / total) * width
    const seg = { ...s, x, w }
    x += w
    return seg
  })

  return (
    <div>
      <svg width={width} height={h} viewBox={`0 0 ${width} ${h}`} role="img"
        aria-label={`Fila atual: ${segs.map((s) => `${s.label} ${s.value}`).join(', ')}`}>
        {placed.map((s, i) => {
          const gapAfter = i < placed.length - 1 ? 2 : 0
          const w = Math.max(s.w - gapAfter, 1)
          // Só rotula dentro quando o texto CABE com folga; senão a legenda carrega.
          const fits = w > 34
          return (
            <g key={s.key}>
              <rect x={s.x} y={0} width={w} height={h} fill={s.color} rx={4} />
              {fits && (
                <text x={s.x + w / 2} y={h / 2 + 4} textAnchor="middle" fontSize={11.5} fill="#ffffff" style={LABEL}>
                  {s.value}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 10 }}>
        {segs.map((s) => (
          <span key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: SUB, fontWeight: 600 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: s.color }} />
            {s.label}
            <b style={{ color: INK }}>{s.value}</b>
          </span>
        ))}
      </div>
    </div>
  )
}

function EmptyPlot({ width, height }: { width: number; height: number }) {
  return (
    <div style={{ width, height, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, color: MUTED }}>
      Sem conversas no período.
    </div>
  )
}
