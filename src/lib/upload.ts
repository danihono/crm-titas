/**
 * Regras de upload compartilhadas entre todos os caminhos que mandam arquivo ao Storage.
 *
 * Existe porque cada tela validava (ou não) o que queria: `uploadContactFile` não olhava
 * tamanho nem tipo e interpolava o nome do arquivo cru no caminho; a biblioteca e a foto de
 * contato mandavam sem `contentType`, então o Storage gravava o que o navegador dissesse —
 * ou `application/octet-stream`. Com isso dava para hospedar HTML, SVG ou executável no
 * bucket do cliente e servi-los pela URL do Firebase.
 *
 * A lista abaixo espelha `anexo()` em storage.rules. As duas andam juntas: aqui é para a
 * pessoa ver um erro em português; lá é a trava de verdade.
 */

/** Teto do navegador. O mesmo número está em storage.rules. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

/** Teto de imagem de perfil/marca — bem menor, e também espelhado nas regras. */
export const MAX_IMAGEM_BYTES = 2 * 1024 * 1024

const IMAGEM = /^image\/(png|jpe?g|gif|webp|heic|heif)$/i
const VIDEO = /^video\/(mp4|quicktime|webm|3gpp)$/i
const DOCUMENTO = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
]

export function ehImagem(mime: string): boolean {
  return IMAGEM.test(mime)
}

/**
 * SVG fica FORA das imagens de propósito: é XML e carrega script. Um SVG hospedado no
 * bucket e aberto pela URL de download roda no domínio do Firebase Storage.
 */
export function ehAnexoAceito(mime: string): boolean {
  return ehImagem(mime) || /^audio\//i.test(mime) || VIDEO.test(mime) || DOCUMENTO.includes(mime.toLowerCase())
}

/**
 * Nome seguro para compor o caminho no Storage: sem acento, sem espaço, sem barra.
 *
 * Barra num nome de arquivo vira PASTA no Storage — é assim que um upload sai do prefixo
 * que as regras confinam.
 */
export function safeFileName(name: string): string {
  return (
    name
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w.-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 120) || 'arquivo'
  )
}

/**
 * Valida o arquivo e devolve o contentType a gravar.
 *
 * Nunca devolve `application/octet-stream`: as regras recusam justamente esse valor, porque
 * é o que um upload sem tipo declarado vira — e um arquivo sem tipo é um arquivo cujo
 * conteúdo ninguém conferiu.
 */
export function validarAnexo(file: File, maxBytes = MAX_UPLOAD_BYTES): string {
  if (file.size >= maxBytes) {
    throw new Error(`Arquivo grande demais: o limite é ${Math.floor(maxBytes / 1024 / 1024)} MB.`)
  }
  const mime = (file.type || '').toLowerCase()
  if (!mime) {
    throw new Error('Não foi possível identificar o tipo deste arquivo. Converta para PDF ou imagem e tente de novo.')
  }
  if (!ehAnexoAceito(mime)) {
    throw new Error('Tipo de arquivo não aceito. Envie imagem, áudio, vídeo, PDF, documento do Office, TXT ou CSV.')
  }
  return mime
}

/** Mesma validação, restrita a imagem (foto de perfil, avatar de contato, logo). */
export function validarImagem(file: File, maxBytes = MAX_IMAGEM_BYTES): string {
  if (file.size >= maxBytes) {
    throw new Error(`A imagem precisa ter no máximo ${Math.floor(maxBytes / 1024 / 1024)} MB.`)
  }
  const mime = (file.type || '').toLowerCase()
  if (!ehImagem(mime)) {
    throw new Error('Escolha uma imagem PNG, JPG, GIF, WEBP ou HEIC.')
  }
  return mime
}
