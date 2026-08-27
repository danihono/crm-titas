import type { ReportModel, ReportRow } from './reportData'
import { fmtDate, fmtDuration } from './reportData'
import { downloadBlob, reportFileName } from './download'
import { brandTitle, dataRow, tableHeader, PURPLE, SUB } from './xlsxStyle'

/** Seções que o usuário pode ligar/desligar antes de exportar. */
export type SectionId = 'resumo' | 'porDia' | 'agora' | 'atendentes' | 'setores' | 'etiquetas'

export type ReportSections = Record<SectionId, boolean>

export const SECTION_DEFS: { id: SectionId; label: string; hint: string }[] = [
  { id: 'resumo', label: 'Resumo', hint: 'Indicadores do período' },
  { id: 'porDia', label: 'Conversas por dia', hint: 'Série diária e gráfico' },
  { id: 'agora', label: 'Fila agora', hint: 'Estado das conversas abertas' },
  { id: 'atendentes', label: 'Por atendente', hint: 'Desempenho de cada pessoa' },
  { id: 'setores', label: 'Por setor', hint: 'Volume por fila de atendimento' },
  { id: 'etiquetas', label: 'Por etiqueta', hint: 'Volume por classificação' },
]

export const ALL_SECTIONS: ReportSections = {
  resumo: true, porDia: true, agora: true, atendentes: true, setores: true, etiquetas: true,
}


/** Imagens dos gráficos, já rasterizadas pela tela. */
export interface ChartImages {
  trend?: string | null
}

type Sheet = import('exceljs').Worksheet
type Wb = import('exceljs').Workbook

function titleBlock(ws: Sheet, model: ReportModel, orgName: string, title: string, cols: number) {
  brandTitle(
    ws,
    cols,
    orgName ? `TITÃS CRM · ${orgName}` : 'TITÃS CRM',
    `${title} · ${fmtDate(model.from)} a ${fmtDate(model.to)} (${model.days} dias)`,
  )
}

function breakdownSheet(wb: Wb, name: string, entity: string, rows: ReportRow[], model: ReportModel, orgName: string) {
  const ws = wb.addWorksheet(name, { properties: { tabColor: { argb: PURPLE } } })
  ws.columns = [
    { width: 34 }, { width: 13 }, { width: 14 }, { width: 20 }, { width: 20 },
  ]
  titleBlock(ws, model, orgName, name, 5)
  const headerRow = 4
  tableHeader(ws, headerRow, [entity, 'Conversas', 'Finalizadas', '1ª resposta', 'Até finalizar'])

  if (rows.length === 0) {
    ws.getCell(headerRow + 1, 1).value = 'Nada registrado neste período.'
    ws.getCell(headerRow + 1, 1).font = { name: 'Calibri', size: 10, italic: true, color: { argb: SUB } }
    return
  }

  rows.forEach((r, i) => {
    // total e closed vão como NÚMERO — é o que deixa o Excel somar, ordenar e filtrar.
    dataRow(ws, headerRow + 1 + i, [
      r.label, r.total, r.closed, fmtDuration(r.firstResponseMs), fmtDuration(r.resolutionMs),
    ], i % 2 === 1)
  })

  // Autofiltro sobre o cabeçalho: quem abre a planilha já consegue recortar por conta.
  ws.autoFilter = {
    from: { row: headerRow, column: 1 },
    to: { row: headerRow + rows.length, column: 5 },
  }
}

/**
 * Gera e baixa a planilha do relatório.
 *
 * O `import('exceljs')` é dinâmico de propósito: a biblioteca é pesada e só faz sentido
 * baixá-la quando alguém realmente exporta — carregar o CRM não paga esse preço.
 */
export async function exportReportXlsx(
  model: ReportModel,
  orgName: string,
  sections: ReportSections,
  charts: ChartImages,
): Promise<void> {
  const ExcelJS = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Titãs CRM'
  wb.created = new Date()

  if (sections.resumo) {
    const ws = wb.addWorksheet('Resumo', { properties: { tabColor: { argb: PURPLE } } })
    ws.columns = [{ width: 38 }, { width: 24 }]
    titleBlock(ws, model, orgName, 'Relatório de atendimento', 2)
    tableHeader(ws, 4, ['Indicador', 'Valor'])

    const k = model.kpis
    const rows: [string, string | number][] = [
      ['Total de conversas', k.total],
      ['Em aberto', k.open],
      ['Finalizadas', k.closed],
      ['Tempo médio de 1ª resposta', fmtDuration(k.firstResponseMs)],
      ['Tempo médio até finalizar', fmtDuration(k.resolutionMs)],
    ]
    rows.forEach(([label, value], i) => dataRow(ws, 5 + i, [label, value], i % 2 === 1))

    const after = 5 + rows.length + 1
    ws.getCell(after, 1).value = `Emitido em ${new Date().toLocaleString('pt-BR')}`
    ws.getCell(after, 1).font = { name: 'Calibri', size: 9, italic: true, color: { argb: SUB } }

    if (charts.trend) {
      const id = wb.addImage({ base64: charts.trend, extension: 'png' })
      ws.addImage(id, { tl: { col: 0, row: after + 1 }, ext: { width: 720, height: 190 } })
    }
  }

  if (sections.porDia) {
    const ws = wb.addWorksheet('Conversas por dia', { properties: { tabColor: { argb: PURPLE } } })
    ws.columns = [{ width: 16 }, { width: 14 }]
    titleBlock(ws, model, orgName, 'Conversas por dia', 2)
    tableHeader(ws, 4, ['Data', 'Conversas'])
    model.byDay.forEach((d, i) => dataRow(ws, 5 + i, [d.label, d.total], i % 2 === 1))
  }

  if (sections.agora) {
    const ws = wb.addWorksheet('Fila agora', { properties: { tabColor: { argb: PURPLE } } })
    ws.columns = [{ width: 28 }, { width: 14 }]
    titleBlock(ws, model, orgName, 'Fila no momento da emissão', 2)
    tableHeader(ws, 4, ['Estado', 'Conversas'])
    const rows: [string, number][] = [
      ['Na fila', model.live.fila],
      ['Em atendimento', model.live.atendimento],
      ['Esperando cliente', model.live.esperando],
    ]
    rows.forEach(([label, value], i) => dataRow(ws, 5 + i, [label, value], i % 2 === 1))
  }

  if (sections.atendentes) breakdownSheet(wb, 'Por atendente', 'Atendente', model.byAgent, model, orgName)
  if (sections.setores) breakdownSheet(wb, 'Por setor', 'Setor', model.bySector, model, orgName)
  if (sections.etiquetas) breakdownSheet(wb, 'Por etiqueta', 'Etiqueta', model.byTag, model, orgName)

  const buffer = await wb.xlsx.writeBuffer()
  downloadBlob(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    reportFileName(model, 'xlsx'),
  )
}
