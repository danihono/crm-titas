import { useEffect, useRef, useState } from 'react'
import { useUIStore } from '../store/uiStore'
import { useTenantStore } from '../store/tenantStore'
import { deleteContact, clearConversationLocal, useContacts, uploadContactPhoto, removeContactPhoto, markContactRead } from '../hooks/useContacts'
import { useMessages, sendMessage, uploadOutgoingMedia, sendLocalMediaMessage } from '../hooks/useMessages'
import { useFiles, uploadContactFile } from '../hooks/useFiles'
import { useWhatsappStatus } from '../hooks/useWhatsappStatus'
import { useScheduledMessages } from '../hooks/useScheduledMessages'
import { deleteScheduledMessage } from '../hooks/useEvents'
import { sendWhatsappMessage, sendWhatsappMedia, fetchWhatsappHistory, refreshWhatsappPhoto, purgeWhatsappContact, retryWhatsappMedia, whatsappEnabled, waErrorCode } from '../lib/whatsapp'
import { useDaemonOnline } from '../hooks/useDaemonOnline'
import { useMembers } from '../hooks/useTeam'
import { useSectors, useTags } from '../hooks/useSettings'
import { convOf, ensureConversation, markFirstResponse } from '../hooks/useConversations'
import InboxTabs, { filterByInbox } from '../components/conversation/InboxTabs'
import AtendimentoBar from '../components/conversation/AtendimentoBar'
import { useAuth } from '../contexts/AuthContext'
import { avPalette, fileTypeMap } from '../lib/theme'
import { chatTimeLabel, timeHHMM, relativeLabel, fmtSize, mediaLabel } from '../lib/format'
import MaterialIcon from '../components/common/MaterialIcon'
import RingButton from '../components/common/RingButton'
import AudioMessage from '../components/common/AudioMessage'
import EmojiPicker from '../components/common/EmojiPicker'
import ContactModal from '../components/modals/ContactModal'
import SchedMessageModal from '../components/modals/SchedMessageModal'
import WhatsappConnectModal from '../components/modals/WhatsappConnectModal'
import HistoryRangeModal from '../components/modals/HistoryRangeModal'
import MediaSendModal from '../components/modals/MediaSendModal'
import type { Contact, Message, ScheduledMessage, HistoryImportStatus, MediaRecovery, ConvStatus, Tag } from '../types'

const WA_DOT: Record<string, string> = {
  connected: '#34c759',
  connecting: '#d8a960',
  qr: '#d8a960',
  loggedOut: '#c14d77',
  disconnected: '#a39bb0',
}

/** Folga (px) para considerar a conversa "no fim" — evita alternar por 1px de arredondamento. */
const BOTTOM_SLACK = 120

/**
 * Id da primeira mensagem NÃO LIDA da conversa, contando de trás para frente.
 *
 * Só mensagem recebida conta: é assim que o daemon incrementa `unreadCount` (ver ingestOne).
 * Se a janela carregada tiver menos recebidas que o contador (histórico grande, teto de 500),
 * ancora na recebida mais antiga que existe — melhor do que não ancorar em nada.
 */
function firstUnreadId(messages: Message[], count: number): string | null {
  if (count <= 0) return null
  let seen = 0
  let oldestIncoming: string | null = null
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.fromMe) continue
    oldestIncoming = m.id
    seen++
    if (seen === count) return m.id
  }
  return oldestIncoming
}

export default function Contacts() {
  const { docs: contacts } = useContacts()
  const ui = useUIStore()
  const readOnly = useTenantStore((s) => s.readOnly)
  const wa = useWhatsappStatus()
  // WhatsApp liberado para todos os usuários (sem feature-flag por tenant). Some
  // no modo somente-leitura (dono visualizando outro tenant) e enquanto o
  // kill-switch global estiver ativo. Daemon fora do ar NÃO esconde nada — isso é
  // sinalizado pelo heartbeat (waOnline abaixo).
  const waEnabled = !readOnly && whatsappEnabled()
  // O daemon é self-hosted e pode estar desligado — decide entre expurgo pelo daemon
  // (completo) e o caminho local.
  const waOnline = useDaemonOnline()
  const [search, setSearch] = useState('')
  const [inbox, setInbox] = useState<ConvStatus>('entrada')
  const { docs: members } = useMembers()
  const { docs: sectors } = useSectors()
  const { docs: tags } = useTags()
  const { user } = useAuth()
  const q = search.trim().toLowerCase()
  // Buscar atravessa as abas de propósito: procurar um contato e não achá-lo porque a
  // conversa dele foi finalizada seria só confusão. Sem busca, vale a aba escolhida.
  const shownContacts = q
    ? contacts.filter((c) => [c.name, c.company, c.email, c.phone, c.whatsapp].some((v) => v?.toLowerCase().includes(q)))
    : filterByInbox(contacts, inbox)
  // O contato selecionado continua aberto mesmo depois de mudar de aba (ao finalizar,
  // por exemplo) — só o fallback respeita a lista visível.
  const active: Contact | undefined =
    contacts.find((c) => c.id === ui.selectedContact) ?? shownContacts[0]
  const activeIdx = active ? contacts.findIndex((c) => c.id === active.id) : 0
  const activeId = active?.id
  const activeUnread = active?.unreadCount ?? 0

  // Quantas não lidas a conversa tinha AO ABRIR — congelado aqui porque o efeito logo abaixo
  // zera o contador em seguida. A dependência é só `activeId` de propósito: assim o valor lido
  // é o de antes do zeramento (efeitos rodam na ordem de declaração, no mesmo commit) e não
  // muda quando chega mensagem com a conversa já aberta, o que faria a faixa pular de lugar.
  const [openUnread, setOpenUnread] = useState(0)
  const [unreadSeen, setUnreadSeen] = useState(false)
  useEffect(() => {
    setOpenUnread(activeUnread)
    setUnreadSeen(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId])

  // Conversa aberta é conversa lida. Depende de unreadCount (e não só do id) para zerar de
  // novo quando chega mensagem com a conversa já na tela.
  useEffect(() => {
    if (!readOnly && activeId && activeUnread > 0) void markContactRead(activeId)
  }, [readOnly, activeId, activeUnread])

  // Abre o ciclo de atendimento de quem já trocou mensagem — é o que faz a conversa
  // existir nos relatórios. Exige `lastMessageAt` para só folhear a agenda não encher o
  // histórico, e nunca toca em conversa finalizada: abrir um contato para reler o que
  // foi dito não pode reabrir o atendimento (isso é o botão Reabrir, ou o daemon quando
  // chega mensagem nova).
  const needsConv =
    !!active && !readOnly && !!active.lastMessageAt &&
    !convOf(active).recordId && convOf(active).status !== 'finalizado'
  useEffect(() => {
    if (needsConv && active) void ensureConversation(active)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsConv, activeId])
  const { docs: messages, loading: messagesLoading } = useMessages(active?.id ?? null)
  const { docs: files } = useFiles(active?.id ?? null)
  const { docs: pendingSchedules } = useScheduledMessages()
  const scheduleByContact = new Map<string, ScheduledMessage>()
  for (const s of pendingSchedules) {
    if (!scheduleByContact.has(s.contactId)) scheduleByContact.set(s.contactId, s)
  }
  const activeSchedule = active ? scheduleByContact.get(active.id) : undefined
  const [waInput, setWaInput] = useState('')
  const [histBusy, setHistBusy] = useState(false)
  const [mediaBusy, setMediaBusy] = useState(false)
  const [showHistModal, setShowHistModal] = useState(false)
  const [convBusy, setConvBusy] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<ScheduledMessage | null>(null)
  const [showEmoji, setShowEmoji] = useState(false)
  const [showAttach, setShowAttach] = useState(false)
  const [pendingMedia, setPendingMedia] = useState<File | null>(null)
  const [mediaSending, setMediaSending] = useState(false)
  const [mediaSendError, setMediaSendError] = useState('')
  const [atBottom, setAtBottom] = useState(true)
  const fileInput = useRef<HTMLInputElement>(null)
  const photoInput = useRef<HTMLInputElement>(null)
  const waInputRef = useRef<HTMLInputElement>(null)
  const emojiBtnRef = useRef<HTMLButtonElement>(null)
  const attachBtnRef = useRef<HTMLButtonElement>(null)
  const photoVideoInput = useRef<HTMLInputElement>(null)
  const docInput = useRef<HTMLInputElement>(null)
  const audioInput = useRef<HTMLInputElement>(null)
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const unreadMarkRef = useRef<HTMLDivElement>(null)
  /** Conversa que já foi posicionada — impede reposicionar a cada mensagem que chega. */
  const positionedFor = useRef('')
  /** Última contagem vista por conversa, para saber o que é mensagem NOVA. */
  const lastSeen = useRef<{ id: string; count: number }>({ id: '', count: 0 })

  const unreadAnchorId = firstUnreadId(messages, openUnread)
  const chatOpen = ui.contactView === 'chat'

  function markPosition(el: HTMLDivElement) {
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_SLACK
    setAtBottom(bottom)
    // Chegou ao fim = viu tudo o que estava por ler; o contador do botão pode sumir.
    if (bottom) setUnreadSeen(true)
  }

  function scrollToEnd(behavior: ScrollBehavior = 'smooth') {
    const el = chatScrollRef.current
    if (!el) return
    if (behavior === 'auto') el.scrollTop = el.scrollHeight
    else chatEndRef.current?.scrollIntoView({ behavior, block: 'end' })
    setUnreadSeen(true)
    setAtBottom(true)
  }

  // Posicionamento de ABERTURA: cai na primeira não lida (ou no fim, quando não há nenhuma).
  // Roda uma vez por conversa aberta, e só depois que as mensagens dela chegaram — enquanto
  // `messagesLoading`, `messages` ainda é o snapshot da conversa anterior.
  useEffect(() => {
    // Sair da aba desmonta o container (a rolagem volta ao topo), então ao voltar tudo é
    // posicionado de novo.
    if (!chatOpen) {
      positionedFor.current = ''
      return
    }
    if (!activeId || messagesLoading) return
    const key = `${activeId}:${messages.length > 0}`
    if (positionedFor.current === key) return
    const el = chatScrollRef.current
    if (!el) return
    positionedFor.current = key

    const place = () => {
      // Outra conversa assumiu entre o agendamento e o quadro: este posicionamento morreu.
      if (positionedFor.current !== key) return
      const mark = unreadMarkRef.current
      if (mark) {
        // getBoundingClientRect em vez de offsetTop: não depende de quem é o offsetParent.
        el.scrollTop += mark.getBoundingClientRect().top - el.getBoundingClientRect().top - 14
      } else {
        el.scrollTop = el.scrollHeight
      }
      markPosition(el)
    }
    place()
    // Registra a contagem já posicionada: sem isto o efeito de auto-scroll abaixo veria as
    // mensagens desta conversa como "recém-chegadas" e puxaria tudo para o fim, desfazendo
    // a âncora que acabamos de aplicar.
    lastSeen.current = { id: activeId, count: messages.length }
    // Imagens e vídeos só ganham altura depois do primeiro layout — repete no quadro seguinte.
    // Sem cleanup de propósito: em StrictMode (dev) o efeito é remontado na hora, e cancelar
    // aqui mataria justamente o quadro de ajuste. Quem descarta o obsoleto é a guarda acima.
    requestAnimationFrame(place)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, chatOpen, messagesLoading, messages.length])

  // Mensagem NOVA só arrasta a tela para quem já estava no fim — quem está lendo o meio da
  // conversa não é puxado para baixo.
  useEffect(() => {
    const el = chatScrollRef.current
    if (!el || !chatOpen || !activeId) return
    const prev = lastSeen.current
    lastSeen.current = { id: activeId, count: messages.length }
    if (prev.id !== activeId) return // troca de conversa: quem posiciona é o efeito acima
    if (messages.length > prev.count && atBottom) el.scrollTop = el.scrollHeight
  }, [activeId, chatOpen, messages.length, atBottom])

  /** Insere o emoji na posição do cursor do campo de mensagem. */
  function insertEmoji(emoji: string) {
    const el = waInputRef.current
    if (!el) {
      setWaInput((t) => t + emoji)
      return
    }
    const start = el.selectionStart ?? waInput.length
    const end = el.selectionEnd ?? waInput.length
    setWaInput(waInput.slice(0, start) + emoji + waInput.slice(end))
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + emoji.length
      el.setSelectionRange(pos, pos)
    })
  }

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
      setShowEmoji(false)
      scrollToEnd('auto')
      // Métrica de primeira resposta — depois do envio, e sem await: a mensagem já saiu,
      // e o relatório não pode segurar a UI nem falhar junto com ela.
      if (!readOnly) void markFirstResponse(active)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Falha ao enviar mensagem.')
    }
  }

  function onPickMedia(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setShowAttach(false)
    setMediaSendError('')
    setPendingMedia(f)
  }

  /**
   * Sobe o anexo e o despacha. O upload vem primeiro nos dois caminhos: com o arquivo já no
   * Storage, o daemon só precisa baixá-lo, e o fallback local reaproveita a mesma URL.
   */
  async function handleSendMedia(caption: string) {
    if (!active || !pendingMedia || mediaSending) return
    setMediaSending(true)
    setMediaSendError('')
    try {
      const media = await uploadOutgoingMedia(active.id, pendingMedia, caption)
      if (waEnabled && wa.status === 'connected') {
        try {
          await sendWhatsappMedia(active.id, media)
        } catch (err) {
          // Daemon fora do ar: o arquivo já subiu, então a mensagem fica no CRM em vez de
          // se perder. Qualquer outra falha é real e precisa aparecer.
          if (waErrorCode(err) !== 'daemon_offline') throw err
          await sendLocalMediaMessage(active.id, media)
        }
      } else {
        await sendLocalMediaMessage(active.id, media)
      }
      setPendingMedia(null)
      scrollToEnd('auto')
    } catch (err) {
      setMediaSendError(err instanceof Error ? err.message : 'Falha ao enviar o anexo.')
    } finally {
      setMediaSending(false)
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

  // Mídias desta conversa que chegaram mas ficaram sem arquivo. Derivado das mensagens já
  // assinadas — não custa leitura nenhuma. 'view_once_unsupported' fica de fora: não é falha,
  // é mídia que o WhatsApp não deixa espelhar.
  const brokenMedia = messages.filter(
    (m) => !!m.mediaType && !m.mediaUrl && !!m.mediaError && m.mediaError !== 'view_once_unsupported',
  ).length

  async function handleRetryMedia() {
    if (!active || mediaBusy) return
    setMediaBusy(true)
    try {
      const res = await retryWhatsappMedia(active.id)
      const legacy = typeof res.legacy === 'number' ? res.legacy : 0
      const eligible = typeof res.eligible === 'number' ? res.eligible : 0
      if (!eligible && legacy) {
        alert(
          `Estas ${legacy} mídias falharam antes do serviço passar a guardar o material de ` +
            'retentativa, então não há como baixá-las de novo.',
        )
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Falha ao recuperar as mídias.')
    } finally {
      setMediaBusy(false)
    }
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f || !active) return
    try {
      await uploadContactFile(active.id, f)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Falha ao enviar o arquivo.')
    }
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
      if (waOnline) await purgeWhatsappContact(active.id, false)
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
      if (waOnline) await purgeWhatsappContact(active.id, true)
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
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar contato..." style={{ background: 'transparent', border: 'none', outline: 'none', color: '#1d1726', fontSize: 13, width: '100%' }} />
            {search && (
              <button onClick={() => setSearch('')} title="Limpar busca" style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', display: 'flex' }}>
                <MaterialIcon name="close" size={15} color="#a39bb0" />
              </button>
            )}
          </div>
          {q ? (
            <div style={{ fontSize: 11.5, color: '#9c95a8', marginTop: 10 }}>
              Buscando em todas as abas do atendimento.
            </div>
          ) : (
            <InboxTabs contacts={contacts} active={inbox} onChange={setInbox} />
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {shownContacts.map((c) => {
            const i = contacts.indexOf(c)
            const sel = active?.id === c.id
            const scheduled = scheduleByContact.get(c.id)
            // A conversa aberta é zerada pelo efeito abaixo; não mostra badge nem negrito.
            const unread = sel ? 0 : (c.unreadCount ?? 0)
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
                        <span style={{ fontSize: 13.5, fontWeight: unread ? 800 : 600, color: '#1d1726', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                        {scheduled && (
                          <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, fontWeight: 800, color: '#8a5f12', background: 'rgba(216,169,96,0.18)', border: '1px solid rgba(216,169,96,0.28)', borderRadius: 999, padding: '2px 6px' }}>
                            <MaterialIcon name="schedule_send" size={11} color="#b3801f" /> Agendada
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0, marginLeft: 6 }}>
                        <span style={{ fontSize: 10.5, color: unread ? '#1f8a4c' : '#a39bb0' }}>{c.lastMessageAt ? chatTimeLabel(c.lastMessageAt) : ''}</span>
                        {unread > 0 && (
                          <span style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, background: '#34c759', color: '#fff', fontSize: 10.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                            {unread > 99 ? '99+' : unread}
                          </span>
                        )}
                      </div>
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
                    <ConvMeta contact={c} tags={tags} />
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
          {shownContacts.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', fontSize: 12.5, color: '#a39bb0', lineHeight: 1.6 }}>
              {q
                ? `Nenhum contato encontrado para "${search}".`
                : inbox === 'entrada'
                  ? 'Nenhuma conversa na entrada.'
                  : inbox === 'esperando'
                    ? 'Nenhuma conversa aguardando retorno do cliente.'
                    : 'Nenhum atendimento finalizado ainda.'}
            </div>
          )}
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
            </div>

            {/* Atendimento: responsável, setor, etiquetas e transições de estado */}
            <AtendimentoBar
              contact={active}
              members={members}
              sectors={sectors}
              tags={tags}
              canWrite={!readOnly}
              meUid={user?.uid ?? ''}
              meName={user?.displayName || user?.email || 'Atendente'}
            />

            {/* Tabs */}
            <div style={{ display: 'flex', flexShrink: 0, background: '#ffffff', borderBottom: '1px solid #e2def0' }}>
              <Tab label="Mensagens" icon="chat" on={ui.contactView === 'chat'} onClick={() => ui.setContactView('chat')} />
              <Tab label="Informações" icon="badge" on={ui.contactView === 'info'} onClick={() => ui.setContactView('info')} />
              <Tab label="Arquivos" icon="folder" on={ui.contactView === 'files'} onClick={() => ui.setContactView('files')} />
            </div>

            {/* CHAT */}
            {ui.contactView === 'chat' && (
              <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                {/* Área de mensagens + botão flutuante: o wrapper posicionado para aqui, para
                    o botão não flutuar por cima do campo de mensagem. */}
                <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                  <div
                    ref={chatScrollRef}
                    onScroll={(e) => markPosition(e.currentTarget)}
                    style={{ flex: 1, overflowY: 'auto', padding: '22px 26px', display: 'flex', flexDirection: 'column', gap: 10 }}
                  >
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
                    {waEnabled && wa.status === 'connected' && (brokenMedia > 0 || active.mediaRecovery?.status === 'loading') && (
                      <MediaBar
                        broken={brokenMedia}
                        recovery={active.mediaRecovery}
                        busy={mediaBusy}
                        onRetry={handleRetryMedia}
                      />
                    )}
                    {activeSchedule && <ScheduledBanner schedule={activeSchedule} readOnly={readOnly} onEdit={() => openScheduleEdit(activeSchedule)} onDelete={() => handleDeleteSchedule(activeSchedule)} />}
                    {messages.map((m) => (
                      <div key={m.id} style={{ display: 'contents' }}>
                        {m.id === unreadAnchorId && (
                          <div ref={unreadMarkRef} style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '6px 0 2px' }}>
                            <span style={{ flex: 1, height: 1, background: 'rgba(52,199,89,0.4)' }} />
                            <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 800, color: '#1f8a4c', background: 'rgba(52,199,89,0.14)', border: '1px solid rgba(52,199,89,0.26)', borderRadius: 20, padding: '4px 12px' }}>
                              {openUnread === 1 ? '1 mensagem não lida' : `${openUnread} mensagens não lidas`}
                            </span>
                            <span style={{ flex: 1, height: 1, background: 'rgba(52,199,89,0.4)' }} />
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: m.fromMe ? 'flex-end' : 'flex-start' }}>
                          <div style={m.fromMe
                            ? { maxWidth: '72%', background: 'linear-gradient(150deg,#7a52a0,#5a3a7e)', borderRadius: '15px 15px 4px 15px', padding: '10px 13px', boxShadow: '0 1px 2px rgba(28,20,50,0.12)' }
                            : { maxWidth: '72%', background: '#ffffff', border: '1px solid #ece8f2', borderRadius: '15px 15px 15px 4px', padding: '10px 13px', boxShadow: '0 1px 1px rgba(28,20,50,0.06)' }}>
                            <MessageBody message={m} />
                            <div style={{ fontSize: 10, color: m.fromMe ? 'rgba(240,230,250,0.7)' : '#a39bb0', textAlign: 'right', marginTop: 3, display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'flex-end' }}>
                              {timeHHMM(m.sentAt)}{m.fromMe && <MaterialIcon name="done_all" size={14} color="#cdb6e6" />}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    <div ref={chatEndRef} style={{ height: 1, flexShrink: 0 }} />
                  </div>

                  {/* Ir para o fim da conversa — some quando já se está lá. */}
                  {!atBottom && (
                    <button
                      onClick={() => scrollToEnd()}
                      title="Ir para o final da conversa"
                      style={{ position: 'absolute', right: 22, bottom: 16, display: 'flex', alignItems: 'center', gap: 6, height: 40, padding: unreadSeen || openUnread === 0 ? 0 : '0 14px 0 12px', width: unreadSeen || openUnread === 0 ? 40 : undefined, justifyContent: 'center', borderRadius: 999, border: '1px solid #e2def0', background: '#ffffff', color: '#1f8a4c', cursor: 'pointer', boxShadow: '0 6px 18px rgba(28,20,50,0.16)', zIndex: 3 }}
                    >
                      <MaterialIcon name="keyboard_double_arrow_down" size={21} color="#1f8a4c" />
                      {!unreadSeen && openUnread > 0 && (
                        <span style={{ fontSize: 12, fontWeight: 800 }}>{openUnread > 99 ? '99+' : openUnread}</span>
                      )}
                    </button>
                  )}
                </div>

                {!readOnly && (
                  <div style={{ position: 'relative', flexShrink: 0, padding: '14px 22px 18px', borderTop: '1px solid #e2def0', background: '#ffffff', display: 'flex', alignItems: 'center', gap: 9 }}>
                    <ComposerAction btnRef={emojiBtnRef} icon="mood" title="Emojis" on={showEmoji} onClick={() => { setShowAttach(false); setShowEmoji((v) => !v) }} />
                    <ComposerAction btnRef={attachBtnRef} icon="attach_file" title="Anexar arquivo" on={showAttach} onClick={() => { setShowEmoji(false); setShowAttach((v) => !v) }} />
                    <input
                      ref={waInputRef}
                      value={waInput}
                      onChange={(e) => setWaInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSend() }}
                      placeholder="Digite uma mensagem..."
                      style={{ flex: 1, background: '#f3f1f7', border: '1px solid #e6e3ee', borderRadius: 13, padding: '12px 16px', color: '#1d1726', fontSize: 13.5, outline: 'none' }}
                    />
                    <button onClick={handleSend} style={{ width: 46, height: 46, borderRadius: 13, background: 'linear-gradient(140deg,#34c759,#1f9c46)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(40,170,80,0.3)' }}>
                      <MaterialIcon name="send" size={21} color="#fff" />
                    </button>

                    {showEmoji && (
                      <div style={{ position: 'absolute', left: 18, bottom: 74, zIndex: 6 }}>
                        <EmojiPicker onPick={insertEmoji} onClose={() => setShowEmoji(false)} anchorRef={emojiBtnRef} />
                      </div>
                    )}
                    {showAttach && (
                      <AttachMenu
                        anchorRef={attachBtnRef}
                        onClose={() => setShowAttach(false)}
                        onPhoto={() => photoVideoInput.current?.click()}
                        onDoc={() => docInput.current?.click()}
                        onAudio={() => audioInput.current?.click()}
                      />
                    )}
                    <input ref={photoVideoInput} type="file" accept="image/*,video/*" hidden onChange={onPickMedia} />
                    <input ref={docInput} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar" hidden onChange={onPickMedia} />
                    <input ref={audioInput} type="file" accept="audio/*" hidden onChange={onPickMedia} />
                  </div>
                )}
              </div>
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
                            <PhotoAction icon="sync" title="Puxar foto do WhatsApp" onClick={handleRefreshPhoto} disabled={photoBusy} busy={photoBusy} green />
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
                    <RingButton radius={11} onClick={() => fileInput.current?.click()} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'linear-gradient(140deg,#7a52a0,#553578)', border: '1px solid rgba(200,160,230,0.3)', padding: '9px 15px', color: '#f4eefa', fontSize: 13, fontWeight: 600, cursor: 'pointer', boxShadow: '0 6px 16px rgba(110,65,150,0.22)' }}>
                      <MaterialIcon name="upload_file" size={18} /> Adicionar arquivo
                    </RingButton>
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
      {pendingMedia && active && (
        <MediaSendModal
          file={pendingMedia}
          contactName={active.name}
          sending={mediaSending}
          error={mediaSendError || undefined}
          onSend={handleSendMedia}
          onClose={() => { setPendingMedia(null); setMediaSendError('') }}
        />
      )}
    </div>
  )
}

/**
 * Rodapé de atendimento da linha da lista: responsável e etiquetas.
 * Só aparece quando há o que mostrar — contato sem atendimento nenhum continua com a
 * linha enxuta que a tela sempre teve.
 */
function ConvMeta({ contact, tags }: { contact: Contact; tags: Tag[] }) {
  const conv = convOf(contact)
  const applied = tags.filter((t) => conv.tagIds.includes(t.id))
  if (!conv.assignedName && applied.length === 0) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
      {conv.assignedName && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, fontWeight: 700, color: '#6e6780' }}>
          <MaterialIcon name="support_agent" size={12} color="#9c95a8" />
          {conv.assignedName}
        </span>
      )}
      {applied.map((t) => (
        <span key={t.id} style={{ fontSize: 10, fontWeight: 800, color: t.color, background: t.color + '1f', borderRadius: 999, padding: '2px 7px' }}>
          {t.label}
        </span>
      ))}
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

/** Botão redondo do campo de mensagem (emoji / anexo), aceso enquanto o painel está aberto. */
function ComposerAction({ icon, title, on, onClick, btnRef }: { icon: string; title: string; on: boolean; onClick: () => void; btnRef?: React.Ref<HTMLButtonElement> }) {
  return (
    <button
      ref={btnRef}
      type="button"
      title={title}
      onClick={onClick}
      style={{ width: 40, height: 40, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 12, background: on ? 'rgba(150,110,200,0.16)' : '#f3f1f7', cursor: 'pointer' }}
    >
      <MaterialIcon name={icon} size={21} color="#7a52a0" />
    </button>
  )
}

/** Menu do clipe: escolhe o tipo de anexo e dispara o seletor de arquivo correspondente. */
function AttachMenu({ anchorRef, onClose, onPhoto, onDoc, onAudio }: { anchorRef?: { current: HTMLElement | null }; onClose: () => void; onPhoto: () => void; onDoc: () => void; onAudio: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // Clique no próprio clipe não conta como "fora": senão o menu fecharia no mousedown e
    // o clique reabriria em seguida.
    function onDown(e: MouseEvent) {
      const t = e.target as Node
      if (ref.current?.contains(t) || anchorRef?.current?.contains(t)) return
      onClose()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose, anchorRef])

  const options: { icon: string; label: string; hint: string; color: string; bg: string; onClick: () => void }[] = [
    { icon: 'photo_library', label: 'Foto ou vídeo', hint: 'Da galeria do computador', color: '#7a52a0', bg: 'rgba(150,110,200,0.12)', onClick: onPhoto },
    { icon: 'description', label: 'Documento', hint: 'PDF, planilha, contrato', color: '#4f7fc0', bg: 'rgba(111,155,207,0.16)', onClick: onDoc },
    { icon: 'graphic_eq', label: 'Áudio', hint: 'Arquivo de áudio', color: '#1f8a4c', bg: 'rgba(52,199,89,0.14)', onClick: onAudio },
  ]

  return (
    <div
      ref={ref}
      style={{ position: 'absolute', left: 62, bottom: 74, zIndex: 6, width: 250, background: '#ffffff', border: '1px solid #e6e3ee', borderRadius: 14, padding: 6, boxShadow: '0 10px 34px rgba(28,20,50,0.18)' }}
    >
      {options.map((o) => (
        <button
          key={o.label}
          type="button"
          onClick={o.onClick}
          style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left', border: 'none', background: 'transparent', borderRadius: 10, padding: '9px 10px', cursor: 'pointer' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#f7f5fa')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <MaterialIcon name={o.icon} size={19} color={o.color} style={{ background: o.bg, width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} />
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#1d1726' }}>{o.label}</span>
            <span style={{ display: 'block', fontSize: 11.5, color: '#9c95a8' }}>{o.hint}</span>
          </span>
        </button>
      ))}
    </div>
  )
}

function PhotoAction({ icon, title, onClick, disabled, busy, rose, green }: { icon: string; title: string; onClick: () => void; disabled?: boolean; busy?: boolean; rose?: boolean; green?: boolean }) {
  const color = rose ? '#b73d6d' : green ? '#1f8a4c' : '#7a52a0'
  const bg = rose ? 'rgba(193,77,119,0.1)' : green ? 'rgba(52,199,89,0.12)' : 'rgba(150,110,200,0.1)'
  return (
    <button type="button" title={busy ? 'Trabalhando…' : title} onClick={onClick} disabled={disabled} style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 8, background: bg, cursor: disabled ? 'wait' : 'pointer', opacity: disabled && !busy ? 0.5 : 1 }}>
      <MaterialIcon name={busy ? 'progress_activity' : icon} size={16} color={color} className={busy ? 'icon-spin' : undefined} />
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

/**
 * Mídias desta conversa que ficaram sem arquivo, com o botão de rebaixá-las.
 *
 * Só aparece quando há o que recuperar. `legacy` (mensagens que quebraram antes de o daemon
 * passar a guardar o material de retentativa) fica de fora da contagem porque não há como
 * trazê-las de volta — prometer isso seria mentira.
 */
function MediaBar({ broken, recovery, busy, onRetry }: { broken: number; recovery?: MediaRecovery; busy: boolean; onRetry: () => void }) {
  // Mesma proteção da HistoryBar: 'loading' parado há > 2 min é considerado travado.
  const stale = recovery?.status === 'loading' && !busy && !!recovery.at && Date.now() - recovery.at.getTime() > 120_000
  const loading = (busy || recovery?.status === 'loading') && !stale
  const denied = recovery?.error === 'storage_denied'
  const expired = recovery?.error === 'wa_media_expired'

  const subtitle = loading
    ? `${recovery?.recovered ?? 0} de ${recovery?.total ?? broken} recuperadas…`
    : denied
      ? 'O serviço ainda está sem permissão para salvar arquivos — tentar de novo não vai adiantar.'
      : expired
        ? 'O WhatsApp não tem mais alguns destes arquivos.'
        : `${broken} ${broken === 1 ? 'arquivo desta conversa não foi salvo' : 'arquivos desta conversa não foram salvos'}.`

  return (
    <div style={{ alignSelf: 'stretch', display: 'flex', gap: 11, alignItems: 'center', background: '#ffffff', border: '1px solid #e6e3ee', borderRadius: 12, padding: '10px 13px', marginBottom: 2 }}>
      <MaterialIcon name={loading ? 'sync' : denied ? 'error_outline' : 'image_not_supported'} size={19} color={denied ? '#c14d77' : '#7a52a0'} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: '#1d1726' }}>{loading ? 'Recuperando mídias…' : 'Mídias não baixadas'}</div>
        <div style={{ fontSize: 11.5, color: denied ? '#b73d6d' : '#7a6f86', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{subtitle}</div>
      </div>
      {!loading && (
        <button onClick={onRetry} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(150,110,200,0.1)', border: '1px solid rgba(150,110,200,0.24)', borderRadius: 10, padding: '8px 13px', color: '#7a52a0', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
          <MaterialIcon name="download" size={16} /> Recuperar mídias
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
          <span>{mediaErrorLabel(m.mediaError)}</span>
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

/**
 * Motivo da mídia não ter arquivo. Distinguir importa: "o WhatsApp não entregou" e "o serviço
 * não pôde salvar" pedem providências opostas — a segunda é problema de infraestrutura, e
 * ficar tentando de novo não resolve.
 */
const MEDIA_ERROR_LABELS: Record<string, string> = {
  view_once_unsupported: 'Mídia de visualização única não importada',
  download_failed: 'Não foi possível baixar a mídia do WhatsApp',
  wa_media_expired: 'O WhatsApp não tem mais este arquivo',
  storage_denied: 'A mídia chegou, mas o serviço não pôde salvá-la',
  storage_failed: 'A mídia chegou, mas falhou ao salvar o arquivo',
}

/** O fallback preserva os docs gravados antes desta lista existir. */
function mediaErrorLabel(code: string): string {
  return MEDIA_ERROR_LABELS[code] || 'Não foi possível baixar a mídia'
}

function isMediaPlaceholder(text: string): boolean {
  return ['[imagem]', '[vídeo]', '[áudio]', '[documento]', '[figurinha]'].includes(text)
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
