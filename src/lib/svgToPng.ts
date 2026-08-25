/**
 * Rasteriza um <svg> já renderizado na página para PNG (data URL).
 *
 * Serve para levar os MESMOS gráficos da tela e do PDF para dentro da planilha — o Excel
 * não aceita SVG, e reimplementar os gráficos numa segunda linguagem seria a receita para
 * a planilha e o PDF divergirem com o tempo.
 */
export async function svgElementToPng(svg: SVGSVGElement, scale = 2): Promise<string | null> {
  try {
    // Espera a página assentar antes de medir e serializar.
    if (document.fonts?.ready) await document.fonts.ready

    // Lê a largura do ATRIBUTO, não do layout: o gráfico de origem vive dentro do
    // documento de impressão, que fica `display:none` na tela — ali clientWidth é 0.
    const w = Number(svg.getAttribute('width')) || svg.clientWidth || 720
    const h = Number(svg.getAttribute('height')) || svg.clientHeight || 200

    const clone = svg.cloneNode(true) as SVGSVGElement
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    clone.setAttribute('width', String(w))
    clone.setAttribute('height', String(h))

    // Um SVG carregado como imagem é um documento ISOLADO: não enxerga a @font-face da
    // página, então a Manrope não estaria disponível e o texto cairia numa substituta
    // imprevisível. Fixamos uma pilha de fontes de sistema — presente em qualquer
    // máquina, e visualmente próxima. A tela e o PDF seguem com a Manrope de verdade.
    clone.setAttribute('style', "font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif")
    clone.querySelectorAll('text').forEach((t) => {
      t.style.fontFamily = "'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    })

    const source = new XMLSerializer().serializeToString(clone)
    // encodeURIComponent + unescape lida com acento no texto do SVG; btoa puro quebraria.
    const dataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(source)))}`

    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('svg_load_failed'))
      img.src = dataUrl
    })

    const canvas = document.createElement('canvas')
    // 2× para o gráfico não sair serrilhado quando alguém der zoom na planilha.
    canvas.width = w * scale
    canvas.height = h * scale
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

    return canvas.toDataURL('image/png')
  } catch (err) {
    // Gráfico é enfeite da planilha: falhar aqui não pode impedir a exportação dos dados.
    console.error('[svgElementToPng]', err)
    return null
  }
}
