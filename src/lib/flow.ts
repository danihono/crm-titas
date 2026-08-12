import { MarkerType, type Edge, type Node } from '@xyflow/react'
import type { FlowEdge, FlowNode, FlowNodeKind } from '../types'
import { C } from '../styles/sx'

/**
 * Ponte entre o modelo salvo no Firestore (FlowNode/FlowEdge, com x/y planos)
 * e o formato do React Flow (position aninhada, source/target).
 *
 * `data` é `type` e não `interface` de propósito: o React Flow exige que os
 * dados do nó sejam atribuíveis a Record<string, unknown>, e só type aliases
 * ganham index signature implícita no TypeScript.
 */
export type TitasNodeData = { title: string; subtitle: string; kind: FlowNodeKind }
export type TitasNode = Node<TitasNodeData, 'titas'>

export const NODE_W = 210
const COL_W = 262
const ROW_H = 152
const EDGE_COLOR = '#b6aec6'

export const NODE_KINDS: { id: FlowNodeKind; label: string; icon: string; color: string }[] = [
  { id: 'start', label: 'Início', icon: 'play_circle', color: C.green },
  { id: 'step', label: 'Etapa', icon: 'radio_button_checked', color: C.purple },
  { id: 'decision', label: 'Decisão', icon: 'call_split', color: C.amber },
  { id: 'end', label: 'Fim', icon: 'flag', color: C.rose },
]

export function kindMeta(kind: FlowNodeKind) {
  return NODE_KINDS.find((k) => k.id === kind) ?? NODE_KINDS[1]
}

/**
 * Id único mesmo para vários itens criados no mesmo milissegundo — o layout da
 * IA cria a lista inteira de uma vez, então `'n' + Date.now()` colidiria.
 */
let seq = 0
export function newId(prefix: string): string {
  seq += 1
  return `${prefix}${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export function toRfNodes(nodes: FlowNode[]): TitasNode[] {
  return nodes.map((n) => ({
    id: n.id,
    type: 'titas' as const,
    position: { x: n.x, y: n.y },
    data: { title: n.title, subtitle: n.subtitle, kind: n.kind },
  }))
}

export function toRfEdges(edges: FlowEdge[]): Edge[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.from,
    target: e.to,
    label: e.label || undefined,
    markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_COLOR, width: 18, height: 18 },
    style: { stroke: EDGE_COLOR, strokeWidth: 1.7 },
    labelStyle: { fill: C.sub, fontSize: 11.5, fontWeight: 700, fontFamily: "'Manrope',sans-serif" },
    labelBgStyle: { fill: '#ffffff', stroke: '#e6e3ee' },
    labelBgPadding: [7, 4] as [number, number],
    labelBgBorderRadius: 7,
  }))
}

export function fromRfNodes(nodes: TitasNode[]): FlowNode[] {
  return nodes.map((n) => ({
    id: n.id,
    title: n.data.title,
    subtitle: n.data.subtitle,
    kind: n.data.kind,
    x: Math.round(n.position.x),
    y: Math.round(n.position.y),
  }))
}

export function fromRfEdges(edges: Edge[]): FlowEdge[] {
  return edges.map((e) => ({
    id: e.id,
    from: e.source,
    to: e.target,
    // No React Flow o label é ReactNode; só interessa gravar quando é texto.
    label: typeof e.label === 'string' ? e.label : '',
  }))
}

export function emptyNode(x: number, y: number, kind: FlowNodeKind = 'step'): FlowNode {
  return { id: newId('n'), title: 'Nova etapa', subtitle: '', kind, x, y }
}

/**
 * Posiciona um grafo sem coordenadas (o que a IA devolve) em camadas de cima
 * para baixo: a profundidade vira a linha e os irmãos se espalham na horizontal.
 * Nós que não são alcançáveis a partir de uma raiz vão para uma faixa própria
 * embaixo, em vez de empilharem todos em cima do (0,0).
 */
export function autoLayout(
  nodes: { id: string; title: string; subtitle: string; kind: FlowNodeKind }[],
  edges: { from: string; to: string }[],
): FlowNode[] {
  const ids = new Set(nodes.map((n) => n.id))
  const links = edges.filter((e) => ids.has(e.from) && ids.has(e.to))

  const outgoing = new Map<string, string[]>()
  const indegree = new Map<string, number>(nodes.map((n) => [n.id, 0]))
  links.forEach((e) => {
    outgoing.set(e.from, [...(outgoing.get(e.from) ?? []), e.to])
    indegree.set(e.to, (indegree.get(e.to) ?? 0) + 1)
  })

  const depth = new Map<string, number>()
  const queue = nodes.filter((n) => (indegree.get(n.id) ?? 0) === 0).map((n) => n.id)
  // Grafo totalmente cíclico não tem raiz; começamos pelo primeiro nó.
  if (!queue.length && nodes.length) queue.push(nodes[0].id)
  queue.forEach((id) => depth.set(id, 0))

  for (let i = 0; i < queue.length; i += 1) {
    const id = queue[i]
    const d = depth.get(id) ?? 0
    ;(outgoing.get(id) ?? []).forEach((next) => {
      if (depth.has(next)) return
      depth.set(next, d + 1)
      queue.push(next)
    })
  }

  const maxDepth = Math.max(-1, ...[...depth.values()])
  nodes.forEach((n) => { if (!depth.has(n.id)) depth.set(n.id, maxDepth + 1) })

  const rows = new Map<number, string[]>()
  nodes.forEach((n) => {
    const d = depth.get(n.id) ?? 0
    rows.set(d, [...(rows.get(d) ?? []), n.id])
  })

  return nodes.map((n) => {
    const d = depth.get(n.id) ?? 0
    const row = rows.get(d) ?? []
    const i = row.indexOf(n.id)
    return {
      ...n,
      x: Math.round((i - (row.length - 1) / 2) * COL_W),
      y: d * ROW_H,
    }
  })
}
