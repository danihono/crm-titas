import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  addEdge, Background, Controls, ReactFlow, ReactFlowProvider,
  useEdgesState, useNodesState, useReactFlow,
  type Connection, type Edge, type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import MaterialIcon from '../common/MaterialIcon'
import RingButton from '../common/RingButton'
import FlowNodeCard from './FlowNodeCard'
import { useTenantStore } from '../../store/tenantStore'
import { renameFlow, saveFlowGraph } from '../../hooks/useFlows'
import {
  emptyNode, fromRfEdges, fromRfNodes, newId, NODE_KINDS, NODE_W, toRfEdges, toRfNodes,
  type TitasNode,
} from '../../lib/flow'
import { C, sx } from '../../styles/sx'
import type { Flow, FlowNodeKind } from '../../types'
import { chipColors } from '../../lib/color'
import { useIsDark } from '../../store/themeStore'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

// Fora do componente: recriar o objeto a cada render faz o React Flow
// remontar todos os nós e derrubar o estado de edição inline.
const nodeTypes: NodeTypes = { titas: FlowNodeCard }

export default function FlowEditor({ flow, onBack }: { flow: Flow; onBack: () => void }) {
  return (
    <ReactFlowProvider>
      <FlowEditorInner flow={flow} onBack={onBack} />
    </ReactFlowProvider>
  )
}

function FlowEditorInner({ flow, onBack }: { flow: Flow; onBack: () => void }) {
  const dark = useIsDark()
  const readOnly = useTenantStore((s) => s.readOnly)
  const { screenToFlowPosition, updateNodeData, deleteElements } = useReactFlow()
  const wrapper = useRef<HTMLDivElement>(null)

  // Estado inicial vindo do doc — só na montagem. O componente é remontado com
  // key={flow.id} ao trocar de fluxo, então o snapshot em tempo real do
  // Firestore não briga com o que está sendo editado na tela.
  const [nodes, setNodes, onNodesChange] = useNodesState<TitasNode>(toRfNodes(flow.nodes))
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(toRfEdges(flow.edges))
  const [name, setName] = useState(flow.name)
  const [saveState, setSaveState] = useState<SaveState>('idle')

  const selectedNode = nodes.find((n) => n.selected)
  const selectedEdge = edges.find((e) => e.selected)

  // --- Autosave -------------------------------------------------------------
  // Arrastar um nó dispara dezenas de mudanças por segundo; gravamos ~800ms
  // depois da última, e damos flush ao desmontar para não perder a última.
  //
  // Comparamos o payload de domínio com o último gravado em vez de reagir a
  // qualquer mudança: o React Flow emite eventos de medição na montagem e de
  // seleção ao clicar, e nenhum dos dois muda o que vai para o Firestore —
  // sem essa checagem, só abrir um fluxo já geraria uma escrita à toa.
  const timer = useRef<number>()
  const latest = useRef({ nodes: flow.nodes, edges: flow.edges })
  const savedJson = useRef(JSON.stringify({ n: flow.nodes, e: flow.edges }))

  const persist = useCallback(() => {
    timer.current = undefined
    const { nodes: n, edges: e } = latest.current
    const json = JSON.stringify({ n, e })
    if (json === savedJson.current) { setSaveState('saved'); return }
    setSaveState('saving')
    saveFlowGraph(flow.id, n, e)
      .then(() => { savedJson.current = json; setSaveState('saved') })
      .catch((err) => {
        console.error('[FlowEditor] falha ao salvar', err)
        setSaveState('error')
      })
  }, [flow.id])

  useEffect(() => {
    if (readOnly) return
    const n = fromRfNodes(nodes)
    const e = fromRfEdges(edges)
    latest.current = { nodes: n, edges: e }
    if (JSON.stringify({ n, e }) === savedJson.current) return
    window.clearTimeout(timer.current)
    setSaveState('saving')
    timer.current = window.setTimeout(persist, 800)
  }, [nodes, edges, persist, readOnly])

  useEffect(() => () => {
    if (timer.current) {
      window.clearTimeout(timer.current)
      persist()
    }
  }, [persist])
  // -------------------------------------------------------------------------

  const onConnect = useCallback((c: Connection) => {
    const [styled] = toRfEdges([{ id: newId('e'), from: c.source, to: c.target, label: '' }])
    setEdges((es) => addEdge({ ...styled, source: c.source, target: c.target }, es))
  }, [setEdges])

  function handleAddNode() {
    const rect = wrapper.current?.getBoundingClientRect()
    const center = rect
      ? screenToFlowPosition({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 })
      : { x: 0, y: 0 }
    const node = emptyNode(Math.round(center.x - NODE_W / 2), Math.round(center.y - 40))
    setNodes((ns) => [...ns, ...toRfNodes([node])])
  }

  function handleDeleteSelected() {
    // deleteElements cuida das setas ligadas ao nó removido.
    deleteElements({
      nodes: nodes.filter((n) => n.selected).map((n) => ({ id: n.id })),
      edges: edges.filter((e) => e.selected).map((e) => ({ id: e.id })),
    })
  }

  function commitName() {
    const n = name.trim()
    if (!n || n === flow.name) { setName(flow.name); return }
    renameFlow(flow.id, n).catch((e) => {
      alert(e instanceof Error ? e.message : 'Falha ao renomear o fluxo.')
    })
  }

  function setEdgeLabel(id: string, label: string) {
    setEdges((es) => es.map((e) => (e.id === id ? { ...e, label: label || undefined } : e)))
  }

  const saveLabel = useMemo(() => ({
    idle: '', saving: 'Salvando...', saved: 'Salvo', error: 'Falha ao salvar',
  }[saveState]), [saveState])

  const canDelete = !readOnly && (!!selectedNode || !!selectedEdge)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Barra de ferramentas */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px', background: C.surface, borderBottom: `1px solid ${C.fieldBorder}` }}>
        <button onClick={onBack} style={{ ...sx.btnGhost, padding: '8px 12px' }}>
          <MaterialIcon name="arrow_back" size={17} /> Fluxos
        </button>
        <input
          value={name}
          disabled={readOnly}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
          style={{ width: 260, background: C.field, border: `1px solid ${C.fieldBorder}`, borderRadius: 10, padding: '9px 12px', color: C.ink, fontSize: 13.5, fontWeight: 700, outline: 'none' }}
        />
        <span style={{ fontSize: 11.5, color: saveState === 'error' ? C.roseDeep : C.muted, fontWeight: 600, minWidth: 86 }}>
          {saveLabel}
        </span>
        <div style={{ flex: 1 }} />
        {!readOnly && (
          <>
            <button onClick={handleDeleteSelected} disabled={!canDelete} style={{ ...sx.btnGhost, opacity: canDelete ? 1 : 0.45, cursor: canDelete ? 'pointer' : 'default' }}>
              <MaterialIcon name="delete" size={17} /> Excluir
            </button>
            <RingButton radius={11} onClick={handleAddNode} style={{ ...sx.btnPrimary }}>
              <MaterialIcon name="add" size={18} /> Adicionar etapa
            </RingButton>
          </>
        )}
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Canvas */}
        <div ref={wrapper} style={{ flex: 1, minWidth: 0, background: C.panel }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
            minZoom={0.2}
            maxZoom={1.8}
            nodesDraggable={!readOnly}
            nodesConnectable={!readOnly}
            edgesReconnectable={!readOnly}
            deleteKeyCode={readOnly ? null : ['Delete', 'Backspace']}
            proOptions={{ hideAttribution: false }}
          >
            <Background color="#d9d3e4" gap={18} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>

        {/* Inspetor */}
        <div style={{ width: 288, flexShrink: 0, background: C.surface, borderLeft: `1px solid ${C.fieldBorder}`, padding: '20px 20px 30px', overflowY: 'auto' }}>
          {selectedNode ? (
            <>
              <div style={{ fontSize: 11, letterSpacing: '.1em', color: C.faint, fontWeight: 700, marginBottom: 12 }}>ETAPA</div>
              <label style={sx.label}>Título</label>
              <input
                value={selectedNode.data.title}
                disabled={readOnly}
                onChange={(e) => updateNodeData(selectedNode.id, { title: e.target.value })}
                style={{ ...sx.input, margin: '6px 0 14px' }}
              />
              <label style={sx.label}>Descrição</label>
              <textarea
                value={selectedNode.data.subtitle}
                disabled={readOnly}
                rows={3}
                onChange={(e) => updateNodeData(selectedNode.id, { subtitle: e.target.value })}
                style={{ ...sx.input, margin: '6px 0 14px', resize: 'vertical', lineHeight: 1.5 }}
              />
              <label style={sx.label}>Tipo</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 8 }}>
                {NODE_KINDS.map((k) => {
                  const on = k.id === selectedNode.data.kind
                  return (
                    <button
                      key={k.id}
                      disabled={readOnly}
                      onClick={() => updateNodeData(selectedNode.id, { kind: k.id as FlowNodeKind })}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5, borderRadius: 9, padding: '7px 11px',
                        fontSize: 12, fontWeight: 700, cursor: readOnly ? 'default' : 'pointer',
                        border: '1px solid ' + (on ? k.color : C.fieldBorder),
                        background: on ? chipColors(k.color, dark).bg : C.surface,
                        color: on ? k.color : C.sub,
                      }}
                    >
                      <MaterialIcon name={k.icon} size={15} /> {k.label}
                    </button>
                  )
                })}
              </div>
            </>
          ) : selectedEdge ? (
            <>
              <div style={{ fontSize: 11, letterSpacing: '.1em', color: C.faint, fontWeight: 700, marginBottom: 12 }}>SETA</div>
              <label style={sx.label}>Rótulo</label>
              <input
                value={typeof selectedEdge.label === 'string' ? selectedEdge.label : ''}
                disabled={readOnly}
                placeholder='Ex.: "sim", "recusado"...'
                onChange={(e) => setEdgeLabel(selectedEdge.id, e.target.value)}
                style={{ ...sx.input, margin: '6px 0 14px' }}
              />
              <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.5 }}>
                Útil para nomear as saídas de uma decisão.
              </div>
            </>
          ) : (
            <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.6 }}>
              <MaterialIcon name="ads_click" size={22} color="#c9c2d6" />
              <div style={{ marginTop: 8 }}>
                Clique numa etapa ou seta para editar aqui.
              </div>
              {!readOnly && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.lineHair}` }}>
                  Arraste da bolinha de baixo de uma etapa até a de cima de outra para ligá-las.
                  Duplo clique no título renomeia direto na caixa.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
