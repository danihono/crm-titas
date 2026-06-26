import { collection, query, orderBy, addDoc, serverTimestamp } from 'firebase/firestore'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../lib/firebase'
import { col, uid } from '../lib/paths'
import { fileFromDoc } from '../lib/converters'
import { extToType } from '../lib/format'
import { useCollection } from './useCollection'
import type { FileMeta } from '../types'

export function useFiles(contactId: string | null) {
  return useCollection<FileMeta>(
    (u) => (contactId ? query(collection(db, `users/${u}/contacts/${contactId}/files`), orderBy('uploadedAt', 'desc')) : null),
    fileFromDoc,
    [contactId],
  )
}

/** Sobe o arquivo ao Storage e grava os metadados na subcoleção files do contato. */
export async function uploadContactFile(contactId: string, file: File): Promise<void> {
  const path = `users/${uid()}/contacts/${contactId}/${Date.now()}_${file.name}`
  const sref = storageRef(storage, path)
  await uploadBytes(sref, file)
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
