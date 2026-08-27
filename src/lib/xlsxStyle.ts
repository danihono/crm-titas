import type { Worksheet } from 'exceljs'

// Cores da marca, no formato ARGB que o Excel usa (alfa na frente).
export const PURPLE = 'FF7A52A0'
export const PURPLE_DEEP = 'FF553578'
export const INK = 'FF1D1726'
export const SUB = 'FF6E6780'
export const ZEBRA = 'FFF7F5FA'
export const BORDER = 'FFE6E3EE'

/**
 * Estilo das planilhas do Titãs, compartilhado pelo relatório de atendimento e pela
 * exportação de faturamento — para as duas saírem com a mesma cara sem duplicar cor,
 * fonte e borda em dois arquivos.
 */

/** Cabeçalho de tabela no roxo da marca, com painel congelado logo abaixo. */
export function tableHeader(ws: Worksheet, rowIdx: number, headers: string[]) {
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

/** Linha de dados, zebrada. Número e data entram como valor real, não como texto. */
export function dataRow(ws: Worksheet, rowIdx: number, values: (string | number | Date)[], zebra: boolean) {
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

/** Faixa roxa de título no topo da aba. */
export function brandTitle(ws: Worksheet, cols: number, title: string, subtitle: string) {
  ws.mergeCells(1, 1, 1, cols)
  const t = ws.getCell(1, 1)
  t.value = title
  t.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } }
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PURPLE_DEEP } }
  t.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  ws.getRow(1).height = 26

  ws.mergeCells(2, 1, 2, cols)
  const s = ws.getCell(2, 1)
  s.value = subtitle
  s.font = { name: 'Calibri', size: 10, color: { argb: SUB } }
  s.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  ws.getRow(2).height = 18
}
