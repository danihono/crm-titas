import { useRef, useState } from 'react'
import SuperModal, { SuperField, superInputClass } from './SuperModal'
import MaterialIcon from '../../components/common/MaterialIcon'
import RingButton from '../../components/common/RingButton'
import { CLIENT_COLORS, brandGradient, brandShadow, clientColor, isHexColor } from '../../lib/clientBrand'
import { deleteClientLogoFile, saveClientBranding, uploadClientLogo, type Client } from '../../hooks/useClients'

interface Logo { url: string; path: string }

/**
 * Ficha do cliente no painel do dono do sistema: nome, cor e logo. Só isto — as
 * security rules recusam qualquer outro campo vindo de um super admin.
 *
 * A imagem sobe para o Storage assim que é escolhida (para dar preview real), então os
 * caminhos enviados nesta sessão são anotados e varridos se o modal for fechado sem
 * salvar — senão cada tentativa deixaria um arquivo órfão no bucket.
 */
export default function ClientEditModal({ client, onClose }: { client: Client; onClose: () => void }) {
  const [name, setName] = useState(client.displayName)
  const [color, setColor] = useState(clientColor(client.brandColor))
  const [logo, setLogo] = useState<Logo | null>(
    client.logoUrl && client.logoPath ? { url: client.logoUrl, path: client.logoPath } : null,
  )
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const uploaded = useRef<string[]>([])

  const trimmed = name.trim()
  const logoChanged = (logo?.path ?? null) !== (client.logoPath ?? null)
  const dirty = trimmed !== client.displayName || color !== clientColor(client.brandColor) || logoChanged
  const busy = uploading || saving

  /** Apaga do Storage o que foi enviado nesta sessão e não vai ficar em pé. */
  async function discardOrphans(keep?: string) {
    await Promise.all(uploaded.current.filter((p) => p !== keep).map(deleteClientLogoFile))
    uploaded.current = []
  }

  async function pick(file: File | undefined) {
    if (!file) return
    setError('')
    setUploading(true)
    try {
      const up = await uploadClientLogo(client.uid, file)
      uploaded.current.push(up.path)
      setLogo(up)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar a imagem.')
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  async function save() {
    if (!trimmed) {
      setError('O nome do cliente não pode ficar vazio.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await saveClientBranding(client.uid, {
        displayName: trimmed,
        brandColor: color,
        ...(logoChanged ? { logo } : null),
      })
      if (logoChanged) await deleteClientLogoFile(client.logoPath)
      await discardOrphans(logo?.path)
      onClose()
    } catch (err) {
      console.error('[ClientEditModal]', err)
      setError('Não foi possível salvar. Confira as regras do Firestore (o dono do sistema só pode alterar nome, cor e logo).')
      setSaving(false)
    }
  }

  async function cancel() {
    if (busy) return
    await discardOrphans(client.logoPath)
    onClose()
  }

  return (
    <SuperModal
      title="Editar cliente"
      subtitle="Nome, cor e logo para identificar este cliente no painel. Não altera nada dentro do CRM dele."
      icon="badge"
      onClose={cancel}
    >
      <div className="flex flex-col gap-5">
        {/* Prévia + logo */}
        <div className="flex items-center gap-4">
          <div
            className="w-16 h-16 rounded-2xl grid place-items-center overflow-hidden shrink-0 text-[22px] font-bold text-[#160f1d]"
            style={{ background: brandGradient(color) }}
          >
            {logo ? <img src={logo.url} alt="" className="w-full h-full object-cover" /> : (trimmed[0] || '?').toUpperCase()}
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => fileInput.current?.click()}
                className="flex items-center gap-1.5 h-9 px-3 rounded-xl text-[12.5px] font-bold text-[#e8e2ee] bg-[rgba(255,255,255,0.05)] border border-[rgba(176,148,210,0.16)] hover:bg-[rgba(255,255,255,0.09)] disabled:opacity-50"
              >
                <MaterialIcon name="image" size={17} />
                {uploading ? 'Enviando…' : logo ? 'Trocar logo' : 'Enviar logo'}
              </button>
              {logo && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setLogo(null)}
                  className="flex items-center gap-1.5 h-9 px-3 rounded-xl text-[12.5px] font-bold text-[#d98aa8] bg-[rgba(193,77,119,0.12)] border border-[rgba(193,77,119,0.28)] hover:bg-[rgba(193,77,119,0.2)] disabled:opacity-50"
                >
                  <MaterialIcon name="delete" size={17} /> Remover
                </button>
              )}
            </div>
            <div className="text-[11.5px] text-[#7d7388]">PNG, JPG ou SVG · até 2 MB</div>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void pick(e.target.files?.[0])}
          />
        </div>

        <SuperField label="Nome do cliente" hint={client.email ? `Conta: ${client.email}` : undefined}>
          <input
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome que aparece no painel"
            className={superInputClass}
          />
        </SuperField>

        <SuperField label="Cor">
          <div className="flex items-center gap-2 flex-wrap pt-0.5">
            {CLIENT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Cor ${c}`}
                className="w-7 h-7 rounded-full"
                style={{
                  background: c,
                  border: c === color ? '2px solid #f3eef6' : '2px solid transparent',
                  outline: c === color ? `2px solid ${c}88` : 'none',
                }}
              />
            ))}
            <label
              className="w-7 h-7 rounded-full grid place-items-center cursor-pointer border border-[rgba(176,148,210,0.3)]"
              title="Cor personalizada"
              style={{ background: CLIENT_COLORS.includes(color) ? 'transparent' : color }}
            >
              <MaterialIcon name="colorize" size={15} color="#c9a6e0" />
              <input
                type="color"
                value={color}
                onChange={(e) => isHexColor(e.target.value) && setColor(e.target.value.toLowerCase())}
                className="w-0 h-0 opacity-0 absolute"
              />
            </label>
          </div>
        </SuperField>

        {error && (
          <div className="flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-[12.5px] text-[#e8a9be] bg-[rgba(193,77,119,0.12)] border border-[rgba(193,77,119,0.28)]">
            <MaterialIcon name="error" size={17} /> <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            onClick={() => void cancel()}
            disabled={busy}
            className="h-10 px-4 rounded-xl text-[13px] font-bold text-[#b9aec6] bg-[rgba(255,255,255,0.04)] border border-[rgba(176,148,210,0.14)] hover:bg-[rgba(255,255,255,0.08)] disabled:opacity-50"
          >
            Cancelar
          </button>
          <RingButton
            radius={12}
            disabled={busy || !dirty}
            onClick={() => void save()}
            wrapStyle={{ opacity: busy || !dirty ? 0.45 : 1 }}
            className="h-10 px-5 text-[13px] font-bold text-[#f4eefa] flex items-center gap-1.5"
            style={{
              background: brandGradient(color, 140),
              boxShadow: brandShadow(color),
              cursor: busy || !dirty ? 'not-allowed' : 'pointer',
            }}
          >
            <MaterialIcon name="save" size={18} /> {saving ? 'Salvando…' : 'Salvar'}
          </RingButton>
        </div>
      </div>
    </SuperModal>
  )
}
