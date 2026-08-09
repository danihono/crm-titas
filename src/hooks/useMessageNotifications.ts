import { useEffect, useRef } from 'react'
import type { Contact } from '../types'

/**
 * Aviso de mensagem nova enquanto o CRM está aberto.
 *
 * O gatilho é o `unreadCount` do contato SUBIR — e não a chegada de qualquer mensagem.
 * Quem incrementa esse campo é o daemon, só para mensagem recebida (ver ingestOne), então
 * responder pelo celular não dispara aviso no próprio CRM.
 *
 * Deliberadamente sem service worker / FCM: isto só funciona com alguma aba aberta. Push
 * com o CRM fechado exigiria infraestrutura nova e é outro assunto.
 */

let audioCtx: AudioContext | null = null

/** Dois toques curtos sintetizados — evita carregar arquivo de áudio no bundle. */
function playChime(): void {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    audioCtx ??= new Ctx()
    const ctx = audioCtx
    // Navegador suspende o contexto até haver gesto do usuário; retomar é best-effort.
    if (ctx.state === 'suspended') void ctx.resume()

    const now = ctx.currentTime
    ;[880, 1174.7].forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const t = now + i * 0.12
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.14, t + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.2)
    })
  } catch {
    // Som é enfeite: política de autoplay do navegador não pode derrubar o CRM.
  }
}

function notify(contact: Contact): void {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  try {
    const n = new Notification(contact.name || 'Nova mensagem', {
      body: contact.lastMessage || 'Mensagem nova no WhatsApp',
      // Uma notificação por contato: a nova substitui a anterior em vez de empilhar.
      tag: `wa-${contact.id}`,
      icon: contact.photoUrl || undefined,
    })
    n.onclick = () => {
      window.focus()
      n.close()
    }
  } catch {
    // Alguns navegadores exigem service worker para Notification; ignorar e seguir.
  }
}

/** Pede permissão ao usuário. Chame SEMPRE a partir de um clique — pedido espontâneo é bloqueado. */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof Notification === 'undefined') return 'denied'
  if (Notification.permission !== 'default') return Notification.permission
  return Notification.requestPermission().catch(() => 'denied' as NotificationPermission)
}

export function useMessageNotifications(contacts: Contact[]): void {
  const previous = useRef<Map<string, number> | null>(null)

  useEffect(() => {
    const current = new Map(contacts.map((c) => [c.id, c.unreadCount ?? 0]))
    const before = previous.current
    previous.current = current

    // Primeira carga: é o estado inicial, não "mensagem que chegou agora". Sem isto o CRM
    // dispararia um aviso por conversa não lida toda vez que a página abrisse.
    if (!before) return

    // Com a aba à frente, o badge na lista já comunica — popup e som viram ruído.
    if (!document.hidden) return

    let arrived = false
    for (const c of contacts) {
      // Contato ausente do snapshot anterior é conversa nova: vale como 0 → notifica.
      if ((c.unreadCount ?? 0) > (before.get(c.id) ?? 0)) {
        notify(c)
        arrived = true
      }
    }
    if (arrived) playChime()
  }, [contacts])
}
