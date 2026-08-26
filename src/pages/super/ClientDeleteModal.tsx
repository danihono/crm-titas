import { useState } from 'react'
import { FirebaseError } from 'firebase/app'
import SuperModal, { SuperField, superInputClass } from './SuperModal'
import MaterialIcon from '../../components/common/MaterialIcon'
import { clientDeleteErrorHint, deleteClientAccount, type Client } from '../../hooks/useClients'

const APAGA = ['Contatos, conversas e mensagens', 'Negócios, atividades e faturas', 'Arquivos e mídias no Storage', 'A conta de acesso e os convites da equipe']

/**
 * Exclusão definitiva. A confirmação por digitação do nome é de propósito: um clique
 * distraído aqui apaga o tenant inteiro, e não há desfazer.
 */
export default function ClientDeleteModal({ client, onClose, onDeleted }: {
  client: Client
  onClose: () => void
  onDeleted: () => void
}) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const confirmed = typed.trim().toLowerCase() === client.displayName.trim().toLowerCase()

  async function run() {
    if (!confirmed || busy) return
    setBusy(true)
    setError('')
    try {
      await deleteClientAccount(client.uid)
      onDeleted()
    } catch (err) {
      console.error('[ClientDeleteModal]', err)
      const code = err instanceof FirebaseError ? err.code : ''
      const msg = err instanceof Error ? err.message : ''
      setError(clientDeleteErrorHint(code, msg))
      setBusy(false)
    }
  }

  return (
    <SuperModal
      title={`Excluir ${client.displayName}?`}
      subtitle="Esta ação é irreversível e apaga tudo o que pertence a este cliente."
      icon="warning"
      onClose={() => !busy && onClose()}
    >
      <div className="flex flex-col gap-5">
        <ul className="flex flex-col gap-2 rounded-xl px-4 py-3.5 bg-[rgba(193,77,119,0.10)] border border-[rgba(193,77,119,0.25)]">
          {APAGA.map((t) => (
            <li key={t} className="flex items-center gap-2 text-[12.5px] text-[#e8bccb]">
              <MaterialIcon name="delete_forever" size={16} color="#d98aa8" /> {t}
            </li>
          ))}
        </ul>

        <SuperField label="Digite o nome do cliente para confirmar" hint={client.email || undefined}>
          <input
            value={typed}
            autoFocus
            disabled={busy}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={client.displayName}
            className={superInputClass}
          />
        </SuperField>

        {error && (
          <div className="flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-[12.5px] text-[#e8a9be] bg-[rgba(193,77,119,0.12)] border border-[rgba(193,77,119,0.28)]">
            <MaterialIcon name="error" size={17} /> <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="h-10 px-4 rounded-xl text-[13px] font-bold text-[#b9aec6] bg-[rgba(255,255,255,0.04)] border border-[rgba(176,148,210,0.14)] hover:bg-[rgba(255,255,255,0.08)] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={() => void run()}
            disabled={!confirmed || busy}
            className="h-10 px-5 rounded-xl text-[13px] font-bold text-[#fff] flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(140deg,#c14d77,#8d2f52)', boxShadow: '0 8px 20px rgba(150,45,85,0.35)' }}
          >
            <MaterialIcon name="delete_forever" size={18} /> {busy ? 'Excluindo…' : 'Excluir definitivamente'}
          </button>
        </div>
      </div>
    </SuperModal>
  )
}
