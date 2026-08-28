/**
 * Exercita as chamadas de IA contra a API DE VERDADE.
 *
 * Não é teste de unidade: bate no Gemini, gasta token (centavos) e serve para
 * responder a única pergunta que importa antes de publicar — o modelo barato dá
 * conta das duas tarefas? A do chat é fácil; a do fluxograma é a que quebra.
 *
 * Uso:  GEMINI_API_KEY=... npm run ia:teste
 * Trocar de modelo sem editar código:  TITA_MODEL=gemini-2.5-flash npm run ia:teste
 */
import { perguntar, montarFluxo, MODEL, FLOW_MODEL, type FluxoGerado } from '../src/ia'

const apiKey = process.env.GEMINI_API_KEY
if (!apiKey) {
  console.error('Falta GEMINI_API_KEY no ambiente.')
  process.exit(1)
}

const out: string[] = []
const ok = (n: string, c: boolean, extra = '') =>
  out.push(`${c ? '✔' : '✘'} ${n}${extra ? ` — ${extra}` : ''}`)

/** O system que o CRM manda de verdade, encurtado. */
const SYSTEM_CRM = [
  'Você é o Titã IA, assistente comercial dentro de um CRM brasileiro.',
  'Responda em português do Brasil, objetivo, sem enrolação.',
  'Dados do CRM: 11 negócios ativos somando R$ 257.500; ticket médio R$ 23.409;',
  'R$ 31.000 em notas vencidas; 4 leads novos aguardando primeiro contato.',
].join(' ')

async function main() {
  console.log(`chat=${MODEL}  fluxo=${FLOW_MODEL}\n`)

  // --- 1. Pergunta simples, em português -----------------------------------
  const r1 = await perguntar(apiKey!, {
    system: SYSTEM_CRM,
    question: 'Quanto tenho em notas vencidas e o que devo priorizar hoje?',
  })
  ok('responde a pergunta do CRM', r1.length > 20)
  ok('responde em português', /[ãõçáéíóú]/i.test(r1))
  ok('usa o dado do system, não inventa', r1.includes('31'), `"${r1.slice(0, 90)}..."`)

  // --- 2. Histórico: precisa lembrar do turno anterior ----------------------
  const r2 = await perguntar(apiKey!, {
    system: SYSTEM_CRM,
    history: [
      { role: 'user', content: 'O cliente mais importante é a Atlas Cloud.' },
      { role: 'assistant', content: 'Entendi, a Atlas Cloud é a prioridade.' },
    ],
    question: 'Qual cliente eu disse que é o mais importante?',
  })
  ok('mantém o histórico da conversa', /atlas/i.test(r2), `"${r2.slice(0, 70)}"`)

  // --- 3. O gerador de fluxo: a parte que costuma quebrar -------------------
  const f: FluxoGerado = await montarFluxo(
    apiKey!,
    'Atendimento de um lead que chegou pelo WhatsApp até fechar a venda, passando por qualificação e proposta. Se o lead não responder em 2 dias, encerrar.',
  )
  const nodes = f.nodes as { id: string; title: string; kind: string; subtitle: string }[]
  const edges = f.edges as { from: string; to: string; label: string }[]

  ok('fluxo tem nome', !!f.name && f.name !== 'Fluxo gerado', `"${f.name}"`)
  ok(`gera etapas suficientes (${nodes.length})`, nodes.length >= 5)
  ok(`gera as setas (${edges.length})`, edges.length >= nodes.length - 1)
  ok('tem exatamente uma etapa "start"', nodes.filter((n) => n.kind === 'start').length === 1)
  ok('tem pelo menos uma etapa "end"', nodes.some((n) => n.kind === 'end'))
  ok('usa "decision" no ponto de ramificação', nodes.some((n) => n.kind === 'decision'))

  // Coerência do grafo — é aqui que modelo barato costuma entregar lixo que
  // valida no schema: seta apontando para id inexistente, etapa órfã.
  const ids = new Set(nodes.map((n) => n.id))
  ok('nenhuma seta aponta para etapa inexistente',
    edges.every((e) => ids.has(e.from) && ids.has(e.to)))
  const ligados = new Set(edges.flatMap((e) => [e.from, e.to]))
  const orfas = nodes.filter((n) => !ligados.has(n.id))
  ok(`nenhuma etapa solta (${orfas.length})`, orfas.length === 0,
    orfas.map((n) => n.title).join(', '))
  const semSaida = nodes.filter((n) => n.kind !== 'end' && !edges.some((e) => e.from === n.id))
  ok(`toda etapa não-final tem saída (${semSaida.length})`, semSaida.length === 0,
    semSaida.map((n) => n.title).join(', '))
  ok('a decisão rotula as saídas',
    nodes.filter((n) => n.kind === 'decision').every((n) =>
      edges.filter((e) => e.from === n.id).every((e) => e.label.trim().length > 0)))
  ok('títulos são concretos, não "Etapa 2"',
    !nodes.some((n) => /^etapa \d+$/i.test(n.title.trim())))
  // Checar acento aqui seria asserção errada: "Enviar Proposta" é português
  // perfeito e não tem nenhum. O sinal honesto são as palavras de ligação.
  const textoFluxo = [f.name, ...nodes.map((n) => `${n.title} ${n.subtitle}`)].join(' ')
  ok('fluxo escrito em português',
    /\b(de|da|do|para|com|sem|em|no|na|pelo|pela|ao|e|ou|se|que)\b/i.test(textoFluxo))
  ok('não vazou inglês',
    !/\b(the|and|with|from|customer|send|close|deal|step|flow)\b/i.test(textoFluxo))

  console.log('FLUXO GERADO:')
  console.log(nodes.map((n) => `  [${n.kind}] ${n.id} · ${n.title}${n.subtitle ? ` — ${n.subtitle}` : ''}`).join('\n'))
  console.log(edges.map((e) => `  ${e.from} →${e.label ? ` (${e.label})` : ''} ${e.to}`).join('\n'))
  console.log()
}

main()
  .then(() => {
    console.log(out.join('\n'))
    process.exit(out.some((l) => l.startsWith('✘')) ? 1 : 0)
  })
  .catch((err) => {
    console.log(out.join('\n'))
    console.error('\n✘ ESTOUROU:', err instanceof Error ? err.message : err)
    process.exit(1)
  })
