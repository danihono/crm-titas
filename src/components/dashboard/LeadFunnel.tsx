import { useEffect, useState } from 'react'
import { C } from '../../styles/sx'
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

/** Altura de cada faixa. Igual em todas de propósito — ver o comentário do desenho. */
const FAIXA = 40
/** Vão entre faixas, onde entram o ombro do funil e o rótulo de conversão. */
const VAO = 34

function corDaEtapa(i: number, n: number): string {
  if (n <= 1) return RAMPA[RAMPA.length - 1]
  // Estica a rampa para o número de etapas do quadro, sem repetir passo.
  const pos = Math.round((i / (n - 1)) * (RAMPA.length - 1))
  return RAMPA[pos]
}

/** "2 h", "3 d" ou "18 min" — a unidade que cabe, sem casa decimal sobrando. */
function tempo(horas: number): string {
  if (horas < 1) return `${Math.max(1, Math.round(horas * 60))} min`
  if (horas < 48) return `${horas < 10 ? horas.toFixed(1) : Math.round(horas)} h`
  return `${Math.round(horas / 24)} d`
}

/**
 * O funil dos leads: uma silhueta contínua, não uma pilha de barras.
 *
 * A largura de cada faixa é proporcional à contagem e todas as faixas têm a MESMA altura —
 * é esse detalhe que torna o funil honesto. Com altura constante a área acompanha a largura,
 * então não existe a distorção que faz "trapézio de funil" ser anti-padrão: o olho lê
 * comprimento, e comprimento é o dado. Os ombros que ligam uma faixa à outra são parede,
 * não dado, e por isso vão num tom bem mais claro.
 */
export default function LeadFunnel({ dados }: { dados: Dados }) {
  const { stages, perdidos, total, fimAFim } = dados
  const [hover, setHover] = useState<number | null>(null)
  // Entrada: a silhueta cresce do centro. Recomeça a cada troca de período, que é quando os
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
        O quadro <b>Leads</b> ainda não foi criado. Abra o Pipeline uma vez e ele nasce com as
        etapas prontas.
      </div>
    )
  }

  const vazio = total === 0
  const largura = (n: number) => (total > 0 ? Math.max((n / total) * 100, n > 0 ? 6 : 0) : 0)

  return (
    <div>
      {vazio ? (
        <div style={{ padding: '30px 4px', color: C.faint, fontSize: 13 }}>
          Nenhum lead novo neste período.
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          {stages.map((s, i) => {
            const w = largura(s.count)
            const wNext = i < stages.length - 1 ? largura(stages[i + 1].count) : w
            const on = hover === i
            const cor = corDaEtapa(i, stages.length)
            return (
              <div key={s.id}>
                {/* A faixa. O rótulo fica FORA, à esquerda e à direita, para não depender da
                    largura da barra — no fim do funil ela é estreita demais para texto. */}
                <div
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  style={{
                    position: 'relative', height: FAIXA, display: 'flex', alignItems: 'center',
                    cursor: 'default',
                  }}
                >
                  <div style={{ width: 132, flexShrink: 0, paddingRight: 10, textAlign: 'right' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: on ? C.ink : C.sub, lineHeight: 1.25 }}>
                      {s.label}
                    </div>
                  </div>

                  <div style={{ flex: 1, minWidth: 0, position: 'relative', height: '100%' }}>
                    <div
                      style={{
                        position: 'absolute', left: '50%', top: 0, height: '100%',
                        width: entrou ? `${w}%` : '0%',
                        transform: 'translateX(-50%)',
                        background: cor,
                        borderRadius: 3,
                        transition: 'width .55s cubic-bezier(.22,1,.36,1), filter .18s ease',
                        filter: on ? 'brightness(1.1)' : undefined,
                      }}
                    />
                  </div>

                  <div style={{ width: 74, flexShrink: 0, paddingLeft: 10 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: C.ink, letterSpacing: '-.02em' }}>
                      {s.count}
                    </div>
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
                        background: C.ink, color: '#fff', borderRadius: 10, padding: '8px 11px',
                        fontSize: 11.5, whiteSpace: 'nowrap', lineHeight: 1.5,
                        boxShadow: '0 10px 24px rgba(20,14,40,0.28)',
                      }}
                    >
                      <b>{s.count}</b> de {total} leads chegaram a {s.label.toLowerCase()}
                      {/* "% do topo" na primeira etapa seria sempre 100% — tautologia. */}
                      {i > 0 && total > 0 && <> · {((s.count / total) * 100).toFixed(0)}% do topo</>}
                      {s.parou !== null && s.parou > 0 && <> · {s.parou} pararam aqui</>}
                      {s.horas !== null && <> · {tempo(s.horas)} para avançar</>}
                    </div>
                  )}
                </div>

                {/* O vão: ombro do funil ao fundo, conversão e perda por cima. */}
                {i < stages.length - 1 && (
                  <div style={{ position: 'relative', height: VAO, display: 'flex', alignItems: 'center' }}>
                    <div style={{ width: 132, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0, position: 'relative', height: '100%' }}>
                      {/* Parede do funil. É transição, não dado — daí o tom bem mais claro
                          e o clip que a estreita junto com a faixa de baixo. */}
                      <div
                        style={{
                          position: 'absolute', inset: 0,
                          background: cor,
                          opacity: entrou ? 0.16 : 0,
                          transition: 'clip-path .55s cubic-bezier(.22,1,.36,1), opacity .5s ease',
                          clipPath: entrou
                            ? `polygon(${50 - w / 2}% 0%, ${50 + w / 2}% 0%, ${50 + wNext / 2}% 100%, ${50 - wNext / 2}% 100%)`
                            : 'polygon(50% 0%, 50% 0%, 50% 100%, 50% 100%)',
                        }}
                      />
                      <div style={{
                        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', gap: 6, fontSize: 11.5, color: C.sub,
                      }}>
                        {/* Sem seta: a silhueta já desce, e o ícone só repetiria isso — com
                            o risco de virar a palavra "south" se a fonte de ícones falhar. */}
                        {s.conv !== null && (
                          <b style={{ color: s.conv >= 50 ? C.green : s.conv >= 20 ? C.amber : C.rose }}>
                            {s.conv.toFixed(s.conv > 0 && s.conv < 10 ? 1 : 0)}%
                          </b>
                        )}
                        {s.parou !== null && s.parou > 0 && (
                          <span style={{ color: C.faint }}>· {s.parou} pararam aqui</span>
                        )}
                      </div>
                    </div>
                    <div style={{ width: 74, flexShrink: 0, paddingLeft: 10, fontSize: 10.5, color: C.faint }}>
                      {s.horas !== null && tempo(s.horas)}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* A manchete: a pergunta que o funil existe para responder. */}
      <div style={{
        marginTop: 16, paddingTop: 13, borderTop: '1px solid ' + C.lineSoft,
        display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap',
      }}>
        {fimAFim === null ? (
          <span style={{ fontSize: 12, color: C.faint }}>Sem lead novo no período para medir conversão.</span>
        ) : (
          <span style={{ fontSize: 12.5, color: C.sub }}>
            De cada 100 leads novos,{' '}
            <b style={{ fontSize: 15, color: C.purple }}>{Math.round(fimAFim)}</b>{' '}
            chegaram a <b style={{ color: C.ink }}>{stages[stages.length - 1].label.toLowerCase()}</b>.
          </span>
        )}
        <div style={{ flex: 1 }} />
        {perdidos > 0 && (
          <span style={{ fontSize: 11.5, color: C.faint, display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* Bolinha, não ícone: sem depender da fonte de símbolos, que quando não carrega
                imprime o nome da ligadura por extenso e estoura a linha. */}
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.rose, flexShrink: 0 }} />
            {perdidos} {perdidos === 1 ? 'marcado como perdido' : 'marcados como perdidos'}
          </span>
        )}
      </div>
    </div>
  )
}
