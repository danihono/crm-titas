import { useMemo } from 'react'
import { collection, query, where } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { app, db, functions } from '../lib/firebase'
import { uid } from '../lib/paths'
import { adCampaignFromDoc, adDailyFromDoc, integrationsFromDocs } from '../lib/converters'
import { idiomaAtual } from '../store/localeStore'
import { useTenantStore } from '../store/tenantStore'
import { useCollection } from './useCollection'
import { dateKeyOf } from '../lib/format'
import type { AdCampaign, AdDaily, Integrations } from '../types'

/**
 * Integrações de anúncio (Meta, Google, site) e as métricas que elas trazem.
 *
 * Tudo aqui é LEITURA pelo Firestore e ESCRITA pelas callables de functions/src/anuncios:
 * as regras bloqueiam escrita do navegador nessas coleções, porque é a callable que cifra
 * o token e mantém config e cofre em sincronia. O atendente nem assina — as regras dariam
 * permission-denied, e o `useCollection` engoliria o erro como lista vazia.
 */

function podeLer(): boolean {
  return useTenantStore.getState().role !== 'atendente'
}

interface RawDoc { id: string; data: Record<string, unknown> }

export function useIntegrations(): { integrations: Integrations; loading: boolean } {
  const role = useTenantStore((s) => s.role)
  const { docs, loading } = useCollection<RawDoc>(
    (u) => (podeLer() ? collection(db, `users/${u}/integrations`) : null),
    (id, data) => ({ id, data }),
    [role],
  )
  const integrations = useMemo(() => integrationsFromDocs(docs), [docs])
  return { integrations, loading }
}

export function useAdCampaigns() {
  const role = useTenantStore((s) => s.role)
  return useCollection<AdCampaign>(
    (u) => (podeLer() ? collection(db, `users/${u}/adCampaigns`) : null),
    adCampaignFromDoc,
    [role],
  )
}

/** Linhas diárias a partir de `desde` (inclusive). */
export function useAdDaily(desde: Date) {
  const role = useTenantStore((s) => s.role)
  const chave = dateKeyOf(desde)
  return useCollection<AdDaily>(
    (u) => (podeLer() ? query(collection(db, `users/${u}/adDaily`), where('date', '>=', chave)) : null),
    adDailyFromDoc,
    [role, chave],
  )
}

// ---------------------------------------------------------------------------
// Callables
// ---------------------------------------------------------------------------

type Provider = 'meta' | 'google' | 'conversoes'

async function chamar<T>(nome: string, dados: Record<string, unknown>): Promise<T> {
  const fn = httpsCallable<Record<string, unknown>, T>(functions, nome)
  const res = await fn({ ...dados, tenantUid: uid(), idioma: idiomaAtual() })
  return res.data
}

export function salvarIntegracao(
  provider: Provider,
  config: Record<string, unknown>,
  segredos: Record<string, string> = {},
): Promise<{ ok: boolean; completo?: boolean }> {
  // Segredo em branco não viaja: a callable entende ausência como "manter o salvo".
  const preenchidos = Object.fromEntries(Object.entries(segredos).filter(([, v]) => v.trim()))
  return chamar('salvarIntegracao', { provider, config, segredos: preenchidos })
}

export function desconectarIntegracao(provider: 'meta' | 'google'): Promise<{ ok: boolean }> {
  return chamar('salvarIntegracao', { provider, desconectar: true })
}

export interface DescobertaMeta {
  usuario: string
  adAccounts: { id: string; name: string; currency?: string }[]
  pages: { id: string; name: string }[]
  pixels: { id: string; name: string }[]
}

export interface DescobertaGoogle {
  conta: string
  moeda?: string
  conversionActions: { id: string; name: string }[]
}

export function testarMeta(token: string, adAccountId?: string): Promise<DescobertaMeta> {
  return chamar('testarIntegracao', {
    provider: 'meta',
    config: { adAccountId },
    segredos: token.trim() ? { token: token.trim() } : {},
  })
}

export function testarGoogle(
  config: { customerId: string; loginCustomerId?: string },
  segredos: Record<string, string>,
): Promise<DescobertaGoogle> {
  const preenchidos = Object.fromEntries(Object.entries(segredos).filter(([, v]) => v.trim()))
  return chamar('testarIntegracao', { provider: 'google', config, segredos: preenchidos })
}

export function gerarChaveWebhook(): Promise<{ chave: string }> {
  return chamar('gerarChaveWebhook', {})
}

export function sincronizarAnunciosAgora(): Promise<{ meta?: string; google?: string; leadsMeta?: number }> {
  return chamar('sincronizarAnunciosAgora', {})
}

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

const REGIAO = import.meta.env.VITE_FUNCTIONS_REGION || 'southamerica-east1'

/**
 * URL pública do `receberLead`. `VITE_LEAD_WEBHOOK_URL` permite apontar para um domínio
 * próprio (rewrite do Hosting) sem mudar código.
 */
export function urlWebhook(chave: string): string {
  const base = import.meta.env.VITE_LEAD_WEBHOOK_URL
    || (import.meta.env.VITE_USE_EMULATORS === 'true'
      ? `http://127.0.0.1:5001/${app.options.projectId}/${REGIAO}/receberLead`
      : `https://${REGIAO}-${app.options.projectId}.cloudfunctions.net/receberLead`)
  return `${base}?k=${encodeURIComponent(chave)}`
}

/** URL SEM a chave — é a que vai no Google Ads, onde a chave tem campo próprio. */
export function urlWebhookSemChave(chave: string): string {
  return urlWebhook(chave).split('?')[0]
}

/**
 * Snippet para colar no site. Faz duas coisas:
 *  1. na chegada, guarda utm_* / gclid / fbclid (90 dias) — o visitante costuma clicar no
 *     anúncio, navegar e só preencher o formulário em outra página;
 *  2. intercepta os formulários marcados com `data-titas` e envia ao CRM, sem tirar a
 *     pessoa da página (e sem quebrar o envio original do formulário, se houver).
 */
export function snippetSite(chave: string): string {
  return `<!-- Titãs CRM: captura de leads -->
<script>
(function () {
  var URL_CRM = ${JSON.stringify(urlWebhook(chave))};
  var CAMPOS = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','fbclid','gbraid','wbraid'];
  var q = new URLSearchParams(location.search), salvo = {};
  try { salvo = JSON.parse(localStorage.getItem('titas_origem') || '{}'); } catch (e) {}
  var achou = false;
  CAMPOS.forEach(function (c) { if (q.get(c)) { salvo[c] = q.get(c); achou = true; } });
  if (achou) { salvo.landing_url = location.href; salvo._t = Date.now(); }
  if (salvo._t && Date.now() - salvo._t > 90 * 864e5) salvo = {};
  try { localStorage.setItem('titas_origem', JSON.stringify(salvo)); } catch (e) {}

  document.addEventListener('submit', function (ev) {
    var f = ev.target;
    if (!f || !f.hasAttribute || !f.hasAttribute('data-titas')) return;
    var dados = {};
    new FormData(f).forEach(function (v, k) { if (typeof v === 'string') dados[k] = v; });
    Object.keys(salvo).forEach(function (k) { if (k !== '_t' && !dados[k]) dados[k] = salvo[k]; });
    dados.page = dados.page || location.href;
    dados._event_id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());
    var corpo = JSON.stringify(dados);
    if (!(navigator.sendBeacon && navigator.sendBeacon(URL_CRM, new Blob([corpo], { type: 'text/plain' })))) {
      fetch(URL_CRM, { method: 'POST', body: corpo, keepalive: true, headers: { 'content-type': 'text/plain' } });
    }
  }, true);
})();
</script>
<!-- No formulário: <form data-titas> ... <input name="nome"> <input name="email"> <input name="telefone">
     e um campo escondido anti-robô: <input name="_hp" style="display:none" tabindex="-1" autocomplete="off"> -->`
}
