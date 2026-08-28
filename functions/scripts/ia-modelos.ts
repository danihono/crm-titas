/**
 * Lista os modelos que ESTA chave enxerga.
 *
 * Existe porque modelo do Gemini sai de linha: o `gemini-2.5-flash-lite` que
 * estava aqui virou 404 ("no longer available to new users") e a resposta certa
 * não é chutar o próximo nome — é perguntar à API.
 *
 * Uso:  GEMINI_API_KEY=... npm run ia:modelos
 */
import { GoogleGenAI } from '@google/genai'

const apiKey = process.env.GEMINI_API_KEY
if (!apiKey) {
  console.error('Falta GEMINI_API_KEY no ambiente.')
  process.exit(1)
}

async function main() {
  const ai = new GoogleGenAI({ apiKey })
  const nomes: string[] = []
  for await (const m of await ai.models.list()) {
    nomes.push(String(m.name ?? '').replace('models/', ''))
  }
  // Só os de texto: a lista completa vem cheia de imagem, áudio e vídeo.
  const texto = nomes
    .filter((n) => /flash|pro|lite/.test(n))
    .filter((n) => !/embed|image|tts|live|native|audio|vision|veo|lyria|banana/.test(n))
    .sort()
  console.log(texto.join('\n'))
  console.log(`\n${texto.length} modelos de texto · ${nomes.length} no total`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
