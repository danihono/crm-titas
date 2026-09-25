import { useEffect, useMemo, useState } from 'react'
import { C, FONT_DISPLAY, sx } from '../styles/sx'
import { plural, t } from '../i18n'
import { useAuth } from '../contexts/AuthContext'
import { useSelfProfile, saveSelfPrefs } from '../hooks/useProfile'
import { useTenantStore } from '../store/tenantStore'
import { useDashboardData } from '../hooks/useDashboardData'
import {
  COLUNAS, FAIXAS, cabe, fontesDoLayout, layoutPadrao, widgetDef,
} from '../lib/dashboardWidgets'
import { saudacao } from '../lib/format'
import { dataPorExtenso, num } from '../i18n/formato'
import WidgetShell from '../components/dashboard/WidgetShell'
import WidgetContent from '../components/dashboard/WidgetContent'
import DashboardEditor from '../components/dashboard/DashboardEditor'
import MaterialIcon from '../components/common/MaterialIcon'
import type { DashboardWidget } from '../types'

/** Um id de instância que não colide com o que já está na grade. */
function novoId(type: string, usados: DashboardWidget[]): string {
  if (!usados.some((w) => w.id === type)) return type
  let i = 2
  while (usados.some((w) => w.id === `${type}-${i}`)) i++
  return `${type}-${i}`
}

export default function Dashboard() {
  const { user } = useAuth()
  const profile = useSelfProfile()
  const readOnly = useTenantStore((s) => s.readOnly)
  const now = useMemo(() => new Date(), [])

  // 30 dias abre o painel: é o recorte de "como está o atendimento agora", e é o
  // que o título lê.
  const [dias, setDias] = useState(30)
  const [editando, setEditando] = useState(false)
  const [rascunho, setRascunho] = useState<DashboardWidget[] | null>(null)
  const [selecionado, setSelecionado] = useState<string | null>(null)
  const [arrastando, setArrastando] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  // Layout gravado, ou o padrão de fábrica. O padrão NÃO é gravado na conta de
  // quem nunca personalizou: guardá-lo congelaria o painel dessa pessoa na
  // versão do dia em que a conta foi criada.
  const salvo = profile.prefs.dashboard?.widgets ?? layoutPadrao().widgets
  // Em edição a tela mostra o rascunho; fora dela, o que está gravado. É o que
  // deixa experimentar e desistir — e evita que o snapshot de outra aba embaralhe
  // a grade debaixo de quem está arrastando.
  const widgets = editando && rascunho ? rascunho : salvo

  const fontes = useMemo(() => fontesDoLayout(widgets), [widgets])
  const dados = useDashboardData(fontes, dias, now)

  // O seletor de período só aparece quando algum widget na tela usa período.
  const usaPeriodo = widgets.some((w) => {
    const f = widgetDef(w.type)?.fontes ?? []
    return f.includes('conversas') || w.type === 'funil'
  })

  // Sair do modo de edição se o acesso virar somente-leitura no meio do caminho
  // (o dono entrou no CRM de um cliente sem fechar a aba).
  useEffect(() => {
    if (readOnly && editando) { setEditando(false); setRascunho(null) }
  }, [readOnly, editando])

  function abrirEdicao() {
    setRascunho(salvo.map((w) => ({ ...w })))
    setSelecionado(null)
    setEditando(true)
  }

  function mudar(fn: (atual: DashboardWidget[]) => DashboardWidget[]) {
    setRascunho((r) => fn(r ?? salvo.map((w) => ({ ...w }))))
  }

  /** Soltar A sobre B troca os dois de lugar. */
  function soltar(alvoId: string) {
    const origemId = arrastando
    setArrastando(null)
    if (!origemId || origemId === alvoId) return
    mudar((atual) => {
      const i = atual.findIndex((w) => w.id === origemId)
      const j = atual.findIndex((w) => w.id === alvoId)
      if (i < 0 || j < 0) return atual
      const novo = [...atual]
      ;[novo[i], novo[j]] = [novo[j], novo[i]]
      return novo
    })
  }

  async function salvar() {
    if (!rascunho) return
    setSalvando(true)
    try {
      await saveSelfPrefs({ dashboard: { widgets: rascunho } })
      setEditando(false)
      setRascunho(null)
      setSelecionado(null)
    } catch (e) {
      alert(e instanceof Error ? e.message : t('painel.falhaSalvar'))
    } finally {
      setSalvando(false)
    }
  }

  const quem = saudacao(profile.displayName || user?.displayName || user?.email || '', now)

  // O título do painel é o estado do atendimento, em duas linhas: quantas pessoas
  // foram atendidas (tinta) e quantas esperam agora (cinza). Sem nenhum bloco de
  // conversas na tela o número não existe — aí o título volta a ser a saudação,
  // em vez de afirmar um zero que não foi medido.
  const periodo = dias === 365 ? t('painel.nosUltimos12Meses') : t('painel.nosUltimosDias', { n: dias })
  // Zero atendidos também volta à saudação: conta nova, ou período sem conversa,
  // não merece uma manchete que abre com "0".
  const temAtendidos = !!dados.relatorio && dados.clientesAtendidos > 0
  const linha1 = temAtendidos
    ? plural(dados.clientesAtendidos, 'painel.heroAtendidos_1', 'painel.heroAtendidos_n', { n: num(dados.clientesAtendidos), periodo })
    : quem.primeiro ? `${quem.parte}, ${quem.primeiro}.` : t('painel.tituloSemNome')
  const linha2 = editando
    ? t('painel.arrasteDica')
    : dados.aguardando.total > 0
      ? plural(dados.aguardando.total, 'painel.heroEsperando_1', 'painel.heroEsperando_n')
      : temAtendidos
        ? t('painel.heroNinguem')
        : dados.pendencias > 0
          ? plural(dados.pendencias, 'painel.compromisso_1', 'painel.compromisso_n')
          : t('painel.nadaHoje')

  return (
    // O painel cabe numa tela só: altura fixa, cabeçalho e uma GRADE EXPLÍCITA de
    // 6 × 3. As trilhas são `1fr`, e não `auto`, de propósito — com linhas
    // implícitas elas passariam a ser dimensionadas pelo conteúdo, os cards
    // perderiam altura definida e o "rola por dentro do card" deixaria de valer
    // em silêncio. `minHeight` é a válvula para janela baixa demais.
    <div className="dash" style={{ height: '100%', minHeight: 600, display: 'flex', flexDirection: 'column', gap: 16, padding: '18px 26px 22px' }}>
      {/* O TOPO SEM SEPARAÇÃO — nem card, nem linha: a saudação é a própria
          página. A margem negativa cancela o padding do painel, então o bloco
          sangra até a borda de cima (encostando na Topbar) e a da direita sem
          mexer no padding do `.dash`, que é quem mantém os cards no lugar. */}
      <div
        className="dash-hero"
        style={{
          position: 'relative',
          flexShrink: 0,
          margin: '-18px -26px 0',
          padding: '20px 26px 10px',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 20,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <span style={sx.eyebrow}>
            {dataPorExtenso(now)}{quem.primeiro && temAtendidos ? ` · ${quem.parte}, ${quem.primeiro}` : ''}
          </span>
          {/* O `clamp` em `cqw` mede a largura do CABEÇALHO, não da janela: com o
              menu recolhido ou aberto a janela é a mesma e o espaço do texto não. */}
          <h1 style={{
            fontFamily: FONT_DISPLAY, fontWeight: 500, color: C.ink, margin: '12px 0 0',
            fontSize: 'clamp(26px, 3.6cqw, 42px)', lineHeight: 1.08, letterSpacing: '-.04em',
            textWrap: 'balance',
          } as React.CSSProperties}>
            {linha1}
            <span style={{ display: 'block', color: C.headlineDim, fontSize: editando ? '0.55em' : undefined, letterSpacing: editando ? '-.02em' : undefined, marginTop: editando ? 6 : 0 }}>
              {linha2}
            </span>
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {usaPeriodo && (
            <div role="group" style={{ display: 'flex', background: C.surface, border: `1px solid ${C.line}`, borderRadius: 999, padding: 3 }}>
              {[30, 90, 365].map((d) => (
                <button
                  key={d}
                  aria-pressed={dias === d}
                  onClick={() => setDias(d)}
                  style={{
                    border: 'none', borderRadius: 999,
                    background: dias === d ? C.purpleSolid : 'transparent',
                    color: dias === d ? C.onAccent : C.sub,
                    padding: '5px 12px', fontSize: 12, fontWeight: 500, cursor: 'pointer',
                    transition: 'background .15s ease, color .15s ease',
                  }}
                >
                  {d === 365 ? t('painel.dozeMeses') : t('painel.dias', { n: d })}
                </button>
              ))}
            </div>
          )}
          {!editando && !readOnly && (
            <button
              onClick={abrirEdicao}
              className="hud-btn"
              title={t('painel.montarMeuJeito')}
              style={{
                width: 36, height: 36, borderRadius: '50%', background: C.surface,
                border: `1px solid ${C.line}`, color: C.sub, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <MaterialIcon name="tune" size={18} />
            </button>
          )}
        </div>
      </div>

      {editando && (
        <DashboardEditor
          widgets={widgets}
          selecionado={selecionado}
          onSelecionar={setSelecionado}
          onAlterar={(id, patch) => mudar((a) => a.map((w) => (w.id === id ? { ...w, ...patch } : w)))}
          onRemover={(id) => { mudar((a) => a.filter((w) => w.id !== id)); setSelecionado(null) }}
          onAdicionar={(type) => mudar((a) => {
            const def = widgetDef(type)
            if (!def || !cabe(a, def)) return a
            return [...a, { id: novoId(type, a), type, cols: def.cols, rows: def.rows, variant: 'surface' as const }]
          })}
          onPadrao={() => { setRascunho(layoutPadrao().widgets); setSelecionado(null) }}
          onSalvar={salvar}
          onCancelar={() => { setEditando(false); setRascunho(null); setSelecionado(null) }}
          salvando={salvando}
        />
      )}

      <div
        className="dash-grid"
        style={{
          flex: 1, minHeight: 0, display: 'grid',
          gridTemplateColumns: `repeat(${COLUNAS},1fr)`,
          gridTemplateRows: `repeat(${FAIXAS},1fr)`,
          gridAutoFlow: 'dense',
          gap: 16,
        }}
      >
        {widgets.map((w) => {
          const def = widgetDef(w.type)
          if (!def) return null
          return (
            <WidgetShell
              key={w.id}
              w={w}
              def={def}
              editando={editando}
              selecionado={selecionado === w.id}
              arrastando={arrastando === w.id}
              onSelect={() => setSelecionado(w.id)}
              onDragStart={() => setArrastando(w.id)}
              onDrop={() => soltar(w.id)}
            >
              <WidgetContent w={w} dados={dados} />
            </WidgetShell>
          )
        })}
      </div>
    </div>
  )
}
