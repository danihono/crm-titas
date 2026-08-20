import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../contexts/AuthContext'
import { useTenantStore } from '../../store/tenantStore'
import { saveOrgName } from '../../hooks/useSettings'
import { useWhatsappStatus } from '../../hooks/useWhatsappStatus'
import { useDaemonOnline } from '../../hooks/useDaemonOnline'
import { sx, C } from '../../styles/sx'
import MaterialIcon from '../common/MaterialIcon'
import { Field, PrimaryButton, SettingsCard } from './primitives'

const CONN_LABEL: Record<string, [string, string]> = {
  connected: ['Conectado', C.green],
  connecting: ['Conectando', C.amber],
  qr: ['Aguardando leitura do QR', C.amber],
  loggedOut: ['Desconectado do celular', C.rose],
  disconnected: ['Desconectado', C.faint],
}

export default function OrgSection({ canEdit }: { canEdit: boolean }) {
  const { user } = useAuth()
  const tenantUid = useTenantStore((s) => s.tenantUid) ?? user?.uid ?? null
  const wa = useWhatsappStatus()
  const waOnline = useDaemonOnline()
  const [orgName, setOrgName] = useState('')
  const [loaded, setLoaded] = useState('')

  useEffect(() => {
    if (!tenantUid) return
    return onSnapshot(doc(db, 'users', tenantUid), (snap) => {
      const v = (snap.data()?.orgName ?? '') as string
      setLoaded(v)
      setOrgName((current) => (current === '' ? v : current))
    })
  }, [tenantUid])

  const [label, color] = CONN_LABEL[wa.status] ?? CONN_LABEL.disconnected

  return (
    <>
      <SettingsCard title="Dados cadastrais" subtitle="Como sua operação aparece para a equipe e nos convites.">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 14, alignItems: 'end' }}>
          <Field label="Nome da organização">
            <input
              value={orgName}
              disabled={!canEdit}
              placeholder="Titãs Consultoria"
              onChange={(e) => setOrgName(e.target.value)}
              style={sx.input}
            />
          </Field>
          {canEdit && (
            <PrimaryButton icon="save" onClick={() => saveOrgName(orgName.trim())} disabled={orgName.trim() === loaded}>
              Salvar
            </PrimaryButton>
          )}
        </div>
        <div style={{ fontSize: 12.5, color: C.sub, marginTop: 14 }}>
          Conta responsável: <b style={{ color: C.ink }}>{user?.email}</b>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Canais de atendimento"
        subtitle="Por onde as conversas chegam. Hoje o Titãs fala WhatsApp pelo daemon próprio."
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '6px 2px' }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(52,199,89,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <MaterialIcon name="chat" size={21} color="#34c759" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>WhatsApp</div>
            <div style={{ fontSize: 12.5, color }}>
              {label}
              {wa.phoneNumber && ` · ${wa.phoneNumber}`}
            </div>
          </div>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: waOnline ? C.green : C.faint }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: waOnline ? C.green : C.faint }} />
            {waOnline ? 'daemon no ar' : 'daemon offline'}
          </span>
        </div>
        <div style={{ fontSize: 12.5, color: C.sub, marginTop: 12 }}>
          A conexão é feita na tela de Contatos, pelo botão de WhatsApp — é lá que o QR aparece.
        </div>
      </SettingsCard>
    </>
  )
}
