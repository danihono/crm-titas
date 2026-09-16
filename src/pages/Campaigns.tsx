import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { canManage, useTenantStore } from '../store/tenantStore'
import { useContacts } from '../hooks/useContacts'
import { useTags } from '../hooks/useSettings'
import {
  audienceFor, createCampaign, deleteCampaign, estimateHours, pauseCampaign,
  startCampaign, useCampaigns, RATE_DEFAULT, RATE_MAX, RATE_MIN,
} from '../hooks/useCampaigns'
import { useDaemonOnline } from '../hooks/useDaemonOnline'
import { useWhatsappStatus } from '../hooks/useWhatsappStatus'
import { sx, C } from '../styles/sx'
import MaterialIcon from '../components/common/MaterialIcon'
import RingButton from '../components/common/RingButton'
import Modal from '../components/modals/Modal'
import type { Campaign, CampaignStatus } from '../types'
import { chipColors } from '../lib/color'
import { useIsDark } from '../store/themeStore'
import { t, type Chave } from '../i18n'
import { num1 } from '../i18n/formato'

const STATUS_STYLE: Record<CampaignStatus, [Chave, string, string]> = {
  rascunho: ['campanhas.rascunho', C.sub, '#eeebf3'],
  enviando: ['campanhas.enviando', '#1f8a4c', 'rgba(52,199,89,0.14)'],
  pausada: ['campanhas.pausada', '#8a5f12', 'rgba(216,169,96,0.18)'],
  concluida: ['campanhas.concluida', C.blue, 'rgba(111,155,207,0.16)'],
}

function fmtHours(h: number): string {
  if (h < 1) return t('campanhas.min', { n: Math.max(1, Math.round(h * 60)) })
  if (h < 24) return t('campanhas.horas', { n: num1(h) })
  return t('campanhas.dias', { n: num1(h / 24) })
}

export default function Campaigns() {
  const { user } = useAuth()
  const readOnly = useTenantStore((s) => s.readOnly)
  const role = useTenantStore((s) => s.role)
  const canEdit = canManage(role, readOnly)
  const { docs: campaigns } = useCampaigns()
  const { docs: contacts } = useContacts()
  const { docs: tags } = useTags()
  const wa = useWhatsappStatus()
  const waOnline = useDaemonOnline()
  const [creating, setCreating] = useState(false)

  return (
    <div style={{ padding: '28px 30px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, marginBottom: 20 }}>
        <div>
          <h1 style={{ ...sx.serif, fontSize: 33, color: C.ink, margin: 0 }}>{t('campanhas.titulo')}</h1>
          <div style={{ fontSize: 13, color: C.sub, marginTop: 4, maxWidth: 620, lineHeight: 1.6 }}>
            {t('campanhas.subtitulo')}
          </div>
        </div>
        {canEdit && (
          <RingButton radius={11} onClick={() => setCreating(true)} style={sx.btnPrimary}>
            <MaterialIcon name="campaign" size={18} /> {t('campanhas.nova')}
          </RingButton>
        )}
      </div>

      <div style={{ display: 'flex', gap: 11, background: 'rgba(216,169,96,0.14)', border: '1px solid rgba(216,169,96,0.34)', borderRadius: 14, padding: '14px 16px', marginBottom: 20 }}>
        <MaterialIcon name="warning" size={20} color={C.amber} />
        <div style={{ fontSize: 12.5, color: C.amberDeep, lineHeight: 1.65 }}>
          <b>{t('campanhas.sobreRitmo')}</b> {t('campanhas.avisoRitmo')}
        </div>
      </div>

      {!waOnline && (
        <Note icon="cloud_off">
          O daemon de WhatsApp está fora do ar — campanhas em andamento ficam paradas até ele voltar.
        </Note>
      )}
      {wa.status !== 'connected' && (
        <Note icon="link_off">
          O WhatsApp não está conectado. Conecte pela tela de Contatos antes de iniciar um disparo.
        </Note>
      )}

      <div style={{ display: 'grid', gap: 14 }}>
        {campaigns.map((c) => (
          <CampaignCard key={c.id} campaign={c} canEdit={canEdit} />
        ))}
        {campaigns.length === 0 && (
          <div style={{ ...sx.card, padding: 40, textAlign: 'center', color: C.faint, fontSize: 13 }}>
            Nenhuma campanha criada ainda.
          </div>
        )}
      </div>

      {creating && (
        <NewCampaignModal
          contacts={contacts}
          tags={tags}
          createdBy={user?.displayName || user?.email || ''}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  )
}

function Note({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: C.tintRose, border: `1px solid ${C.rose}55`, borderRadius: 12, padding: '11px 14px', marginBottom: 14, fontSize: 12.5, color: C.roseDeep, fontWeight: 600 }}>
      <MaterialIcon name={icon} size={18} color={C.rose} /> {children}
    </div>
  )
}

function CampaignCard({ campaign: c, canEdit }: { campaign: Campaign; canEdit: boolean }) {
  const [chaveStatus, color, bg] = STATUS_STYLE[c.status]
  const label = t(chaveStatus)
  const done = c.sent + c.failed + c.skipped
  const pct = c.total > 0 ? Math.round((done / c.total) * 100) : 0
  const remaining = Math.max(0, c.total - done)

  return (
    <div style={{ ...sx.card, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 15.5, fontWeight: 700, color: C.ink }}>{c.name}</span>
            <span style={{ fontSize: 11.5, fontWeight: 800, color, background: bg, borderRadius: 999, padding: '3px 11px' }}>{label}</span>
          </div>
          <div style={{ fontSize: 12.5, color: C.sub, marginTop: 6, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{c.text}</div>
        </div>
        {canEdit && (
          <div style={{ display: 'flex', gap: 7, flexShrink: 0 }}>
            {(c.status === 'rascunho' || c.status === 'pausada') && c.total > done && (
              <button onClick={() => startCampaign(c.id)} style={btn('#1f8a4c', 'rgba(52,199,89,0.14)')}>
                <MaterialIcon name="play_arrow" size={17} /> {t(c.status === 'pausada' ? 'campanhas.retomar' : 'campanhas.iniciar')}
              </button>
            )}
            {c.status === 'enviando' && (
              <button onClick={() => pauseCampaign(c.id)} style={btn('#8a5f12', 'rgba(216,169,96,0.18)')}>
                <MaterialIcon name="pause" size={17} /> {t('campanhas.pausar')}
              </button>
            )}
            {c.status !== 'enviando' && (
              <button onClick={() => deleteCampaign(c.id)} style={btn('#b73d6d', 'rgba(217,138,171,0.16)')}>
                <MaterialIcon name="delete" size={17} />
              </button>
            )}
          </div>
        )}
      </div>

      <div style={{ height: 7, borderRadius: 999, background: C.raised, marginTop: 16, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#7a52a0,#b692d6)', transition: 'width .3s ease' }} />
      </div>

      <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', marginTop: 12, fontSize: 12.5, color: C.sub }}>
        <Stat label={t('campanhas.publico')} value={String(c.total)} />
        <Stat label={t('campanhas.enviadas')} value={String(c.sent)} color={C.green} />
        {c.failed > 0 && <Stat label={t('campanhas.falhas')} value={String(c.failed)} color={C.rose} />}
        {c.skipped > 0 && <Stat label={t('campanhas.puladas')} value={String(c.skipped)} color={C.amber} />}
        <Stat label={t('campanhas.ritmo')} value={t('campanhas.porHora', { n: c.ratePerHour })} />
        {remaining > 0 && <Stat label={t('campanhas.faltam')} value={t('campanhas.faltamValor', { n: remaining, tempo: fmtHours(estimateHours(remaining, c.ratePerHour)) })} />}
      </div>

      {c.lastError && (
        <div style={{ fontSize: 12, color: C.rose, marginTop: 10 }}>{t('campanhas.ultimoErro')} {c.lastError}</div>
      )}
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <span>
      <b style={{ color: color ?? C.ink, fontWeight: 700 }}>{value}</b>
      <span style={{ marginLeft: 5 }}>{label}</span>
    </span>
  )
}

function btn(color: string, bg: string): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 5, border: 'none', borderRadius: 10,
    padding: '8px 12px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', color, background: bg,
  }
}

function NewCampaignModal({ contacts, tags, createdBy, onClose }: {
  contacts: ReturnType<typeof useContacts>['docs']
  tags: ReturnType<typeof useTags>['docs']
  createdBy: string
  onClose: () => void
}) {
  const dark = useIsDark()
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const [tagIds, setTagIds] = useState<string[]>([])
  const [rate, setRate] = useState(RATE_DEFAULT)
  const [respectHours, setRespectHours] = useState(true)
  const [saving, setSaving] = useState(false)

  const audience = audienceFor(contacts, tagIds)
  const optOuts = contacts.filter((c) => c.optOut).length
  const valid = !!name.trim() && !!text.trim() && audience.length > 0

  async function save() {
    if (!valid || saving) return
    setSaving(true)
    try {
      await createCampaign({ name, text, tagIds, ratePerHour: rate, respectBusinessHours: respectHours }, audience, createdBy)
      onClose()
    } catch (err) {
      alert(err instanceof Error ? err.message : t('campanhas.falhaCriar'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal onClose={onClose} width={560}>
      <div style={{ fontSize: 18, fontWeight: 700, color: C.ink, marginBottom: 16 }}>{t('campanhas.nova')}</div>
      <div style={{ display: 'grid', gap: 14, maxHeight: '70vh', overflowY: 'auto' }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={sx.label}>{t('campanhas.nome')}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('campanhas.nomeExemplo')} style={sx.input} />
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <span style={sx.label}>{t('campanhas.mensagem')}</span>
          <textarea
            value={text}
            rows={4}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('campanhas.mensagemExemplo')}
            style={{ ...sx.input, resize: 'vertical', fontFamily: 'inherit' }}
          />
          <span style={{ fontSize: 11.5, color: C.faint }}>
            {t('campanhas.variaveisDica')}
          </span>
        </label>

        <div style={{ display: 'grid', gap: 6 }}>
          <span style={sx.label}>{t('campanhas.publicoEtiquetas')}</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {tags.map((t) => {
              const on = tagIds.includes(t.id)
              return (
                <button
                  key={t.id}
                  onClick={() => setTagIds((v) => (on ? v.filter((x) => x !== t.id) : [...v, t.id]))}
                  style={{
                    fontSize: 12, fontWeight: 700, borderRadius: 999, padding: '5px 12px', cursor: 'pointer',
                    color: on ? '#fff' : chipColors(t.color, dark).fg,
                    background: on ? t.color : chipColors(t.color, dark).bg,
                    border: `1px solid ${chipColors(t.color, dark).border}`,
                  }}
                >
                  {t.label}
                </button>
              )
            })}
            {tags.length === 0 && (
              <span style={{ fontSize: 12.5, color: C.faint }}>
                Nenhuma etiqueta criada — a campanha vai para toda a base.
              </span>
            )}
          </div>
        </div>

        <label style={{ display: 'grid', gap: 6 }}>
          <span style={sx.label}>Ritmo: {rate} mensagens por hora</span>
          <input
            type="range"
            min={RATE_MIN}
            max={RATE_MAX}
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
            style={{ accentColor: C.purple }}
          />
          <span style={{ fontSize: 11.5, color: C.faint }}>
            Quanto mais devagar, menor o risco. O daemon ainda aplica cota diária e aquecimento.
          </span>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={respectHours}
            onChange={(e) => setRespectHours(e.target.checked)}
            style={{ accentColor: C.purple, width: 16, height: 16 }}
          />
          <span style={{ fontSize: 13, color: C.ink }}>{t('campanhas.soNoHorario')}</span>
        </label>

        <div style={{ background: C.field, border: '1px solid ' + C.fieldBorder, borderRadius: 12, padding: '13px 15px', fontSize: 12.5, color: C.sub, lineHeight: 1.6 }}>
          <b style={{ color: C.ink }}>{audience.length}</b> {t('campanhas.vaoReceber')}
          {optOuts > 0 && <> · <b style={{ color: C.ink }}>{optOuts}</b> {t('campanhas.excluidosOptOut')}</>}
          <br />
          {t('campanhas.tempoEstimado')} <b style={{ color: C.ink }}>{fmtHours(estimateHours(audience.length, rate))}</b>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
          <button onClick={onClose} style={sx.btnGhost}>{t('comum.cancelar')}</button>
          <RingButton
            radius={11}
            onClick={save}
            disabled={!valid || saving}
            style={{ ...sx.btnPrimary, opacity: valid && !saving ? 1 : 0.5 }}
          >
            <MaterialIcon name="save" size={18} /> Criar rascunho
          </RingButton>
        </div>
      </div>
    </Modal>
  )
}
