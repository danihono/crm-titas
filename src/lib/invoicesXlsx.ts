import { downloadBlob } from './download'
import { brandTitle, dataRow, tableHeader, PURPLE, SUB } from './xlsxStyle'
import { invoiceStatus } from '../hooks/useInvoices'
import type { Invoice } from '../types'

function stamp(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Exporta as notas para XLSX — o recorte que está na tela, não a coleção inteira: quem
 * filtrou por "vencidas de julho" quer exportar exatamente aquilo.
 *
 * O `import('exceljs')` é dinâmico pelo mesmo motivo do relatório: a biblioteca é pesada
 * e só quem exporta deve pagar por ela.
 */
export async function exportInvoicesXlsx(invoices: Invoice[], orgName: string, subtitle: string): Promise<void> {
  const ExcelJS = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Titãs CRM'
  wb.created = new Date()

  const ws = wb.addWorksheet('Faturamento', { properties: { tabColor: { argb: PURPLE } } })
  ws.columns = [
    { width: 10 }, { width: 30 }, { width: 34 }, { width: 14 },
    { width: 13 }, { width: 12 }, { width: 13 }, { width: 16 }, { width: 11 },
  ]
  brandTitle(ws, 9, orgName ? `TITÃS CRM · ${orgName}` : 'TITÃS CRM', `Faturamento · ${subtitle}`)

  const headerRow = 4
  tableHeader(ws, headerRow, [
    'Nota', 'Cliente', 'Descrição', 'Valor', 'Vencimento', 'Status', 'Pago em', 'Pagamento', 'Parcela',
  ])

  if (invoices.length === 0) {
    ws.getCell(headerRow + 1, 1).value = 'Nenhuma nota no recorte selecionado.'
    ws.getCell(headerRow + 1, 1).font = { name: 'Calibri', size: 10, italic: true, color: { argb: SUB } }
  } else {
    invoices.forEach((iv, i) => {
      const st = invoiceStatus(iv)
      // Valor e datas vão como número/data DE VERDADE — é o que deixa o Excel somar,
      // ordenar e filtrar em vez de tratar tudo como texto.
      dataRow(ws, headerRow + 1 + i, [
        iv.num,
        iv.client,
        iv.desc ?? '',
        iv.value,
        iv.dueAt,
        st,
        iv.paidAt ?? '',
        iv.paymentMethod ?? '',
        iv.installment ? `${iv.installment.n}/${iv.installment.of}` : '',
      ], i % 2 === 1)
      ws.getCell(headerRow + 1 + i, 4).numFmt = 'R$ #,##0'
      ws.getCell(headerRow + 1 + i, 5).numFmt = 'dd/mm/yyyy'
      if (iv.paidAt) ws.getCell(headerRow + 1 + i, 7).numFmt = 'dd/mm/yyyy'
    })

    // Linha de total, para a planilha fechar sozinha.
    const totalRow = headerRow + 1 + invoices.length
    ws.getCell(totalRow, 3).value = 'Total'
    ws.getCell(totalRow, 3).font = { name: 'Calibri', size: 10, bold: true }
    ws.getCell(totalRow, 3).alignment = { horizontal: 'right' }
    ws.getCell(totalRow, 4).value = { formula: `SUM(D${headerRow + 1}:D${totalRow - 1})` }
    ws.getCell(totalRow, 4).font = { name: 'Calibri', size: 10, bold: true }
    ws.getCell(totalRow, 4).numFmt = 'R$ #,##0'

    ws.autoFilter = {
      from: { row: headerRow, column: 1 },
      to: { row: headerRow + invoices.length, column: 9 },
    }
  }

  const buf = await wb.xlsx.writeBuffer()
  downloadBlob(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `titas-faturamento-${stamp(new Date())}.xlsx`,
  )
}
