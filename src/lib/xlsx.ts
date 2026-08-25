import type { ReportModel, ReportRow } from './reportData'
import { fmtDate, fmtDuration } from './reportData'
import { downloadBlob, reportFileName } from './download'

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

// Cores da marca, no formato ARGB que o Excel usa (alfa na frente).
const PURPLE = 'FF7A52A0'
const PURPLE_DEEP = 'FF553578'
const INK = 'FF1D1726'
const SUB = 'FF6E6780'
const ZEBRA = 'FFF7F5FA'
const BORDER = 'FFE6E3EE'

/** Imagens dos gráficos, já rasterizadas pela tela. */
export interface ChartImages {
  trend?: string | null
}

type Sheet = import('exceljs').Worksheet
type Wb = import('exceljs').Workbook

function titleBlock(ws: Sheet, model: ReportModel, orgName: string, title: string, cols: number) {
  ws.mergeCells(1, 1, 1, cols)
  const t = ws.getCell(1, 1)
  t.value = orgName ? `TITÃS CRM · ${orgName}` : 'TITÃS CRM'
  t.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } }
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PURPLE_DEEP } }
  t.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  ws.getRow(1).height = 26

  ws.mergeCells(2, 1, 2, cols)
  const s = ws.getCell(2, 1)
  s.value = `${title} · ${fmtDate(model.from)} a ${fmtDate(model.to)} (${model.days} dias)`
  s.font = { name: 'Calibri', size: 10, color: { argb: SUB } }
  s.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  ws.getRow(2).height = 18
}

/** Cabeçalho de tabela no roxo da marca, com painel congelado logo abaixo. */
function tableHeader(ws: Sheet, rowIdx: number, headers: string[]) {
  const row = ws.getRow(rowIdx)
  headers.forEach((h, i) => {
    const cell = row.getCell(i + 1)
    cell.value = h
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PURPLE } }
    cell.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : 'center' }
    cell.border = { bottom: { style: 'thin', color: { argb: BORDER } } }
  })
  row.height = 20
  // Congela o cabeçalho: rolar uma lista longa sem perder de vista o nome da coluna.
  ws.views = [{ state: 'frozen', ySplit: rowIdx }]
}

function dataRow(ws: Sheet, rowIdx: number, values: (string | number)[], zebra: boolean) {
  const row = ws.getRow(rowIdx)
  values.forEach((v, i) => {
    const cell = row.getCell(i + 1)
    cell.value = v
    cell.font = { name: 'Calibri', size: 10, color: { argb: INK } }
    cell.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : 'center' }
    if (zebra) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } }
    cell.border = { bottom: { style: 'hair', color: { argb: BORDER } } }
  })
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
