import { GoogleGenAI } from '@google/genai'
async function main() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  const page = await ai.models.list()
  const nomes: string[] = []
  for await (const m of page) nomes.push(String(m.name ?? '').replace('models/', ''))
  console.log(nomes.filter((n) => /flash|pro|lite/.test(n) && !/embed|image|tts|live|native|audio|vision/.test(n)).sort().join('\n'))
}
main()
