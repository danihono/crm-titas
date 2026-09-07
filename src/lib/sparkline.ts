/**
 * Mini gráfico dos cards do painel — funções PURAS, sem React.
 *
 * É a generalização da matemática que `revenueChart` (src/hooks/useRevenueChart.ts)
 * já fazia para a curva de receita: mesma escala ancorada no ZERO — ancorar no
 * menor valor da série empola variação mínima e faz R$ 100 parecer um pico —, o
 * mesmo teto `Math.max(...v, 1)` que impede a divisão virar NaN e sumir com o
 * traço, e os mesmos caminhos `line`/`area` como string de path.
 *
 * O que muda: largura/altura são parâmetros (o card é pequeno) e o passo do eixo
 * X sai de `n - 1` em vez do `11` fixo de doze meses.
 */

export interface Spark {
  line: string
  area: string
  lastX: number
  lastY: number
  /** Variação do último balde sobre o anterior, em %. null sem base de comparação. */
  changePct: number | null
  /** false quando a série é toda zero — o card mostra o vazio em vez de uma reta. */
  hasData: boolean
}

export function sparkline(values: number[], w = 240, h = 44, pad = 5): Spark {
  const n = values.length
  const vazio: Spark = { line: '', area: '', lastX: 0, lastY: 0, changePct: null, hasData: false }
  // Um ponto só não desenha reta: `(i / (n - 1))` dividiria por zero.
  if (n < 2) return vazio

  const max = Math.max(...values, 1)
  const pts = values.map((v, i) => {
    const x = (i / (n - 1)) * w
    const y = h - (v / max) * (h - pad * 2) - pad
    return [x, y] as const
  })

  const line = 'M' + pts.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L ')

  // A variação compara as duas últimas semanas FECHADAS, e não a semana em curso
  // contra a anterior.
  //
  // O último balde é a semana corrente, ainda pela metade: numa segunda de manhã
  // ela tem quase nada, e comparar isso com sete dias inteiros marcava ▼100% em
  // quase todo card — número correto na conta e mentiroso na leitura. Com menos
  // de três baldes não há duas semanas fechadas para comparar, e aí não há chip.
  const fechadaAtual = n >= 2 ? values[n - 2] : 0
  const fechadaAnterior = n >= 3 ? values[n - 3] : 0

  return {
    line,
    area: line + ` L ${w} ${h} L 0 ${h} Z`,
    lastX: pts[n - 1][0],
    lastY: pts[n - 1][1],
    changePct: n >= 3 && fechadaAnterior > 0
      ? ((fechadaAtual - fechadaAnterior) / fechadaAnterior) * 100
      : null,
    hasData: values.some((v) => v > 0),
  }
}

/**
 * Os N baldes semanais que terminam HOJE, do mais antigo ao atual.
 *
 * Devolve os limites, e não só rótulos, porque as séries do painel são de dois
 * tipos: as que contam ACONTECIMENTOS na semana (negócio criado, lead que entrou
 * na etapa) e as que remontam um SALDO no fim da semana (o que estava em aberto).
 * As duas precisam das mesmas datas.
 */
export interface Semana {
  ini: Date
  fim: Date
}

export function semanas(n: number, agora = new Date()): Semana[] {
  const fimAtual = new Date(agora)
  fimAtual.setHours(23, 59, 59, 999)

  const out: Semana[] = []
  for (let i = n - 1; i >= 0; i--) {
    const fim = new Date(fimAtual)
    fim.setDate(fim.getDate() - i * 7)
    const ini = new Date(fim)
    ini.setDate(ini.getDate() - 6)
    ini.setHours(0, 0, 0, 0)
    out.push({ ini, fim })
  }
  return out
}

/** Soma `valor` de cada item cuja data cai na semana. Item sem data fica de fora. */
export function porSemana<T>(
  itens: T[],
  quando: (t: T) => Date | undefined,
  faixas: Semana[],
  valor: (t: T) => number = () => 1,
): number[] {
  const baldes = new Array<number>(faixas.length).fill(0)
  for (const it of itens) {
    const d = quando(it)
    if (!d) continue
    const t = d.getTime()
    for (let i = 0; i < faixas.length; i++) {
      if (t >= faixas[i].ini.getTime() && t <= faixas[i].fim.getTime()) {
        baldes[i] += valor(it)
        break
      }
    }
  }
  return baldes
}
