import type { ReportModel, ReportRow } from './reportData'
import { t, type Chave } from '../i18n'
import { dataHoraCurta } from '../i18n/formato'
import { fmtDate, fmtDuration } from './reportData'
import { downloadBlob, reportFileName } from './download'
import { brandTitle, dataRow, tableHeader, PURPLE, SUB } from './xlsxStyle'

/** Seções que o usuário pode ligar/desligar antes de exportar. */
export type SectionId = 'resumo' | 'porDia' | 'agora' | 'atendentes' | 'setores' | 'etiquetas'

export type ReportSections = Record<SectionId, boolean>

export const SECTION_DEFS: { id: SectionId; label: Chave; hint: Chave }[] = [
  { id: 'resumo', label: 'exp.secResumo', hint: 'exp.secResumoDica' },
  { id: 'porDia', label: 'exp.secPorDia', hint: 'exp.secPorDiaDica' },
  { id: 'agora', label: 'exp.secAgora', hint: 'exp.secAgoraDica' },
  { id: 'atendentes', label: 'exp.secAtendentes', hint: 'exp.secAtendentesDica' },
  { id: 'setores', label: 'exp.secSetores', hint: 'exp.secSetoresDica' },
  { id: 'etiquetas', label: 'exp.secEtiquetas', hint: 'exp.secEtiquetasDica' },
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
    orgName ? t('exp.cabecalho', { org: orgName }) : 'TITÃS CRM',
    t('exp.periodo', { titulo: title, de: fmtDate(model.from), ate: fmtDate(model.to), dias: model.days }),
  )
}

function breakdownSheet(wb: Wb, name: string, entity: string, rows: ReportRow[], model: ReportModel, orgName: string) {
  const ws = wb.addWorksheet(name, { properties: { tabColor: { argb: PURPLE } } })
  ws.columns = [
    { width: 34 }, { width: 13 }, { width: 14 }, { width: 20 }, { width: 20 },
  ]
  titleBlock(ws, model, orgName, name, 5)
  const headerRow = 4
  tableHeader(ws, headerRow, [entity, t('exp.colConversas'), t('exp.colFinalizadas'), t('exp.colPrimeiraResposta'), t('exp.colAteFinalizar')])

  if (rows.length === 0) {
    ws.getCell(headerRow + 1, 1).value = t('comum.semRegistros')
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
    const ws = wb.addWorksheet(t('exp.secResumo'), { properties: { tabColor: { argb: PURPLE } } })
    ws.columns = [{ width: 38 }, { width: 24 }]
    titleBlock(ws, model, orgName, t('exp.relatorioAtendimento'), 2)
    tableHeader(ws, 4, [t('exp.indicador'), t('exp.valor')])

    const k = model.kpis
    const rows: [string, string | number][] = [
      [t('exp.totalConversas'), k.total],
      [t('exp.emAberto'), k.open],
      [t('exp.colFinalizadas'), k.closed],
      [t('exp.tempoPrimeiraResposta'), fmtDuration(k.firstResponseMs)],
      [t('exp.tempoAteFinalizar'), fmtDuration(k.resolutionMs)],
    ]
    rows.forEach(([label, value], i) => dataRow(ws, 5 + i, [label, value], i % 2 === 1))

    const after = 5 + rows.length + 1
    ws.getCell(after, 1).value = t('doc.emitidoEm', { data: dataHoraCurta(new Date()) })
    ws.getCell(after, 1).font = { name: 'Calibri', size: 9, italic: true, color: { argb: SUB } }

    if (charts.trend) {
      const id = wb.addImage({ base64: charts.trend, extension: 'png' })
      ws.addImage(id, { tl: { col: 0, row: after + 1 }, ext: { width: 720, height: 190 } })
    }
  }

  if (sections.porDia) {
    const ws = wb.addWorksheet(t('exp.secPorDia'), { properties: { tabColor: { argb: PURPLE } } })
    ws.columns = [{ width: 16 }, { width: 14 }]
    titleBlock(ws, model, orgName, t('exp.secPorDia'), 2)
    tableHeader(ws, 4, [t('exp.data'), t('exp.colConversas')])
    model.byDay.forEach((d, i) => dataRow(ws, 5 + i, [d.label, d.total], i % 2 === 1))
  }

  if (sections.agora) {
    const ws = wb.addWorksheet(t('exp.secAgora'), { properties: { tabColor: { argb: PURPLE } } })
    ws.columns = [{ width: 28 }, { width: 14 }]
    titleBlock(ws, model, orgName, t('exp.filaNaEmissao'), 2)
    tableHeader(ws, 4, [t('exp.estado'), t('exp.colConversas')])
    const rows: [string, number][] = [
      [t('relatorios.naFila'), model.live.fila],
      [t('atend.emAtendimento'), model.live.atendimento],
      [t('atend.esperandoCliente'), model.live.esperando],
    ]
    rows.forEach(([label, value], i) => dataRow(ws, 5 + i, [label, value], i % 2 === 1))
  }

  if (sections.atendentes) breakdownSheet(wb, t('exp.secAtendentes'), t('exp.atendente'), model.byAgent, model, orgName)
  if (sections.setores) breakdownSheet(wb, t('exp.secSetores'), t('exp.setor'), model.bySector, model, orgName)
  if (sections.etiquetas) breakdownSheet(wb, t('exp.secEtiquetas'), t('exp.etiqueta'), model.byTag, model, orgName)

  const buffer = await wb.xlsx.writeBuffer()
  downloadBlob(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    reportFileName(model, 'xlsx'),
  )
}
