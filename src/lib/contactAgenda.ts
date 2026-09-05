import type { Activity, Contact, EventDoc } from '../types'

/**
 * O que liga a AGENDA e as ATIVIDADES a uma CONVERSA.
 *
 * Funções puras, sem React: o que erra aqui é casamento de registro, e isso se
 * testa no Node — não olhando a tela.
 *
 * A regra do casamento é a parte que importa. `contactId` só existe nos
 * registros criados depois deste campo; tudo o que veio antes guarda apenas o
 * NOME em `Activity.contact`. Casar só por id deixaria a aba vazia para quem já
 * usa o sistema, e casar só por nome erraria em dois clientes homônimos. Então:
 * id manda quando existe, nome é a rede de segurança para o histórico.
 */

/** Nomes pelos quais um contato pode aparecer em `Activity.contact`. */
function apelidos(contact: Contact): string[] {
  return [contact.company, contact.name]
    .map((v) => (v ?? '').trim().toLowerCase())
    .filter(Boolean)
}

export function daConversa(a: Activity, contact: Contact): boolean {
  // Vínculo explícito é definitivo, para os dois lados: uma atividade amarrada a
  // OUTRO contato não pode voltar por semelhança de nome.
  if (a.contactId) return a.contactId === contact.id
  return apelidos(contact).includes((a.contact ?? '').trim().toLowerCase())
}

export function eventoDaConversa(e: EventDoc, contact: Contact): boolean {
  if (e.contactId) return e.contactId === contact.id
  const nomes = apelidos(contact)
  const sub = (e.subtitle ?? '').toLowerCase()
  return nomes.some((n) => sub.startsWith(n))
}

export interface AgendaDoContato {
  /** Em aberto, da mais próxima para a mais distante — inclui as atrasadas. */
  abertas: Activity[]
  /** Concluídas, da mais recente para a mais antiga. */
  concluidas: Activity[]
  /** Quantas em aberto já passaram do prazo. */
  atrasadas: number
}

export function agendaDoContato(activities: Activity[], contact: Contact, agora = new Date()): AgendaDoContato {
  const minhas = activities.filter((a) => daConversa(a, contact))
  const abertas = minhas.filter((a) => !a.done).sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())
  const concluidas = minhas.filter((a) => a.done).sort((a, b) => b.dueAt.getTime() - a.dueAt.getTime())
  return {
    abertas,
    concluidas,
    atrasadas: abertas.filter((a) => a.dueAt.getTime() < agora.getTime()).length,
  }
}
