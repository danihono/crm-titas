import { useEffect, useState } from 'react'
import { C } from '../../styles/sx'
import MaterialIcon from '../common/MaterialIcon'
import type { QuickReply } from '../../types'

/** O texto digitado é um comando de resposta rápida? Devolve o filtro, ou null. */
export function quickReplyQuery(text: string): string | null {
  // Só no começo da mensagem e sem espaço: "/ola" abre a lista, "manda /ola pra ele" não.
  const m = /^\/(\S*)$/.exec(text)
  return m ? m[1].toLowerCase() : null
}

export function matchQuickReplies(replies: QuickReply[], query: string): QuickReply[] {
  if (!query) return replies
  return replies.filter(
    (r) => r.shortcut.includes(query) || r.title.toLowerCase().includes(query),
  )
}

/**
 * Lista de respostas rápidas que aparece ao digitar `/` no campo de mensagem.
 * Setas navegam, Enter/clique escolhem, Esc fecha — o teclado é onde a mão já está.
 */
export default function QuickReplyPicker({ replies, onPick, onClose }: {
  replies: QuickReply[]
  onPick: (reply: QuickReply) => void
  onClose: () => void
}) {
  const [index, setIndex] = useState(0)

  // A lista muda a cada tecla digitada no campo; sem religar a seleção, a seta poderia
  // apontar para um item que já saiu do filtro.
  useEffect(() => {
    setIndex(0)
  }, [replies.length])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (replies.length === 0) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setIndex((i) => (i + 1) % replies.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setIndex((i) => (i - 1 + replies.length) % replies.length)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        onPick(replies[index])
      } else if (e.key === 'Escape') {
        onClose()
      }
    }
    // Captura para chegar antes do onKeyDown do campo, que manda a mensagem no Enter.
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [replies, index, onPick, onClose])

  if (replies.length === 0) return null

  return (
    <div style={{ position: 'absolute', left: 18, right: 18, bottom: 74, zIndex: 7, background: '#fff', border: '1px solid #e6e3ee', borderRadius: 14, padding: 6, boxShadow: '0 18px 44px rgba(20,14,40,0.2)', maxHeight: 260, overflowY: 'auto' }}>
      {replies.map((r, i) => (
        <button
          key={r.id}
          onMouseEnter={() => setIndex(i)}
          onClick={() => onPick(r)}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
            border: 'none', borderRadius: 10, padding: '9px 10px', cursor: 'pointer',
            fontFamily: "'Manrope',sans-serif",
            background: i === index ? 'rgba(150,110,200,0.12)' : 'transparent',
          }}
        >
          <MaterialIcon name="quickreply" size={17} color={C.purple} />
          <span style={{ minWidth: 0, flex: 1 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <code style={{ fontSize: 11.5, fontWeight: 700, color: C.purple }}>/{r.shortcut}</code>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{r.title}</span>
            </span>
            <span style={{ display: 'block', fontSize: 12, color: C.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {r.text}
            </span>
          </span>
        </button>
      ))}
    </div>
  )
}
