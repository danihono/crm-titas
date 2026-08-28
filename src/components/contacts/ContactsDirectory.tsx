import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUIStore } from '../../store/uiStore'
import { useTenantStore } from '../../store/tenantStore'
import { useContacts } from '../../hooks/useContacts'
import { useTags } from '../../hooks/useSettings'
import { fmtPhoneBR, initialsOf, relativeLabel, searchable } from '../../lib/format'
import { avPalette } from '../../lib/theme'
import Avatar from '../common/Avatar'
import MaterialIcon from '../common/MaterialIcon'
import RingButton from '../common/RingButton'
import ContactModal from '../modals/ContactModal'
import { sx, C } from '../../styles/sx'
import type { Contact } from '../../types'

type Ordem = 'nome' | 'empresa' | 'recente'

const COLUNAS: { id: Ordem; label: string; largura: string }[] = [
  { id: 'nome', label: 'Contato', largura: 'minmax(220px,2fr)' },
  { id: 'empresa', label: 'Empresa', largura: 'minmax(150px,1.2fr)' },
]

/** Data que responde "quando falei com essa pessoa pela última vez". */
function ultimoContato(c: Contact): Date | undefined {
  return c.lastMessageAt ?? c.createdAt
}

/**
 * A agenda como CADASTRO, não como caixa de atendimento.
 *
 * A outra aba responde "quem está esperando resposta agora"; esta responde "quem eu tenho
 * cadastrado" — que é a pergunta de quem vai criar um lead, conferir um telefone ou achar
 * alguém que não tem conversa aberta nenhuma e por isso some das abas do atendimento.
 */
export default function ContactsDirectory() {
  const navigate = useNavigate()
  const ui = useUIStore()
  const readOnly = useTenantStore((s) => s.readOnly)
  const { docs: contacts, loading } = useContacts()
  const { docs: tags } = useTags()

  const [busca, setBusca] = useState('')
  const [ordem, setOrdem] = useState<Ordem>('recente')
  const [editando, setEditando] = useState<Contact | null>(null)

  const tagMap = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags])

  const q = searchable(busca)
  const lista = useMemo(() => {
    const filtrados = q
      ? contacts.filter((c) =>
          searchable(c.name).includes(q)
          || searchable(c.company).includes(q)
          || searchable(c.email).includes(q)
          || searchable(c.phone || c.whatsapp).includes(q))
      : contacts
    const ordenados = [...filtrados]
    if (ordem === 'nome') ordenados.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    else if (ordem === 'empresa') ordenados.sort((a, b) => a.company.localeCompare(b.company, 'pt-BR'))
    else ordenados.sort((a, b) => (ultimoContato(b)?.getTime() ?? 0) - (ultimoContato(a)?.getTime() ?? 0))
    return ordenados
  }, [contacts, q, ordem])

  /** Abre a conversa da pessoa na aba de atendimento. */
  function abrirConversa(c: Contact) {
    ui.selectContact(c.id)
    ui.setContactView('chat')
    ui.setContactsView('atendimento')
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '22px 30px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid ' + C.fieldBorder, borderRadius: 11, padding: '9px 12px', minWidth: 300 }}>
          <MaterialIcon name="search" size={17} color={C.faint} />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, empresa, e-mail ou telefone..."
            style={{ background: 'transparent', border: 'none', outline: 'none', color: C.ink, fontSize: 13, width: '100%', fontFamily: "'Manrope',sans-serif" }}
          />
          {busca && (
            <button onClick={() => setBusca('')} title="Limpar busca" style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', display: 'flex' }}>
              <MaterialIcon name="close" size={15} color={C.faint} />
            </button>
          )}
        </div>

        <div style={{ fontSize: 12.5, color: C.sub }}>
          <b style={{ color: C.ink }}>{lista.length}</b>
          {lista.length === 1 ? ' contato' : ' contatos'}
          {q && contacts.length !== lista.length && ` de ${contacts.length}`}
        </div>

        <div style={{ flex: 1 }} />

        {!readOnly && (
          <RingButton radius={11} onClick={ui.openContactModal} style={{ ...sx.btnPrimary }}>
            <MaterialIcon name="person_add" size={18} /> Novo contato
          </RingButton>
        )}
      </div>

      <div style={{ ...sx.card, borderRadius: 16, overflow: 'hidden' }}>
        {/* Cabeçalho: as duas primeiras colunas ordenam ao clicar; as outras são só rótulo. */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: `${COLUNAS.map((c) => c.largura).join(' ')} minmax(140px,1fr) minmax(150px,1.2fr) 132px`,
          gap: 12, padding: '11px 18px', borderBottom: '1px solid ' + C.line, background: C.field,
          fontSize: 10.5, fontWeight: 700, letterSpacing: '.1em', color: C.muted,
        }}>
          {COLUNAS.map((col) => (
            <button
              key={col.id}
              onClick={() => setOrdem(col.id)}
              style={{
                border: 'none', background: 'transparent', padding: 0, textAlign: 'left', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 4,
                font: 'inherit', letterSpacing: 'inherit',
                color: ordem === col.id ? C.purple : C.muted,
              }}
            >
              {col.label.toUpperCase()}
              {ordem === col.id && <MaterialIcon name="arrow_downward" size={13} />}
            </button>
          ))}
          <span>TELEFONE</span>
          <span>ETIQUETAS</span>
          <button
            onClick={() => setOrdem('recente')}
            style={{
              border: 'none', background: 'transparent', padding: 0, textAlign: 'left', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4, font: 'inherit', letterSpacing: 'inherit',
              color: ordem === 'recente' ? C.purple : C.muted,
            }}
          >
            ÚLTIMO CONTATO
            {ordem === 'recente' && <MaterialIcon name="arrow_downward" size={13} />}
          </button>
        </div>

        {loading && (
          <div style={{ padding: '26px 18px', fontSize: 13, color: C.faint }}>Carregando contatos...</div>
        )}

        {!loading && lista.length === 0 && (
          <div style={{ padding: '30px 18px', fontSize: 13, color: C.faint, lineHeight: 1.6 }}>
            {q
              ? <>Nenhum contato encontrado para <b style={{ color: C.sub }}>{busca}</b>.</>
              : 'Nenhum contato cadastrado ainda. Crie o primeiro no botão acima.'}
          </div>
        )}

        {lista.map((c, i) => {
          const tel = c.phone || c.whatsapp
          const quando = ultimoContato(c)
          const etiquetas = (c.conv?.tagIds ?? []).map((id) => tagMap.get(id)).filter(Boolean)
          return (
            <div
              key={c.id}
              onDoubleClick={() => abrirConversa(c)}
              style={{
                display: 'grid',
                gridTemplateColumns: `${COLUNAS.map((col) => col.largura).join(' ')} minmax(140px,1fr) minmax(150px,1.2fr) 132px`,
                gap: 12, padding: '11px 18px', alignItems: 'center',
                borderBottom: i === lista.length - 1 ? 'none' : '1px solid ' + C.lineSoft,
                fontSize: 13,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <Avatar initials={c.initials || initialsOf(c.name) || '?'} photoUrl={c.photoUrl} size={32} bg={avPalette[i % avPalette.length]} fontSize={12} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.name || 'Sem nome'}
                  </div>
                  {c.email && (
                    <div style={{ fontSize: 11.5, color: C.faint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.email}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ color: C.sub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.company && c.company !== '—' ? c.company : <span style={{ color: C.faint }}>—</span>}
              </div>

              <div style={{ color: C.sub }}>
                {tel ? fmtPhoneBR(tel) : <span style={{ color: C.faint }}>—</span>}
              </div>

              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', minWidth: 0 }}>
                {etiquetas.length === 0 && <span style={{ color: C.faint }}>—</span>}
                {etiquetas.map((t) => (
                  <span key={t!.id} style={{
                    fontSize: 10.5, fontWeight: 700, borderRadius: 20, padding: '2px 8px',
                    color: t!.color, background: t!.color + '1f', whiteSpace: 'nowrap',
                  }}>
                    {t!.label}
                  </span>
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <span style={{ fontSize: 11.5, color: C.faint, flex: 1, minWidth: 0 }}>
                  {quando ? relativeLabel(quando) : '—'}
                </span>
                <RowAction icon="chat" title="Abrir conversa" onClick={() => abrirConversa(c)} />
                {!readOnly && (
                  <>
                    <RowAction icon="edit" title="Editar contato" onClick={() => setEditando(c)} />
                    <RowAction
                      icon="filter_alt"
                      title="Criar lead com este contato"
                      onClick={() => {
                        ui.pedirNovoLead({
                          contact: c.name,
                          company: c.company && c.company !== '—' ? c.company : '',
                          contactId: c.id,
                        })
                        navigate('/pipeline')
                      }}
                    />
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ fontSize: 11.5, color: C.faint, marginTop: 12, lineHeight: 1.6 }}>
        Clique duas vezes numa linha para abrir a conversa. As etiquetas vêm do atendimento
        em andamento — contato sem conversa aberta não tem etiqueta, e é justamente quem some
        das abas Entrada · Esperando · Finalizados.
      </div>

      {ui.showContactModal && (
        <ContactModal
          onClose={ui.closeContactModal}
          onSaved={() => ui.closeContactModal()}
        />
      )}

      {editando && (
        <ContactModal
          contact={editando}
          onClose={() => setEditando(null)}
          onSaved={() => setEditando(null)}
        />
      )}
    </div>
  )
}

/** Botãozinho de ação da linha. `overflow:hidden` porque sem a fonte de ícones carregada a
    ligadura vira texto largo e invade o vizinho — o mesmo cuidado do HeadAction do Kanban. */
function RowAction({ icon, title, onClick }: { icon: string; title: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 26, height: 26, flexShrink: 0, border: 'none', background: 'transparent',
        borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center',
        justifyContent: 'center', color: C.muted, padding: 0, overflow: 'hidden',
      }}
    >
      <MaterialIcon name={icon} size={16} />
    </button>
  )
}
