import { useMemo } from 'react'
import { useAllDeals, useBoards, LEADS_BOARD_ID } from './useDeals'
import { useActivities, useActTypes } from './useActivities'
import { useInvoices, invoiceStatus } from './useInvoices'
import { useEvents } from './useEvents'
import { useConversations } from './useConversations'
import { useContacts } from './useContacts'
import { useMembers } from './useTeam'
import { useSectors, useTags } from './useSettings'
import { revenueChart, type RevChart } from './useRevenueChart'
import {
  buildLeadFunnel, buildHeatmap, aReceberPorSemana, vencidasPorSemana,
  type LeadFunnel as Funil, type Heatmap,
} from '../lib/dashboardData'
import { buildReport, filaAgora, type ReportModel } from '../lib/reportData'
import { semanas, porSemana } from '../lib/sparkline'
import { dateKeyOf } from '../lib/format'
import { srcMap } from '../lib/theme'
import { C } from '../styles/sx'
import type { Fonte } from '../lib/dashboardWidgets'
import type { Activity, ActType, Deal, EventDoc } from '../types'

/** Cores para origens de lead que não estão no srcMap (o usuário digita o que quiser). */
const SOURCE_FALLBACK = ['#6f9bcf', '#5fc9a6', '#b692d6', '#e0b56a', '#d98aab', '#5fa9c9']

export interface Origem {
  name: string
  count: number
  pct: number
  color: string
}

export interface DadosPainel {
  // negócios
  deals: Deal[]
  pipelineTotal: number
  ticket: number
  leadsNovos: number
  leadsTotal: number
  origens: Origem[]
  donutGradient: string
  funil: Funil
  serieNovoPipeline: number[]
  serieNegocios: number[]
  serieLeads: number[]
  // atividades
  typeMap: Record<string, ActType>
  feed: Activity[]
  pendentes: Activity[]
  pendingToday: Activity[]
  nextPending: Activity | undefined
  // agenda
  todayEvents: EventDoc[]
  proximosEventos: EventDoc[]
  // conversas
  heat: Heatmap
  relatorio: ReportModel | null
  // notas
  aReceber: number
  serieAReceber: number[]
  vencidas: number
  vencidoSum: number
  serieVencidas: number[]
  receita: RevChart
  // agora
  fila: { fila: number; atendimento: number; esperando: number }
  pendencias: number
}

/**
 * Tudo o que os widgets do painel mostram, num lugar só.
 *
 * As consultas caras — conversas e eventos — são LIGADAS PELO LAYOUT: se nenhum
 * widget na tela pede conversas, a assinatura não existe. Sem isso, quem tirasse
 * o mapa de calor do painel continuaria pagando a leitura de até 365 dias.
 *
 * O gate fica aqui, e não dentro de cada widget, de propósito: dois widgets que
 * dependem de conversas (mapa de calor e ranking, por exemplo) assinariam a
 * mesma consulta duas vezes se cada um trouxesse a sua.
 */
export function useDashboardData(fontes: Set<Fonte>, dias: number, agora: Date): DadosPainel {
  const precisaEventos = fontes.has('eventos')
  const precisaConversas = fontes.has('conversas')
  const precisaEquipe = fontes.has('equipe')

  // Estes quatro a Topbar já assina em toda tela — não custam nada a mais aqui.
  const { docs: deals } = useAllDeals()
  const { docs: activities } = useActivities()
  const { docs: invoices } = useInvoices()
  const { docs: contacts } = useContacts()

  const { docs: boards } = useBoards()
  const { docs: types } = useActTypes()

  // O intervalo precisa ser estável entre renders: `useConversations` reassina a
  // consulta a cada objeto Date novo, e um `new Date()` solto religaria o
  // listener sem parar.
  const [from, to] = useMemo(() => {
    const fim = new Date()
    fim.setHours(23, 59, 59, 999)
    const ini = new Date(fim)
    ini.setDate(ini.getDate() - (dias - 1))
    ini.setHours(0, 0, 0, 0)
    return [ini, fim]
  }, [dias])

  const { docs: events } = useEvents(agora.getFullYear(), agora.getMonth(), { enabled: precisaEventos })
  const { docs: conversations } = useConversations(from, to, { enabled: precisaConversas })
  const { docs: members } = useMembers({ enabled: precisaEquipe })
  const { docs: sectors } = useSectors({ enabled: precisaEquipe })
  const { docs: tags } = useTags({ enabled: precisaEquipe })

  // ── Negócios ────────────────────────────────────────────────────────────
  const leadsBoard = boards.find((b) => b.id === LEADS_BOARD_ID)
  const leadCards = useMemo(() => deals.filter((d) => d.boardId === LEADS_BOARD_ID), [deals])
  const funil = useMemo(
    () => buildLeadFunnel({ deals: leadCards, columns: leadsBoard?.columns ?? [], from, to }),
    [leadCards, leadsBoard, from, to],
  )
  const primeiraEtapa = leadsBoard
    ? [...leadsBoard.columns].sort((a, b) => a.order - b.order)[0]?.id
    : undefined
  const leadsNovos = primeiraEtapa ? leadCards.filter((d) => d.columnId === primeiraEtapa).length : 0

  const origens = useMemo<Origem[]>(() => {
    const contagem = new Map<string, number>()
    leadCards.forEach((l) => {
      const key = l.tag?.trim() || 'Sem origem'
      contagem.set(key, (contagem.get(key) ?? 0) + 1)
    })
    return [...contagem.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count], i) => ({
        name,
        count,
        pct: Math.round((count / leadCards.length) * 100),
        color: srcMap[name]?.[0] ?? SOURCE_FALLBACK[i % SOURCE_FALLBACK.length],
      }))
  }, [leadCards])

  // A rosca usa a fração exata, não o rótulo arredondado — senão não fecha 100%.
  const donutGradient = useMemo(() => {
    if (!origens.length) return `conic-gradient(${C.line} 0 100%)`
    let acc = 0
    const paradas = origens.map((s) => {
      const ini = acc
      acc += (s.count / leadCards.length) * 100
      return `${s.color} ${ini}% ${acc}%`
    })
    return `conic-gradient(${paradas.join(',')})`
  }, [origens, leadCards.length])

  const pipelineTotal = deals.reduce((s, d) => s + (d.value || 0), 0)
  const ticket = deals.length ? Math.round(pipelineTotal / deals.length) : 0

  // ── Séries semanais ─────────────────────────────────────────────────────
  const todayKey = dateKeyOf(agora)
  const faixas = useMemo(() => semanas(12, agora), [todayKey])
  const serieNovoPipeline = useMemo(
    () => porSemana(deals, (d) => d.createdAt, faixas, (d) => d.value || 0),
    [deals, faixas],
  )
  const serieNegocios = useMemo(() => porSemana(deals, (d) => d.createdAt, faixas), [deals, faixas])
  const serieLeads = useMemo(
    () => (primeiraEtapa ? porSemana(leadCards, (d) => d.reachedAt?.[primeiraEtapa], faixas) : []),
    [leadCards, primeiraEtapa, faixas],
  )

  // ── Atividades e agenda ─────────────────────────────────────────────────
  const typeMap = useMemo(() => Object.fromEntries(types.map((t) => [t.id, t])), [types])
  const pendentes = useMemo(
    () => activities.filter((a) => !a.done).sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime()),
    [activities],
  )
  const pendingToday = pendentes.filter((a) => dateKeyOf(a.dueAt) === todayKey)
  const todayEvents = useMemo(
    () => events.filter((e) => e.dateKey === todayKey).sort((a, b) => a.time.localeCompare(b.time)),
    [events, todayKey],
  )
  const proximosEventos = useMemo(
    () => events
      .filter((e) => e.date.getTime() >= agora.getTime() - 12 * 3600_000)
      .sort((a, b) => a.date.getTime() - b.date.getTime()),
    [events, todayKey],
  )

  // ── Conversas ───────────────────────────────────────────────────────────
  const heat = useMemo(() => buildHeatmap(conversations), [conversations])
  // Montado sempre que houver CONVERSAS, e não só quando houver equipe: o widget
  // "Conversas por dia" consome `byDay`, que sai só das conversas. Amarrar o
  // relatório à equipe deixaria esse gráfico permanentemente vazio — e sem erro
  // nenhum para denunciar.
  //
  // Sem equipe carregada, `byAgent`/`bySector`/`byTag` saem vazios, o que é
  // correto: quem pede ranking declara a fonte 'equipe' e recebe os três.
  const relatorio = useMemo(
    () => (precisaConversas
      ? buildReport({ conversations, contacts, members, sectors, tags, from, to, days: dias })
      : null),
    [precisaConversas, conversations, contacts, members, sectors, tags, from, to, dias],
  )

  // ── Notas ───────────────────────────────────────────────────────────────
  const withStatus = invoices.map((iv) => invoiceStatus(iv, agora))
  const aReceber = invoices.filter((_, i) => withStatus[i] === 'Pendente').reduce((s, iv) => s + iv.value, 0)
  const vencidasList = invoices.filter((_, i) => withStatus[i] === 'Vencida')
  const serieAReceber = useMemo(() => aReceberPorSemana(invoices, faixas), [invoices, faixas])
  const serieVencidas = useMemo(() => vencidasPorSemana(invoices, faixas), [invoices, faixas])
  const receita = useMemo(() => revenueChart(invoices, agora), [invoices, todayKey])

  // ── Fila agora ──────────────────────────────────────────────────────────
  // A conta é a MESMA dos Relatórios (lib/reportData.ts) — dois números iguais
  // na tela têm de vir da mesma função, senão divergem no primeiro ajuste.
  const fila = useMemo(() => filaAgora(contacts), [contacts])

  return {
    deals, pipelineTotal, ticket, leadsNovos, leadsTotal: leadCards.length,
    origens, donutGradient, funil, serieNovoPipeline, serieNegocios, serieLeads,
    typeMap, feed: activities.slice(0, 8), pendentes, pendingToday, nextPending: pendentes[0],
    todayEvents, proximosEventos,
    heat, relatorio,
    aReceber, serieAReceber, vencidas: vencidasList.length,
    vencidoSum: vencidasList.reduce((s, iv) => s + iv.value, 0), serieVencidas, receita,
    fila,
    pendencias: todayEvents.length + pendingToday.length,
  }
}
