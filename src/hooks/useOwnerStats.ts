import { useEffect, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../lib/firebase'

export interface PerClient {
  pipeline: number
  deals: number
}

export interface OwnerStats {
  pipelineTotal: number
  dealCount: number
  faturado: number
  aReceber: number
  vencido: number
  contactsCount: number
  activitiesCount: number
  perClient: Record<string, PerClient>
  loading: boolean
}

const VAZIO: Omit<OwnerStats, 'loading'> = {
  pipelineTotal: 0, dealCount: 0, faturado: 0, aReceber: 0, vencido: 0,
  contactsCount: 0, activitiesCount: 0, perClient: {},
}

/**
 * Métricas agregadas de todos os clientes, calculadas NO SERVIDOR.
 *
 * Antes eram quatro `collectionGroup` abertos daqui sobre `deals`, `invoices`, `contacts` e
 * `activities` de todos os tenants. A tela só mostrava somas, mas o navegador recebia os
 * documentos inteiros — nome da empresa e valor de cada negócio, cliente e forma de
 * pagamento de cada nota, nome e telefone de cada contato. O produto promete que o dono do
 * sistema não enxerga o atendimento dos clientes; essa promessa não se cumpria aqui.
 *
 * Agora a conta sai da callable `estatisticasClientes` e só os números atravessam.
 * Perde-se o "ao vivo" do onSnapshot: é uma visão geral administrativa, e recarregar a
 * página é atualização suficiente para o que ela responde.
 */
export function useOwnerStats(): OwnerStats {
  const [stats, setStats] = useState(VAZIO)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let vivo = true
    httpsCallable<void, typeof VAZIO>(functions, 'estatisticasClientes')()
      .then((r) => {
        if (!vivo) return
        setStats({ ...VAZIO, ...r.data })
      })
      .catch((e) => {
        console.error('[ownerStats]', e)
      })
      .finally(() => {
        if (vivo) setLoading(false)
      })
    return () => { vivo = false }
  }, [])

  return { ...stats, loading }
}
