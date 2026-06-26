import {
  addDoc, updateDoc, collection, query, where, orderBy, serverTimestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { col, ref } from '../lib/paths'
import { boardFromDoc, dealFromDoc } from '../lib/converters'
import { useCollection } from './useCollection'
import type { Board, Deal } from '../types'

export function useBoards() {
  return useCollection<Board>(
    (uid) => query(collection(db, `users/${uid}/boards`), orderBy('createdAt')),
    boardFromDoc,
    [],
  )
}

export function useDeals(boardId: string) {
  return useCollection<Deal>(
    (uid) => query(collection(db, `users/${uid}/deals`), where('boardId', '==', boardId), orderBy('order')),
    dealFromDoc,
    [boardId],
  )
}

/** Todos os deals do usuário (uma assinatura) — permite contar por quadro client-side. */
export function useAllDeals() {
  return useCollection<Deal>(
    (uid) => query(collection(db, `users/${uid}/deals`), orderBy('order')),
    dealFromDoc,
    [],
  )
}

/** Maior order + 1 dentro de uma coluna (append no fim). */
export function nextOrder(deals: Deal[], columnId: string): number {
  const inCol = deals.filter((d) => d.columnId === columnId)
  if (!inCol.length) return 0
  return Math.max(...inCol.map((d) => d.order)) + 1
}

export async function addBoard(name: string): Promise<string> {
  const columns = [
    { id: 'c1', title: 'A fazer', color: '#6f9bcf', order: 0 },
    { id: 'c2', title: 'Em andamento', color: '#d8a960', order: 1 },
    { id: 'c3', title: 'Concluído', color: '#5fc9a6', order: 2 },
  ]
  const r = await addDoc(col('boards'), { name, icon: 'dashboard', columns, createdAt: serverTimestamp() })
  return r.id
}

export async function addColumn(board: Board, title: string): Promise<void> {
  const order = board.columns.reduce((m, c) => Math.max(m, c.order), -1) + 1
  const newCol = { id: 'col' + Date.now(), title, color: '#9a6fb8', order }
  await updateDoc(ref(`boards/${board.id}`), { columns: [...board.columns, newCol] })
}

export async function addDeal(
  boardId: string,
  columnId: string,
  deals: Deal[],
  overrides: Partial<Deal> = {},
): Promise<void> {
  await addDoc(col('deals'), {
    company: 'Novo negócio',
    contact: 'Definir contato',
    value: 0,
    initials: '?',
    tag: 'Novo',
    boardId,
    columnId,
    order: nextOrder(deals, columnId),
    createdAt: serverTimestamp(),
    ...overrides,
  })
}

export async function moveDeal(dealId: string, toColumnId: string, deals: Deal[]): Promise<void> {
  await updateDoc(ref(`deals/${dealId}`), {
    columnId: toColumnId,
    order: nextOrder(deals.filter((d) => d.id !== dealId), toColumnId),
  })
}
