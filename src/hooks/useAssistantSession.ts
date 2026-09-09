import { useEffect, useState } from 'react'
import { collection, doc, limit, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { ASSISTANT_UID } from '../lib/whatsapp'
import type { WhatsappStatus } from './useWhatsappStatus'

/**
 * Estado do NÚMERO DA ASSISTENTE — `whatsappStatus/_assistente`.
 *
 * Hook próprio, e não `useWhatsappStatus`, porque aquele observa o ambiente ATIVO: o número
 * da Assistente é da plataforma e não pertence a ambiente nenhum. As security rules só
 * liberam esta leitura para os donos do sistema.
 */
const INICIAL: WhatsappStatus = { status: 'disconnected', qr: null, phoneNumber: null, lastError: null }

export function useAssistantStatus(): WhatsappStatus {
  const [st, setSt] = useState<WhatsappStatus>(INICIAL)
  useEffect(() => {
    return onSnapshot(
      doc(db, 'whatsappStatus', ASSISTANT_UID),
      (snap) => {
        const d = snap.data()
        if (!d) {
          setSt(INICIAL)
          return
        }
        setSt({
          status: (d.status ?? 'disconnected') as WhatsappStatus['status'],
          qr: d.qr ?? null,
          phoneNumber: d.phoneNumber ?? null,
          lastError: d.lastError ?? null,
        })
      },
      (err) => console.error('[useAssistantStatus]', err),
    )
  }, [])
  return st
}

export interface EnvioAssistente {
  id: string
  tenantUid: string
  kind: string
  status: string
  lastError: string | null
  createdAt: Date | null
}

/** As últimas saídas da fila. Escrita só pelo Admin SDK; aqui é leitura de diagnóstico. */
export function useAssistantOutbox(): EnvioAssistente[] {
  const [docs, setDocs] = useState<EnvioAssistente[]>([])
  useEffect(() => {
    const q = query(collection(db, 'assistantOutbox'), orderBy('createdAt', 'desc'), limit(20))
    return onSnapshot(
      q,
      (snap) => setDocs(snap.docs.map((d) => ({
        id: d.id,
        tenantUid: String(d.get('tenantUid') ?? ''),
        kind: String(d.get('kind') ?? ''),
        status: String(d.get('status') ?? ''),
        lastError: (d.get('lastError') as string | undefined) ?? null,
        createdAt: d.get('createdAt')?.toDate?.() ?? null,
      }))),
      (err) => console.error('[useAssistantOutbox]', err),
    )
  }, [])
  return docs
}
