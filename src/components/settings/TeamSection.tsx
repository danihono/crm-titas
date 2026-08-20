import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useTenantStore } from '../../store/tenantStore'
import { useMembers, usePendingInvites } from '../../hooks/useTeam'
import { cancelInvite, inviteMember, setMemberActive, updateMemberRole } from '../../lib/team'
import { sx, C } from '../../styles/sx'
import MaterialIcon from '../common/MaterialIcon'
import { EmptyLine, Field, IconAction, PrimaryButton, Row, SettingsCard } from './primitives'
import type { MemberRole } from '../../types'

const ROLE_LABEL: Record<MemberRole, string> = {
  dono: 'Dono',
  gestor: 'Gestor',
  atendente: 'Atendente',
}

const ROLE_HINT: Record<MemberRole, string> = {
  dono: 'Acesso total, inclusive faturamento e configurações.',
  gestor: 'Administra equipe, setores e etiquetas; atende conversas.',
  atendente: 'Atende conversas e cuida de contatos, negócios e atividades.',
}

export default function TeamSection({ canEdit }: { canEdit: boolean }) {
  const { user } = useAuth()
  const tenantUid = useTenantStore((s) => s.tenantUid) ?? user?.uid ?? null
  const tenantName = useTenantStore((s) => s.client)?.name ?? user?.displayName ?? 'Titãs CRM'
  const { docs: members } = useMembers()
  // A listagem de convites pendentes só é permitida a quem é o DONO da conta: a regra
  // do Firestore precisa casar com o where('tenantUid'), e um teste de papel por get()
  // não é comparável a um filtro de consulta (ver o bloco `invites` em firestore.rules).
  const isOwnAccount = !useTenantStore.getState().tenantUid
  const invites = usePendingInvites(isOwnAccount ? tenantUid : null)

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
      setError(err instanceof Error ? err.message : 'Não foi possível enviar o convite.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <SettingsCard
        title="Atendentes"
        subtitle="Quem tem acesso a este CRM e o que cada um pode fazer."
      >
        {members.length === 0 && <EmptyLine>Nenhum atendente ainda.</EmptyLine>}
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
                      <option value="gestor">Gestor</option>
                      <option value="atendente">Atendente</option>
                    </select>
                    <IconAction
                      icon={m.active ? 'toggle_on' : 'toggle_off'}
                      title={m.active ? 'Desativar acesso' : 'Reativar acesso'}
                      color={m.active ? C.green : C.faint}
                      onClick={() => setMemberActive(m.id, !m.active)}
                    />
                  </>
                ) : (
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.purple }}>{ROLE_LABEL[m.role]}</span>
                )
              }
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>{m.name}</span>
                {!m.active && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.rose, background: 'rgba(217,138,171,0.16)', borderRadius: 20, padding: '2px 9px' }}>
                    inativo
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
          title="Convidar atendente"
          subtitle="Ele entra na equipe assim que criar a conta (ou fizer login) com este e-mail."
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr auto', gap: 12, alignItems: 'end' }}>
            <Field label="E-mail">
              <input
                type="email"
                value={email}
                placeholder="atendente@empresa.com"
                onChange={(e) => setEmail(e.target.value)}
                style={sx.input}
              />
            </Field>
            <Field label="Papel">
              <select value={role} onChange={(e) => setRole(e.target.value as MemberRole)} style={sx.input}>
                <option value="atendente">Atendente</option>
                <option value="gestor">Gestor</option>
              </select>
            </Field>
            <PrimaryButton icon="person_add" onClick={submitInvite} disabled={busy || !email.trim()}>
              Convidar
            </PrimaryButton>
          </div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 10 }}>{ROLE_HINT[role]}</div>
          {error && <div style={{ fontSize: 12.5, color: C.rose, marginTop: 8 }}>{error}</div>}

          {invites.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ ...sx.label, marginBottom: 6 }}>Convites aguardando aceite</div>
              {invites.map((i) => (
                <Row
                  key={i.id}
                  actions={<IconAction icon="close" title="Cancelar convite" onClick={() => cancelInvite(i.email)} />}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.ink }}>
                    <MaterialIcon name="mail" size={16} color={C.muted} />
                    {i.email}
                    <span style={{ fontSize: 11.5, color: C.sub }}>· {ROLE_LABEL[i.role]}</span>
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
