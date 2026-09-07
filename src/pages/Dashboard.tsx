import { useEffect, useMemo, useState } from 'react'
import { C, FONT_DISPLAY } from '../styles/sx'
import { useAuth } from '../contexts/AuthContext'
import { useSelfProfile, saveSelfPrefs } from '../hooks/useProfile'
import { useTenantStore } from '../store/tenantStore'
import { useDashboardData } from '../hooks/useDashboardData'
import {
  COLUNAS, FAIXAS, cabe, fontesDoLayout, layoutPadrao, widgetDef,
} from '../lib/dashboardWidgets'
import { greeting } from '../lib/format'
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

  const [dias, setDias] = useState(90)
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
      alert(e instanceof Error ? e.message : 'Não foi possível salvar o painel.')
    } finally {
      setSalvando(false)
    }
  }

  const dateLabel = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' }).format(now)

  return (
    // O painel cabe numa tela só: altura fixa, cabeçalho e uma GRADE EXPLÍCITA de
    // 6 × 3. As trilhas são `1fr`, e não `auto`, de propósito — com linhas
    // implícitas elas passariam a ser dimensionadas pelo conteúdo, os cards
    // perderiam altura definida e o "rola por dentro do card" deixaria de valer
    // em silêncio. `minHeight` é a válvula para janela baixa demais.
    <div style={{ height: '100%', minHeight: 600, display: 'flex', flexDirection: 'column', gap: 13, padding: '18px 26px 20px' }}>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20 }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: 25, fontWeight: 700, letterSpacing: '-.03em', color: C.ink, margin: 0, lineHeight: 1.15 }}>
            {greeting(profile.displayName || user?.displayName || user?.email || '').split(' · ')[0]}
          </h1>
          <div style={{ fontSize: 12.5, color: C.sub, marginTop: 3 }}>
            {editando
              ? 'Arraste os blocos para trocar de lugar. Clique num deles para mudar tamanho e cor.'
              : dados.pendencias > 0
                ? `Você tem ${dados.pendencias} ${dados.pendencias === 1 ? 'compromisso' : 'compromissos'} hoje.`
                : 'Nada marcado para hoje.'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
          {!editando && <span style={{ fontSize: 12, color: C.muted, textTransform: 'capitalize', marginRight: 4 }}>{dateLabel}</span>}
          {usaPeriodo && [30, 90, 365].map((d) => (
            <button
              key={d}
              onClick={() => setDias(d)}
              style={{
                border: '1px solid ' + (dias === d ? C.selBorder : C.fieldBorder),
                background: dias === d ? C.sel : C.surface,
                color: dias === d ? C.purple : C.sub,
                borderRadius: 10, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}
            >
              {d === 365 ? '12 meses' : `${d} dias`}
            </button>
          ))}
          {!editando && !readOnly && (
            <button
              onClick={abrirEdicao}
              title="Montar o painel do meu jeito"
              style={{
                width: 34, height: 34, borderRadius: 10, background: C.surface,
                border: `1px solid ${C.fieldBorder}`, color: C.sub, cursor: 'pointer',
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
        style={{
          flex: 1, minHeight: 0, display: 'grid',
          gridTemplateColumns: `repeat(${COLUNAS},1fr)`,
          gridTemplateRows: `repeat(${FAIXAS},1fr)`,
          gridAutoFlow: 'dense',
          gap: 13,
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
