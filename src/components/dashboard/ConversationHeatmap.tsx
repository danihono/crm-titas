import { useState } from 'react'
import { shade } from '../../lib/color'
import { C } from '../../styles/sx'
import { DIAS, type Heatmap } from '../../lib/dashboardData'

/** Horas mostradas. Fora dessa faixa o movimento é resíduo e só espremia a grade. */
const H0 = 7
const H1 = 22

/**
 * Escala sequencial de um matiz só, claro → escuro. A variável é magnitude, então rampa —
 * arco-íris aqui seria ler cor como categoria.
 *
 * Zero fica com a cor da SUPERFÍCIE, não com o passo mais claro: senão "nenhuma conversa" e
 * "uma conversa" viram quase a mesma célula.
 */
function corDaCelula(n: number, peak: number): string {
  if (n <= 0) return C.field
  const t = n / peak
  // 4 degraus discretos: a diferença entre células fica legível, o que um gradiente
  // contínuo não entrega num quadradinho de 14px.
  const passo = t > 0.75 ? -0.22 : t > 0.5 ? -0.02 : t > 0.25 ? 0.154 : 0.28
  return shade(C.purple, passo)
}

/**
 * Quando as conversas chegam, por dia da semana e hora — a grade que diz onde a fila
 * aperta, para dimensionar a escala de atendimento.
 */
export default function ConversationHeatmap({ data }: { data: Heatmap }) {
  const [hover, setHover] = useState<{ dia: number; hora: number } | null>(null)
  const horas = Array.from({ length: H1 - H0 + 1 }, (_, i) => H0 + i)

  if (data.total === 0) {
    return <div style={{ padding: '28px 4px', color: C.faint, fontSize: 13 }}>Nenhuma conversa neste período.</div>
  }

  const atual = hover ? data.grid[hover.dia][hover.hora] : 0

  return (
    <div>
      <div style={{ display: 'flex', gap: 6 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 16 }}>
          {DIAS.map((d) => (
            <div key={d} style={{ height: 14, fontSize: 10, color: C.muted, fontWeight: 700, lineHeight: '14px' }}>{d}</div>
          ))}
        </div>

        <div style={{ flex: 1, minWidth: 0, overflowX: 'auto' }}>
          {/* Régua de horas: rótulo a cada 3h, senão vira um borrão de números. */}
          <div style={{ display: 'flex', gap: 2, height: 14 }}>
            {horas.map((h) => (
              <div key={h} style={{ flex: 1, minWidth: 14, fontSize: 9.5, color: C.faint, textAlign: 'center' }}>
                {h % 3 === 0 ? h : ''}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2 }}>
            {DIAS.map((_, dia) => (
              <div key={dia} style={{ display: 'flex', gap: 2 }}>
                {horas.map((hora) => {
                  const n = data.grid[dia][hora]
                  const on = hover?.dia === dia && hover?.hora === hora
                  return (
                    <div
                      key={hora}
                      onMouseEnter={() => setHover({ dia, hora })}
                      onMouseLeave={() => setHover(null)}
                      title={`${DIAS[dia]} ${String(hora).padStart(2, '0')}h · ${n} conversa(s)`}
                      style={{
                        flex: 1, minWidth: 14, height: 14, borderRadius: 3,
                        background: corDaCelula(n, data.peak),
                        // Anel na cor da superfície: destaca a célula sob o cursor sem
                        // empurrar a grade nem mudar a cor que codifica o valor.
                        boxShadow: on ? `0 0 0 2px ${C.ink}` : undefined,
                        cursor: 'default',
                      }}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 10.5, color: C.faint }}>menos</span>
          {[0.2, 0.4, 0.6, 0.9].map((t) => (
            <span key={t} style={{ width: 13, height: 13, borderRadius: 3, background: corDaCelula(t * data.peak, data.peak) }} />
          ))}
          <span style={{ fontSize: 10.5, color: C.faint }}>mais</span>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 11.5, color: C.sub }}>
          {hover
            ? <>{DIAS[hover.dia]}, {String(hover.hora).padStart(2, '0')}h · <b style={{ color: C.ink }}>{atual}</b> conversa(s)</>
            : data.pico
              ? <>Pico: <b style={{ color: C.ink }}>{DIAS[data.pico.dia]}, {String(data.pico.hora).padStart(2, '0')}h</b> ({data.pico.n})</>
              : null}
        </div>
      </div>
    </div>
  )
}
