import { useState } from 'react'
import {
  assignConversation, closeConversation, convOf, reopenConversation,
  setConversationSector, setConversationStatus, toggleConversationTag,
} from '../../hooks/useConversations'
import { setContactOptOut } from '../../hooks/useCampaigns'
import MaterialIcon from '../common/MaterialIcon'
import { C } from '../../styles/sx'
import type { Contact, ConvStatus, Member, Sector, Tag } from '../../types'

const selectStyle: React.CSSProperties = {
  background: '#f7f5fa',
  border: '1px solid #e6e3ee',
  borderRadius: 9,
  padding: '6px 9px',
  fontSize: 12,
  color: C.ink,
  fontFamily: "'Manrope',sans-serif",
  cursor: 'pointer',
  outline: 'none',
  maxWidth: 170,
}

function actionStyle(color: string, bg: string): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 5, border: 'none', borderRadius: 9,
    padding: '6px 11px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
    fontFamily: "'Manrope',sans-serif", color, background: bg,
  }
}

/**
 * Faixa de atendimento do cabeçalho da conversa: responsável, setor, etiquetas e as
 * transições de estado. Fica na MESMA tela de contatos — o Umbler separa em módulos,
 * aqui a conversa é uma aba do contato.
 */
export default function AtendimentoBar({
  contact, members, sectors, tags, canWrite, meUid, meName, closingMessage, onSend,
}: {
  contact: Contact
  members: Member[]
  sectors: Sector[]
  tags: Tag[]
  canWrite: boolean
  meUid: string
  meName: string
  /** Texto de despedida configurado no perfil. Vazio = finaliza calado. */
  closingMessage: string
  onSend: (text: string) => Promise<void>
}) {
  const conv = convOf(contact)
  const [tagsOpen, setTagsOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const activeMembers = members.filter((m) => m.active)
  const applied = tags.filter((t) => conv.tagIds.includes(t.id))
  const finished = conv.status === 'finalizado'

  /**
   * Finaliza: manda a despedida (se houver) e só então fecha o ciclo.
   *
   * Nessa ordem porque fechar antes faria a própria despedida reabrir o atendimento —
   * é uma mensagem na conversa como outra qualquer. Se o envio falhar, o atendimento
   * fecha assim mesmo: o clique foi em "Finalizar", não em "Enviar".
   */
  async function finish(): Promise<void> {
    const text = closingMessage.trim()
    if (text) {
      await onSend(text).catch((err) => console.error('[AtendimentoBar] despedida', err))
    }
    await closeConversation(contact, meUid, meName)
  }

  /** Serializa as ações: dois cliques seguidos abririam dois ciclos de atendimento. */
  async function run(fn: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    try {
      await fn()
    } catch (err) {
      console.error('[AtendimentoBar]', err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', padding: '9px 22px', background: '#faf9fc', borderBottom: '1px solid #e2def0' }}>
      <StatusChip status={conv.status} />

      {canWrite && !finished && !conv.assignedTo && (
        <button
          onClick={() => run(() => assignConversation(contact, meUid, meName))}
          style={actionStyle('#1f8a4c', 'rgba(52,199,89,0.14)')}
        >
          <MaterialIcon name="how_to_reg" size={15} /> Assumir
        </button>
      )}

      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <MaterialIcon name="support_agent" size={16} color={C.muted} />
        <select
          value={conv.assignedTo}
          disabled={!canWrite || finished}
          onChange={(e) => {
            const m = activeMembers.find((x) => x.id === e.target.value)
            run(() => assignConversation(contact, e.target.value, m?.name ?? ''))
          }}
          style={selectStyle}
        >
          <option value="">Sem responsável</option>
          {activeMembers.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </label>

      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <MaterialIcon name="account_tree" size={16} color={C.muted} />
        <select
          value={conv.sectorId}
          disabled={!canWrite || finished}
          onChange={(e) => run(() => setConversationSector(contact, e.target.value))}
          style={selectStyle}
        >
          <option value="">Sem setor</option>
          {sectors.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </label>

      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6 }}>
        {applied.map((t) => (
          <span key={t.id} style={{ fontSize: 11.5, fontWeight: 700, color: t.color, background: t.color + '1f', border: '1px solid ' + t.color + '3a', borderRadius: 999, padding: '3px 9px' }}>
            {t.label}
          </span>
        ))}
        {canWrite && tags.length > 0 && (
          <button
            onClick={() => setTagsOpen((v) => !v)}
            title="Etiquetar conversa"
            style={actionStyle(C.purple, 'rgba(150,110,200,0.12)')}
          >
            <MaterialIcon name="label" size={15} /> {applied.length ? '' : 'Etiquetar'}
          </button>
        )}
        {tagsOpen && (
          <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 20, background: '#fff', border: '1px solid #e6e3ee', borderRadius: 12, padding: 10, boxShadow: '0 16px 40px rgba(20,14,40,0.18)', minWidth: 190 }}>
            {tags.map((t) => {
              const on = conv.tagIds.includes(t.id)
              return (
                <button
                  key={t.id}
                  onClick={() => run(() => toggleConversationTag(contact, t.id))}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', border: 'none', background: 'transparent', cursor: 'pointer', padding: '7px 6px', fontSize: 12.5, color: C.ink, fontFamily: "'Manrope',sans-serif", fontWeight: on ? 700 : 500 }}
                >
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: t.color }} />
                  <span style={{ flex: 1, textAlign: 'left' }}>{t.label}</span>
                  {on && <MaterialIcon name="check" size={15} color={C.green} />}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {contact.optOut && (
        <span
          title="Pediu para não receber campanhas (respondeu SAIR/PARE)"
          style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: '#a03257', background: 'rgba(217,138,171,0.16)', borderRadius: 999, padding: '4px 10px' }}
        >
          <MaterialIcon name="do_not_disturb_on" size={14} /> Sem campanhas
          {canWrite && (
            <button
              onClick={() => run(() => setContactOptOut(contact.id, false))}
              title="Voltar a incluir em campanhas"
              style={{ display: 'flex', border: 'none', background: 'transparent', cursor: 'pointer', color: '#a03257', padding: 0, marginLeft: 2 }}
            >
              <MaterialIcon name="undo" size={14} />
            </button>
          )}
        </span>
      )}

      <div style={{ flex: 1 }} />

      {canWrite && !finished && (
        <>
          {conv.status !== 'esperando' && (
            <button
              onClick={() => run(() => setConversationStatus(contact, 'esperando'))}
              style={actionStyle('#8a5f12', 'rgba(216,169,96,0.18)')}
            >
              <MaterialIcon name="hourglass_top" size={15} /> Esperando
            </button>
          )}
          {conv.status === 'esperando' && (
            <button
              onClick={() => run(() => setConversationStatus(contact, 'entrada'))}
              style={actionStyle(C.purple, 'rgba(150,110,200,0.12)')}
            >
              <MaterialIcon name="undo" size={15} /> Voltar à entrada
            </button>
          )}
          <button
            onClick={() => run(() => finish())}
            style={actionStyle('#1f8a4c', 'rgba(52,199,89,0.14)')}
          >
            <MaterialIcon name="task_alt" size={15} /> Finalizar
          </button>
        </>
      )}

      {canWrite && finished && (
        <button
          onClick={() => run(() => reopenConversation(contact))}
          style={actionStyle(C.purple, 'rgba(150,110,200,0.12)')}
        >
          <MaterialIcon name="refresh" size={15} /> Reabrir atendimento
        </button>
      )}
    </div>
  )
}

function StatusChip({ status }: { status: ConvStatus }) {
  const map: Record<ConvStatus, [string, string, string]> = {
    entrada: ['Em atendimento', '#1f8a4c', 'rgba(52,199,89,0.14)'],
    esperando: ['Esperando cliente', '#8a5f12', 'rgba(216,169,96,0.18)'],
    finalizado: ['Finalizado', '#6e6780', '#eeebf3'],
  }
  const [label, color, bg] = map[status] ?? map.entrada
  return (
    <span style={{ fontSize: 11.5, fontWeight: 800, color, background: bg, borderRadius: 999, padding: '4px 11px' }}>
      {label}
    </span>
  )
}
