import { t } from '../i18n'
import type { LeadChannel, LeadSource } from '../types'

/**
 * Como a origem de um lead automático aparece na tela. Nome de plataforma não se traduz
 * ("Meta Ads" é marca); "Site" sim.
 */
export function rotuloCanal(channel: LeadChannel): string {
  if (channel === 'meta') return 'Meta Ads'
  if (channel === 'google') return 'Google Ads'
  return t('origem.site')
}

export const ICONE_CANAL: Record<LeadChannel, string> = {
  meta: 'campaign',
  google: 'ads_click',
  site: 'language',
}

/** "Meta Ads · Black Friday" — a linha curta do card. */
export function resumoOrigem(s: LeadSource): string {
  const campanha = s.campaignName || s.utm?.campaign
  return campanha ? `${rotuloCanal(s.channel)} · ${campanha}` : rotuloCanal(s.channel)
}
