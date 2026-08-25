import type { ReportModel, ReportRow } from './reportData'
import { fmtDate, fmtDuration } from './reportData'

/**
 * Separador `;` e BOM UTF-8 — não é preciosismo, é o que faz o Excel brasileiro abrir
 * o arquivo certo. Com vírgula e sem BOM, o Excel joga tudo numa coluna só e mostra
 * "RelatÃ³rios" no lugar de "Relatórios".
 */
const SEP = ';'
const BOM = '﻿'

/** Escapa um campo: aspas dobradas e envelopadas quando há separador, aspa ou quebra. */
function cell(v: string | number): string {
  const s = String(v ?? '')
  if (s.includes(SEP) || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function row(...cells: (string | number)[]): string {
  return cells.map(cell).join(SEP)
}

function breakdown(title: string, entity: string, rows: ReportRow[]): string[] {
  const out = ['', title, row(entity, 'Conversas', 'Finalizadas', '1a resposta', 'Ate finalizar')]
  if (rows.length === 0) {
    out.push(row('(sem dados no periodo)', '', '', '', ''))
    return out
  }
  rows.forEach((r) => {
    out.push(row(r.label, r.total, r.closed, fmtDuration(r.firstResponseMs), fmtDuration(r.resolutionMs)))
  })
  return out
}

/** Monta o CSV completo do relatório — todas as seções, na ordem em que a tela as mostra. */
export function buildReportCsv(model: ReportModel, orgName: string): string {
  const lines: string[] = []

  lines.push(row(orgName || 'Titas CRM', 'Relatorio de atendimento'))
  lines.push(row('Periodo', `${fmtDate(model.from)} a ${fmtDate(model.to)}`))
  lines.push(row('Emitido em', new Date().toLocaleString('pt-BR')))

  lines.push('', 'RESUMO', row('Indicador', 'Valor'))
  lines.push(row('Total de conversas', model.kpis.total))
  lines.push(row('Em aberto', model.kpis.open))
  lines.push(row('Finalizadas', model.kpis.closed))
  lines.push(row('Tempo medio de 1a resposta', fmtDuration(model.kpis.firstResponseMs)))
  lines.push(row('Tempo medio ate finalizar', fmtDuration(model.kpis.resolutionMs)))

  lines.push('', 'AGORA', row('Estado', 'Conversas'))
  lines.push(row('Na fila', model.live.fila))
  lines.push(row('Em atendimento', model.live.atendimento))
  lines.push(row('Esperando cliente', model.live.esperando))

  lines.push('', 'CONVERSAS POR DIA', row('Data', 'Conversas'))
  model.byDay.forEach((d) => lines.push(row(d.label, d.total)))

  lines.push(...breakdown('POR ATENDENTE', 'Atendente', model.byAgent))
  lines.push(...breakdown('POR SETOR', 'Setor', model.bySector))
  lines.push(...breakdown('POR ETIQUETA', 'Etiqueta', model.byTag))

  return BOM + lines.join('\r\n')
}

function stamp(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Nome do arquivo carrega o período — o usuário acumula exportações na pasta Downloads. */
export function reportFileName(model: ReportModel, ext: string): string {
  return `titas-relatorio-${stamp(model.from)}-a-${stamp(model.to)}.${ext}`
}

/** Dispara o download de um texto como arquivo, liberando a URL temporária depois. */
export function downloadText(content: string, fileName: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Sem o revoke o blob fica preso na memória da aba até ela ser fechada.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
