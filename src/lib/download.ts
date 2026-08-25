import type { ReportModel } from './reportData'

function stamp(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Nome do arquivo carrega o período — o usuário acumula exportações na pasta Downloads. */
export function reportFileName(model: ReportModel, ext: string): string {
  return `titas-relatorio-${stamp(model.from)}-a-${stamp(model.to)}.${ext}`
}

/** Dispara o download de um Blob, liberando a URL temporária depois. */
export function downloadBlob(blob: Blob, fileName: string): void {
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
