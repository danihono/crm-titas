import { useEffect, useRef, useState } from 'react'
import {
  useAgentConfig, useAgentChat, updateAgentField, toggleAgentSource, pushAgentMessage, callTitaIA, fallbackReply,
  agentErrorHint, errorCode, assistantWhatsapp, updateAssistantWhatsapp, toggleAssistantBlock, useTenantPhone,
} from '../hooks/useAssistant'
import { useTenantStore, canManage } from '../store/tenantStore'
import { knowledgeContext, useKnowledge } from '../hooks/useLibrary'
import { useAllDeals, useBoards } from '../hooks/useDeals'
import { useActivities, statusOf } from '../hooks/useActivities'
import { useInvoices } from '../hooks/useInvoices'
import { useContacts } from '../hooks/useContacts'
import { fmtMoney, relativeLabel } from '../lib/format'
import MaterialIcon from '../components/common/MaterialIcon'
import RingButton from '../components/common/RingButton'
import type { AgentConfig, AgentMessage, AssistantBlocks } from '../types'
import { C } from '../styles/sx'
import { t, type Chave as ChaveTexto } from '../i18n'

const SOURCE_DEFS: { key: keyof AgentConfig['sources']; label: ChaveTexto; icon: string; desc: ChaveTexto }[] = [
  { key: 'pipeline', label: 'assistente.fontePipeline', icon: 'view_kanban', desc: 'assistente.fontePipelineDesc' },
  { key: 'contatos', label: 'assistente.fonteContatos', icon: 'contacts', desc: 'assistente.fonteContatosDesc' },
  { key: 'atividades', label: 'assistente.fonteAtividades', icon: 'task_alt', desc: 'assistente.fonteAtividadesDesc' },
  { key: 'conversas', label: 'assistente.fonteConversas', icon: 'forum', desc: 'assistente.fonteConversasDesc' },
  { key: 'faturamento', label: 'assistente.fonteFaturamento', icon: 'receipt_long', desc: 'assistente.fonteFaturamentoDesc' },
  { key: 'agenda', label: 'assistente.fonteAgenda', icon: 'calendar_month', desc: 'assistente.fonteAgendaDesc' },
]

/** Blocos do resumo diário. Deliberadamente SEPARADO de SOURCE_DEFS — ver AssistantWhatsapp. */
const RESUMO_BLOCOS: { key: keyof AssistantBlocks; label: ChaveTexto; icon: string }[] = [
  { key: 'agenda', label: 'assistente.blocoAgenda', icon: 'calendar_month' },
  { key: 'tarefas', label: 'assistente.blocoTarefas', icon: 'task_alt' },
  { key: 'faturas', label: 'assistente.blocoFaturas', icon: 'receipt_long' },
  { key: 'conversas', label: 'assistente.blocoConversas', icon: 'forum' },
]
const SUGGESTIONS: ChaveTexto[] = ['assistente.sugestao1', 'assistente.sugestao2', 'assistente.sugestao3']

/** Um único aviso de falha para toda a tela — salvar config aqui nunca falha em silêncio. */
function avisaFalha(e: unknown) {
  alert(e instanceof Error ? e.message : t('assistente.falhaConfig'))
}

function saveAgentField(field: 'name' | 'persona' | 'instructions', value: string) {
  updateAgentField(field, value).catch(avisaFalha)
}

/**
 * Campo de texto do agente com escrita debounced no Firestore (1 write ~600ms
 * após parar de digitar, com flush no blur) — antes era 1 write por tecla.
 */
function useDebouncedAgentField(field: 'name' | 'instructions', remote: string) {
  const [draft, setDraft] = useState<string | null>(null)
  const timer = useRef<number>()
  useEffect(() => {
    if (draft !== null && draft === remote) setDraft(null)
  }, [remote, draft])
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return {
    value: draft ?? remote,
    onChange(v: string) {
      setDraft(v)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => saveAgentField(field, v), 600)
    },
    onBlur() {
      if (draft !== null) {
        window.clearTimeout(timer.current)
        saveAgentField(field, draft)
      }
    },
  }
}

export default function Agent() {
  const cfg = useAgentConfig()
  const { docs: chat } = useAgentChat()
  const { docs: deals } = useAllDeals()
  const { docs: boards } = useBoards()
  const { docs: activities } = useActivities()
  const readOnly = useTenantStore((s) => s.readOnly)
  const role = useTenantStore((s) => s.role)
  const podeGerir = canManage(role, readOnly)
  // Faturamento no contexto da IA só para quem pode lê-lo — as regras negam ao atendente.
  const { docs: invoices } = useInvoices({ enabled: podeGerir })
  const { docs: contacts } = useContacts()
  const { docs: knowledge } = useKnowledge()

  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const nameField = useDebouncedAgentField('name', cfg.name)
  const instrField = useDebouncedAgentField('instructions', cfg.instructions)

  // Resumo diário. `wa` já vem com os padrões preenchidos, então os campos abaixo nunca
  // recebem undefined num ambiente que ainda não abriu esta seção.
  const wa = assistantWhatsapp(cfg)
  const tenantPhone = useTenantPhone()
  const [phoneDraft, setPhoneDraft] = useState<string | null>(null)
  const phoneSalvo = wa.phone ?? ''
  // Enquanto ninguém digita, o campo mostra o telefone do ambiente — é para lá que o
  // resumo vai quando `whatsapp.phone` está vazio, e mostrar em branco esconderia isso.
  const phoneValor = phoneDraft ?? (phoneSalvo || tenantPhone)

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
        // A base de conhecimento vem ANTES dos dados do CRM: é material curado pela
        // empresa, e é dela que a resposta deve sair quando houver conflito.
        const system = `${cfg.instructions}\nVocê é "${cfg.name}", persona: ${cfg.persona}.\nUse os dados reais do CRM abaixo para responder de forma concreta. ${t('ia.instrucaoIdioma')}, de forma objetiva (máx ~120 palavras).\n${knowledgeContext(knowledge)}${buildContext()}`
        const history = chat.slice(-8).map((m) => ({ role: (m.role === 'agent' ? 'assistant' : 'user') as 'assistant' | 'user', content: m.text }))
        reply = await callTitaIA({ system, history, question: q })
        if (!reply) reply = fallbackReply()
      } catch (err) {
        // Engolir o erro aqui escondia a causa: a tela dizia "modo offline" e o console
        // ficava limpo, entao nao dava para saber se a funcao nao estava publicada ou se
        // o App Check estava barrando. Agora o motivo vai para o console E para a resposta.
        const code = errorCode(err)
        console.error('[callTitaIA]', code || err, err)
        reply = fallbackReply() + agentErrorHint(code)
      }
      await pushAgentMessage('agent', reply)
    } catch (e) {
      alert(e instanceof Error ? e.message : t('assistente.falhaEnviar'))
    } finally {
      setTyping(false)
    }
  }

  const activeSources = Object.values(cfg.sources).filter(Boolean).length

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* Builder */}
      <div style={{ width: 400, flexShrink: 0, background: C.surface, borderRight: `1px solid ${C.fieldBorder}`, overflowY: 'auto', padding: '24px 24px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 6 }}>
          <div style={{ width: 44, height: 44, borderRadius: 13, background: 'linear-gradient(140deg,#9a6fb8,#5a3a7e)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 18px rgba(120,70,160,0.3)' }}>
            <MaterialIcon name="auto_awesome" size={24} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>{t('assistente.titulo')}</div>
            <div style={{ fontSize: 12, color: C.sub }}>{t('assistente.subtitulo')}</div>
          </div>
        </div>

        <div style={{ fontSize: 11, letterSpacing: '.1em', color: C.faint, fontWeight: 700, margin: '24px 0 10px' }}>{t('assistente.identidade')}</div>
        <label style={{ fontSize: 12, color: C.sub, fontWeight: 600 }}>{t('assistente.nomeAgente')}</label>
        <input value={nameField.value} disabled={readOnly} onChange={(e) => nameField.onChange(e.target.value)} onBlur={nameField.onBlur} style={fieldStyle} />
        <label style={{ fontSize: 12, color: C.sub, fontWeight: 600 }}>{t('assistente.persona')}</label>
        <select value={cfg.persona} disabled={readOnly} onChange={(e) => saveAgentField('persona', e.target.value)} style={fieldStyle}>
          <option>{t('assistente.personaConsultor')}</option>
          <option>{t('assistente.personaSdr')}</option>
          <option>{t('assistente.personaSucesso')}</option>
          <option>{t('assistente.personaAnalista')}</option>
        </select>
        <label style={{ fontSize: 12, color: C.sub, fontWeight: 600 }}>{t('assistente.instrucoes')}</label>
        <textarea value={instrField.value} disabled={readOnly} onChange={(e) => instrField.onChange(e.target.value)} onBlur={instrField.onBlur} rows={4} style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.5 }} />

        <div style={{ fontSize: 11, letterSpacing: '.1em', color: C.faint, fontWeight: 700, margin: '22px 0 10px' }}>{t('assistente.fontes')}</div>
        <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.5, marginBottom: 14 }}>{t('assistente.fontesDica')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {SOURCE_DEFS.map((s) => {
            const on = !!cfg.sources[s.key] // `agenda` é opcional: ausente = desligada
            return (
              <div key={s.key} onClick={() => {
                if (readOnly) return
                toggleAgentSource(s.key, on).catch(avisaFalha)
              }} style={{ display: 'flex', alignItems: 'center', gap: 12, background: on ? C.tintPurpleWeak : C.field, border: '1px solid ' + (on ? 'rgba(150,110,200,0.35)' : C.fieldBorder), borderRadius: 12, padding: '12px 14px', cursor: readOnly ? 'default' : 'pointer' }}>
                <MaterialIcon name={s.icon} size={20} color={on ? C.purple : C.faint} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{t(s.label)}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>{t(s.desc)}</div>
                </div>
                <Chave on={on} />
              </div>
            )
          })}
        </div>

        {/* Resumo diário no WhatsApp */}
        {podeGerir && (
          <>
            <div style={{ fontSize: 11, letterSpacing: '.1em', color: C.faint, fontWeight: 700, margin: '26px 0 10px' }}>{t('assistente.resumoDiario')}</div>
            <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.5, marginBottom: 14 }}>
              {t('assistente.resumoDica')}
            </div>

            <div
              onClick={() => {
                if (readOnly) return
                updateAssistantWhatsapp({ enabled: !wa.enabled, optOut: false }).catch(avisaFalha)
              }}
              style={{ display: 'flex', alignItems: 'center', gap: 12, background: wa.enabled ? C.tintPurpleWeak : C.field, border: '1px solid ' + (wa.enabled ? 'rgba(150,110,200,0.35)' : C.fieldBorder), borderRadius: 12, padding: '12px 14px', cursor: readOnly ? 'default' : 'pointer', marginBottom: 14 }}
            >
              <MaterialIcon name="schedule_send" size={20} color={wa.enabled ? C.purple : C.faint} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{t('assistente.enviarTodoDia')}</div>
                <div style={{ fontSize: 11, color: C.muted }}>
                  {wa.enabled ? t('assistente.todoDiaAs', { hora: wa.sendAt }) : t('assistente.desligado')}
                </div>
              </div>
              <Chave on={wa.enabled} />
            </div>

            {wa.enabled && (
              <>
                <label style={{ fontSize: 12, color: C.sub, fontWeight: 600 }}>{t('assistente.horario')}</label>
                <input
                  type="time"
                  value={wa.sendAt}
                  disabled={readOnly}
                  onChange={(e) => updateAssistantWhatsapp({ sendAt: e.target.value || '07:00' }).catch(avisaFalha)}
                  style={fieldStyle}
                />

                <label style={{ fontSize: 12, color: C.sub, fontWeight: 600 }}>{t('assistente.whatsappRecebe')}</label>
                <input
                  value={phoneValor}
                  disabled={readOnly}
                  placeholder="+55 11 90000-0000"
                  onChange={(e) => setPhoneDraft(e.target.value)}
                  onBlur={() => {
                    if (phoneDraft === null) return
                    const limpo = phoneDraft.trim()
                    setPhoneDraft(null)
                    if (limpo !== phoneSalvo) updateAssistantWhatsapp({ phone: limpo }).catch(avisaFalha)
                  }}
                  style={fieldStyle}
                />

                <div style={{ fontSize: 11, letterSpacing: '.08em', color: C.faint, fontWeight: 700, margin: '4px 0 10px' }}>{t('assistente.oQueVem')}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {RESUMO_BLOCOS.map((b) => {
                    const on = wa.blocks[b.key]
                    return (
                      <div
                        key={b.key}
                        onClick={() => {
                          if (readOnly) return
                          toggleAssistantBlock(b.key, on).catch(avisaFalha)
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, background: on ? C.tintPurpleWeak : C.field, border: '1px solid ' + (on ? 'rgba(150,110,200,0.35)' : C.fieldBorder), borderRadius: 12, padding: '10px 14px', cursor: readOnly ? 'default' : 'pointer' }}
                      >
                        <MaterialIcon name={b.icon} size={19} color={on ? C.purple : C.faint} />
                        <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: C.ink }}>{t(b.label)}</div>
                        <Chave on={on} />
                      </div>
                    )
                  })}
                </div>

                <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.6, marginTop: 14 }}>
                  {wa.optOut
                    ? t('assistente.optOut')
                    : wa.lastSentDateKey
                      ? t('assistente.ultimoResumo', { data: wa.lastSentDateKey })
                      : t('assistente.nenhumResumo')}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Chat */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: C.panel }}>
        <div style={{ height: 66, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '0 24px', borderBottom: `1px solid ${C.fieldBorder}`, background: C.surface }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: 'linear-gradient(140deg,#9a6fb8,#5a3a7e)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MaterialIcon name="auto_awesome" size={20} color="#fff" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{cfg.name}</div>
            <div style={{ fontSize: 11.5, color: C.green, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34c759' }} />Conectado · {activeSources} fontes ativas
            </div>
          </div>
          <div style={{ fontSize: 11, color: C.sub, background: C.raised, border: `1px solid ${C.fieldBorder}`, borderRadius: 8, padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 5 }}>
            <MaterialIcon name="bolt" size={14} color={C.purple} />Gemini · Google
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {chat.length === 0 && (
            <AgentBubble text={t('assistente.boasVindas', { nome: cfg.name })} />
          )}
          {chat.map((m) => (
            m.role === 'agent'
              ? <AgentBubble key={m.id} text={m.text} m={m} />
              : (
                <div key={m.id} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <div style={{ maxWidth: '74%', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                    <div style={{ background: 'linear-gradient(150deg,#7a52a0,#5a3a7e)', borderRadius: '15px 15px 4px 15px', padding: '13px 16px', fontSize: 13.5, lineHeight: 1.5, color: '#f5f0fa', whiteSpace: 'pre-wrap', boxShadow: '0 2px 8px rgba(110,65,150,0.25)' }}>{m.text}</div>
                    <SeloCanal m={m} />
                  </div>
                </div>
              )
          ))}
          {typing && (
            <div style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: 'linear-gradient(140deg,#9a6fb8,#5a3a7e)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <MaterialIcon name="auto_awesome" size={17} color="#fff" />
              </div>
              <div style={{ display: 'flex', gap: 4, background: C.surface, border: '1px solid #e9e6f0', borderRadius: 13, padding: '13px 16px' }}>
                {[0, 0.2, 0.4].map((d) => <span key={d} style={{ width: 7, height: 7, borderRadius: '50%', background: '#9a6fb8', animation: `blink 1s infinite ${d}s` }} />)}
              </div>
            </div>
          )}
        </div>

        {!readOnly && (
        <div style={{ flexShrink: 0, padding: '8px 24px 14px' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 11, flexWrap: 'wrap' }}>
            {SUGGESTIONS.map((sg) => (
              <button key={sg} onClick={() => send(t(sg))} style={{ background: C.surface, border: '1px solid #e2dcee', borderRadius: 20, padding: '7px 13px', color: C.purple, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{t(sg)}</button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send() }}
              placeholder={t('assistente.perguntePlaceholder')}
              style={{ flex: 1, background: C.surface, border: `1px solid ${C.fieldBorder}`, borderRadius: 14, padding: '14px 17px', color: C.ink, fontSize: 13.5, outline: 'none', boxShadow: '0 1px 2px rgba(28,20,50,0.04)' }}
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

/** A chave liga/desliga — mesma peça nas fontes de conhecimento e nos blocos do resumo. */
function Chave({ on }: { on: boolean }) {
  return (
    <div style={{ width: 38, height: 22, borderRadius: 20, flexShrink: 0, position: 'relative', transition: '.2s', background: on ? 'linear-gradient(140deg,#9a6fb8,#5a3a7e)' : '#dcd8e6' }}>
      <div style={{ position: 'absolute', top: 3, left: on ? 19 : 3, width: 16, height: 16, borderRadius: '50%', background: C.surface, transition: '.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.15)' }} />
    </div>
  )
}

/**
 * Selo de origem. Só aparece no que veio do WhatsApp: a tela é o caso comum, e marcar os
 * dois lados encheria a conversa de etiqueta sem informar nada.
 */
function SeloCanal({ m }: { m: AgentMessage }) {
  if (m.channel !== 'whatsapp') return null
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 600, color: C.muted, marginTop: 5 }}>
      <MaterialIcon name="smartphone" size={12} color={C.muted} />WhatsApp
    </span>
  )
}

function AgentBubble({ text, m }: { text: string; m?: AgentMessage }) {
  return (
    <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
      <div style={{ width: 32, height: 32, borderRadius: 10, background: 'linear-gradient(140deg,#9a6fb8,#5a3a7e)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <MaterialIcon name="auto_awesome" size={17} color="#fff" />
      </div>
      <div style={{ maxWidth: '74%' }}>
        <div style={{ background: C.surface, border: '1px solid #e9e6f0', borderRadius: '4px 15px 15px 15px', padding: '13px 16px', fontSize: 13.5, lineHeight: 1.55, color: C.ink, whiteSpace: 'pre-wrap', boxShadow: '0 1px 2px rgba(28,20,50,0.05)' }}>{text}</div>
        {m && <SeloCanal m={m} />}
      </div>
    </div>
  )
}

const fieldStyle: React.CSSProperties = {
  width: '100%',
  margin: '6px 0 14px',
  background: C.field,
  border: `1px solid ${C.fieldBorder}`,
  borderRadius: 11,
  padding: '11px 13px',
  color: C.ink,
  fontSize: 13.5,
  outline: 'none',
}
