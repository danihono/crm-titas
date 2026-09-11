import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useTenantStore } from '../../store/tenantStore'
import { useMembers, usePendingInvites } from '../../hooks/useTeam'
import { cancelInvite, inviteMember, setMemberActive, updateMemberRole } from '../../lib/team'
import { sx, C } from '../../styles/sx'
import { t, type Chave } from '../../i18n'
import MaterialIcon from '../common/MaterialIcon'
import { EmptyLine, Field, IconAction, PrimaryButton, Row, SettingsCard } from './primitives'
import type { MemberRole } from '../../types'

// O papel é um código ('dono'/'gestor'/'atendente') gravado no doc do membro;
// aqui só se decide como ele é escrito na tela.
const ROLE_LABEL: Record<MemberRole, Chave> = {
  dono: 'equipe.dono',
  gestor: 'equipe.gestor',
  atendente: 'equipe.atendente',
}

const ROLE_HINT: Record<MemberRole, Chave> = {
  dono: 'equipe.donoDica',
  gestor: 'equipe.gestorDica',
  atendente: 'equipe.atendenteDica',
}

export default function TeamSection({ canEdit }: { canEdit: boolean }) {
  const { user } = useAuth()
  const tenantUid = useTenantStore((s) => s.tenantUid) ?? user?.uid ?? null
  const tenantName = useTenantStore((s) => s.client)?.name ?? user?.displayName ?? 'Titãs CRM'
  const { docs: members } = useMembers()
  // A listagem de convites pendentes só é permitida a quem é o DONO da conta: a regra
  // do Firestore precisa casar com o where('tenantUid'), e um teste de papel por get()
  // não é comparável a um filtro de consulta (ver o bloco `invites` em firestore.rules).
  // Lido pelo seletor do store (e não por getState), senão trocar de equipe não
  // re-renderiza esta seção.
  const activeTenant = useTenantStore((s) => s.tenantUid)
  const invites = usePendingInvites(activeTenant ? null : tenantUid)

  const [email, setEmail] = useState('')
  const [role, setRole] = useState<MemberRole>('atendente')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submitInvite() {
    if (!tenantUid) return
    setBusy(true)
    setError('')
    try {
      await inviteMember(tenantUid, tenantName, email, role)
      setEmail('')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('equipe.falhaConvite'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <SettingsCard
        title={t('equipe.titulo')}
        subtitle={t('equipe.subtitulo')}
      >
        {members.length === 0 && <EmptyLine>{t('equipe.vazio')}</EmptyLine>}
        {members.map((m) => {
          // O dono não pode se rebaixar: viraria um tenant sem ninguém para administrá-lo.
          const isSelfOwner = m.id === tenantUid
          return (
            <Row
              key={m.id}
              actions={
                canEdit && !isSelfOwner ? (
                  <>
                    <select
                      value={m.role}
                      onChange={(e) => updateMemberRole(m.id, e.target.value as MemberRole)}
                      style={{ ...sx.input, width: 'auto', padding: '7px 10px', fontSize: 12.5 }}
                    >
                      <option value="gestor">{t('equipe.gestor')}</option>
                      <option value="atendente">{t('equipe.atendente')}</option>
                    </select>
                    <IconAction
                      icon={m.active ? 'toggle_on' : 'toggle_off'}
                      title={t(m.active ? 'equipe.desativar' : 'equipe.reativar')}
                      color={m.active ? C.green : C.faint}
                      onClick={() => setMemberActive(m.id, !m.active)}
                    />
                  </>
                ) : (
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.purple }}>{t(ROLE_LABEL[m.role])}</span>
                )
              }
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>{m.name}</span>
                {!m.active && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.rose, background: C.tintRose, borderRadius: 20, padding: '2px 9px' }}>
                    {t('equipe.inativo')}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: C.sub }}>{m.email}</div>
            </Row>
          )
        })}
      </SettingsCard>

      {canEdit && (
        <SettingsCard
          title={t('equipe.convidar')}
          subtitle={t('equipe.convidarDica')}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr auto', gap: 12, alignItems: 'end' }}>
            <Field label={t('comum.email')}>
              <input
                type="email"
                value={email}
                placeholder={t('equipe.emailExemplo')}
                onChange={(e) => setEmail(e.target.value)}
                style={sx.input}
              />
            </Field>
            <Field label={t('equipe.papel')}>
              <select value={role} onChange={(e) => setRole(e.target.value as MemberRole)} style={sx.input}>
                <option value="atendente">{t('equipe.atendente')}</option>
                <option value="gestor">{t('equipe.gestor')}</option>
              </select>
            </Field>
            <PrimaryButton icon="person_add" onClick={submitInvite} disabled={busy || !email.trim()}>
              {t('equipe.convidarBotao')}
            </PrimaryButton>
          </div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 10 }}>{t(ROLE_HINT[role])}</div>
          {error && <div style={{ fontSize: 12.5, color: C.rose, marginTop: 8 }}>{error}</div>}

          {invites.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ ...sx.label, marginBottom: 6 }}>{t('equipe.convitesPendentes')}</div>
              {invites.map((i) => (
                <Row
                  key={i.id}
                  actions={<IconAction icon="close" title={t('equipe.cancelarConvite')} onClick={() => cancelInvite(i.email)} />}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.ink }}>
                    <MaterialIcon name="mail" size={16} color={C.muted} />
                    {i.email}
                    <span style={{ fontSize: 11.5, color: C.sub }}>· {t(ROLE_LABEL[i.role])}</span>
                  </div>
                </Row>
              ))}
            </div>
          )}
        </SettingsCard>
      )}
    </>
  )
}
