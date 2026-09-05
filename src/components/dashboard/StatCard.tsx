import type { CSSProperties, ReactNode } from 'react'
import { C } from '../../styles/sx'
import { sparkline } from '../../lib/sparkline'
import MaterialIcon from '../common/MaterialIcon'

export type Accent = 'purple' | 'green' | 'amber' | 'rose' | 'blue'

const ACCENT: Record<Accent, { fg: string; tint: string }> = {
  purple: { fg: C.purple, tint: C.tintPurpleStrong },
  green: { fg: C.green, tint: C.tintGreen },
  amber: { fg: C.amber, tint: C.tintAmber },
  rose: { fg: C.rose, tint: C.tintRose },
  blue: { fg: C.blue, tint: C.tintBlue },
}

export interface StatCardProps {
  /** Rótulo em caixa alta, como na referência. */
  label: string
  value: string
  /** Linha de apoio — é AQUI que se diz o que a linha do mini gráfico mostra. */
  sub?: string
  icon: string
  accent?: Accent
  /** Série do mini gráfico. Sem ela o card fica só com número e link. */
  series?: number[]
  /** Rodapé: "Ver pipeline →". */
  linkLabel?: string
  onLink?: () => void
  /** Card em destaque (escuro), como o primeiro da referência. */
  featured?: boolean
  /** Explica de onde sai o número, no ícone de informação. */
  info?: string
  extra?: ReactNode
}

/**
 * Card simples do painel: rótulo, número, variação, mini gráfico e link.
 *
 * O mini gráfico é OPCIONAL de propósito. Nem toda métrica do CRM tem histórico
 * real — ticket médio, por exemplo, é razão de duas séries cujo passado não é
 * recuperável, porque `updateDeal` sobrescreve o valor do negócio sem versionar.
 * Card sem série fica só com número e link, exatamente como os dois cards sem
 * gráfico da interface de referência. Linha inventada em painel de CRM é pior
 * que nenhuma linha.
 */
export default function StatCard({
  label, value, sub, icon, accent = 'purple', series, linkLabel, onLink, featured, info, extra,
}: StatCardProps) {
  const a = ACCENT[accent]
  const spark = series && series.length > 1 ? sparkline(series) : null
  const mostraGrafico = !!spark?.hasData

  // No card em destaque o fundo é escuro nos DOIS temas, então texto e acento
  // são fixos e claros — não podem seguir os tokens de superfície.
  const ink = featured ? '#f6f1fb' : C.ink
  const dim = featured ? 'rgba(238,228,248,0.62)' : C.muted
  const fg = featured ? '#d9bff2' : a.fg
  const tint = featured ? 'rgba(255,255,255,0.09)' : a.tint

  const shell: CSSProperties = {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    borderRadius: 18,
    padding: '16px 18px 14px',
    overflow: 'hidden',
    background: featured ? C.featured : C.surface,
    border: `1px solid ${featured ? C.featuredBorder : C.line}`,
  }

  return (
    <div className="stat-card" style={shell}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.09em', color: dim, textTransform: 'uppercase' }}>
          {label}
        </span>
        {info && <MaterialIcon name="info" size={13} color={dim} title={info} style={{ cursor: 'help' }} />}
        <div style={{ flex: 1 }} />
        <MaterialIcon
          name={icon}
          size={18}
          color={fg}
          style={{ background: tint, width: 32, height: 32, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 25, fontWeight: 700, letterSpacing: '-.03em', color: ink, lineHeight: 1.05 }}>{value}</span>
        {spark?.changePct !== null && spark?.changePct !== undefined && (
          <DeltaChip pct={spark.changePct} featured={featured} />
        )}
      </div>

      {sub && (
        <div style={{ fontSize: 11.5, color: dim, marginTop: 5, lineHeight: 1.4 }}>{sub}</div>
      )}

      {extra}

      {mostraGrafico && (
        <svg viewBox="0 0 240 44" preserveAspectRatio="none" style={{ width: '100%', height: 40, display: 'block', marginTop: 12 }}>
          <defs>
            <linearGradient id={`sparkFill-${label.replace(/\W/g, '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={fg} stopOpacity="0.26" />
              <stop offset="1" stopColor={fg} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={spark.area} fill={`url(#sparkFill-${label.replace(/\W/g, '')})`} />
          <path d={spark.line} fill="none" stroke={fg} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          <circle cx={spark.lastX} cy={spark.lastY} r="2.6" fill={fg} vectorEffect="non-scaling-stroke" />
        </svg>
      )}

      {linkLabel && (
        <button
          onClick={onLink}
          style={{
            marginTop: mostraGrafico ? 8 : 'auto',
            paddingTop: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 5,
            background: 'transparent',
            border: 'none',
            borderTop: `1px solid ${featured ? 'rgba(255,255,255,0.09)' : C.lineHair}`,
            color: fg,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            width: '100%',
          }}
        >
          {linkLabel} <MaterialIcon name="arrow_forward" size={15} />
        </button>
      )}
    </div>
  )
}

/** ▲/▼ com o mesmo formato e as mesmas cores da variação do gráfico de receita. */
function DeltaChip({ pct, featured }: { pct: number; featured?: boolean }) {
  const sobe = pct >= 0
  // O card em destaque é escuro NOS DOIS temas, então o par de cores dele é
  // fixo e claro: C.green/C.rose são calibrados para superfície clara e ficam
  // apagados ali.
  const cor = featured ? (sobe ? '#6fd7ae' : '#f0a0bd') : sobe ? C.green : C.rose
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        fontSize: 11,
        fontWeight: 700,
        color: cor,
        background: featured ? 'rgba(255,255,255,0.1)' : sobe ? C.tintGreen : C.tintRose,
        borderRadius: 20,
        padding: '2px 8px',
      }}
    >
      {sobe ? '▲' : '▼'} {Math.abs(pct).toFixed(1).replace('.', ',')}%
    </span>
  )
}
