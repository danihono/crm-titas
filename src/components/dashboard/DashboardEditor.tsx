import { useState } from 'react'
import { C } from '../../styles/sx'
import MaterialIcon from '../common/MaterialIcon'
import RingButton from '../common/RingButton'
import {
  CATALOGO, CELULAS, COLUNAS, FAIXAS, cabe, celulasLivres, widgetDef,
} from '../../lib/dashboardWidgets'
import type { Accent, DashboardWidget, WidgetVariant } from '../../types'

const ACENTOS: { id: Accent; cor: string }[] = [
  { id: 'purple', cor: 'var(--c-purple)' },
  { id: 'green', cor: 'var(--c-green)' },
  { id: 'amber', cor: 'var(--c-amber)' },
  { id: 'rose', cor: 'var(--c-rose)' },
  { id: 'blue', cor: 'var(--c-blue)' },
]

/**
 * A barra do modo de edição do painel.
 *
 * Os controles do widget ficam AQUI, e não dentro do card: um card de 1 coluna
 * tem ~215px de largura, e seletor de tamanho, paleta e remover não cabem lá sem
 * virar sopa de ícone. Clicar seleciona; a barra mostra o que dá para fazer.
 */
export default function DashboardEditor({
  widgets, selecionado, onSelecionar, onAlterar, onRemover, onAdicionar, onPadrao, onSalvar, onCancelar, salvando,
}: {
  widgets: DashboardWidget[]
  selecionado: string | null
  onSelecionar: (id: string | null) => void
  onAlterar: (id: string, patch: Partial<DashboardWidget>) => void
  onRemover: (id: string) => void
  onAdicionar: (type: string) => void
  onPadrao: () => void
  onSalvar: () => void
  onCancelar: () => void
  salvando: boolean
}) {
  const [catalogoAberto, setCatalogoAberto] = useState(false)
  const livres = celulasLivres(widgets)
  const w = widgets.find((x) => x.id === selecionado)
  const def = w ? widgetDef(w.type) : undefined

  /** Só troca de tamanho se o novo couber — a grade é o teto. */
  function redimensionar(campo: 'cols' | 'rows', delta: number) {
    if (!w || !def) return
    const alvo = { ...w, [campo]: w[campo] + delta }
    const min = campo === 'cols' ? def.minCols : def.minRows
    const max = campo === 'cols' ? COLUNAS : FAIXAS
    if (alvo[campo] < min || alvo[campo] > max) return
    const outros = widgets.filter((x) => x.id !== w.id)
    if (!cabe(outros, alvo)) return
    onAlterar(w.id, { [campo]: alvo[campo] })
  }

  return (
    // `position: relative` porque o catálogo flutua por cima da grade em vez de
    // ocupar espaço no fluxo: aberto no fluxo, ele empurrava a última faixa de
    // widgets para fora da tela — justamente o que este painel promete não fazer.
    <div style={{ flexShrink: 0, position: 'relative', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          background: C.sel, border: `1px solid ${C.selBorder}`, borderRadius: 14, padding: '9px 12px',
        }}
      >
        <MaterialIcon name="dashboard_customize" size={18} color={C.purple} />
        <span style={{ fontSize: 13, fontWeight: 700, color: C.purple }}>Montando o painel</span>
        <span style={{ fontSize: 11.5, color: C.sub }}>
          {livres > 0 ? `${livres} de ${CELULAS} espaços livres` : 'grade cheia'}
        </span>

        <div style={{ flex: 1 }} />

        {w && def ? (
          <>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.ink, maxWidth: 160, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {def.nome}
            </span>
            <Passo rotulo="larg." valor={w.cols} onMenos={() => redimensionar('cols', -1)} onMais={() => redimensionar('cols', 1)} />
            <Passo rotulo="alt." valor={w.rows} onMenos={() => redimensionar('rows', -1)} onMais={() => redimensionar('rows', 1)} />

            {def.colorivel && (
              <>
                <Alternar
                  ativo={w.variant === 'featured'}
                  onClick={() => onAlterar(w.id, { variant: (w.variant === 'featured' ? 'surface' : 'featured') as WidgetVariant })}
                  titulo={w.variant === 'featured' ? 'Voltar ao card branco' : 'Deixar em destaque escuro'}
                >
                  <span style={{ width: 13, height: 13, borderRadius: 4, background: w.variant === 'featured' ? 'var(--c-featured)' : C.surface, border: `1px solid ${C.fieldBorder}` }} />
                  destaque
                </Alternar>
                {ACENTOS.map((a) => (
                  <button
                    key={a.id}
                    title={`Acento ${a.id}`}
                    onClick={() => onAlterar(w.id, { accent: a.id })}
                    style={{
                      width: 20, height: 20, borderRadius: '50%', background: a.cor, cursor: 'pointer',
                      border: (w.accent ?? 'purple') === a.id ? `2px solid ${C.ink}` : `1px solid ${C.fieldBorder}`,
                    }}
                  />
                ))}
              </>
            )}

            <button onClick={() => onRemover(w.id)} title="Tirar do painel" style={botaoIcone}>
              <MaterialIcon name="delete" size={17} color={C.rose} />
            </button>
          </>
        ) : (
          <span style={{ fontSize: 12, color: C.sub }}>Clique num bloco para mudar tamanho e cor · arraste para trocar de lugar</span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => setCatalogoAberto((v) => !v)} style={{ ...botaoTexto, color: C.purple, borderColor: C.selBorder, background: catalogoAberto ? C.sel : C.surface }}>
          <MaterialIcon name={catalogoAberto ? 'expand_less' : 'add'} size={17} /> Adicionar bloco
        </button>
        <button onClick={onPadrao} style={botaoTexto}>
          <MaterialIcon name="restart_alt" size={17} /> Voltar ao padrão
        </button>
        <div style={{ flex: 1 }} />
        <button onClick={onCancelar} style={botaoTexto}>Cancelar</button>
        <RingButton
          radius={11}
          onClick={onSalvar}
          disabled={salvando}
          style={{
            display: 'flex', alignItems: 'center', gap: 7, background: 'var(--c-purple-grad)',
            border: '1px solid rgba(200,160,230,0.3)', borderRadius: 11, padding: '8px 16px',
            color: C.onAccent, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: salvando ? 0.6 : 1,
          }}
        >
          <MaterialIcon name="check" size={17} /> {salvando ? 'Salvando...' : 'Salvar painel'}
        </RingButton>
      </div>

      {catalogoAberto && (
        <div
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, marginTop: 6,
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: 8,
            background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 12,
            maxHeight: 300, overflowY: 'auto', boxShadow: 'var(--c-shadow-pop)',
          }}
        >
          {CATALOGO.map((d) => {
            const jaTem = d.unico && widgets.some((x) => x.type === d.type)
            const semEspaco = !cabe(widgets, d)
            const bloqueado = jaTem || semEspaco
            const motivo = jaTem
              ? 'Já está no painel'
              : semEspaco
                ? `Não cabe: precisa de ${d.cols * d.rows} espaços e só há ${livres}`
                : `${d.cols}×${d.rows}`
            return (
              <button
                key={d.type}
                disabled={bloqueado}
                title={motivo}
                onClick={() => { onAdicionar(d.type); onSelecionar(d.type) }}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 9, textAlign: 'left',
                  background: 'transparent', border: `1px solid ${C.fieldBorder}`, borderRadius: 11,
                  padding: '9px 11px', cursor: bloqueado ? 'default' : 'pointer', opacity: bloqueado ? 0.45 : 1,
                }}
              >
                <MaterialIcon name={d.icone} size={18} color={C.purple} style={{ background: C.tintPurple, width: 30, height: 30, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>{d.nome}</span>
                    <span style={{ fontSize: 10, color: C.faint }}>{d.cols}×{d.rows}</span>
                  </span>
                  <span style={{ display: 'block', fontSize: 11, color: C.sub, lineHeight: 1.4, marginTop: 2 }}>
                    {bloqueado ? motivo : d.descricao}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

const botaoIcone: React.CSSProperties = {
  width: 30, height: 30, borderRadius: 9, background: C.surface,
  border: `1px solid ${C.fieldBorder}`, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}

const botaoTexto: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, background: C.surface,
  border: `1px solid ${C.fieldBorder}`, borderRadius: 11, padding: '8px 13px',
  color: C.sub, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
}

function Passo({ rotulo, valor, onMenos, onMais }: {
  rotulo: string
  valor: number
  onMenos: () => void
  onMais: () => void
}) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 3, background: C.surface, border: `1px solid ${C.fieldBorder}`, borderRadius: 9, padding: '2px 5px' }}>
      <span style={{ fontSize: 10.5, color: C.muted, fontWeight: 700 }}>{rotulo}</span>
      <button onClick={onMenos} style={mini}><MaterialIcon name="remove" size={14} /></button>
      <span style={{ fontSize: 12, fontWeight: 700, color: C.ink, minWidth: 10, textAlign: 'center' }}>{valor}</span>
      <button onClick={onMais} style={mini}><MaterialIcon name="add" size={14} /></button>
    </span>
  )
}

const mini: React.CSSProperties = {
  width: 20, height: 20, borderRadius: 6, background: 'transparent', border: 'none',
  color: 'var(--c-sub)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
}

function Alternar({ ativo, onClick, titulo, children }: {
  ativo: boolean
  onClick: () => void
  titulo: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={titulo}
      style={{
        display: 'flex', alignItems: 'center', gap: 5, borderRadius: 9, padding: '5px 9px',
        fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
        background: ativo ? C.sel : C.surface,
        border: `1px solid ${ativo ? C.selBorder : C.fieldBorder}`,
        color: ativo ? C.purple : C.sub,
      }}
    >
      {children}
    </button>
  )
}
