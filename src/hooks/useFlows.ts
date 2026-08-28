import {
  addDoc, updateDoc, deleteDoc, collection, query, orderBy, serverTimestamp,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '../lib/firebase'
import { col, ref } from '../lib/paths'
import { flowFromDoc } from '../lib/converters'
import { autoLayout, newId } from '../lib/flow'
import { useCollection } from './useCollection'
import type { Flow, FlowEdge, FlowNode, FlowNodeKind } from '../types'

export function useFlows() {
  return useCollection<Flow>(
    (uid) => query(collection(db, `users/${uid}/flows`), orderBy('createdAt')),
    flowFromDoc,
    [],
  )
}

export async function addFlow(
  name: string,
  overrides: Partial<Pick<Flow, 'description' | 'nodes' | 'edges' | 'source'>> = {},
): Promise<string> {
  const r = await addDoc(col('flows'), {
    name,
    description: '',
    nodes: [],
    edges: [],
    source: 'manual',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  })
  return r.id
}

/** Salva o desenho inteiro (chamado pelo autosave do editor). */
export async function saveFlowGraph(flowId: string, nodes: FlowNode[], edges: FlowEdge[]): Promise<void> {
  await updateDoc(ref(`flows/${flowId}`), { nodes, edges, updatedAt: serverTimestamp() })
}

export async function renameFlow(flowId: string, name: string): Promise<void> {
  await updateDoc(ref(`flows/${flowId}`), { name, updatedAt: serverTimestamp() })
}

export async function deleteFlow(flowId: string): Promise<void> {
  await deleteDoc(ref(`flows/${flowId}`))
}

interface GerarFluxoRequest { descricao: string }
interface GerarFluxoResponse {
  name: string
  nodes: { id: string; title: string; subtitle: string; kind: FlowNodeKind }[]
  edges: { from: string; to: string; label: string }[]
}

/** O que a IA devolveu, já posicionado e pronto para virar um doc. */
export interface GeneratedFlow {
  name: string
  nodes: FlowNode[]
  edges: FlowEdge[]
}

/**
 * Chama a Cloud Function gerarFluxoIA (Gemini) e monta o grafo.
 *
 * O modelo devolve só a estrutura — as coordenadas saem do autoLayout aqui,
 * porque pedir x/y para o modelo gasta tokens e posiciona pior.
 */
export async function callGerarFluxoIA(descricao: string): Promise<GeneratedFlow> {
  const fn = httpsCallable<GerarFluxoRequest, GerarFluxoResponse>(functions, 'gerarFluxoIA')
  const res = await fn({ descricao })
  const data = res.data
  const nodes = autoLayout(data?.nodes ?? [], data?.edges ?? [])
  const ids = new Set(nodes.map((n) => n.id))
  const edges: FlowEdge[] = (data?.edges ?? [])
    .filter((e) => ids.has(e.from) && ids.has(e.to))
    .map((e) => ({ id: newId('e'), from: e.from, to: e.to, label: e.label ?? '' }))
  return { name: data?.name?.trim() || 'Fluxo sem nome', nodes, edges }
}
