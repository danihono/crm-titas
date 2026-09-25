import type { ReactNode } from 'react'
import MaterialIcon from '../common/MaterialIcon'
import { variacao } from '../../lib/format'
import { t } from '../../i18n'

/**
 * O bloco em destaque do painel: um número grande sobre o roxo da marca, e
 * opcionalmente um gráfico que ocupa o resto do card (`children`).
 *
 * É o ÚNICO ponto saturado da tela — o resto do painel é branco com acento. Um
 * segundo card assim disputaria a atenção com este e os dois deixariam de ser
 * destaque, que é o motivo de o widget ser `unico` no catálogo.
 *
 * Nada aqui usa os tokens de superfície (`C.ink`, `C.sub`…): o fundo é roxo
 * saturado nos DOIS temas, e os tokens, que invertem entre claro e escuro,
 * sumiriam no escuro. As cores são literais e claras, exatamente como o
 * `featured` do StatCard faz pelo mesmo motivo.
 */
export default function HeroCard({
  label, value, sub, icon, changePct, linkLabel, onLink, children,
}: {
  label: string
  value: string
  sub?: string
  icon: string
  /** Variação sobre o período anterior. `null` quando não há base de comparação. */
  changePct?: number | null
  linkLabel?: string
  onLink?: () => void
  children?: ReactNode
}) {
  const ink = '#ffffff'
  const dim = 'rgba(244,238,250,0.72)'

  return (
    <div
      className="stat-card widget hero-card"
      style={{
        position: 'relative',
        isolation: 'isolate',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        borderRadius: 18,
        padding: '18px 20px 14px',
        overflow: 'hidden',
        background: 'var(--c-featured)',
        border: '1px solid transparent',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          title={label}
          style={{
            fontSize: 10.5, fontWeight: 600, letterSpacing: '.08em', color: dim,
            textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden',
            textOverflow: 'ellipsis', minWidth: 0, lineHeight: 1.6,
          }}
        >
          {label}
        </span>
        <div style={{ flex: 1 }} />
        <MaterialIcon
          name={icon}
          size={17}
          color={ink}
          style={{
            width: 22, height: 22,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginTop: 2 }}>
        {/* O número é o widget inteiro: `clamp` deixa ele encolher no card de 2
            colunas sem quebrar linha, em vez de fixar um corpo que só serve numa
            largura. */}
        <span className="num" style={{ fontSize: 'clamp(34px, 13cqw, 64px)', fontWeight: 500, letterSpacing: '-.05em', color: ink, lineHeight: 1 }}>
          {value}
        </span>
        {changePct !== null && changePct !== undefined && <Delta pct={changePct} />}
      </div>

      {sub && (
        <div style={{ fontSize: 11.5, color: dim, marginTop: 5, lineHeight: 1.35 }}>{sub}</div>
      )}

      {children}

      {linkLabel && (
        <button
          onClick={onLink}
          style={{
            marginTop: 'auto', paddingTop: 9,
            display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5,
            background: 'transparent', border: 'none',
            borderTop: '1px solid rgba(255,255,255,0.16)',
            color: ink, fontSize: 12, fontWeight: 500, cursor: 'pointer', width: '100%',
          }}
        >
          {linkLabel} <MaterialIcon name="arrow_forward" size={15} />
        </button>
      )}
    </div>
  )
}

/** ▲/▼/= sobre o roxo: o par de cores do StatCard não vale aqui, o fundo é outro. */
function Delta({ pct }: { pct: number }) {
  const v = variacao(pct)
  const cor = v.sentido === 'igual'
    ? 'rgba(244,238,250,0.82)'
    : v.sentido === 'sobe' ? '#b6f0d5' : '#ffc4d8'
  return (
    <span
      title={t(v.sentido === 'igual' ? 'painel.semMudancaMes' : 'painel.mesContraMes')}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 500,
        color: cor,
        background: 'rgba(255,255,255,0.15)',
        borderRadius: 20, padding: '3px 9px',
      }}
    >
      {v.seta} {v.texto}
    </span>
  )
}
