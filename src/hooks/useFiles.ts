import { collection, query, orderBy, addDoc, serverTimestamp } from 'firebase/firestore'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../lib/firebase'
import { col, uid } from '../lib/paths'
import { fileFromDoc } from '../lib/converters'
import { extToType } from '../lib/format'
import { safeFileName, validarAnexo } from '../lib/upload'
import { useCollection } from './useCollection'
import type { FileMeta } from '../types'

export function useFiles(contactId: string | null) {
  return useCollection<FileMeta>(
    (u) => (contactId ? query(collection(db, `users/${u}/contacts/${contactId}/files`), orderBy('uploadedAt', 'desc')) : null),
    fileFromDoc,
    [contactId],
  )
}

/**
 * Sobe o arquivo ao Storage e grava os metadados na subcoleção files do contato.
 *
 * Este caminho não validava NADA — nem tamanho, nem tipo — e ainda interpolava o nome do
 * arquivo cru no caminho do Storage, onde uma barra vira pasta e leva o upload para fora
 * do prefixo que as regras confinam.
 */
export async function uploadContactFile(contactId: string, file: File): Promise<void> {
  const contentType = validarAnexo(file)
  const path = `users/${uid()}/contacts/${contactId}/${Date.now()}_${safeFileName(file.name)}`
  const sref = storageRef(storage, path)
  await uploadBytes(sref, file, { contentType })
  const downloadURL = await getDownloadURL(sref)
  await addDoc(col(`contacts/${contactId}/files`), {
    name: file.name,
    type: extToType(file.name),
    sizeBytes: file.size,
    storagePath: path,
    downloadURL,
    uploadedAt: serverTimestamp(),
  })
}
