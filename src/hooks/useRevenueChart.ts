// Porta revChart() do protótipo — série mockada na v1 (até existir histórico real).
export interface RevChart {
  line: string
  area: string
  lastX: number
  lastY: number
}

export function revenueChart(): RevChart {
  const vals = [120, 135, 128, 150, 162, 158, 175, 190, 185, 205, 225, 284]
  const w = 560, h = 150, pad = 14, n = vals.length
  const max = Math.max(...vals), min = Math.min(...vals)
  const pts = vals.map((v, i) => {
    const x = (i / (n - 1)) * w
    const y = h - ((v - min) / (max - min)) * (h - pad * 2) - pad
    return [x, y] as const
  })
  const line = 'M' + pts.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L ')
  const area = line + ` L ${w} ${h} L 0 ${h} Z`
  return { line, area, lastX: pts[n - 1][0], lastY: pts[n - 1][1] }
}
