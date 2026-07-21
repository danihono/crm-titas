import { useState } from 'react'
import {
  useAgentConfig, useAgentChat, updateAgentField, toggleAgentSource, pushAgentMessage, callTitaIA, fallbackReply,
} from '../hooks/useAgent'
import { useTenantStore } from '../store/tenantStore'
import { useAllDeals, useBoards } from '../hooks/useDeals'
import { useActivities, statusOf } from '../hooks/useActivities'
import { useInvoices } from '../hooks/useInvoices'
import { useContacts } from '../hooks/useContacts'
import { fmtMoney, relativeLabel } from '../lib/format'
import MaterialIcon from '../components/common/MaterialIcon'
import RingButton from '../components/common/RingButton'
import type { AgentConfig } from '../types'

const SOURCE_DEFS: { key: keyof AgentConfig['sources']; label: string; icon: string; desc: string }[] = [
  { key: 'pipeline', label: 'Pipeline de vendas', icon: 'view_kanban', desc: 'Negócios, etapas e valores' },
  { key: 'contatos', label: 'Contatos', icon: 'contacts', desc: 'Clientes e dados de cadastro' },
  { key: 'atividades', label: 'Atividades', icon: 'task_alt', desc: 'Tarefas, ligações e reuniões' },
  { key: 'conversas', label: 'Conversas (WhatsApp)', icon: 'forum', desc: 'Histórico de mensagens' },
  { key: 'faturamento', label: 'Faturamento', icon: 'receipt_long', desc: 'Notas e status de pagamento' },
]
const SUGGESTIONS = ['Qual meu foco hoje?', 'Analisar a Atlas Cloud', 'Cobrar notas vencidas']

export default function Agent() {
  const cfg = useAgentConfig()
  const { docs: chat } = useAgentChat()
  const { docs: deals } = useAllDeals()
  const { docs: boards } = useBoards()
  const { docs: activities } = useActivities()
  const { docs: invoices } = useInvoices()
  const { docs: contacts } = useContacts()
  const readOnly = useTenantStore((s) => s.readOnly)

  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)

  const colTitle: Record<string, string> = {}
  boards.forEach((b) => b.columns.forEach((c) => { colTitle[c.id] = c.title }))

  function buildContext(): string {
    const s = cfg.sources
    let ctx = ''
    if (s.pipeline) {
      ctx += '\nPIPELINE:\n'
      deals.forEach((k) => { ctx += `- ${k.company} (${k.contact}) — R$ ${fmtMoney(k.value)} — etapa: ${colTitle[k.columnId] || k.columnId}\n` })
    }
    if (s.atividades) {
      ctx += '\nATIVIDADES:\n'
      activities.forEach((a) => { ctx += `- ${a.title} [${statusOf(a)}]\n` })
    }
    if (s.faturamento) {
      ctx += '\nFATURAMENTO:\n'
      invoices.forEach((i) => { ctx += `- ${i.num} ${i.client} R$ ${fmtMoney(i.value)} [${i.status}]\n` })
    }
    if (s.contatos) {
      ctx += '\nCONTATOS: ' + contacts.map((c) => `${c.name} (${c.company})`).join(', ') + '\n'
    }
    if (s.conversas) {
      const recentes = contacts
        .filter((c) => c.lastMessage)
        .sort((a, b) => (b.lastMessageAt?.getTime() ?? 0) - (a.lastMessageAt?.getTime() ?? 0))
        .slice(0, 30)
      if (recentes.length) {
        ctx += '\nCONVERSAS RECENTES (WhatsApp — última mensagem de cada contato):\n'
        recentes.forEach((c) => {
          const quando = c.lastMessageAt ? ` (${relativeLabel(c.lastMessageAt)})` : ''
          ctx += `- ${c.name}: "${c.lastMessage}"${quando}\n`
        })
      }
    }
    return ctx
  }

  async function send(qRaw?: string) {
    const q = (qRaw ?? input).trim()
    if (!q || typing) return
    setInput('')
    setTyping(true)
    try {
      await pushAgentMessage('user', q)
      let reply = ''
      try {
        const system = `${cfg.instructions}\nVocê é "${cfg.name}", persona: ${cfg.persona}.\nUse os dados reais do CRM abaixo para responder de forma concreta. Responda em português do Brasil, de forma objetiva (máx ~120 palavras).\n${buildContext()}`
        const history = chat.slice(-8).map((m) => ({ role: (m.role === 'agent' ? 'assistant' : 'user') as 'assistant' | 'user', content: m.text }))
        reply = await callTitaIA({ system, history, question: q })
        if (!reply) reply = fallbackReply(q)
      } catch {
        reply = fallbackReply(q)
      }
      await pushAgentMessage('agent', reply)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Falha ao enviar a mensagem ao agente.')
    } finally {
      setTyping(false)
    }
  }

  const activeSources = Object.values(cfg.sources).filter(Boolean).length

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* Builder */}
      <div style={{ width: 400, flexShrink: 0, background: '#ffffff', borderRight: '1px solid #e6e3ee', overflowY: 'auto', padding: '24px 24px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 6 }}>
          <div style={{ width: 44, height: 44, borderRadius: 13, background: 'linear-gradient(140deg,#9a6fb8,#5a3a7e)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 18px rgba(120,70,160,0.3)' }}>
            <MaterialIcon name="auto_awesome" size={24} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1d1726' }}>Construtor de Agente</div>
            <div style={{ fontSize: 12, color: '#6e6780' }}>Crie um agente que entende seu negócio</div>
          </div>
        </div>

        <div style={{ fontSize: 11, letterSpacing: '.1em', color: '#a39bb0', fontWeight: 700, margin: '24px 0 10px' }}>IDENTIDADE</div>
        <label style={{ fontSize: 12, color: '#6e6780', fontWeight: 600 }}>Nome do agente</label>
        <input value={cfg.name} disabled={readOnly} onChange={(e) => updateAgentField('name', e.target.value)} style={fieldStyle} />
        <label style={{ fontSize: 12, color: '#6e6780', fontWeight: 600 }}>Função / Persona</label>
        <select value={cfg.persona} disabled={readOnly} onChange={(e) => updateAgentField('persona', e.target.value)} style={fieldStyle}>
          <option>Consultor de Vendas</option>
          <option>SDR / Pré-vendas</option>
          <option>Gerente de Sucesso</option>
          <option>Analista de Dados</option>
        </select>
        <label style={{ fontSize: 12, color: '#6e6780', fontWeight: 600 }}>Instruções</label>
        <textarea value={cfg.instructions} disabled={readOnly} onChange={(e) => updateAgentField('instructions', e.target.value)} rows={4} style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.5 }} />

        <div style={{ fontSize: 11, letterSpacing: '.1em', color: '#a39bb0', fontWeight: 700, margin: '22px 0 10px' }}>FONTES DE CONHECIMENTO</div>
        <div style={{ fontSize: 12, color: '#6e6780', lineHeight: 1.5, marginBottom: 14 }}>Escolha o que o agente pode acessar. Ele lê os dados em tempo real para entender todo o seu negócio.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {SOURCE_DEFS.map((s) => {
            const on = cfg.sources[s.key]
            return (
              <div key={s.key} onClick={() => { if (!readOnly) toggleAgentSource(s.key, on) }} style={{ display: 'flex', alignItems: 'center', gap: 12, background: on ? 'rgba(150,110,200,0.07)' : '#f7f5fa', border: '1px solid ' + (on ? 'rgba(150,110,200,0.35)' : '#e6e3ee'), borderRadius: 12, padding: '12px 14px', cursor: readOnly ? 'default' : 'pointer' }}>
                <MaterialIcon name={s.icon} size={20} color={on ? '#7a52a0' : '#b8b2c4'} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1d1726' }}>{s.label}</div>
                  <div style={{ fontSize: 11, color: '#9c95a8' }}>{s.desc}</div>
                </div>
                <div style={{ width: 38, height: 22, borderRadius: 20, flexShrink: 0, position: 'relative', transition: '.2s', background: on ? 'linear-gradient(140deg,#9a6fb8,#5a3a7e)' : '#dcd8e6' }}>
                  <div style={{ position: 'absolute', top: 3, left: on ? 19 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: '.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.15)' }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Chat */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: '#f0edf5' }}>
        <div style={{ height: 66, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '0 24px', borderBottom: '1px solid #e2def0', background: '#ffffff' }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: 'linear-gradient(140deg,#9a6fb8,#5a3a7e)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MaterialIcon name="auto_awesome" size={20} color="#fff" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1d1726' }}>{cfg.name}</div>
            <div style={{ fontSize: 11.5, color: '#2f9e6f', display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34c759' }} />Conectado · {activeSources} fontes ativas
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#6e6780', background: '#f3f1f7', border: '1px solid #e6e3ee', borderRadius: 8, padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 5 }}>
            <MaterialIcon name="bolt" size={14} color="#7a52a0" />Claude · Anthropic
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {chat.length === 0 && (
            <AgentBubble text={`Olá! 👋 Eu sou o ${cfg.name}. Tenho acesso ao seu pipeline, contatos, atividades e conversas. Posso analisar seus negócios, sugerir prioridades ou redigir mensagens. Como posso ajudar hoje?`} />
          )}
          {chat.map((m) => (
            m.role === 'agent'
              ? <AgentBubble key={m.id} text={m.text} />
              : (
                <div key={m.id} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <div style={{ maxWidth: '74%', background: 'linear-gradient(150deg,#7a52a0,#5a3a7e)', borderRadius: '15px 15px 4px 15px', padding: '13px 16px', fontSize: 13.5, lineHeight: 1.5, color: '#f5f0fa', whiteSpace: 'pre-wrap', boxShadow: '0 2px 8px rgba(110,65,150,0.25)' }}>{m.text}</div>
                </div>
              )
          ))}
          {typing && (
            <div style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: 'linear-gradient(140deg,#9a6fb8,#5a3a7e)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <MaterialIcon name="auto_awesome" size={17} color="#fff" />
              </div>
              <div style={{ display: 'flex', gap: 4, background: '#ffffff', border: '1px solid #e9e6f0', borderRadius: 13, padding: '13px 16px' }}>
                {[0, 0.2, 0.4].map((d) => <span key={d} style={{ width: 7, height: 7, borderRadius: '50%', background: '#9a6fb8', animation: `blink 1s infinite ${d}s` }} />)}
              </div>
            </div>
          )}
        </div>

        {!readOnly && (
        <div style={{ flexShrink: 0, padding: '8px 24px 14px' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 11, flexWrap: 'wrap' }}>
            {SUGGESTIONS.map((sg) => (
              <button key={sg} onClick={() => send(sg)} style={{ background: '#ffffff', border: '1px solid #e2dcee', borderRadius: 20, padding: '7px 13px', color: '#7a52a0', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{sg}</button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send() }}
              placeholder="Pergunte algo sobre seu negócio..."
              style={{ flex: 1, background: '#ffffff', border: '1px solid #e6e3ee', borderRadius: 14, padding: '14px 17px', color: '#1d1726', fontSize: 13.5, outline: 'none', boxShadow: '0 1px 2px rgba(28,20,50,0.04)' }}
            />
            <RingButton radius={14} onClick={() => send()} style={{ width: 48, height: 48, background: 'linear-gradient(140deg,#7a52a0,#553578)', border: '1px solid rgba(200,160,230,0.3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(110,65,150,0.3)' }}>
              <MaterialIcon name="send" size={21} color="#f4eefa" />
            </RingButton>
          </div>
        </div>
        )}
      </div>
    </div>
  )
}

function AgentBubble({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
      <div style={{ width: 32, height: 32, borderRadius: 10, background: 'linear-gradient(140deg,#9a6fb8,#5a3a7e)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <MaterialIcon name="auto_awesome" size={17} color="#fff" />
      </div>
      <div style={{ maxWidth: '74%', background: '#ffffff', border: '1px solid #e9e6f0', borderRadius: '4px 15px 15px 15px', padding: '13px 16px', fontSize: 13.5, lineHeight: 1.55, color: '#2a2435', whiteSpace: 'pre-wrap', boxShadow: '0 1px 2px rgba(28,20,50,0.05)' }}>{text}</div>
    </div>
  )
}

const fieldStyle: React.CSSProperties = {
  width: '100%',
  margin: '6px 0 14px',
  background: '#f7f5fa',
  border: '1px solid #e6e3ee',
  borderRadius: 11,
  padding: '11px 13px',
  color: '#1d1726',
  fontSize: 13.5,
  outline: 'none',
  fontFamily: "'Manrope',sans-serif",
}
