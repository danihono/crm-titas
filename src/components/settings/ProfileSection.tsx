import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { saveSelfProfile, useSelfProfile } from '../../hooks/useProfile'
import { sx, C } from '../../styles/sx'
import { Field, PrimaryButton, SettingsCard } from './primitives'

/**
 * Perfil da CONTA logada. Sempre editável, inclusive por atendente convidado e em modo
 * somente-leitura: os dados são da pessoa e vão para o doc dela, não para o do tenant
 * que ela está visualizando.
 */
export default function ProfileSection() {
  const { user } = useAuth()
  const saved = useSelfProfile()
  const [draft, setDraft] = useState(saved)
  const [savedAt, setSavedAt] = useState(0)

  const savedKey = JSON.stringify(saved)
  useEffect(() => {
    setDraft(saved)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey])

  const dirty = JSON.stringify(draft) !== savedKey

  async function save() {
    await saveSelfProfile({
      displayName: draft.displayName.trim(),
      signature: draft.signature,
      phone: draft.phone.trim(),
      closingMessage: draft.closingMessage,
      closingEnabled: draft.closingEnabled,
    })
    setSavedAt(Date.now())
  }

  return (
    <SettingsCard title="Dados do seu perfil" subtitle="Como você aparece para a equipe e nas mensagens que envia.">
      <div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Nome">
            <input
              value={draft.displayName}
              onChange={(e) => setDraft((d) => ({ ...d, displayName: e.target.value }))}
              style={sx.input}
            />
          </Field>
          <Field label="Telefone">
            <input
              value={draft.phone}
              placeholder="(19) 99999-9999"
              onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
              style={sx.input}
            />
          </Field>
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
