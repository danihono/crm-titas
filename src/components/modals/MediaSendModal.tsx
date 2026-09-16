import { useEffect, useMemo, useRef, useState } from 'react'
import Modal from './Modal'
import MaterialIcon from '../common/MaterialIcon'
import RingButton from '../common/RingButton'
import EmojiPicker from '../common/EmojiPicker'
import { C, sx } from '../../styles/sx'
import { t, type Chave } from '../../i18n'
import { fmtSize } from '../../lib/format'
import { mediaTypeOf, MAX_UPLOAD_BYTES, type OutgoingMediaType } from '../../hooks/useMessages'

/**
 * Confirmação do anexo antes de sair: preview do arquivo, legenda (com emojis) e o envio.
 *
 * O upload NÃO acontece aqui — quem sobe e roteia (WhatsApp x local) é a página. Confirmado
 * o anexo, o modal FECHA na hora e a pré-via vira bolha na conversa; o que demora (upload,
 * daemon, Baileys) acontece atrás dela. Por isso não há mais estado de "enviando" aqui: o
 * modal é só a etapa de conferência, e `error` cobre o que ainda pode reprovar antes de
 * sair — arquivo grande demais ou de tipo recusado.
 */

const TYPE_ICON: Record<OutgoingMediaType, string> = {
  image: 'image',
  video: 'movie',
  audio: 'graphic_eq',
  document: 'description',
}

const TYPE_LABEL: Record<OutgoingMediaType, Chave> = {
  image: 'modal.midiaFoto',
  video: 'modal.midiaVideo',
  audio: 'modal.midiaAudio',
  document: 'modal.midiaDocumento',
}

interface Props {
  file: File
  contactName: string
  error?: string
  onSend: (caption: string) => void
  onClose: () => void
}

export default function MediaSendModal({ file, contactName, error, onSend, onClose }: Props) {
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
    if (tooBig) return
    onSend(caption)
  }

  return (
    <Modal width={470} onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ ...sx.serif, fontSize: 23, color: C.ink }}>{t('modal.enviarMidia', { tipo: t(TYPE_LABEL[mediaType]).toLowerCase() })}</div>
        <MaterialIcon name="close" size={23} color={C.muted} style={{ cursor: 'pointer' }} onClick={onClose} />
      </div>
      <div style={{ fontSize: 12.5, color: C.sub, marginBottom: 16 }}>
        {t('modal.midiaDestino')} <b>{contactName}</b>.
      </div>

      <div style={{ background: C.field, border: `1px solid ${C.fieldBorder}`, borderRadius: 14, padding: 12, marginBottom: 14 }}>
        {mediaType === 'image' && (
          <img src={url} alt={file.name} style={{ display: 'block', width: '100%', maxHeight: 260, objectFit: 'contain', borderRadius: 10, background: C.chatBg }} />
        )}
        {mediaType === 'video' && (
          <video src={url} controls preload="metadata" style={{ display: 'block', width: '100%', maxHeight: 260, borderRadius: 10, background: '#0d0a12' }} />
        )}
        {mediaType === 'audio' && <audio src={url} controls style={{ display: 'block', width: '100%' }} />}
        {mediaType === 'document' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 2px' }}>
            <MaterialIcon name="description" size={26} color={C.purple} style={{ background: C.tintPurple, width: 48, height: 48, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
              <div style={{ fontSize: 11.5, color: C.muted }}>{file.type || t('modal.arquivoGenerico')}</div>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 11.5, color: tooBig ? C.roseDeep : C.sub }}>
          <MaterialIcon name={TYPE_ICON[mediaType]} size={15} color={tooBig ? C.rose : C.muted} />
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {file.name} · {fmtSize(file.size)}
          </span>
        </div>
      </div>

      {tooBig && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: 'rgba(193,77,119,0.08)', border: '1px solid rgba(193,77,119,0.22)', borderRadius: 11, padding: '9px 12px', marginBottom: 14 }}>
          <MaterialIcon name="error_outline" size={17} color={C.rose} />
          <div style={{ fontSize: 12, color: C.roseDeep }}>
            {t('modal.midiaGrandeDemais', { tamanho: fmtSize(file.size), limite: fmtSize(MAX_UPLOAD_BYTES) })}
          </div>
        </div>
      )}

      {error && !tooBig && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: 'rgba(193,77,119,0.08)', border: '1px solid rgba(193,77,119,0.22)', borderRadius: 11, padding: '9px 12px', marginBottom: 14 }}>
          <MaterialIcon name="error_outline" size={17} color={C.rose} />
          <div style={{ fontSize: 12, color: C.roseDeep }}>{error}</div>
        </div>
      )}

      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <button
          ref={emojiBtnRef}
          type="button"
          title={t('contatos.emojis')}
          onClick={() => setShowEmoji((v) => !v)}
          style={{ width: 38, height: 38, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${C.fieldBorder}`, borderRadius: 11, background: showEmoji ? C.tintPurple : C.field, cursor: 'pointer' }}
        >
          <MaterialIcon name="mood" size={19} color={C.purple} />
        </button>
        <input
          ref={captionRef}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
          placeholder={t('modal.legendaPlaceholder')}
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
          style={{ background: C.raised, border: `1px solid ${C.fieldBorder}`, borderRadius: 11, padding: '10px 18px', color: C.strong, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          {t('comum.cancelar')}
        </button>
        <RingButton
          radius={11}
          onClick={submit}
          disabled={tooBig}
          style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'linear-gradient(140deg,#34c759,#1f9c46)', border: '1px solid rgba(150,220,170,0.4)', padding: '10px 20px', color: '#ffffff', fontSize: 13, fontWeight: 700, cursor: tooBig ? 'default' : 'pointer', opacity: tooBig ? 0.6 : 1 }}
        >
          <MaterialIcon name="send" size={16} />
          {t('comum.enviar')}
        </RingButton>
      </div>
    </Modal>
  )
}
