import { useEffect, useState, type ReactNode } from 'react'
import {
  desconectarIntegracao, gerarChaveWebhook, salvarIntegracao, sincronizarAnunciosAgora,
  snippetSite, testarGoogle, testarMeta, urlWebhook, urlWebhookSemChave, useIntegrations,
  type DescobertaMeta,
} from '../../hooks/useIntegrations'
import { LEADS_COLUMNS } from '../../hooks/useDeals'
import { tituloEtapaLeads } from '../../i18n/sistema'
import { relativeLabel } from '../../lib/format'
import { num } from '../../i18n/formato'
import { sx, C } from '../../styles/sx'
import { t, type Chave } from '../../i18n'
import MaterialIcon from '../common/MaterialIcon'
import { Field, PrimaryButton, SettingsCard } from './primitives'
import type { ConversionStage, Integrations } from '../../types'

/**
 * Configurações → Integrações: Meta Ads, Google Ads, formulários do site e conversões de
 * volta. Tudo é salvo pelas callables (functions/src/anuncios/callables.ts) — os tokens
 * vão direto para o cofre cifrado e NUNCA voltam para a tela: o que a tela recebe é só o
 * final ("…a1b2"), para a pessoa saber qual está salvo.
 */

/** Ação assíncrona com estado de "ocupado" e mensagem de erro/sucesso. */
function useAcao() {
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  async function rodar(fn: () => Promise<string | void>) {
    setOcupado(true)
    setAviso(null)
    try {
      const msg = await fn()
      if (msg) setAviso({ ok: true, texto: msg })
    } catch (e) {
      setAviso({ ok: false, texto: (e as Error).message || t('integ.falhou') })
    } finally {
      setOcupado(false)
    }
  }
  return { ocupado, aviso, rodar }
}

function Aviso({ aviso }: { aviso: { ok: boolean; texto: string } | null }) {
  if (!aviso) return null
  return (
    <div style={{ marginTop: 12, fontSize: 12.5, fontWeight: 600, color: aviso.ok ? C.green : C.rose, whiteSpace: 'pre-wrap' }}>
      {aviso.texto}
    </div>
  )
}

function Status({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: on ? C.green : C.faint }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: on ? C.green : C.faint }} />
      {children}
    </span>
  )
}

function Linha({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 12.5, color: C.sub, marginTop: 6, lineHeight: 1.6 }}>{children}</div>
}

function Erro({ texto }: { texto?: string }) {
  if (!texto) return null
  return <Linha><span style={{ color: C.rose, fontWeight: 600 }}>{t('integ.ultimoErro')}</span> {texto}</Linha>
}

function quando(d?: Date): string {
  return d ? relativeLabel(d) : t('integ.nunca')
}

function Copiavel({ valor, multilinha }: { valor: string; multilinha?: boolean }) {
  const [copiado, setCopiado] = useState(false)
  async function copiar() {
    try {
      await navigator.clipboard.writeText(valor)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1500)
    } catch {
      // Sem permissão de área de transferência: o campo continua selecionável à mão.
    }
  }
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: multilinha ? 'flex-start' : 'center' }}>
      {multilinha
        ? <textarea readOnly value={valor} rows={8} style={{ ...sx.input, fontFamily: 'var(--font-mono)', fontSize: 11.5, resize: 'vertical' }} onFocus={(e) => e.target.select()} />
        : <input readOnly value={valor} style={{ ...sx.input, fontFamily: 'var(--font-mono)', fontSize: 12 }} onFocus={(e) => e.target.select()} />}
      <button type="button" onClick={copiar} style={{ ...sx.btnGhost, flexShrink: 0 }}>
        <MaterialIcon name={copiado ? 'check' : 'content_copy'} size={16} /> {t(copiado ? 'integ.copiado' : 'integ.copiar')}
      </button>
    </div>
  )
}

function placeholderSegredo(fim?: string): string {
  return fim ? t('integ.tokenSalvo', { fim }) : ''
}

const grid2 = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 } as const

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

function MetaCard({ cfg, canEdit }: { cfg: Integrations['meta']; canEdit: boolean }) {
  const [token, setToken] = useState('')
  const [desc, setDesc] = useState<DescobertaMeta | null>(null)
  const [adAccountId, setAdAccountId] = useState(cfg.adAccountId ?? '')
  const [pageId, setPageId] = useState(cfg.pageId ?? '')
  const [pixelId, setPixelId] = useState(cfg.pixelId ?? '')
  const [importarLeads, setImportarLeads] = useState(cfg.importarLeads !== false)
  const acao = useAcao()

  useEffect(() => {
    setAdAccountId(cfg.adAccountId ?? '')
    setPageId(cfg.pageId ?? '')
    setPixelId(cfg.pixelId ?? '')
    setImportarLeads(cfg.importarLeads !== false)
  }, [cfg.adAccountId, cfg.pageId, cfg.pixelId, cfg.importarLeads])

  /** Opções da lista: o que o teste trouxe, mais o já salvo (para não sumir da tela). */
  function opcoes(lista: { id: string; name: string }[] | undefined, atualId?: string, atualNome?: string) {
    const out = [...(lista ?? [])]
    if (atualId && !out.some((o) => o.id === atualId)) out.unshift({ id: atualId, name: atualNome || atualId })
    return out
  }
  const contas = opcoes(desc?.adAccounts, cfg.adAccountId, cfg.adAccountName)
  const paginas = opcoes(desc?.pages, cfg.pageId, cfg.pageName)
  const pixels = opcoes(desc?.pixels, cfg.pixelId, cfg.pixelName)
  const nomeDe = (l: { id: string; name: string }[], id: string) => l.find((o) => o.id === id)?.name ?? ''

  const testar = () => acao.rodar(async () => {
    const r = await testarMeta(token, adAccountId || undefined)
    setDesc(r)
    if (!adAccountId && r.adAccounts[0]) setAdAccountId(r.adAccounts[0].id)
    if (!pageId && r.pages[0]) setPageId(r.pages[0].id)
    if (!pixelId && r.pixels[0]) setPixelId(r.pixels[0].id)
    return t('integ.metaTesteOk', { usuario: r.usuario, contas: r.adAccounts.length, paginas: r.pages.length })
  })

  const salvar = () => acao.rodar(async () => {
    await salvarIntegracao('meta', {
      adAccountId, adAccountName: nomeDe(contas, adAccountId),
      pageId, pageName: nomeDe(paginas, pageId),
      pixelId, pixelName: nomeDe(pixels, pixelId),
      importarLeads,
    }, { token })
    setToken('')
    return t('integ.salvo')
  })

  return (
    <SettingsCard
      title={t('integ.metaTitulo')}
      subtitle={t('integ.metaSub')}
      action={<Status on={!!cfg.conectado}>{t(cfg.conectado ? 'integ.conectado' : 'integ.desconectado')}</Status>}
    >
      {cfg.conectado && (
        <div style={{ marginBottom: 14 }}>
          <Linha>{t('integ.metaResumo', { conta: cfg.adAccountName || cfg.adAccountId || '—', pagina: cfg.pageName || cfg.pageId || '—' })}</Linha>
          <Linha>{t('integ.ultimaSync', { quando: quando(cfg.lastSyncAt) })} · {t('integ.ultimosLeads', { quando: quando(cfg.lastLeadsSyncAt) })} · {t('integ.leadsRecebidos', { n: num(cfg.totalLeads ?? 0) })}</Linha>
          <Erro texto={cfg.lastError} />
          <Erro texto={cfg.leadsError} />
        </div>
      )}
      {canEdit && (
        <>
          <Field label={t('integ.metaToken')}>
            <input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder={placeholderSegredo(cfg.tokenFim) || 'EAAG…'} style={sx.input} />
          </Field>
          <Linha>{t('integ.metaTokenDica')}</Linha>
          <div style={{ ...grid2, marginTop: 14 }}>
            <Field label={t('integ.contaAnuncio')}>
              <select value={adAccountId} onChange={(e) => setAdAccountId(e.target.value)} style={sx.input}>
                <option value="">{t('integ.escolha')}</option>
                {contas.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.id})</option>)}
              </select>
            </Field>
            <Field label={t('integ.paginaLeads')}>
              <select value={pageId} onChange={(e) => setPageId(e.target.value)} style={sx.input}>
                <option value="">{t('integ.escolha')}</option>
                {paginas.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </Field>
            <Field label={t('integ.pixel')}>
              <select value={pixelId} onChange={(e) => setPixelId(e.target.value)} style={sx.input}>
                <option value="">{t('integ.escolha')}</option>
                {pixels.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.id})</option>)}
              </select>
            </Field>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 13, color: C.ink }}>
            <input type="checkbox" checked={importarLeads} onChange={(e) => setImportarLeads(e.target.checked)} />
            {t('integ.metaImportarLeads')}
          </label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
            <button type="button" onClick={testar} disabled={acao.ocupado || (!token && !cfg.tokenFim)} style={sx.btnGhost}>
              <MaterialIcon name="travel_explore" size={16} /> {t('integ.testar')}
            </button>
            <PrimaryButton icon="save" onClick={salvar} disabled={acao.ocupado || (!token && !cfg.tokenFim) || !adAccountId}>
              {t('comum.salvar')}
            </PrimaryButton>
            {cfg.conectado && (
              <button type="button" onClick={() => acao.rodar(async () => { await desconectarIntegracao('meta'); return t('integ.desconectou') })} disabled={acao.ocupado} style={{ ...sx.btnGhost, color: C.rose }}>
                <MaterialIcon name="link_off" size={16} /> {t('integ.desconectar')}
              </button>
            )}
          </div>
        </>
      )}
      <Aviso aviso={acao.aviso} />
    </SettingsCard>
  )
}

// ---------------------------------------------------------------------------
// Google
// ---------------------------------------------------------------------------

function GoogleCard({ cfg, chave, canEdit }: { cfg: Integrations['google']; chave?: string; canEdit: boolean }) {
  const [customerId, setCustomerId] = useState(cfg.customerId ?? '')
  const [loginCustomerId, setLogin] = useState(cfg.loginCustomerId ?? '')
  const [seg, setSeg] = useState({ developerToken: '', clientId: '', clientSecret: '', refreshToken: '' })
  const acao = useAcao()

  useEffect(() => {
    setCustomerId(cfg.customerId ?? '')
    setLogin(cfg.loginCustomerId ?? '')
  }, [cfg.customerId, cfg.loginCustomerId])

  const campo = (k: keyof typeof seg, rotulo: Chave, placeholder = '') => (
    <Field label={t(rotulo)}>
      <input type="password" autoComplete="off" value={seg[k]} onChange={(e) => setSeg({ ...seg, [k]: e.target.value })} placeholder={cfg.conectado ? t('integ.manterSalvo') : placeholder} style={sx.input} />
    </Field>
  )

  return (
    <SettingsCard
      title="Google Ads"
      subtitle={t('integ.googleSub')}
      action={<Status on={!!cfg.conectado}>{t(cfg.conectado ? 'integ.conectado' : 'integ.soFormulario')}</Status>}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 6 }}>{t('integ.googleLeadsTitulo')}</div>
      {chave ? (
        <>
          <Linha>{t('integ.googleLeadsComo')}</Linha>
          <div style={{ ...grid2, marginTop: 10 }}>
            <Field label={t('integ.urlWebhook')}><Copiavel valor={urlWebhookSemChave(chave)} /></Field>
            <Field label={t('integ.chaveWebhook')}><Copiavel valor={chave} /></Field>
          </div>
          <Linha>{t('integ.leadsRecebidos', { n: num(cfg.totalLeads ?? 0) })} · {t('integ.ultimoLead', { quando: quando(cfg.lastLeadAt) })}</Linha>
        </>
      ) : (
        <Linha>{t('integ.gereChavePrimeiro')}</Linha>
      )}

      <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, margin: '20px 0 6px' }}>{t('integ.googleApiTitulo')}</div>
      {cfg.conectado && (
        <>
          <Linha>{t('integ.googleResumo', { conta: cfg.contaNome || cfg.customerId || '—' })} · {t('integ.ultimaSync', { quando: quando(cfg.lastSyncAt) })}</Linha>
          <Erro texto={cfg.lastError} />
        </>
      )}
      <Linha>{t('integ.googleApiDica')}</Linha>
      {canEdit && (
        <>
          <div style={{ ...grid2, marginTop: 12 }}>
            <Field label={t('integ.customerId')}>
              <input value={customerId} onChange={(e) => setCustomerId(e.target.value)} placeholder="123-456-7890" style={sx.input} />
            </Field>
            <Field label={t('integ.loginCustomerId')}>
              <input value={loginCustomerId} onChange={(e) => setLogin(e.target.value)} placeholder={t('comum.opcional')} style={sx.input} />
            </Field>
            {campo('developerToken', 'integ.developerToken')}
            {campo('clientId', 'integ.clientId', '…apps.googleusercontent.com')}
            {campo('clientSecret', 'integ.clientSecret')}
            {campo('refreshToken', 'integ.refreshToken', '1//…')}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
            <button
              type="button"
              disabled={acao.ocupado || !customerId}
              style={sx.btnGhost}
              onClick={() => acao.rodar(async () => {
                const r = await testarGoogle({ customerId, loginCustomerId }, seg)
                return t('integ.googleTesteOk', { conta: r.conta, n: r.conversionActions.length })
              })}
            >
              <MaterialIcon name="travel_explore" size={16} /> {t('integ.testar')}
            </button>
            <PrimaryButton
              icon="save"
              disabled={acao.ocupado || !customerId}
              onClick={() => acao.rodar(async () => {
                const r = await salvarIntegracao('google', { customerId, loginCustomerId }, seg)
                setSeg({ developerToken: '', clientId: '', clientSecret: '', refreshToken: '' })
                return t(r.completo ? 'integ.salvo' : 'integ.googleIncompleto')
              })}
            >
              {t('comum.salvar')}
            </PrimaryButton>
            {cfg.conectado && (
              <button type="button" onClick={() => acao.rodar(async () => { await desconectarIntegracao('google'); return t('integ.desconectou') })} disabled={acao.ocupado} style={{ ...sx.btnGhost, color: C.rose }}>
                <MaterialIcon name="link_off" size={16} /> {t('integ.desconectar')}
              </button>
            )}
          </div>
        </>
      )}
      <Aviso aviso={acao.aviso} />
    </SettingsCard>
  )
}

// ---------------------------------------------------------------------------
// Site
// ---------------------------------------------------------------------------

function SiteCard({ cfg, canEdit }: { cfg: Integrations['site']; canEdit: boolean }) {
  const acao = useAcao()
  const gerar = () => acao.rodar(async () => {
    if (cfg.chave && !window.confirm(t('integ.confirmaTrocarChave'))) return
    await gerarChaveWebhook()
    return t('integ.chaveGerada')
  })
  return (
    <SettingsCard
      title={t('integ.siteTitulo')}
      subtitle={t('integ.siteSub')}
      action={canEdit && (
        <button type="button" onClick={gerar} disabled={acao.ocupado} style={sx.btnGhost}>
          <MaterialIcon name={cfg.chave ? 'autorenew' : 'key'} size={16} /> {t(cfg.chave ? 'integ.trocarChave' : 'integ.gerarChave')}
        </button>
      )}
    >
      {cfg.chave ? (
        <>
          <Linha>{t('integ.leadsRecebidos', { n: num(cfg.totalLeads ?? 0) })} · {t('integ.ultimoLead', { quando: quando(cfg.lastLeadAt) })}</Linha>
          <div style={{ marginTop: 12 }}>
            <Field label={t('integ.urlComChave')}><Copiavel valor={urlWebhook(cfg.chave)} /></Field>
          </div>
          <div style={{ marginTop: 14 }}>
            <Field label={t('integ.snippet')}><Copiavel valor={snippetSite(cfg.chave)} multilinha /></Field>
          </div>
          <Linha>{t('integ.snippetDica')}</Linha>
        </>
      ) : (
        <Linha>{t('integ.semChave')}</Linha>
      )}
      <Aviso aviso={acao.aviso} />
    </SettingsCard>
  )
}

// ---------------------------------------------------------------------------
// Conversões de volta
// ---------------------------------------------------------------------------

/** Etapas que podem virar evento: todas do funil menos a de entrada (essa já é o lead). */
const ETAPAS = LEADS_COLUMNS.filter((c) => c.id !== 'novo' && !c.outOfFunnel)
const PADRAO: Record<string, ConversionStage> = { qualificado: { meta: 'QualifiedLead' }, ganho: { meta: 'Purchase' } }

function ConversoesCard({ cfg, google, canEdit }: { cfg: Integrations['conversoes']; google: Integrations['google']; canEdit: boolean }) {
  const [ativo, setAtivo] = useState(!!cfg.ativo)
  const [etapas, setEtapas] = useState<Record<string, ConversionStage>>(cfg.etapas ?? PADRAO)
  const [testCode, setTestCode] = useState(cfg.metaTestCode ?? '')
  const acao = useAcao()

  useEffect(() => {
    setAtivo(!!cfg.ativo)
    setEtapas(cfg.etapas ?? PADRAO)
    setTestCode(cfg.metaTestCode ?? '')
  }, [cfg.ativo, cfg.etapas, cfg.metaTestCode])

  const muda = (col: string, k: keyof ConversionStage, v: string) =>
    setEtapas((e) => ({ ...e, [col]: { ...e[col], [k]: v } }))
  const acoes = google.conversionActions ?? []

  return (
    <SettingsCard
      title={t('integ.convTitulo')}
      subtitle={t('integ.convSub')}
      action={<Status on={!!cfg.ativo}>{t(cfg.ativo ? 'integ.ativo' : 'integ.inativo')}</Status>}
    >
      {cfg.ativo && (
        <>
          <Linha>{t('integ.convEnviadas', { n: num(cfg.enviadas ?? 0) })} · {t('integ.ultimoEnvio', { quando: quando(cfg.lastSentAt) })}</Linha>
          <Erro texto={cfg.lastError} />
        </>
      )}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0', fontSize: 13, color: C.ink }}>
        <input type="checkbox" checked={ativo} disabled={!canEdit} onChange={(e) => setAtivo(e.target.checked)} />
        {t('integ.convAtivar')}
      </label>
      <datalist id="eventos-meta">
        {['Lead', 'QualifiedLead', 'Contact', 'Schedule', 'SubmitApplication', 'InitiateCheckout', 'Purchase'].map((e) => <option key={e} value={e} />)}
      </datalist>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) 1fr 1fr', gap: 10, alignItems: 'center' }}>
        <span style={sx.label}>{t('integ.convEtapa')}</span>
        <span style={sx.label}>{t('integ.convEventoMeta')}</span>
        <span style={sx.label}>{t('integ.convAcaoGoogle')}</span>
        {ETAPAS.map((c) => (
          <div key={c.id} style={{ display: 'contents' }}>
            <span style={{ fontSize: 13, color: C.ink, fontWeight: 600 }}>{tituloEtapaLeads(c.id, c.title)}</span>
            <input list="eventos-meta" disabled={!canEdit} value={etapas[c.id]?.meta ?? ''} onChange={(e) => muda(c.id, 'meta', e.target.value)} placeholder={t('integ.naoEnviar')} style={sx.input} />
            <select disabled={!canEdit || !acoes.length} value={etapas[c.id]?.google ?? ''} onChange={(e) => muda(c.id, 'google', e.target.value)} style={sx.input}>
              <option value="">{t(acoes.length ? 'integ.naoEnviar' : 'integ.testeGoogleAntes')}</option>
              {acoes.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14, maxWidth: 320 }}>
        <Field label={t('integ.metaTestCode')}>
          <input disabled={!canEdit} value={testCode} onChange={(e) => setTestCode(e.target.value)} placeholder="TEST12345" style={sx.input} />
        </Field>
      </div>
      <Linha>{t('integ.convDica')}</Linha>
      {canEdit && (
        <div style={{ marginTop: 14 }}>
          <PrimaryButton icon="save" disabled={acao.ocupado} onClick={() => acao.rodar(async () => {
            await salvarIntegracao('conversoes', { ativo, etapas, metaTestCode: testCode })
            return t('integ.salvo')
          })}>
            {t('comum.salvar')}
          </PrimaryButton>
        </div>
      )}
      <Aviso aviso={acao.aviso} />
    </SettingsCard>
  )
}

// ---------------------------------------------------------------------------

export default function IntegrationsSection({ canEdit }: { canEdit: boolean }) {
  const { integrations, loading } = useIntegrations()
  const sync = useAcao()
  if (loading) return <div style={{ color: C.faint, fontSize: 13 }}>{t('comum.carregando')}</div>
  const algumConectado = !!(integrations.meta.conectado || integrations.google.conectado)

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.6, maxWidth: 640 }}>{t('integ.intro')}</div>
        {algumConectado && (
          <button
            type="button"
            disabled={sync.ocupado}
            style={{ ...sx.btnGhost, flexShrink: 0 }}
            onClick={() => sync.rodar(async () => {
              const r = await sincronizarAnunciosAgora()
              return t('integ.syncResultado', { meta: r.meta ?? '—', google: r.google ?? '—', leads: r.leadsMeta ?? 0 })
            })}
          >
            <MaterialIcon name="sync" size={16} /> {t(sync.ocupado ? 'integ.sincronizando' : 'integ.sincronizarAgora')}
          </button>
        )}
      </div>
      <Aviso aviso={sync.aviso} />
      <MetaCard cfg={integrations.meta} canEdit={canEdit} />
      <GoogleCard cfg={integrations.google} chave={integrations.site.chave} canEdit={canEdit} />
      <SiteCard cfg={integrations.site} canEdit={canEdit} />
      <ConversoesCard cfg={integrations.conversoes} google={integrations.google} canEdit={canEdit} />
    </>
  )
}
