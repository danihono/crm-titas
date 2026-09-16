import { useRef, useState } from 'react'
import { deleteLibraryAsset, uploadLibraryAsset, useMediaLibrary } from '../../hooks/useLibrary'
import { fileTypeMap } from '../../lib/theme'
import { fmtSize, relativeLabel } from '../../lib/format'
import { C } from '../../styles/sx'
import { t } from '../../i18n'
import MaterialIcon from '../common/MaterialIcon'
import { EmptyLine, IconAction, PrimaryButton, Row, SettingsCard } from './primitives'

/**
 * Teto por arquivo. Espelha o limite de upload do `storage.rules` — checar aqui é o que
 * transforma um erro cru de permissão numa mensagem que explica o problema.
 */
const MAX_BYTES = 10 * 1024 * 1024

export default function LibrarySection({ canEdit }: { canEdit: boolean }) {
  const { docs: assets } = useMediaLibrary()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > MAX_BYTES) {
      setError(t('biblioteca.grandeDemais', { nome: file.name, tamanho: fmtSize(file.size), limite: fmtSize(MAX_BYTES) }))
      return
    }
    setBusy(true)
    setError('')
    try {
      await uploadLibraryAsset(file)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('biblioteca.falhaEnvio'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingsCard
      title={t('biblioteca.titulo')}
      subtitle={t('biblioteca.subtitulo')}
      action={
        canEdit ? (
          <PrimaryButton icon="upload" onClick={() => inputRef.current?.click()} disabled={busy}>
            {t(busy ? 'comum.enviando' : 'biblioteca.enviarArquivo')}
          </PrimaryButton>
        ) : undefined
      }
    >
      <input ref={inputRef} type="file" onChange={onPick} style={{ display: 'none' }} />
      {error && <div style={{ fontSize: 12.5, color: C.rose, marginBottom: 10 }}>{error}</div>}

      {assets.length === 0 && <EmptyLine>{t('biblioteca.vazio')}</EmptyLine>}
      {assets.map((a) => {
        const [icon, color, bg] = fileTypeMap[a.type] ?? fileTypeMap.doc
        return (
          <Row
            key={a.id}
            actions={
              <>
                <a
                  href={a.downloadURL}
                  target="_blank"
                  rel="noreferrer"
                  title={t('biblioteca.abrir')}
                  style={{ display: 'flex', color: C.muted, padding: 4 }}
                >
                  <MaterialIcon name="open_in_new" size={18} />
                </a>
                {canEdit && (
                  <IconAction icon="delete" title={t('biblioteca.excluir')} color={C.rose} onClick={() => deleteLibraryAsset(a)} />
                )}
              </>
            }
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <span style={{ width: 34, height: 34, borderRadius: 10, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <MaterialIcon name={icon} size={18} color={color} />
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {a.name}
                </span>
                <span style={{ display: 'block', fontSize: 12, color: C.sub }}>
                  {fmtSize(a.sizeBytes)}
                  {a.uploadedAt.getTime() > 0 && ` · ${relativeLabel(a.uploadedAt)}`}
                </span>
              </span>
            </div>
          </Row>
        )
      })}
    </SettingsCard>
  )
}
