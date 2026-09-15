import type { ReactNode } from 'react'
import MaterialIcon from '../common/MaterialIcon'
import { variacao } from '../../lib/format'
import { t } from '../../i18n'

/**
 * O bloco em destaque do painel: um número grande sobre o roxo da marca.
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
        padding: '14px 16px 12px',
        overflow: 'hidden',
        background: 'var(--c-purple-grad)',
        border: '1px solid rgba(200,160,230,0.3)',
        // O halo do hover (.stat-card em src/index.css) na cor da marca.
        ['--beam-glow' as string]: 'rgba(150,110,200,0.45)',
      }}
    >
      {/* Brilho de luz no canto, em z-index -1 preso pelo `isolation`: fica acima
          do gradiente e abaixo de todo o texto. */}
      <div
        aria-hidden
        style={{
          position: 'absolute', top: -60, right: -40, width: 190, height: 190,
          borderRadius: '50%', pointerEvents: 'none', zIndex: -1,
          background: 'radial-gradient(circle, rgba(255,255,255,0.20), transparent 68%)',
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          title={label}
          style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '.11em', color: dim,
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
            background: 'rgba(255,255,255,0.14)', width: 30, height: 30, borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.18)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginTop: 2 }}>
        {/* O número é o widget inteiro: `clamp` deixa ele encolher no card de 2
            colunas sem quebrar linha, em vez de fixar um corpo que só serve numa
            largura. */}
        <span style={{ fontSize: 'clamp(30px, 11cqw, 46px)', fontWeight: 700, letterSpacing: '-.035em', color: ink, lineHeight: 1.02 }}>
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
            color: ink, fontSize: 12, fontWeight: 600, cursor: 'pointer', width: '100%',
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
        fontSize: 11.5, fontWeight: 700,
        color: cor,
        background: 'rgba(255,255,255,0.15)',
        borderRadius: 20, padding: '3px 9px',
      }}
    >
      {v.seta} {v.texto}
    </span>
  )
}
