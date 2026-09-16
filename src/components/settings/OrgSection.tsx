import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../contexts/AuthContext'
import { useTenantStore } from '../../store/tenantStore'
import { saveOrgName } from '../../hooks/useSettings'
import { useWhatsappStatus } from '../../hooks/useWhatsappStatus'
import { useDaemonOnline } from '../../hooks/useDaemonOnline'
import { sx, C } from '../../styles/sx'
import { t, type Chave } from '../../i18n'
import MaterialIcon from '../common/MaterialIcon'
import { Field, PrimaryButton, SettingsCard } from './primitives'

// A chave é o status cru que o daemon publica; a tupla diz como ele é escrito
// e com que cor.
const CONN_LABEL: Record<string, [Chave, string]> = {
  connected: ['org.conectado', C.green],
  connecting: ['org.conectando', C.amber],
  qr: ['org.aguardandoQR', C.amber],
  loggedOut: ['org.desconectadoCelular', C.rose],
  disconnected: ['org.desconectado', C.faint],
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

  const [chaveConexao, color] = CONN_LABEL[wa.status] ?? CONN_LABEL.disconnected

  return (
    <>
      <SettingsCard title={t('org.dadosTitulo')} subtitle={t('org.dadosSub')}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 14, alignItems: 'end' }}>
          <Field label={t('org.nomeOrg')}>
            <input
              value={orgName}
              disabled={!canEdit}
              placeholder={t('org.nomeExemplo')}
              onChange={(e) => setOrgName(e.target.value)}
              style={sx.input}
            />
          </Field>
          {canEdit && (
            <PrimaryButton icon="save" onClick={() => saveOrgName(orgName.trim())} disabled={orgName.trim() === loaded}>
              {t('comum.salvar')}
            </PrimaryButton>
          )}
        </div>
        <div style={{ fontSize: 12.5, color: C.sub, marginTop: 14 }}>
          {t('org.contaResponsavel')} <b style={{ color: C.ink }}>{user?.email}</b>
        </div>
      </SettingsCard>

      <SettingsCard
        title={t('org.canaisTitulo')}
        subtitle={t('org.canaisSub')}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '6px 2px' }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(52,199,89,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <MaterialIcon name="chat" size={21} color="#34c759" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>WhatsApp</div>
            <div style={{ fontSize: 12.5, color }}>
              {t(chaveConexao)}
              {wa.phoneNumber && ` · ${wa.phoneNumber}`}
            </div>
          </div>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: waOnline ? C.green : C.faint }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: waOnline ? C.green : C.faint }} />
            {t(waOnline ? 'org.daemonNoAr' : 'org.daemonOffline')}
          </span>
        </div>
        <div style={{ fontSize: 12.5, color: C.sub, marginTop: 12 }}>
          {t('org.conexaoOnde')}
        </div>
      </SettingsCard>
    </>
  )
}
