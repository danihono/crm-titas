import { useEffect, useMemo, useRef, useState } from 'react'
import Modal from './Modal'
import MaterialIcon from '../common/MaterialIcon'
import RingButton from '../common/RingButton'
import EmojiPicker from '../common/EmojiPicker'
import { sx } from '../../styles/sx'
import { fmtSize } from '../../lib/format'
import { mediaTypeOf, MAX_UPLOAD_BYTES, type OutgoingMediaType } from '../../hooks/useMessages'

/**
 * Confirmação do anexo antes de sair: preview do arquivo, legenda (com emojis) e o envio.
 *
 * O upload NÃO acontece aqui — quem sobe e roteia (WhatsApp x local) é a página, que passa
 * `sending` e `error` de volta. Assim o modal continua sendo só a etapa de conferência, e a
 * regra de envio mora num lugar só.
 */

const TYPE_ICON: Record<OutgoingMediaType, string> = {
  image: 'image',
  video: 'movie',
  audio: 'graphic_eq',
  document: 'description',
}

const TYPE_LABEL: Record<OutgoingMediaType, string> = {
  image: 'Foto',
  video: 'Vídeo',
  audio: 'Áudio',
  document: 'Documento',
}

interface Props {
  file: File
  contactName: string
  sending: boolean
  error?: string
  onSend: (caption: string) => void
  onClose: () => void
}

export default function MediaSendModal({ file, contactName, sending, error, onSend, onClose }: Props) {
  const [caption, setCaption] = useState('')
  const [showEmoji, setShowEmoji] = useState(false)
  const captionRef = useRef<HTMLInputElement>(null)
  const emojiBtnRef = useRef<HTMLButtonElement>(null)
  const mediaType = mediaTypeOf(file)
  const tooBig = file.size >= MAX_UPLOAD_BYTES

  // URL local só para o preview: nada sobe ao Storage antes de o usuário confirmar.
  const url = useMemo(() => URL.createObjectURL(file), [file])
  useEffect(() => () => URL.revokeObjectURL(url), [url])

  /** Insere o emoji na posição do cursor da legenda, mantendo o foco onde estava. */
  function insertEmoji(emoji: string) {
    const el = captionRef.current
    if (!el) {
      setCaption((c) => c + emoji)
      return
    }
    const start = el.selectionStart ?? caption.length
    const end = el.selectionEnd ?? caption.length
    const next = caption.slice(0, start) + emoji + caption.slice(end)
    setCaption(next)
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + emoji.length
      el.setSelectionRange(pos, pos)
    })
  }

  function submit() {
    if (sending || tooBig) return
    onSend(caption)
  }

  return (
    <Modal width={470} onClose={sending ? () => {} : onClose}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ ...sx.serif, fontSize: 23, fontWeight: 600, color: '#1d1726' }}>Enviar {TYPE_LABEL[mediaType].toLowerCase()}</div>
        {!sending && <MaterialIcon name="close" size={23} color="#9c95a8" style={{ cursor: 'pointer' }} onClick={onClose} />}
      </div>
      <div style={{ fontSize: 12.5, color: '#6e6780', marginBottom: 16 }}>
        Para <b>{contactName}</b>.
      </div>

      <div style={{ background: '#f7f5fa', border: '1px solid #e6e3ee', borderRadius: 14, padding: 12, marginBottom: 14 }}>
        {mediaType === 'image' && (
          <img src={url} alt={file.name} style={{ display: 'block', width: '100%', maxHeight: 260, objectFit: 'contain', borderRadius: 10, background: '#ece7f1' }} />
        )}
        {mediaType === 'video' && (
          <video src={url} controls preload="metadata" style={{ display: 'block', width: '100%', maxHeight: 260, borderRadius: 10, background: '#0d0a12' }} />
        )}
        {mediaType === 'audio' && <audio src={url} controls style={{ display: 'block', width: '100%' }} />}
        {mediaType === 'document' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 2px' }}>
            <MaterialIcon name="description" size={26} color="#7a52a0" style={{ background: 'rgba(150,110,200,0.12)', width: 48, height: 48, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1d1726', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
              <div style={{ fontSize: 11.5, color: '#9c95a8' }}>{file.type || 'arquivo'}</div>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 11.5, color: tooBig ? '#b73d6d' : '#7a6f86' }}>
          <MaterialIcon name={TYPE_ICON[mediaType]} size={15} color={tooBig ? '#c14d77' : '#9c95a8'} />
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {file.name} · {fmtSize(file.size)}
          </span>
        </div>
      </div>

      {tooBig && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: 'rgba(193,77,119,0.08)', border: '1px solid rgba(193,77,119,0.22)', borderRadius: 11, padding: '9px 12px', marginBottom: 14 }}>
          <MaterialIcon name="error_outline" size={17} color="#c14d77" />
          <div style={{ fontSize: 12, color: '#b73d6d' }}>
            Este arquivo tem {fmtSize(file.size)} e o limite é 10 MB. Escolha um menor (ou comprima o vídeo) e tente de novo.
          </div>
        </div>
      )}

      {error && !tooBig && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: 'rgba(193,77,119,0.08)', border: '1px solid rgba(193,77,119,0.22)', borderRadius: 11, padding: '9px 12px', marginBottom: 14 }}>
          <MaterialIcon name="error_outline" size={17} color="#c14d77" />
          <div style={{ fontSize: 12, color: '#b73d6d' }}>{error}</div>
        </div>
      )}

      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <button
          ref={emojiBtnRef}
          type="button"
          title="Emojis"
          onClick={() => setShowEmoji((v) => !v)}
          style={{ width: 38, height: 38, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e6e3ee', borderRadius: 11, background: showEmoji ? 'rgba(150,110,200,0.12)' : '#f7f5fa', cursor: 'pointer' }}
        >
          <MaterialIcon name="mood" size={19} color="#7a52a0" />
        </button>
        <input
          ref={captionRef}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
          placeholder="Escreva uma legenda (opcional)..."
          disabled={sending}
          style={{ ...sx.input, flex: 1 }}
        />
        {showEmoji && (
          <div style={{ position: 'absolute', bottom: 46, left: 0, zIndex: 5 }}>
            <EmojiPicker onPick={insertEmoji} onClose={() => setShowEmoji(false)} anchorRef={emojiBtnRef} />
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button
          onClick={onClose}
          disabled={sending}
          style={{ background: '#f3f1f7', border: '1px solid #e6e3ee', borderRadius: 11, padding: '10px 18px', color: '#4a4458', fontSize: 13, fontWeight: 600, cursor: sending ? 'default' : 'pointer', opacity: sending ? 0.6 : 1 }}
        >
          Cancelar
        </button>
        <RingButton
          radius={11}
          onClick={submit}
          disabled={sending || tooBig}
          style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'linear-gradient(140deg,#34c759,#1f9c46)', border: '1px solid rgba(150,220,170,0.4)', padding: '10px 20px', color: '#ffffff', fontSize: 13, fontWeight: 700, cursor: sending || tooBig ? 'default' : 'pointer', opacity: sending || tooBig ? 0.6 : 1 }}
        >
          <MaterialIcon name={sending ? 'progress_activity' : 'send'} size={16} className={sending ? 'icon-spin' : undefined} />
          {sending ? 'Enviando…' : 'Enviar'}
        </RingButton>
      </div>
    </Modal>
  )
}
