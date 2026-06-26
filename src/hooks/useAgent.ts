import { useEffect, useState } from 'react'
import { doc, onSnapshot, collection, query, orderBy, addDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import { col, userRef } from '../lib/paths'
import { agentMessageFromDoc } from '../lib/converters'
import { defaultAgentConfig } from '../lib/theme'
import { useCollection } from './useCollection'
import type { AgentConfig, AgentMessage } from '../types'

/** Config do agente (campo `agent` em users/{uid}), em tempo real. */
export function useAgentConfig(): AgentConfig {
  const { user } = useAuth()
  const [cfg, setCfg] = useState<AgentConfig>(defaultAgentConfig)
  useEffect(() => {
    const uid = user?.uid
    if (!uid) return
    return onSnapshot(doc(db, 'users', uid), (snap) => {
      const a = snap.data()?.agent
      if (a) setCfg(a as AgentConfig)
    })
  }, [user?.uid])
  return cfg
}

export function useAgentChat() {
  return useCollection<AgentMessage>(
    (uid) => query(collection(db, `users/${uid}/agentChat`), orderBy('createdAt')),
    agentMessageFromDoc,
    [],
  )
}

export async function updateAgentField(field: 'name' | 'persona' | 'instructions', value: string) {
  await setDoc(userRef(), { agent: { [field]: value } }, { merge: true })
}

export async function toggleAgentSource(key: keyof AgentConfig['sources'], current: boolean) {
  await setDoc(userRef(), { agent: { sources: { [key]: !current } } }, { merge: true })
}

export async function pushAgentMessage(role: 'user' | 'agent', text: string) {
  await addDoc(col('agentChat'), { role, text, createdAt: serverTimestamp() })
}

interface AskRequest { system: string; history: { role: 'user' | 'assistant'; content: string }[]; question: string }
interface AskResponse { reply: string }

/** Chama a Cloud Function askTitaIA (Claude). Lança em erro de rede/quota. */
export async function callTitaIA(req: AskRequest): Promise<string> {
  const fn = httpsCallable<AskRequest, AskResponse>(functions, 'askTitaIA')
  const res = await fn(req)
  return (res.data?.reply || '').trim()
}

/** Resposta scriptada de degradação (porta fallbackReply do protótipo). */
export function fallbackReply(q: string): string {
  const ql = q.toLowerCase()
  if (ql.includes('priorid') || ql.includes('foco') || ql.includes('hoje')) {
    return 'Olhando seu pipeline e atividades de hoje, eu priorizaria: 1) Reunião de fechamento com a Atlas Cloud (R$ 48k em negociação) — é o maior negócio aberto; 2) Follow-up com a Marina (Nexa Software) — ela já pediu a proposta, é só enviar e fechar R$ 12k; 3) Resolver a atividade atrasada "Atualizar pipeline semanal". Quer que eu redija a mensagem de follow-up pra Marina?'
  }
  if (ql.includes('atlas')) {
    return 'A Atlas Cloud está em Negociação com R$ 48.000 — seu maior negócio aberto. O contato é o Rafa Lima, que já sinalizou "Fechado! Vamos seguir" no WhatsApp. Recomendo entrar já com a proposta formal e a nota de faturamento preparada para acelerar o sim.'
  }
  if (ql.includes('vencid') || ql.includes('receb') || ql.includes('fatur')) {
    return 'No faturamento você tem R$ 51.200 a receber e R$ 31.000 vencidos — a nota #1046 da Hélix Data (R$ 31k) é a prioridade de cobrança. Quer que eu prepare uma mensagem de cobrança cordial para a Paula Nunes?'
  }
  if (ql.includes('mensag') || ql.includes('redij') || ql.includes('escrev') || ql.includes('propost')) {
    return 'Sugestão de mensagem para a Marina (Nexa Software):\n\n"Oi Marina! Conforme combinamos, segue a proposta do plano Enterprise cobrindo os 3 ambientes (produção, homologação e dev) com suporte prioritário. Fico à disposição para ajustar qualquer ponto — podemos fechar ainda esta semana? 🚀"'
  }
  return 'Analisei os dados do seu CRM. Posso priorizar seu dia, analisar um negócio específico, cobrar notas vencidas ou redigir mensagens — é só pedir. (Observação: a IA respondeu em modo offline; configure a Cloud Function askTitaIA para respostas do Claude em tempo real.)'
}
