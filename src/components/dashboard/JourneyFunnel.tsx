import { useState } from 'react'
import { shade } from '../../lib/color'
import { C } from '../../styles/sx'
import MaterialIcon from '../common/MaterialIcon'
import type { JourneyStage } from '../../lib/dashboardData'

/**
 * Rampa sequencial de UM matiz — não quatro cores categóricas.
 *
 * As etapas não são identidades independentes: são uma sequência que decresce, e magnitude
 * ordenada pede rampa, não paleta categórica. Fora isso, a paleta da marca não sustenta 4
 * matizes simultâneas — o validador reprovou roxo × azul (ΔE 12.6, abaixo do piso de 15),
 * e reordenar não resolve porque as quatro aparecem juntas. A rampa abaixo é monotônica em
 * luminância e cada passo passa de 3:1 contra o fundo branco.
 */
const RAMPA = [shade(C.purple, -0.22), shade(C.purple, -0.02), shade(C.purple, 0.154), shade(C.purple, 0.28)]

/**
 * A jornada do sistema inteiro: contato → conversa → negócio → nota paga.
 *
 * Barras horizontais, e não um trapézio de funil: trapézio codifica o número na ÁREA, que se
 * lê mal e distorce. Comprimento de barra compara direto, que é a pergunta ("de cada 100
 * contatos, quantos viram dinheiro?").
 */
export default function JourneyFunnel({ stages }: { stages: JourneyStage[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...stages.map((s) => s.count))
  const vazio = stages.every((s) => s.count === 0)

  return (
    <div>
      {vazio ? (
        <div style={{ padding: '28px 4px', color: C.faint, fontSize: 13 }}>
          Nenhum registro neste período.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {stages.map((s, i) => {
            const pct = (s.count / max) * 100
            const on = hover === i
            return (
              <div key={s.id}>
                {/* Conversão entre etapas: rótulo direto, sem depender de cor.
                    Acima de 100% a frase muda: uma etapa PODE passar da anterior (contato de
                    um ano atrás abre conversa hoje), e aí ninguém "seguiu" de uma para a
                    outra — dizer isso em verde seria mentira com cara de meta batida. */}
                {s.conv !== null && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 0 5px 2px', color: C.sub, fontSize: 11.5 }}>
                    <MaterialIcon name="subdirectory_arrow_right" size={15} color={C.muted} />
                    {s.conv > 100 ? (
                      <>
                        <b style={{ color: C.purple }}>{(s.conv / 100).toFixed(1)}×</b>
                        a etapa anterior — também vêm de registros mais antigos
                      </>
                    ) : (
                      <>
                        <b style={{ color: s.conv >= 50 ? C.green : s.conv >= 20 ? C.amber : C.rose }}>
                          {s.conv.toFixed(s.conv < 10 ? 1 : 0)}%
                        </b>
                        seguem para a etapa seguinte
                      </>
                    )}
                  </div>
                )}

                <div
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  style={{ position: 'relative', cursor: 'default' }}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>{s.label}</span>
                    <span style={{ fontSize: 11.5, color: C.faint }}>{s.hint}</span>
                    <div style={{ flex: 1 }} />
                    <span style={{ fontSize: 15, fontWeight: 800, color: C.ink }}>{s.count}</span>
                  </div>
                  {/* Trilho + barra. Ponta arredondada só na direita: a esquerda é a linha de
                      base, e arredondá-la faria a barra parecer mais curta do que é. */}
                  <div style={{ height: 12, borderRadius: 4, background: C.field, overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${Math.max(pct, s.count > 0 ? 2 : 0)}%`,
                        height: '100%',
                        borderRadius: '0 4px 4px 0',
                        background: RAMPA[i],
                        transition: 'width .4s cubic-bezier(.22,1,.36,1), filter .2s ease',
                        filter: on ? 'brightness(1.08)' : undefined,
                      }}
                    />
                  </div>

                  {on && s.count > 0 && (
                    <div
                      role="tooltip"
                      style={{
                        position: 'absolute', right: 0, top: -6, transform: 'translateY(-100%)',
                        background: C.ink, color: '#fff', borderRadius: 9, padding: '7px 10px',
                        fontSize: 11.5, whiteSpace: 'nowrap', zIndex: 5,
                        boxShadow: '0 8px 20px rgba(20,14,40,0.25)',
                      }}
                    >
                      <b>{s.count}</b> {s.label.toLowerCase()} · {s.hint}
                      {s.conv !== null && (
                        <> · {s.conv > 100 ? `${(s.conv / 100).toFixed(1)}×` : `${s.conv.toFixed(0)}%`} da etapa anterior</>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div style={{ fontSize: 11, color: C.faint, marginTop: 12, lineHeight: 1.5 }}>
        Considera registros com data. Notas entram pela baixa de pagamento, não pela emissão.
      </div>
    </div>
  )
}
