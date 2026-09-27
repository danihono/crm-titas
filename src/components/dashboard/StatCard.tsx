import type { CSSProperties, ReactNode } from 'react'
import { C } from '../../styles/sx'
import { t } from '../../i18n'
import { sparkline } from '../../lib/sparkline'
import { variacao } from '../../lib/format'
import MaterialIcon from '../common/MaterialIcon'

export type Accent = 'purple' | 'green' | 'amber' | 'rose' | 'blue'

const ACCENT: Record<Accent, { fg: string }> = {
  purple: { fg: C.purple },
  green: { fg: C.green },
  amber: { fg: C.amber },
  rose: { fg: C.rose },
  blue: { fg: C.blue },
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
  const spark = series && series.length > 1 ? sparkline(series, 240, 34) : null
  const mostraGrafico = !!spark?.hasData

  // No card em destaque o fundo é escuro nos DOIS temas, então texto e acento
  // são fixos e claros — não podem seguir os tokens de superfície.
  const ink = featured ? '#ffffff' : C.ink
  const dim = featured ? 'rgba(255,255,255,0.7)' : C.muted
  const fg = featured ? '#ffffff' : a.fg

  const shell: CSSProperties = {
    position: 'relative',
    // Prende o brilho do acento (z-index -1, abaixo) DENTRO do card: sem o
    // contexto de empilhamento próprio ele afundaria atrás do fundo do card.
    isolation: 'isolate',
    display: 'flex',
    flexDirection: 'column',
    // Preenche a célula da grade: sem isto o card para na altura do conteúdo e a
    // fileira fica com cards de alturas diferentes.
    height: '100%',
    borderRadius: 18,
    padding: '16px 18px 13px',
    overflow: 'hidden',
    background: featured ? C.featured : C.surface,
    border: `1px solid ${featured ? C.featuredBorder : C.lineHair}`,
  }

  return (
    <div className="stat-card widget" style={shell}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 8 }}>
        <span
          title={label}
          style={{
            fontSize: 10.5, fontWeight: 600, letterSpacing: '.08em', color: dim,
            // Quebra em até duas linhas em vez de cortar: no card de uma coluna
            // "ESPERANDO RESPOSTA" não cabe numa linha só.
            textTransform: 'uppercase', overflow: 'hidden', display: '-webkit-box',
            WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', minWidth: 0,
            // Sem folga vertical o `overflow:hidden` come o acento das
            // maiúsculas — "NEGÓCIOS" virava "NEGOCIOS".
            lineHeight: 1.6,
          }}
        >
          {label}
        </span>
        {info && <MaterialIcon name="info" size={13} color={dim} title={info} style={{ cursor: 'help' }} />}
        <div style={{ flex: 1 }} />
        <MaterialIcon
          name={icon}
          size={16}
          color={fg}
          style={{
            // Ícone solto, sem ladrilho nem anel: a cor do acento já basta.
            width: 22, height: 22,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        />
      </div>

      <div style={{ position: 'relative', display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
        <span className="num" style={{ fontSize: 'clamp(24px, 13cqw, 32px)', fontWeight: 500, letterSpacing: '-.04em', color: ink, lineHeight: 1.05 }}>{value}</span>
        {spark?.changePct !== null && spark?.changePct !== undefined && (
          <DeltaChip pct={spark.changePct} featured={featured} />
        )}
      </div>

      {sub && (
        <div style={{ fontSize: 11, color: dim, marginTop: 4, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{sub}</div>
      )}

      {extra}

      {mostraGrafico && (
        <svg viewBox="0 0 240 34" preserveAspectRatio="none" style={{ width: '100%', height: 32, display: 'block', marginTop: 9 }}>
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
            marginTop: 'auto',
            paddingTop: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 5,
            background: 'transparent',
            border: 'none',
            borderTop: `1px solid ${featured ? 'rgba(255,255,255,0.16)' : C.lineHair}`,
            color: featured ? '#ffffff' : C.sub,
            fontSize: 12,
            fontWeight: 500,
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

/** ▲/▼/= com o mesmo formato e as mesmas cores da variação do gráfico de receita. */
function DeltaChip({ pct, featured }: { pct: number; featured?: boolean }) {
  const v = variacao(pct)
  // O card em destaque é escuro NOS DOIS temas, então o par de cores dele é
  // fixo e claro: C.green/C.rose são calibrados para superfície clara e ficam
  // apagados ali.
  //
  // Variação nula é NEUTRA nos dois: pintar de verde um "não mudou" é a mesma
  // mentira que a seta para cima que este chip tinha antes.
  const cor = v.sentido === 'igual'
    ? (featured ? 'rgba(255,255,255,0.8)' : C.muted)
    : featured
      ? (v.sentido === 'sobe' ? '#b6f0d5' : '#ffc4d8')
      : v.sentido === 'sobe' ? C.green : C.rose
  const fundo = featured
    ? 'rgba(255,255,255,0.15)'
    : v.sentido === 'igual' ? C.tintNeutral : v.sentido === 'sobe' ? C.tintGreen : C.tintRose
  return (
    <span
      title={v.sentido === 'igual' ? t('painel.semMudanca') : t('painel.semanaFechada')}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        fontFamily: 'var(--font-mono)',
        fontSize: 10.5,
        fontWeight: 500,
        color: cor,
        background: fundo,
        borderRadius: 20,
        padding: '2px 8px',
      }}
    >
      {v.seta} {v.texto}
    </span>
  )
}
