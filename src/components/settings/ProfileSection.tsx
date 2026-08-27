import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { removeSelfPhoto, saveSelfProfile, uploadSelfPhoto, useSelfProfile } from '../../hooks/useProfile'
import { initialsOf } from '../../lib/format'
import { sx, C } from '../../styles/sx'
import Avatar from '../common/Avatar'
import PhotoAction from '../common/PhotoAction'
import { Field, PrimaryButton, SettingsCard } from './primitives'
import type { SelfProfile } from '../../hooks/useProfile'

/**
 * Só os campos que o FORMULÁRIO edita. A foto fica de fora de propósito: ela é gravada na
 * hora, e se entrasse aqui o snapshot que volta do upload reiniciaria o rascunho — jogando
 * fora o nome e o cargo ainda não salvos.
 */
type ProfileForm = Pick<SelfProfile, 'displayName' | 'role' | 'signature' | 'phone' | 'closingMessage' | 'closingEnabled'>

function formOf(p: SelfProfile): ProfileForm {
  const { displayName, role, signature, phone, closingMessage, closingEnabled } = p
  return { displayName, role, signature, phone, closingMessage, closingEnabled }
}

/**
 * Perfil da CONTA logada. Sempre editável, inclusive por atendente convidado e em modo
 * somente-leitura: os dados são da pessoa e vão para o doc dela, não para o do tenant
 * que ela está visualizando.
 */
export default function ProfileSection() {
  const { user } = useAuth()
  const saved = useSelfProfile()
  const [draft, setDraft] = useState<ProfileForm>(formOf(saved))
  const [savedAt, setSavedAt] = useState(0)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoError, setPhotoError] = useState('')
  const photoInput = useRef<HTMLInputElement>(null)

  const savedKey = JSON.stringify(formOf(saved))
  useEffect(() => {
    setDraft(JSON.parse(savedKey) as ProfileForm)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey])

  const dirty = JSON.stringify(draft) !== savedKey

  async function save() {
    await saveSelfProfile({
      displayName: draft.displayName.trim(),
      role: draft.role.trim(),
      signature: draft.signature,
      phone: draft.phone.trim(),
      closingMessage: draft.closingMessage,
      closingEnabled: draft.closingEnabled,
    })
    setSavedAt(Date.now())
  }

  /** A foto é gravada na hora, fora do formulário: sobe, grava e o snapshot devolve. */
  async function pickPhoto(file: File | undefined) {
    if (!file) return
    setPhotoError('')
    setPhotoBusy(true)
    try {
      await uploadSelfPhoto(file, saved.photoPath || undefined)
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Não foi possível enviar a foto.')
    } finally {
      setPhotoBusy(false)
      if (photoInput.current) photoInput.current.value = ''
    }
  }

  async function dropPhoto() {
    setPhotoError('')
    setPhotoBusy(true)
    try {
      await removeSelfPhoto(saved.photoPath || undefined)
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Não foi possível remover a foto.')
    } finally {
      setPhotoBusy(false)
    }
  }

  return (
    <SettingsCard title="Dados do seu perfil" subtitle="Nome, cargo e foto aparecem no rodapé da barra lateral. A assinatura vai nas mensagens que você envia.">
      <div style={{ display: 'grid', gap: 14 }}>
        {/* Foto — é o que aparece no rodapé da barra lateral, junto do nome e do cargo. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Avatar
            photoUrl={saved.photoUrl || undefined}
            initials={initialsOf(draft.displayName) || '?'}
            size={64}
            bg={C.purple}
            fontSize={22}
          />
          <div style={{ display: 'grid', gap: 7 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <PhotoAction
                icon="photo_camera"
                title={saved.photoUrl ? 'Trocar foto' : 'Adicionar foto'}
                onClick={() => photoInput.current?.click()}
                disabled={photoBusy}
                busy={photoBusy}
              />
              {saved.photoUrl && !photoBusy && (
                <PhotoAction icon="delete" title="Remover foto" onClick={() => void dropPhoto()} rose />
              )}
              <span style={{ fontSize: 12.5, color: C.sub }}>
                {saved.photoUrl ? 'Sua foto no rodapé da barra lateral.' : 'Sem foto — aparecem suas iniciais.'}
              </span>
            </div>
            <div style={{ fontSize: 11.5, color: C.faint }}>PNG ou JPG · até 2 MB</div>
            {photoError && <div style={{ fontSize: 12.5, color: C.rose, fontWeight: 600 }}>{photoError}</div>}
          </div>
          <input
            ref={photoInput}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => void pickPhoto(e.target.files?.[0])}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Nome">
            <input
              value={draft.displayName}
              onChange={(e) => setDraft((d) => ({ ...d, displayName: e.target.value }))}
              style={sx.input}
            />
          </Field>
          <Field label="Cargo">
            <input
              value={draft.role}
              placeholder="Gerente Comercial"
              onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))}
              style={sx.input}
            />
          </Field>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Telefone">
            <input
              value={draft.phone}
              placeholder="(19) 99999-9999"
              onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
              style={sx.input}
            />
          </Field>
          <div />
        </div>

        <Field label="Assinatura (vai no fim das mensagens que você enviar)">
          <textarea
            value={draft.signature}
            rows={2}
            placeholder="— Pedro, Titãs Consultoria"
            onChange={(e) => setDraft((d) => ({ ...d, signature: e.target.value }))}
            style={{ ...sx.input, resize: 'vertical', fontFamily: 'inherit' }}
          />
        </Field>

        <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={draft.closingEnabled}
            onChange={(e) => setDraft((d) => ({ ...d, closingEnabled: e.target.checked }))}
            style={{ accentColor: C.purple, width: 16, height: 16 }}
          />
          <span style={{ fontSize: 13, color: C.ink }}>Enviar mensagem ao finalizar a conversa</span>
        </label>

        {draft.closingEnabled && (
          <Field label="Sua mensagem de encerramento">
            <textarea
              value={draft.closingMessage}
              rows={3}
              placeholder="Foi um prazer atender você! Qualquer coisa, é só chamar."
              onChange={(e) => setDraft((d) => ({ ...d, closingMessage: e.target.value }))}
              style={{ ...sx.input, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </Field>
        )}

        <div style={{ fontSize: 12.5, color: C.sub }}>
          Conta: <b style={{ color: C.ink }}>{user?.email}</b>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <PrimaryButton icon="save" onClick={save} disabled={!dirty}>Salvar perfil</PrimaryButton>
          {!dirty && savedAt > 0 && <span style={{ fontSize: 12.5, color: C.green, fontWeight: 600 }}>Salvo.</span>}
        </div>
      </div>
    </SettingsCard>
  )
}
