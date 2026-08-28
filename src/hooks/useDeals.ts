import {
  addDoc, updateDoc, deleteDoc, collection, query, where, orderBy, serverTimestamp,
  writeBatch, doc as fsDoc, getDoc, getDocs,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { col, ref, uid } from '../lib/paths'
import { boardFromDoc, dealFromDoc, leadFromDoc } from '../lib/converters'
import { initialsOf } from '../lib/format'
import { useCollection } from './useCollection'
import type { Board, Column, Deal } from '../types'

export function useBoards() {
  return useCollection<Board>(
    (uid) => query(collection(db, `users/${uid}/boards`), orderBy('createdAt')),
    boardFromDoc,
    [],
  )
}

/** Id fixo do quadro do sistema. É fixo de propósito: o painel aponta para ele pelo nome. */
export const LEADS_BOARD_ID = 'leads'

/**
 * As etapas do quadro LEADS. Não são editáveis, e é isso que faz o funil do painel valer:
 * se o usuário pudesse renomear ou apagar um degrau, a série histórica mudaria de sentido
 * sozinha. Quem quer etapa própria cria outro quadro, que continua com CRUD completo.
 *
 * `Perdido` fica FORA do funil: perder um lead não é avançar, e contá-lo como degrau faria
 * a conversão da última etapa mentir.
 */
export const LEADS_COLUMNS: Column[] = [
  { id: 'novo', title: 'Novo lead', color: '#8e97b8', order: 0 },
  { id: 'contato', title: 'Contato feito', color: '#6f9bcf', order: 1 },
  { id: 'qualificado', title: 'Qualificado', color: '#9a6fb8', order: 2 },
  { id: 'proposta', title: 'Proposta enviada', color: '#d8a960', order: 3 },
  { id: 'ganho', title: 'Ganho', color: '#5fc9a6', order: 4 },
  { id: 'perdido', title: 'Perdido', color: '#c98a9f', order: 5, outOfFunnel: true },
]

/** As etapas que formam o funil, na ordem — sem a coluna Perdido. */
export function funnelColumns(board: Board): Column[] {
  return [...board.columns].sort((a, b) => a.order - b.order).filter((c) => !c.outOfFunnel)
}

/** Mensagem única para as tentativas de mexer no quadro fixo. */
const FIXO = 'O quadro Leads é fixo. Crie outro quadro para ter etapas próprias.'

function travaQuadroFixo(boardId: string): void {
  if (boardId === LEADS_BOARD_ID) throw new Error(FIXO)
}

/**
 * Garante o quadro LEADS e traz para dentro dele os leads da coleção antiga.
 *
 * Idempotente por construção: o card migrado tem id derivado do lead (`lead-<id>`), então
 * rodar de novo sobrescreve em vez de duplicar, e o doc do quadro é gravado no ÚLTIMO lote —
 * quadro existindo significa "migração terminou". Se algo falhar no meio, a próxima chamada
 * continua de onde parou.
 */
export async function ensureLeadsBoard(): Promise<void> {
  const boardRef = ref(`boards/${LEADS_BOARD_ID}`)
  if ((await getDoc(boardRef)).exists()) return

  const legacy = (await getDocs(col('leads'))).docs
  const base = `users/${uid()}/deals`
  const primeira = LEADS_COLUMNS[0].id

  const chunks: (typeof legacy)[] = []
  for (let i = 0; i < legacy.length; i += 200) chunks.push(legacy.slice(i, i + 200))
  if (!chunks.length) chunks.push([])

  for (let i = 0; i < chunks.length; i++) {
    const batch = writeBatch(db)
    chunks[i].forEach((d, k) => {
      const lead = leadFromDoc(d.id, d.data())
      const nome = lead.name.trim()
      const empresa = lead.company.trim()
      const nascimento = lead.createdAt ?? new Date()
      batch.set(fsDoc(db, `${base}/lead-${d.id}`), {
        company: empresa || nome || 'Lead',
        contact: nome || 'Definir contato',
        value: lead.value || 0,
        initials: lead.initials || initialsOf(nome || empresa) || '?',
        // A origem do lead ('Site', 'Indicação'…) vira etiqueta: é como o Kanban mostra
        // essa informação, e é o que mantém a rosca "Origem dos leads" de pé.
        tag: lead.source.trim() || 'Novo',
        boardId: LEADS_BOARD_ID,
        columnId: primeira,
        order: i * 200 + k,
        createdAt: nascimento,
        reachedAt: { [primeira]: nascimento },
      })
      batch.delete(d.ref)
    })
    if (i === chunks.length - 1) {
      batch.set(boardRef, {
        name: 'Leads',
        icon: 'filter_alt',
        color: '#7a52a0',
        columns: LEADS_COLUMNS,
        system: 'leads',
        // Data zero de propósito: `useBoards` ordena por createdAt, então o quadro do
        // sistema nasce sempre na frente dos quadros do usuário no seletor.
        createdAt: new Date(0),
      })
    }
    await batch.commit()
  }
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

/**
 * Cria o quadro já com três etapas — um quadro sem etapa não serve para nada. Todas são
 * renomeáveis, recoloríveis e removíveis depois; o que vem pronto é só o ponto de partida.
 */
export async function addBoard(name: string, icon = 'dashboard', color = '#7a52a0'): Promise<string> {
  const columns = [
    { id: 'c1', title: 'A fazer', color: '#6f9bcf', order: 0 },
    { id: 'c2', title: 'Em andamento', color: '#d8a960', order: 1 },
    { id: 'c3', title: 'Concluído', color: '#5fc9a6', order: 2 },
  ]
  const r = await addDoc(col('boards'), { name, icon, color, columns, createdAt: serverTimestamp() })
  return r.id
}

/** Campos editáveis do quadro. */
export interface BoardForm {
  name: string
  icon: string
  color: string
}

export async function updateBoard(boardId: string, form: BoardForm): Promise<void> {
  travaQuadroFixo(boardId)
  await updateDoc(ref(`boards/${boardId}`), {
    name: form.name.trim() || 'Quadro',
    icon: form.icon || 'dashboard',
    color: form.color,
  })
}

/**
 * Apaga em lotes. O writeBatch do Firestore aceita no máximo 500 operações, e um quadro
 * cheio passa disso com facilidade — daí o fatiamento em vez de um batch só.
 */
async function deleteDealsInBatches(dealIds: string[], extra?: (batch: ReturnType<typeof writeBatch>) => void): Promise<void> {
  const base = `users/${uid()}/deals`
  const chunks: string[][] = []
  for (let i = 0; i < dealIds.length; i += 400) chunks.push(dealIds.slice(i, i + 400))
  if (!chunks.length) chunks.push([])
  for (let i = 0; i < chunks.length; i++) {
    const batch = writeBatch(db)
    chunks[i].forEach((id) => batch.delete(fsDoc(db, `${base}/${id}`)))
    // A operação extra (apagar o quadro / reescrever as colunas) vai no ÚLTIMO lote: se
    // algum lote de negócios falhar antes, o quadro continua de pé com o que sobrou,
    // em vez de sumir deixando cards órfãos.
    if (i === chunks.length - 1) extra?.(batch)
    await batch.commit()
  }
}

/** Exclui o quadro E os negócios dele. Sem volta — a UI confirma antes, com a contagem. */
export async function deleteBoard(boardId: string, deals: Deal[]): Promise<void> {
  travaQuadroFixo(boardId)
  const ids = deals.filter((d) => d.boardId === boardId).map((d) => d.id)
  await deleteDealsInBatches(ids, (batch) => batch.delete(fsDoc(db, `users/${uid()}/boards/${boardId}`)))
}

export async function addColumn(board: Board, title: string): Promise<void> {
  travaQuadroFixo(board.id)
  const order = board.columns.reduce((m, c) => Math.max(m, c.order), -1) + 1
  const newCol = { id: 'col' + Date.now(), title, color: '#9a6fb8', order }
  await updateDoc(ref(`boards/${board.id}`), { columns: [...board.columns, newCol] })
}

/** Campos editáveis de uma etapa. */
export interface ColumnForm {
  title: string
  color: string
}

/** As colunas são um array dentro do doc do quadro — editar é reescrever o array. */
export async function updateColumn(board: Board, columnId: string, form: ColumnForm): Promise<void> {
  travaQuadroFixo(board.id)
  const columns = board.columns.map((c) =>
    c.id === columnId ? { ...c, title: form.title.trim() || 'Etapa', color: form.color } : c)
  await updateDoc(ref(`boards/${board.id}`), { columns })
}

/** Troca a etapa de lugar com a vizinha, reescrevendo os `order` das duas. */
export async function moveColumn(board: Board, columnId: string, dir: 'left' | 'right'): Promise<void> {
  travaQuadroFixo(board.id)
  const sorted = [...board.columns].sort((a, b) => a.order - b.order)
  const i = sorted.findIndex((c) => c.id === columnId)
  const j = dir === 'left' ? i - 1 : i + 1
  if (i < 0 || j < 0 || j >= sorted.length) return
  ;[sorted[i], sorted[j]] = [sorted[j], sorted[i]]
  await updateDoc(ref(`boards/${board.id}`), {
    columns: sorted.map((c, k) => ({ ...c, order: k })),
  })
}

/** Exclui a etapa E os negócios dentro dela. A UI confirma antes, com a contagem. */
export async function deleteColumn(board: Board, columnId: string, deals: Deal[]): Promise<void> {
  travaQuadroFixo(board.id)
  const ids = deals.filter((d) => d.boardId === board.id && d.columnId === columnId).map((d) => d.id)
  const columns = board.columns
    .filter((c) => c.id !== columnId)
    .sort((a, b) => a.order - b.order)
    .map((c, k) => ({ ...c, order: k }))
  await deleteDealsInBatches(ids, (batch) =>
    batch.update(fsDoc(db, `users/${uid()}/boards/${board.id}`), { columns }))
}

/** Campos editáveis de um negócio — o que o DealModal preenche. */
export interface DealForm {
  company: string
  contact: string
  value: number
  tag: string
  /** Contato escolhido da lista. Vazio quando o nome foi digitado à mão — segue valendo. */
  contactId?: string
}

/**
 * Normaliza o formulário para o formato gravado. Criar e editar passam pelo mesmo
 * lugar para não divergirem (as iniciais são derivadas, nunca digitadas).
 */
function dealFields(form: DealForm) {
  const company = form.company.trim()
  const contact = form.contact.trim()
  return {
    company: company || 'Novo negócio',
    contact: contact || 'Definir contato',
    value: Number.isFinite(form.value) && form.value > 0 ? Math.round(form.value) : 0,
    initials: initialsOf(contact || company) || '?',
    tag: form.tag || 'Novo',
    contactId: form.contactId ?? '',
  }
}

export async function addDeal(
  boardId: string,
  columnId: string,
  deals: Deal[],
  form: DealForm,
): Promise<void> {
  await addDoc(col('deals'), {
    ...dealFields(form),
    boardId,
    columnId,
    order: nextOrder(deals, columnId),
    createdAt: serverTimestamp(),
    // Nascer numa etapa já é tê-la alcançado — sem isto, um lead criado direto em
    // "Qualificado" entraria no funil sem ter passado por degrau nenhum.
    reachedAt: { [columnId]: serverTimestamp() },
  })
}

/** Edita os dados do negócio. Coluna/ordem ficam por conta do arraste (moveDeal). */
export async function updateDeal(dealId: string, form: DealForm): Promise<void> {
  await updateDoc(ref(`deals/${dealId}`), dealFields(form))
}

export async function deleteDeal(dealId: string): Promise<void> {
  await deleteDoc(ref(`deals/${dealId}`))
}

export async function moveDeal(dealId: string, toColumnId: string, deals: Deal[]): Promise<void> {
  const patch: Record<string, unknown> = {
    columnId: toColumnId,
    order: nextOrder(deals.filter((d) => d.id !== dealId), toColumnId),
  }
  // Só a PRIMEIRA chegada é registrada. Voltar uma etapa e avançar de novo não pode
  // reescrever a data original, senão o funil esqueceria por onde o lead já andou — e o
  // tempo do degrau viraria o tempo do reprocesso, não o da venda.
  const atual = deals.find((d) => d.id === dealId)
  if (!atual?.reachedAt?.[toColumnId]) patch[`reachedAt.${toColumnId}`] = serverTimestamp()
  await updateDoc(ref(`deals/${dealId}`), patch)
}
