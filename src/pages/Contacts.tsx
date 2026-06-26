import { useRef, useState } from 'react'
import { useUIStore } from '../store/uiStore'
import { useTenantStore } from '../store/tenantStore'
import { useContacts } from '../hooks/useContacts'
import { useMessages, sendMessage } from '../hooks/useMessages'
import { useFiles, uploadContactFile } from '../hooks/useFiles'
import { avPalette, fileTypeMap } from '../lib/theme'
import { chatTimeLabel, timeHHMM, relativeLabel, fmtSize } from '../lib/format'
import MaterialIcon from '../components/common/MaterialIcon'
import ContactModal from '../components/modals/ContactModal'
import SchedMessageModal from '../components/modals/SchedMessageModal'
import type { Contact } from '../types'

export default function Contacts() {
  const { docs: contacts } = useContacts()
  const ui = useUIStore()
  const readOnly = useTenantStore((s) => s.readOnly)
  const active: Contact | undefined = contacts.find((c) => c.id === ui.selectedContact) ?? contacts[0]
  const activeIdx = active ? contacts.findIndex((c) => c.id === active.id) : 0
  const { docs: messages } = useMessages(active?.id ?? null)
  const { docs: files } = useFiles(active?.id ?? null)
  const [waInput, setWaInput] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  async function handleSend() {
    if (!active || !waInput.trim()) return
    await sendMessage(active.id, waInput)
    setWaInput('')
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f && active) await uploadContactFile(active.id, f)
    e.target.value = ''
  }

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* Lista de contatos */}
      <div style={{ width: 320, flexShrink: 0, background: '#ffffff', borderRight: '1px solid #e6e3ee', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '18px 18px 14px', borderBottom: '1px solid #eeebf3' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#1d1726' }}>Contatos</div>
            {!readOnly && (
              <button onClick={ui.openContactModal} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#7a52a0', background: 'rgba(150,110,200,0.1)', border: 'none', borderRadius: 9, padding: '6px 10px', fontWeight: 700, cursor: 'pointer' }}>
                <MaterialIcon name="person_add" size={16} /> Novo
              </button>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f3f1f7', border: '1px solid #e6e3ee', borderRadius: 10, padding: '8px 11px' }}>
            <MaterialIcon name="search" size={17} color="#a39bb0" />
            <input placeholder="Buscar contato..." style={{ background: 'transparent', border: 'none', outline: 'none', color: '#1d1726', fontSize: 13, width: '100%' }} />
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {contacts.map((c, i) => {
            const sel = active?.id === c.id
            return (
              <div
                key={c.id}
                onClick={() => ui.selectContact(c.id)}
                style={{ display: 'flex', flexDirection: 'column', padding: '12px 14px 11px', cursor: 'pointer', borderBottom: '1px solid #f1eff5', background: sel ? 'linear-gradient(90deg,rgba(150,110,200,0.1),transparent)' : 'transparent', boxShadow: sel ? 'inset 3px 0 0 #7a52a0' : undefined }}
              >
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', width: '100%' }}>
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <div style={{ width: 44, height: 44, borderRadius: '50%', background: avPalette[i % avPalette.length], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#fff' }}>{c.initials}</div>
                    {c.online && <span style={{ position: 'absolute', bottom: 1, right: 1, width: 11, height: 11, borderRadius: '50%', background: '#34c759', border: '2px solid #fff' }} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: '#1d1726', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                      <span style={{ fontSize: 10.5, color: '#a39bb0', flexShrink: 0, marginLeft: 6 }}>{c.lastMessageAt ? chatTimeLabel(c.lastMessageAt) : ''}</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: '#9c95a8', margin: '1px 0 3px' }}>{c.company}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <MaterialIcon name="done_all" size={13} color="#34c759" />
                      <span style={{ fontSize: 12, color: '#6e6780', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.lastMessage}</span>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 7, marginTop: 9, paddingLeft: 56 }}>
                  <RowAction icon="chat" color="#1f8a4c" bg="rgba(52,199,89,0.12)" onClick={(e) => { e.stopPropagation(); ui.selectContact(c.id); ui.setContactView('chat') }} />
                  <RowAction icon="person" color="#7a52a0" bg="rgba(150,110,200,0.12)" onClick={(e) => { e.stopPropagation(); ui.selectContact(c.id); ui.setContactView('info') }} />
                  <RowAction icon="folder" color="#4f7fc0" bg="rgba(111,155,207,0.14)" onClick={(e) => { e.stopPropagation(); ui.selectContact(c.id); ui.setContactView('files') }} />
                  {!readOnly && <RowAction icon="schedule_send" color="#b3801f" bg="rgba(216,169,96,0.18)" onClick={(e) => { e.stopPropagation(); ui.openSchedModal(c.id) }} />}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Painel direito */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: '#ece7f1' }}>
        {active && (
          <>
            <div style={{ height: 66, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 13, padding: '0 22px', borderBottom: '1px solid #e2def0', background: '#ffffff' }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: avPalette[activeIdx % avPalette.length], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff' }}>{active.initials}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1d1726' }}>{active.name}</div>
                <div style={{ fontSize: 11.5, color: '#9c95a8' }}>{active.role} · {active.company}</div>
              </div>
              <MaterialIcon name="call" size={21} color="#9c95a8" style={{ cursor: 'pointer' }} />
              <MaterialIcon name="more_vert" size={21} color="#9c95a8" style={{ cursor: 'pointer' }} />
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', flexShrink: 0, background: '#ffffff', borderBottom: '1px solid #e2def0' }}>
              <Tab label="Mensagens" icon="chat" on={ui.contactView === 'chat'} onClick={() => ui.setContactView('chat')} />
              <Tab label="Informações" icon="badge" on={ui.contactView === 'info'} onClick={() => ui.setContactView('info')} />
              <Tab label="Arquivos" icon="folder" on={ui.contactView === 'files'} onClick={() => ui.setContactView('files')} />
            </div>

            {/* CHAT */}
            {ui.contactView === 'chat' && (
              <>
                <div style={{ flex: 1, overflowY: 'auto', padding: '22px 26px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ alignSelf: 'center', fontSize: 10.5, color: '#6e6780', background: 'rgba(28,20,50,0.06)', borderRadius: 20, padding: '4px 12px', marginBottom: 4 }}>Conversa</div>
                  {messages.map((m) => (
                    <div key={m.id} style={{ display: 'flex', justifyContent: m.fromMe ? 'flex-end' : 'flex-start' }}>
                      <div style={m.fromMe
                        ? { maxWidth: '72%', background: 'linear-gradient(150deg,#7a52a0,#5a3a7e)', borderRadius: '15px 15px 4px 15px', padding: '10px 13px', boxShadow: '0 1px 2px rgba(28,20,50,0.12)' }
                        : { maxWidth: '72%', background: '#ffffff', border: '1px solid #ece8f2', borderRadius: '15px 15px 15px 4px', padding: '10px 13px', boxShadow: '0 1px 1px rgba(28,20,50,0.06)' }}>
                        <div style={{ fontSize: 13.5, lineHeight: 1.45, color: m.fromMe ? '#f5f0fa' : '#2a2435' }}>{m.text}</div>
                        <div style={{ fontSize: 10, color: m.fromMe ? 'rgba(240,230,250,0.7)' : '#a39bb0', textAlign: 'right', marginTop: 3, display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'flex-end' }}>
                          {timeHHMM(m.sentAt)}{m.fromMe && <MaterialIcon name="done_all" size={14} color="#cdb6e6" />}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {!readOnly && (
                  <div style={{ flexShrink: 0, padding: '14px 22px 18px', borderTop: '1px solid #e2def0', background: '#ffffff', display: 'flex', alignItems: 'center', gap: 11 }}>
                    <MaterialIcon name="add_circle" size={23} color="#9c95a8" style={{ cursor: 'pointer' }} />
                    <MaterialIcon name="mood" size={22} color="#9c95a8" style={{ cursor: 'pointer' }} />
                    <input
                      value={waInput}
                      onChange={(e) => setWaInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSend() }}
                      placeholder="Digite uma mensagem..."
                      style={{ flex: 1, background: '#f3f1f7', border: '1px solid #e6e3ee', borderRadius: 13, padding: '12px 16px', color: '#1d1726', fontSize: 13.5, outline: 'none' }}
                    />
                    <button onClick={handleSend} style={{ width: 46, height: 46, borderRadius: 13, background: 'linear-gradient(140deg,#34c759,#1f9c46)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(40,170,80,0.3)' }}>
                      <MaterialIcon name="send" size={21} color="#fff" />
                    </button>
                  </div>
                )}
              </>
            )}

            {/* INFO */}
            {ui.contactView === 'info' && (
              <div style={{ flex: 1, overflowY: 'auto', padding: '26px 30px' }}>
                <div style={{ background: '#ffffff', border: '1px solid #ececf3', borderRadius: 18, padding: 24, maxWidth: 560, boxShadow: '0 1px 2px rgba(28,20,50,0.04),0 8px 22px rgba(28,20,50,0.05)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 22 }}>
                    <div style={{ width: 60, height: 60, borderRadius: '50%', background: avPalette[activeIdx % avPalette.length], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 21, fontWeight: 700, color: '#fff' }}>{active.initials}</div>
                    <div>
                      <div style={{ fontSize: 19, fontWeight: 800, color: '#1d1726' }}>{active.name}</div>
                      <div style={{ fontSize: 13, color: '#6e6780' }}>{active.role} · {active.company}</div>
                    </div>
                  </div>
                  <InfoRow icon="mail" color="#7a52a0" bg="rgba(150,110,200,0.12)" label="E-mail" value={active.email} />
                  <InfoRow icon="call" color="#4f7fc0" bg="rgba(111,155,207,0.16)" label="Telefone" value={active.phone} />
                  <InfoRow icon="chat" color="#1f8a4c" bg="rgba(52,199,89,0.14)" label="WhatsApp" value={active.whatsapp} />
                  <InfoRow icon="business" color="#b3801f" bg="rgba(216,169,96,0.18)" label="Empresa" value={active.company} />
                </div>
              </div>
            )}

            {/* FILES */}
            {ui.contactView === 'files' && (
              <div style={{ flex: 1, overflowY: 'auto', padding: '26px 30px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#1d1726' }}>Arquivos de {active.name}</div>
                  {!readOnly && (
                    <button onClick={() => fileInput.current?.click()} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'linear-gradient(140deg,#7a52a0,#553578)', border: '1px solid rgba(200,160,230,0.3)', borderRadius: 11, padding: '9px 15px', color: '#f4eefa', fontSize: 13, fontWeight: 600, cursor: 'pointer', boxShadow: '0 6px 16px rgba(110,65,150,0.22)' }}>
                      <MaterialIcon name="upload_file" size={18} /> Adicionar arquivo
                    </button>
                  )}
                  <input ref={fileInput} type="file" hidden onChange={onPickFile} />
                </div>
                <div style={{ fontSize: 12.5, color: '#9c95a8', marginBottom: 18 }}>Documentos, propostas e contratos armazenados deste cliente.</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 13 }}>
                  {files.map((f) => {
                    const [icon, color, bg] = fileTypeMap[f.type] || fileTypeMap.doc
                    return (
                      <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 13, background: '#ffffff', border: '1px solid #ececf3', borderRadius: 14, padding: 14, boxShadow: '0 1px 2px rgba(28,20,50,0.04)' }}>
                        <MaterialIcon name={icon} size={24} color={color} style={{ background: bg, width: 46, height: 46, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#1d1726', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</div>
                          <div style={{ fontSize: 11.5, color: '#9c95a8' }}>{fmtSize(f.sizeBytes)} · {relativeLabel(f.uploadedAt)}</div>
                        </div>
                        {f.downloadURL
                          ? <a href={f.downloadURL} target="_blank" rel="noreferrer"><MaterialIcon name="download" size={19} color="#7a52a0" style={{ cursor: 'pointer' }} /></a>
                          : <MaterialIcon name="download" size={19} color="#d8d3e2" />}
                      </div>
                    )
                  })}
                  {files.length === 0 && (
                    <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 40, color: '#a39bb0', fontSize: 13, border: '1px dashed #d8d3e2', borderRadius: 14 }}>
                      Nenhum arquivo ainda. Clique em "Adicionar arquivo" para armazenar documentos deste cliente.
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {ui.showContactModal && (
        <ContactModal
          onClose={ui.closeContactModal}
          onSaved={(id) => { ui.selectContact(id); ui.setContactView('info'); ui.closeContactModal() }}
        />
      )}
      {ui.showSchedModal && active && (
        <SchedMessageModal
          contactName={active.name}
          onClose={ui.closeSchedModal}
          onSaved={(day) => { ui.selectDay(day); ui.closeSchedModal() }}
        />
      )}
    </div>
  )
}

function RowAction({ icon, color, bg, onClick }: { icon: string; color: string; bg: string; onClick: (e: React.MouseEvent) => void }) {
  return (
    <span onClick={onClick} className="ms" style={{ fontSize: 16, color, cursor: 'pointer', flex: 1, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, background: bg }}>{icon}</span>
  )
}

function Tab({ label, icon, on, onClick }: { label: string; icon: string; on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flex: 1, padding: '9px 0', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, borderBottom: '2px solid ' + (on ? '#7a52a0' : 'transparent'), color: on ? '#7a52a0' : '#9c95a8', background: 'transparent' }}>
      <MaterialIcon name={icon} size={17} /> {label}
    </button>
  )
}

function InfoRow({ icon, color, bg, label, value }: { icon: string; color: string; bg: string; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 0', borderTop: '1px solid #f1eff5' }}>
      <MaterialIcon name={icon} size={20} color={color} style={{ background: bg, width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }} />
      <div>
        <div style={{ fontSize: 11, color: '#9c95a8', fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 13.5, color: '#1d1726', fontWeight: 500 }}>{value || '—'}</div>
      </div>
    </div>
  )
}
