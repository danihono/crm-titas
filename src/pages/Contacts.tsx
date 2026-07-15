import { useRef, useState } from 'react'
import { useUIStore } from '../store/uiStore'
import { useTenantStore } from '../store/tenantStore'
import { deleteContact, clearConversationLocal, useContacts, uploadContactPhoto, removeContactPhoto } from '../hooks/useContacts'
import { useMessages, sendMessage } from '../hooks/useMessages'
import { useFiles, uploadContactFile } from '../hooks/useFiles'
import { useWhatsappStatus } from '../hooks/useWhatsappStatus'
import { useScheduledMessages } from '../hooks/useScheduledMessages'
import { deleteScheduledMessage } from '../hooks/useEvents'
import { sendWhatsappMessage, fetchWhatsappHistory, refreshWhatsappPhoto, purgeWhatsappContact, daemonConfigured } from '../lib/whatsapp'
import { avPalette, fileTypeMap } from '../lib/theme'
import { chatTimeLabel, timeHHMM, relativeLabel, fmtSize } from '../lib/format'
import MaterialIcon from '../components/common/MaterialIcon'
import AudioMessage from '../components/common/AudioMessage'
import ContactModal from '../components/modals/ContactModal'
import SchedMessageModal from '../components/modals/SchedMessageModal'
import WhatsappConnectModal from '../components/modals/WhatsappConnectModal'
import HistoryRangeModal from '../components/modals/HistoryRangeModal'
import type { Contact, Message, ScheduledMessage, HistoryImportStatus } from '../types'

const WA_DOT: Record<string, string> = {
  connected: '#34c759',
  connecting: '#d8a960',
  qr: '#d8a960',
  loggedOut: '#c14d77',
  disconnected: '#a39bb0',
}

export default function Contacts() {
  const { docs: contacts } = useContacts()
  const ui = useUIStore()
  const readOnly = useTenantStore((s) => s.readOnly)
  const wa = useWhatsappStatus()
  // WhatsApp liberado para todos os usuários (sem feature-flag). Só o modo
  // somente-leitura (dono visualizando outro tenant) esconde a UI de WhatsApp.
  const waEnabled = !readOnly
  const active: Contact | undefined = contacts.find((c) => c.id === ui.selectedContact) ?? contacts[0]
  const activeIdx = active ? contacts.findIndex((c) => c.id === active.id) : 0
  const { docs: messages } = useMessages(active?.id ?? null)
  const { docs: files } = useFiles(active?.id ?? null)
  const { docs: pendingSchedules } = useScheduledMessages()
  const scheduleByContact = new Map<string, ScheduledMessage>()
  for (const s of pendingSchedules) {
    if (!scheduleByContact.has(s.contactId)) scheduleByContact.set(s.contactId, s)
  }
  const activeSchedule = active ? scheduleByContact.get(active.id) : undefined
  const [waInput, setWaInput] = useState('')
  const [histBusy, setHistBusy] = useState(false)
  const [showHistModal, setShowHistModal] = useState(false)
  const [convBusy, setConvBusy] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<ScheduledMessage | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const photoInput = useRef<HTMLInputElement>(null)

  async function handleSend() {
    const text = waInput.trim()
    if (!active || !text) return
    try {
      // Só roteia pelo WhatsApp quando de fato conectado; caso contrário, envio
      // normal (local). Assim quem ainda não conectou o WhatsApp não é bloqueado.
      if (waEnabled && wa.status === 'connected') {
        await sendWhatsappMessage(active.id, text)
      } else {
        await sendMessage(active.id, text)
      }
      setWaInput('')
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Falha ao enviar mensagem.')
    }
  }

  function handleFetchHistory() {
    if (!active || histBusy) return
    setShowHistModal(true) // a janela (dias) é escolhida no modal
  }

  async function startFetchHistory(maxDays?: number) {
    if (!active) return
    setShowHistModal(false)
    setHistBusy(true)
    try {
      await fetchWhatsappHistory(active.id, maxDays)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Falha ao recuperar histórico.')
    } finally {
      setHistBusy(false)
    }
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f && active) await uploadContactFile(active.id, f)
    e.target.value = ''
  }

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f || !active || photoBusy) return
    if (!f.type.startsWith('image/')) { alert('Selecione um arquivo de imagem.'); return }
    setPhotoBusy(true)
    try {
      await uploadContactPhoto(active.id, f, active.photoPath || undefined)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Falha ao enviar a foto.')
    } finally {
      setPhotoBusy(false)
    }
  }

  async function handleRemovePhoto() {
    if (!active || photoBusy) return
    if (!confirm('Remover a foto deste contato? Ele volta a exibir as iniciais.')) return
    setPhotoBusy(true)
    try {
      await removeContactPhoto(active.id, active.photoPath || undefined)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Falha ao remover a foto.')
    } finally {
      setPhotoBusy(false)
    }
  }

  async function handleRefreshPhoto() {
    if (!active || photoBusy) return
    setPhotoBusy(true)
    try {
      const r = await refreshWhatsappPhoto(active.id)
      if (r && r.found === false) alert('Este contato não tem foto de perfil visível no WhatsApp.')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Falha ao puxar a foto do WhatsApp.')
    } finally {
      setPhotoBusy(false)
    }
  }

  async function handleDeleteContact() {
    if (!active) return
    if (!confirm(`Apagar o contato "${active.name}" e TODO o histórico dele (mensagens, arquivos e mídias)?`)) return
    const next = contacts.find((c) => c.id !== active.id)
    try {
      // Expurgo completo via daemon: Firestore recursivo + Storage por prefixo (pega até
      // arquivo órfão) + marcador anti-replay. Sem daemon, cai no caminho local.
      if (daemonConfigured()) await purgeWhatsappContact(active.id, false)
      else await deleteContact(active.id, active.photoPath || undefined)
    } catch {
      try {
        await deleteContact(active.id, active.photoPath || undefined) // daemon fora do ar
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Falha ao apagar o contato.')
        return
      }
    }
    if (next) ui.selectContact(next.id)
  }

  async function handleClearConversation() {
    if (!active || convBusy) return
    if (!confirm(`Limpar TODA a conversa com "${active.name}"? Mensagens, arquivos e mídias serão apagados — o contato continua no CRM.`)) return
    setConvBusy(true)
    try {
      if (daemonConfigured()) await purgeWhatsappContact(active.id, true)
      else await clearConversationLocal(active.id)
    } catch {
      try {
        await clearConversationLocal(active.id) // daemon fora do ar
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Falha ao limpar a conversa.')
      }
    } finally {
      setConvBusy(false)
    }
  }

  function openScheduleCreate(contactId: string) {
    setEditingSchedule(null)
    ui.openSchedModal(contactId)
  }

  function openScheduleEdit(schedule: ScheduledMessage) {
    setEditingSchedule(schedule)
    ui.openSchedModal(schedule.contactId)
  }

  function closeScheduleModal() {
    setEditingSchedule(null)
    ui.closeSchedModal()
  }

  async function handleDeleteSchedule(schedule: ScheduledMessage) {
    if (!confirm(`Excluir a mensagem agendada para ${scheduleLong(schedule)}?`)) return
    await deleteScheduledMessage(schedule.id, schedule.eventId)
    setEditingSchedule(null)
  }

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* Lista de contatos */}
      <div style={{ width: 320, flexShrink: 0, background: '#ffffff', borderRight: '1px solid #e6e3ee', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '18px 18px 14px', borderBottom: '1px solid #eeebf3' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#1d1726' }}>Contatos</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              {waEnabled && (
                <button onClick={ui.openWhatsappModal} title="Conectar WhatsApp" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#1f8a4c', background: 'rgba(52,199,89,0.12)', border: 'none', borderRadius: 9, padding: '6px 10px', fontWeight: 700, cursor: 'pointer' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: WA_DOT[wa.status] ?? '#a39bb0' }} />
                  <MaterialIcon name="chat" size={16} /> WhatsApp
                </button>
              )}
              {!readOnly && (
                <button onClick={ui.openContactModal} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#7a52a0', background: 'rgba(150,110,200,0.1)', border: 'none', borderRadius: 9, padding: '6px 10px', fontWeight: 700, cursor: 'pointer' }}>
                  <MaterialIcon name="person_add" size={16} /> Novo
                </button>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f3f1f7', border: '1px solid #e6e3ee', borderRadius: 10, padding: '8px 11px' }}>
            <MaterialIcon name="search" size={17} color="#a39bb0" />
            <input placeholder="Buscar contato..." style={{ background: 'transparent', border: 'none', outline: 'none', color: '#1d1726', fontSize: 13, width: '100%' }} />
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {contacts.map((c, i) => {
            const sel = active?.id === c.id
            const scheduled = scheduleByContact.get(c.id)
            return (
              <div
                key={c.id}
                onClick={() => ui.selectContact(c.id)}
                style={{ display: 'flex', flexDirection: 'column', padding: '12px 14px 11px', cursor: 'pointer', borderBottom: '1px solid #f1eff5', background: sel ? 'linear-gradient(90deg,rgba(150,110,200,0.1),transparent)' : 'transparent', boxShadow: sel ? 'inset 3px 0 0 #7a52a0' : undefined }}
              >
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', width: '100%' }}>
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <Avatar photoUrl={c.photoUrl} initials={c.initials} size={44} bg={avPalette[i % avPalette.length]} fontSize={14} />
                    {c.online && <span style={{ position: 'absolute', bottom: 1, right: 1, width: 11, height: 11, borderRadius: '50%', background: '#34c759', border: '2px solid #fff' }} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                        <span style={{ fontSize: 13.5, fontWeight: 600, color: '#1d1726', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                        {scheduled && (
                          <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, fontWeight: 800, color: '#8a5f12', background: 'rgba(216,169,96,0.18)', border: '1px solid rgba(216,169,96,0.28)', borderRadius: 999, padding: '2px 6px' }}>
                            <MaterialIcon name="schedule_send" size={11} color="#b3801f" /> Agendada
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: 10.5, color: '#a39bb0', flexShrink: 0, marginLeft: 6 }}>{c.lastMessageAt ? chatTimeLabel(c.lastMessageAt) : ''}</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: '#9c95a8', margin: '1px 0 3px' }}>{c.company}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <MaterialIcon name="done_all" size={13} color="#34c759" />
                      <span style={{ fontSize: 12, color: '#6e6780', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.lastMessage}</span>
                    </div>
                    {scheduled && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4, color: '#b3801f' }}>
                        <MaterialIcon name="schedule_send" size={13} color="#b3801f" />
                        <span style={{ fontSize: 11.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Agendada {scheduleShort(scheduled)}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 7, marginTop: 9, paddingLeft: 56 }}>
                  <RowAction icon="chat" color="#1f8a4c" bg="rgba(52,199,89,0.12)" onClick={(e) => { e.stopPropagation(); ui.selectContact(c.id); ui.setContactView('chat') }} />
                  <RowAction icon="person" color="#7a52a0" bg="rgba(150,110,200,0.12)" onClick={(e) => { e.stopPropagation(); ui.selectContact(c.id); ui.setContactView('info') }} />
                  <RowAction icon="folder" color="#4f7fc0" bg="rgba(111,155,207,0.14)" onClick={(e) => { e.stopPropagation(); ui.selectContact(c.id); ui.setContactView('files') }} />
                  {!readOnly && <RowAction icon="schedule_send" color="#b3801f" bg="rgba(216,169,96,0.18)" onClick={(e) => { e.stopPropagation(); scheduled ? openScheduleEdit(scheduled) : openScheduleCreate(c.id) }} />}
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
              <Avatar photoUrl={active.photoUrl} initials={active.initials} size={40} bg={avPalette[activeIdx % avPalette.length]} fontSize={13} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#1d1726', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{active.name}</div>
                  {activeSchedule && (
                    <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(216,169,96,0.16)', border: '1px solid rgba(216,169,96,0.32)', borderRadius: 999, padding: '3px 5px 3px 9px' }}>
                      <button onClick={() => openScheduleEdit(activeSchedule)} disabled={readOnly} style={{ display: 'flex', alignItems: 'center', gap: 4, border: 'none', background: 'transparent', color: '#7a5516', fontSize: 11.5, fontWeight: 800, cursor: readOnly ? 'default' : 'pointer', padding: 0 }}>
                        <MaterialIcon name="schedule_send" size={13} color="#b3801f" /> Agendada {scheduleShort(activeSchedule)}
                      </button>
                      {!readOnly && (
                        <>
                          <button title="Editar agendamento" onClick={() => openScheduleEdit(activeSchedule)} style={{ width: 22, height: 22, border: 'none', borderRadius: '50%', background: 'rgba(255,255,255,0.64)', color: '#7a5516', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <MaterialIcon name="edit" size={13} />
                          </button>
                          <button title="Excluir agendamento" onClick={() => handleDeleteSchedule(activeSchedule)} style={{ width: 22, height: 22, border: 'none', borderRadius: '50%', background: 'rgba(255,255,255,0.64)', color: '#b73d6d', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <MaterialIcon name="delete" size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
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
                  {waEnabled && wa.status === 'connected' && active.whatsapp && (
                    <HistoryBar
                      status={active.historyImport?.status}
                      imported={active.historyImport?.imported}
                      error={active.historyImport?.error}
                      at={active.historyImport?.at}
                      busy={histBusy}
                      onFetch={handleFetchHistory}
                    />
                  )}
                  {activeSchedule && <ScheduledBanner schedule={activeSchedule} readOnly={readOnly} onEdit={() => openScheduleEdit(activeSchedule)} onDelete={() => handleDeleteSchedule(activeSchedule)} />}
                  {messages.map((m) => (
                    <div key={m.id} style={{ display: 'flex', justifyContent: m.fromMe ? 'flex-end' : 'flex-start' }}>
                      <div style={m.fromMe
                        ? { maxWidth: '72%', background: 'linear-gradient(150deg,#7a52a0,#5a3a7e)', borderRadius: '15px 15px 4px 15px', padding: '10px 13px', boxShadow: '0 1px 2px rgba(28,20,50,0.12)' }
                        : { maxWidth: '72%', background: '#ffffff', border: '1px solid #ece8f2', borderRadius: '15px 15px 15px 4px', padding: '10px 13px', boxShadow: '0 1px 1px rgba(28,20,50,0.06)' }}>
                        <MessageBody message={m} />
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
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 22 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, flexShrink: 0 }}>
                      <Avatar photoUrl={active.photoUrl} initials={active.initials} size={60} bg={avPalette[activeIdx % avPalette.length]} fontSize={21} />
                      {!readOnly && (
                        <div style={{ display: 'flex', gap: 5 }}>
                          <PhotoAction icon="photo_camera" title={active.photoUrl ? 'Trocar foto' : 'Adicionar foto'} onClick={() => photoInput.current?.click()} disabled={photoBusy} />
                          {active.photoUrl && <PhotoAction icon="delete" title="Remover foto" onClick={handleRemovePhoto} disabled={photoBusy} rose />}
                          {waEnabled && wa.status === 'connected' && active.whatsapp && (
                            <PhotoAction icon="sync" title="Puxar foto do WhatsApp" onClick={handleRefreshPhoto} disabled={photoBusy} green />
                          )}
                        </div>
                      )}
                      <input ref={photoInput} type="file" accept="image/*" hidden onChange={onPickPhoto} />
                    </div>
                    <div style={{ flex: 1, marginTop: 4 }}>
                      <div style={{ fontSize: 19, fontWeight: 800, color: '#1d1726' }}>{active.name}</div>
                      <div style={{ fontSize: 13, color: '#6e6780' }}>{active.role} · {active.company}</div>
                    </div>
                    {!readOnly && (
                      <div style={{ display: 'flex', gap: 8, alignSelf: 'flex-start' }}>
                        <button onClick={() => setShowEdit(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(150,110,200,0.1)', border: '1px solid rgba(150,110,200,0.22)', borderRadius: 11, padding: '8px 14px', color: '#7a52a0', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                          <MaterialIcon name="edit" size={17} /> Editar
                        </button>
                        <button onClick={handleClearConversation} disabled={convBusy} title="Apaga todas as mensagens e mídias, mas mantém o contato" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(216,169,96,0.14)', border: '1px solid rgba(216,169,96,0.3)', borderRadius: 11, padding: '8px 14px', color: '#8a5f12', fontSize: 13, fontWeight: 700, cursor: convBusy ? 'wait' : 'pointer', opacity: convBusy ? 0.6 : 1 }}>
                          <MaterialIcon name="delete_sweep" size={17} /> Limpar conversa
                        </button>
                        <button onClick={handleDeleteContact} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(193,77,119,0.1)', border: '1px solid rgba(193,77,119,0.22)', borderRadius: 11, padding: '8px 14px', color: '#b73d6d', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                          <MaterialIcon name="delete" size={17} /> Apagar
                        </button>
                      </div>
                    )}
                  </div>
                  <InfoRow icon="mail" color="#7a52a0" bg="rgba(150,110,200,0.12)" label="E-mail" value={active.email} />
                  <InfoRow icon="call" color="#4f7fc0" bg="rgba(111,155,207,0.16)" label="Telefone" value={active.phone} />
                  <InfoRow icon="chat" color="#1f8a4c" bg="rgba(52,199,89,0.14)" label="WhatsApp" value={active.whatsapp} />
                  <InfoRow icon="business" color="#b3801f" bg="rgba(216,169,96,0.18)" label="Empresa" value={active.company} />
                  {waEnabled && wa.status === 'connected' && active.whatsapp && (
                    <div style={{ marginTop: 18 }}>
                      <HistoryBar
                        status={active.historyImport?.status}
                        imported={active.historyImport?.imported}
                        error={active.historyImport?.error}
                        at={active.historyImport?.at}
                        busy={histBusy}
                        onFetch={handleFetchHistory}
                      />
                    </div>
                  )}
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
      {showEdit && active && (
        <ContactModal
          contact={active}
          onClose={() => setShowEdit(false)}
          onSaved={() => setShowEdit(false)}
        />
      )}
      {ui.showSchedModal && active && (
        <SchedMessageModal
          contactId={active.id}
          contactName={active.name}
          schedule={editingSchedule}
          onClose={closeScheduleModal}
          onSaved={(day) => { setEditingSchedule(null); ui.selectDay(day); ui.closeSchedModal() }}
        />
      )}
      {ui.showWhatsappModal && <WhatsappConnectModal onClose={ui.closeWhatsappModal} />}
      {showHistModal && active && (
        <HistoryRangeModal contactName={active.name} onConfirm={startFetchHistory} onClose={() => setShowHistModal(false)} />
      )}
    </div>
  )
}

function Avatar({ photoUrl, initials, size, bg, fontSize }: { photoUrl?: string; initials: string; size: number; bg: string; fontSize: number }) {
  if (photoUrl) {
    return <img src={photoUrl} alt={initials} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, background: bg }} />
  }
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{initials}</div>
  )
}

function PhotoAction({ icon, title, onClick, disabled, rose, green }: { icon: string; title: string; onClick: () => void; disabled?: boolean; rose?: boolean; green?: boolean }) {
  const color = rose ? '#b73d6d' : green ? '#1f8a4c' : '#7a52a0'
  const bg = rose ? 'rgba(193,77,119,0.1)' : green ? 'rgba(52,199,89,0.12)' : 'rgba(150,110,200,0.1)'
  return (
    <button type="button" title={title} onClick={onClick} disabled={disabled} style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 8, background: bg, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 }}>
      <MaterialIcon name={icon} size={16} color={color} />
    </button>
  )
}

/** Traduz códigos de erro crus do daemon em mensagens legíveis; demais códigos passam direto. */
function historyErrorLabel(code?: string): string {
  switch (code) {
    case 'history_timeout':
      return 'O WhatsApp não respondeu a tempo. Tente novamente.'
    case 'whatsapp_not_connected':
      return 'WhatsApp desconectado. Reconecte e tente de novo.'
    default:
      return code || 'erro desconhecido'
  }
}

function HistoryBar({ status, imported, error, at, busy, onFetch }: { status?: HistoryImportStatus; imported?: number; error?: string; at?: Date; busy: boolean; onFetch: () => void }) {
  // Um 'loading' sem atualização há > 2 min é considerado travado (ex.: daemon reiniciou
  // no meio da importação) → volta a permitir tentar de novo em vez de spinner eterno.
  const stale = status === 'loading' && !busy && !!at && Date.now() - at.getTime() > 120_000
  const loading = (busy || status === 'loading') && !stale
  const done = status === 'done'
  const isError = status === 'error'
  const subtitle = isError
    ? `Não foi possível recuperar: ${historyErrorLabel(error)}`
    : done
      ? `Histórico recuperado${imported ? ` · ${imported} mensagens` : ''}. Você pode buscar mensagens ainda mais antigas.`
      : 'Traz as mensagens antigas desta conversa que o WhatsApp ainda tiver — pode não vir tudo.'
  return (
    <div style={{ alignSelf: 'stretch', display: 'flex', gap: 11, alignItems: 'center', background: '#ffffff', border: '1px solid #e6e3ee', borderRadius: 12, padding: '10px 13px', marginBottom: 2 }}>
      <MaterialIcon name={loading ? 'sync' : isError ? 'error_outline' : 'history'} size={19} color={isError ? '#c14d77' : '#7a52a0'} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: '#1d1726' }}>{loading ? 'Recuperando histórico…' : 'Histórico antigo do WhatsApp'}</div>
        <div style={{ fontSize: 11.5, color: isError ? '#b73d6d' : '#7a6f86', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {loading ? (imported ? `${imported} mensagens até agora…` : 'Buscando no WhatsApp…') : subtitle}
        </div>
      </div>
      {!loading && (
        <button onClick={onFetch} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(150,110,200,0.1)', border: '1px solid rgba(150,110,200,0.24)', borderRadius: 10, padding: '8px 13px', color: '#7a52a0', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
          <MaterialIcon name="history" size={16} /> {done ? 'Buscar mais antigas' : 'Recuperar histórico'}
        </button>
      )}
    </div>
  )
}

function ScheduledBanner({ schedule, readOnly, onEdit, onDelete }: { schedule: ScheduledMessage; readOnly: boolean; onEdit: () => void; onDelete: () => void }) {
  return (
    <div style={{ alignSelf: 'stretch', display: 'flex', gap: 10, alignItems: 'flex-start', background: 'rgba(216,169,96,0.16)', border: '1px solid rgba(216,169,96,0.34)', borderRadius: 12, padding: '10px 13px', color: '#6b4a12', marginBottom: 2 }}>
      <MaterialIcon name="schedule_send" size={18} color="#b3801f" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: '#6b4a12' }}>Mensagem agendada para {scheduleLong(schedule)}</div>
        <div style={{ fontSize: 12.5, color: '#7a5a22', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>{schedule.text}</div>
      </div>
      {!readOnly && (
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button onClick={onEdit} style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#fffaf0', border: '1px solid rgba(216,169,96,0.34)', borderRadius: 9, padding: '6px 9px', color: '#7a5516', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
            <MaterialIcon name="edit" size={14} /> Editar
          </button>
          <button onClick={onDelete} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(193,77,119,0.08)', border: '1px solid rgba(193,77,119,0.22)', borderRadius: 9, padding: '6px 9px', color: '#b73d6d', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
            <MaterialIcon name="delete" size={14} /> Excluir
          </button>
        </div>
      )}
    </div>
  )
}

function scheduleShort(s: ScheduledMessage): string {
  return `${s.dueAt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${s.time}`
}

function scheduleLong(s: ScheduledMessage): string {
  return `${s.dueAt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${s.time}`
}

function MessageBody({ message: m }: { message: Message }) {
  const textColor = m.fromMe ? '#f5f0fa' : '#2a2435'
  const muted = m.fromMe ? 'rgba(240,230,250,0.78)' : '#6e6780'
  const hasRenderableMedia = !!m.mediaType && !!m.mediaUrl && !m.mediaError
  const legacyMediaPlaceholder = !m.mediaType && m.pending && isMediaPlaceholder(m.text)

  return (
    <div style={{ fontSize: 13.5, lineHeight: 1.45, color: textColor }}>
      {hasRenderableMedia && m.mediaType === 'image' && (
        <a href={m.mediaUrl} target="_blank" rel="noreferrer" style={{ display: 'block', margin: '-2px -4px 7px', color: 'inherit' }}>
          <img src={m.mediaUrl} alt={m.caption || m.fileName || 'Imagem do WhatsApp'} style={{ display: 'block', width: '100%', maxWidth: 330, maxHeight: 360, objectFit: 'cover', borderRadius: 10 }} />
        </a>
      )}
      {hasRenderableMedia && m.mediaType === 'sticker' && (
        <img src={m.mediaUrl} alt={m.caption || 'Figurinha do WhatsApp'} style={{ display: 'block', width: 140, height: 140, objectFit: 'contain', margin: '-2px 0 5px' }} />
      )}
      {hasRenderableMedia && m.mediaType === 'video' && (
        <video src={m.mediaUrl} controls preload="metadata" style={{ display: 'block', width: '100%', maxWidth: 330, maxHeight: 360, borderRadius: 10, margin: '-2px -4px 7px', background: '#0d0a12' }} />
      )}
      {hasRenderableMedia && m.mediaType === 'audio' && (
        <AudioMessage src={m.mediaUrl!} fromMe={m.fromMe} downloadName={m.fileName} />
      )}
      {hasRenderableMedia && m.mediaType !== 'image' && m.mediaType !== 'audio' && m.mediaType !== 'video' && m.mediaType !== 'sticker' && (
        <a href={m.mediaUrl} target="_blank" rel="noreferrer" style={{ color: m.fromMe ? '#ffffff' : '#5a3a7e', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8, border: '1px solid ' + (m.fromMe ? 'rgba(255,255,255,0.24)' : '#e6e3ee'), borderRadius: 10, padding: '8px 10px', marginBottom: m.text ? 7 : 0, background: m.fromMe ? 'rgba(255,255,255,0.1)' : '#f8f6fb' }}>
          <MaterialIcon name="description" size={18} color={m.fromMe ? '#f5f0fa' : '#7a52a0'} />
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 700 }}>{m.fileName || mediaLabel(m.mediaType)}</span>
          <MaterialIcon name="download" size={17} color={m.fromMe ? '#f5f0fa' : '#7a52a0'} />
        </a>
      )}
      {m.mediaError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: muted, fontStyle: 'italic' }}>
          <MaterialIcon name="error_outline" size={15} color={muted} />
          <span>{m.mediaError === 'view_once_unsupported' ? 'Mídia de visualização única não importada' : 'Não foi possível baixar a mídia'}</span>
        </div>
      )}
      {legacyMediaPlaceholder && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: muted, fontStyle: 'italic' }}>
          <MaterialIcon name="hide_image" size={15} color={muted} />
          <span>{m.text} sem arquivo salvo</span>
        </div>
      )}
      {!legacyMediaPlaceholder && (!hasRenderableMedia || m.text !== mediaLabel(m.mediaType)) && m.text && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: hasRenderableMedia && (m.mediaType === 'image' || m.mediaType === 'video') ? 0 : undefined }}>
          {m.pending && !m.mediaError && <MaterialIcon name="attach_file" size={15} color={muted} />}
          <span style={{ fontStyle: m.pending && !m.mediaUrl ? 'italic' : 'normal', opacity: m.pending && !m.mediaUrl ? 0.9 : 1 }}>{m.text}</span>
        </div>
      )}
    </div>
  )
}

function isMediaPlaceholder(text: string): boolean {
  return ['[imagem]', '[vídeo]', '[áudio]', '[documento]', '[figurinha]'].includes(text)
}

function mediaLabel(type?: Message['mediaType']): string {
  if (type === 'image') return '[imagem]'
  if (type === 'video') return '[vídeo]'
  if (type === 'audio') return '[áudio]'
  if (type === 'document') return '[documento]'
  if (type === 'sticker') return '[figurinha]'
  return ''
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
