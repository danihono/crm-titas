import { useEffect, useState } from 'react'
import { C } from '../../styles/sx'
import { plural, t } from '../../i18n'
import { tituloEtapaLeads } from '../../i18n/sistema'
import { useIsDark } from '../../store/themeStore'
import type { LeadFunnel as Dados } from '../../lib/dashboardData'

/**
 * Rampa ORDINAL de um matiz só, do topo (claro) ao fim (escuro).
 *
 * Etapa de funil é ordem, não identidade: por isso rampa, e não cores categóricas — que,
 * de quebra, a paleta da marca não sustenta em quatro matizes (roxo × azul reprovou por
 * ΔE 12.6, abaixo do piso 15). Validada em modo ordinal: luminância monotônica, todos os
 * degraus com ΔL ≥ 0.06 e o extremo claro a 2.62:1 sobre a superfície.
 */
const RAMPA = ['#ad94c4', '#9778b5', '#7f59a4', '#664586', '#51366a']

/**
 * A mesma rampa para o tema escuro, refeita — não invertida.
 *
 * A de cima desce para roxos escuros porque foi medida sobre superfície branca.
 * Sobre o card escuro os dois últimos degraus encostam no fundo e as etapas do
 * fim do funil somem. Aqui a rampa sobe: a ordem continua legível porque o que
 * a carrega é a luminância monotônica, não o sentido dela.
 */
const RAMPA_ESCURA = ['#5c4278', '#74538f', '#8e6aa9', '#a986c2', '#c4a3ea']

function corDaEtapa(i: number, n: number, dark: boolean): string {
  // A última etapa (o Ganho) sai em tinta: é o resultado, e o resultado é o
  // único ponto do funil que não é roxo — o mesmo papel do preto no resto do
  // painel, que é destacar dentro de um gráfico.
  if (i === n - 1 && n > 1) return 'var(--c-ink)'
  const rampa = dark ? RAMPA_ESCURA : RAMPA
  if (n <= 2) return rampa[rampa.length - 1]
  // Estica a rampa pelas etapas antes da última, sem repetir passo.
  const pos = Math.round((i / (n - 2)) * (rampa.length - 1))
  return rampa[pos]
}

/** "2 h", "3 d" ou "18 min" — a unidade que cabe, sem casa decimal sobrando. */
function tempo(horas: number): string {
  if (horas < 1) return t('funil.min', { n: Math.max(1, Math.round(horas * 60)) })
  if (horas < 48) return t('funil.horas', { n: horas < 10 ? horas.toFixed(1) : Math.round(horas) })
  return t('funil.diasCurto', { n: Math.round(horas / 24) })
}

/**
 * O funil dos leads, desenhado como funil: uma fatia por etapa, empilhadas, cada
 * uma estreitando da largura da sua etapa até a da seguinte.
 *
 * A borda de CIMA de cada fatia é o dado — proporcional ao número de leads que
 * chegaram àquela etapa — e o número exato fica ao lado, à direita, para quem
 * quer ler e não só ver a forma. A de baixo é só a continuação até a próxima
 * etapa; na última ela fecha um pouco, como o bico do funil.
 *
 * A altura de cada fatia acompanha o card: o painel cabe numa tela só, então o
 * funil divide a altura que tiver entre as etapas em vez de exigir uma medida.
 */
export default function LeadFunnel({ dados, deitado }: {
  dados: Dados
  /** Card baixo e largo (uma faixa da grade): o funil deita e estreita da esquerda para a direita. */
  deitado?: boolean
}) {
  const { stages, perdidos, total, fimAFim } = dados
  const dark = useIsDark()
  const [hover, setHover] = useState<number | null>(null)
  // Entrada: o funil abre do centro. Recomeça a cada troca de período, que é quando os
  // números mudam — sem isso o gráfico trocaria de forma num salto seco.
  const [entrou, setEntrou] = useState(false)
  useEffect(() => {
    setEntrou(false)
    const t = setTimeout(() => setEntrou(true), 30)
    return () => clearTimeout(t)
  }, [dados])

  if (!stages.length) {
    return (
      <div style={{ padding: '30px 4px', color: C.faint, fontSize: 13, lineHeight: 1.6 }}>
        {t('funil.semQuadro')}
      </div>
    )
  }

  const vazio = total === 0
  const largura = (n: number) => (total > 0 ? Math.max((n / total) * 100, n > 0 ? 6 : 0) : 0)

  if (deitado && !vazio) {
    return <FunilDeitado dados={dados} largura={largura} dark={dark} entrou={entrou} />
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {vazio ? (
        <div style={{ padding: '30px 4px', color: C.faint, fontSize: 13 }}>
          Nenhum lead novo neste período.
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: stages.length * 24, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {stages.map((s, i) => {
            const w = largura(s.count)
            // Última etapa: o bico fecha a 70% da própria largura.
            const wNext = i < stages.length - 1 ? largura(stages[i + 1].count) : w * 0.7
            const on = hover === i
            const cor = corDaEtapa(i, stages.length, dark)
            // "Avançaram" é a conversão de QUEM CHEGOU à etapa anterior — por isso a
            // linha mostra a conversão da etapa de cima, e a primeira não mostra nada.
            const veio = i > 0 ? stages[i - 1].conv : null
            return (
              <div
                key={s.id}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                style={{ position: 'relative', flex: 1, minHeight: 22, maxHeight: 48, display: 'flex', alignItems: 'center', cursor: 'default' }}
              >
                {/* O rótulo fica FORA da fatia: no fim do funil ela é estreita demais para texto. */}
                <div className="funil-etapa" style={{ width: 132, flexShrink: 0, paddingRight: 14, textAlign: 'right' }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500, color: on ? C.ink : C.sub, lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {tituloEtapaLeads(s.id, s.label)}
                  </div>
                </div>

                <div style={{ flex: 1, minWidth: 0, height: '100%' }}>
                  <svg
                    viewBox="0 0 100 10"
                    preserveAspectRatio="none"
                    aria-hidden
                    style={{
                      width: '100%', height: '100%', display: 'block', overflow: 'visible',
                      transform: entrou ? 'scaleX(1)' : 'scaleX(0)',
                      transition: 'transform .55s cubic-bezier(.22,1,.36,1), filter .18s ease',
                      filter: on ? 'brightness(1.12)' : undefined,
                    }}
                  >
                    <polygon
                      points={`${50 - w / 2},0 ${50 + w / 2},0 ${50 + wNext / 2},10 ${50 - wNext / 2},10`}
                      fill={cor}
                    />
                  </svg>
                </div>

                <div className="funil-num" style={{ width: 104, flexShrink: 0, paddingLeft: 14 }}>
                  <div className="num" style={{ fontSize: 15, fontWeight: 500, color: C.ink, lineHeight: 1.1 }}>
                    {s.count}
                  </div>
                  {veio !== null && (
                    <div className="funil-tempo" style={{ fontSize: 10.5, color: C.muted, whiteSpace: 'nowrap', marginTop: 1 }}>
                      {t('funil.avancaram', { p: veio.toFixed(veio > 0 && veio < 10 ? 1 : 0) })}
                    </div>
                  )}
                </div>

                {on && (
                  <div
                    role="tooltip"
                    style={{
                      // A primeira faixa abre o balão para BAIXO: para cima ele cobriria o
                      // título do cartão, que fica logo acima dela.
                      position: 'absolute', left: '50%', zIndex: 6,
                      ...(i === 0
                        ? { bottom: -8, transform: 'translate(-50%,100%)' }
                        : { top: -8, transform: 'translate(-50%,-100%)' }),
                      background: C.inverse, color: C.onInverse, borderRadius: 10, padding: '8px 11px',
                      fontSize: 11.5, whiteSpace: 'nowrap', lineHeight: 1.5,
                      boxShadow: 'var(--c-shadow-pop)',
                    }}
                  >
                    {t('funil.chegaramA', { n: s.count, total, etapa: tituloEtapaLeads(s.id, s.label).toLowerCase() })}
                    {/* "% do topo" na primeira etapa seria sempre 100% — tautologia. */}
                    {i > 0 && total > 0 && <> · {t('funil.doTopo', { p: ((s.count / total) * 100).toFixed(0) })}</>}
                    {s.parou !== null && s.parou > 0 && <> · {t('funil.pararamAqui', { n: s.parou })}</>}
                    {s.horas !== null && <> · {t('funil.paraAvancar', { tempo: tempo(s.horas) })}</>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* A manchete: a pergunta que o funil existe para responder. */}
      <div style={{
        marginTop: 12, paddingTop: 11, borderTop: '1px solid ' + C.lineSoft, flexShrink: 0,
        display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap',
      }}>
        {fimAFim === null ? (
          <span style={{ fontSize: 12, color: C.faint }}>{t('funil.semLeadNovo')}</span>
        ) : (
          <span style={{ fontSize: 12.5, color: C.sub }}>
            {t('funil.deCada100')}{' '}
            <b className="num" style={{ fontSize: 15, fontWeight: 500, color: C.purple }}>{Math.round(fimAFim)}</b>{' '}
            {t('funil.chegaramAFinal')} <b style={{ color: C.ink }}>{tituloEtapaLeads(stages[stages.length - 1].id, stages[stages.length - 1].label).toLowerCase()}</b>.
          </span>
        )}
        <div style={{ flex: 1 }} />
        {perdidos > 0 && (
          <span style={{ fontSize: 11.5, color: C.faint, display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* Bolinha, não ícone: sem depender da fonte de símbolos, que quando não carrega
                imprime o nome da ligadura por extenso e estoura a linha. */}
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.rose, flexShrink: 0 }} />
            {plural(perdidos, 'funil.perdido_1', 'funil.perdido_n')}
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * O mesmo funil, deitado: cada etapa é uma coluna, e a ALTURA da fatia no começo
 * da coluna é o dado. Existe porque o painel cabe numa tela só — num card de uma
 * faixa de altura e quatro colunas de largura, o funil em pé teria fatias de
 * poucos pixels. Deitado, ele usa a dimensão que o card tem de sobra.
 */
function FunilDeitado({ dados, largura, dark, entrou }: {
  dados: Dados
  largura: (n: number) => number
  dark: boolean
  entrou: boolean
}) {
  const { stages, total } = dados
  const [hover, setHover] = useState<number | null>(null)
  const n = stages.length
  const W = n * 100

  return (
    <div style={{ height: '100%', minHeight: 110, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <svg
        viewBox={`0 0 ${W} 100`}
        preserveAspectRatio="none"
        aria-hidden
        style={{
          flex: 1, minHeight: 40, width: '100%', display: 'block',
          transform: entrou ? 'scaleY(1)' : 'scaleY(0)',
          transition: 'transform .55s cubic-bezier(.22,1,.36,1)',
        }}
      >
        {stages.map((s, i) => {
          const h = largura(s.count)
          const hNext = i < n - 1 ? largura(stages[i + 1].count) : h * 0.7
          const x0 = i * 100 + 1
          const x1 = (i + 1) * 100 - 1
          return (
            <polygon
              key={s.id}
              points={`${x0},${50 - h / 2} ${x1},${50 - hNext / 2} ${x1},${50 + hNext / 2} ${x0},${50 + h / 2}`}
              fill={corDaEtapa(i, n, dark)}
              style={{ filter: hover === i ? 'brightness(1.12)' : undefined, transition: 'filter .18s ease' }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          )
        })}
      </svg>

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, gap: 2 }}>
        {stages.map((s, i) => {
          const veio = i > 0 ? stages[i - 1].conv : null
          const titulo = tituloEtapaLeads(s.id, s.label)
          const detalhe = [
            t('funil.chegaramA', { n: s.count, total, etapa: titulo.toLowerCase() }),
            i > 0 && total > 0 ? t('funil.doTopo', { p: ((s.count / total) * 100).toFixed(0) }) : '',
            s.parou !== null && s.parou > 0 ? t('funil.pararamAqui', { n: s.parou }) : '',
            s.horas !== null ? t('funil.paraAvancar', { tempo: tempo(s.horas) }) : '',
          ].filter(Boolean).join(' · ')
          return (
            <div
              key={s.id}
              title={detalhe}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{ minWidth: 0, paddingLeft: 2 }}
            >
              <div style={{ fontSize: 11.5, color: hover === i ? C.ink : C.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{titulo}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 1 }}>
                <span className="num" style={{ fontSize: 15, fontWeight: 500, color: C.ink }}>{s.count}</span>
                {veio !== null && (
                  <span className="funil-tempo num" style={{ fontSize: 10.5, color: C.muted }}>{veio.toFixed(veio > 0 && veio < 10 ? 1 : 0)}%</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
