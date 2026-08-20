import {
  addDoc, collection, deleteDoc, orderBy, query, serverTimestamp, updateDoc,
} from 'firebase/firestore'
import { deleteObject, getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage'
import { db, storage } from '../lib/firebase'
import { col, ref, uid } from '../lib/paths'
import { knowledgeFromDoc, mediaAssetFromDoc, variableFromDoc } from '../lib/converters'
import { extToType } from '../lib/format'
import { useCollection } from './useCollection'
import type { KnowledgeDoc, MediaAsset, Variable } from '../types'

// ---------------------------------------------------------------- Variáveis

export function useVariables() {
  return useCollection<Variable>(
    (u) => query(collection(db, `users/${u}/variables`), orderBy('key')),
    variableFromDoc,
    [],
  )
}

/** Chave sem chaves, espaços nem acento — é o que o `{{...}}` vai casar. */
export function normalizeVarKey(v: string): string {
  return v
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '')
}

export async function addVariable(key: string, value: string, description: string): Promise<string> {
  const clean = normalizeVarKey(key)
  if (!clean) throw new Error('Informe uma chave válida.')
  const r = await addDoc(col('variables'), {
    key: clean,
    value,
    description,
    createdAt: serverTimestamp(),
  })
  return r.id
}

export async function updateVariable(id: string, patch: Partial<Omit<Variable, 'id'>>): Promise<void> {
  await updateDoc(ref(`variables/${id}`), patch)
}

export async function deleteVariable(id: string): Promise<void> {
  await deleteDoc(ref(`variables/${id}`))
}

/** Mapa chave→valor das variáveis do tenant, pronto para o applyVariables. */
export function variableMap(vars: Variable[]): Record<string, string> {
  const out: Record<string, string> = {}
  vars.forEach((v) => {
    out[v.key] = v.value
  })
  return out
}

// -------------------------------------------------------- Biblioteca de mídias

export function useMediaLibrary() {
  return useCollection<MediaAsset>(
    (u) => query(collection(db, `users/${u}/mediaLibrary`), orderBy('uploadedAt', 'desc')),
    mediaAssetFromDoc,
    [],
  )
}

export async function uploadLibraryAsset(file: File): Promise<string> {
  const path = `users/${uid()}/library/${Date.now()}_${file.name}`
  await uploadBytes(storageRef(storage, path), file)
  const downloadURL = await getDownloadURL(storageRef(storage, path))
  const r = await addDoc(col('mediaLibrary'), {
    name: file.name,
    type: extToType(file.name),
    mimeType: file.type || '',
    sizeBytes: file.size,
    storagePath: path,
    downloadURL,
    uploadedAt: serverTimestamp(),
  })
  return r.id
}

export async function deleteLibraryAsset(asset: MediaAsset): Promise<void> {
  if (asset.storagePath) {
    await deleteObject(storageRef(storage, asset.storagePath)).catch((err) => {
      // Arquivo já sumiu do Storage: seguir e apagar o registro é o certo — deixá-lo
      // na lista apontando para o nada é pior do que a inconsistência que causou isto.
      if ((err as { code?: string }).code !== 'storage/object-not-found') throw err
    })
  }
  await deleteDoc(ref(`mediaLibrary/${asset.id}`))
}

// ------------------------------------------------------ Base de conhecimento

export function useKnowledge() {
  return useCollection<KnowledgeDoc>(
    (u) => query(collection(db, `users/${u}/knowledge`), orderBy('title')),
    knowledgeFromDoc,
    [],
  )
}

export async function addKnowledgeDoc(title: string, content: string): Promise<string> {
  const r = await addDoc(col('knowledge'), {
    title: title.trim(),
    content: content.trim(),
    enabled: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return r.id
}

export async function updateKnowledgeDoc(id: string, patch: Partial<Omit<KnowledgeDoc, 'id'>>): Promise<void> {
  await updateDoc(ref(`knowledge/${id}`), { ...patch, updatedAt: serverTimestamp() })
}

export async function deleteKnowledgeDoc(id: string): Promise<void> {
  await deleteDoc(ref(`knowledge/${id}`))
}

/** Teto do que a base injeta no prompt do agente — cada chamada é paga por token. */
const KNOWLEDGE_CHAR_BUDGET = 12_000

/**
 * Monta o trecho de base de conhecimento para o system prompt do Titã IA.
 *
 * Corta no orçamento em vez de mandar tudo: uma base grande encareceria (e estouraria)
 * toda pergunta feita ao agente. O corte é por documento inteiro, não no meio da frase.
 */
export function knowledgeContext(docs: KnowledgeDoc[]): string {
  const on = docs.filter((d) => d.enabled && d.content.trim())
  if (on.length === 0) return ''

  let used = 0
  const parts: string[] = []
  for (const d of on) {
    const block = `\n### ${d.title}\n${d.content.trim()}\n`
    if (used + block.length > KNOWLEDGE_CHAR_BUDGET) break
    used += block.length
    parts.push(block)
  }
  if (parts.length === 0) return ''
  return `\nBASE DE CONHECIMENTO (material da empresa — prefira estas informações às suas suposições):\n${parts.join('')}`
}
