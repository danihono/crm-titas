# Módulos de atendimento (inspirados no Umbler Talk)

Leitura dos módulos do Umbler Talk (Conversas, Contatos, Boards de contatos, Chatbots,
Agentes de IA, Campanhas, Relatórios, Configurações) e o que faz sentido trazer para o
Titãs CRM — com o nosso modelo de dados, o nosso visual e as nossas limitações reais.

## Decisões que valem para tudo

**Contatos e Conversas ficam na MESMA tela.** O Umbler separa; nós não. A lista da
esquerda de `/contatos` já é a caixa de entrada — ela ganha as abas de estado do
atendimento em vez de virar uma página nova. Todo o resto do plano respeita isso.

**O gargalo real não é UI, é o modelo de dados.** Hoje `users/{uid}/...` significa
"1 usuário do Auth = 1 tenant" (ver `src/lib/paths.ts` e `firestore.rules`). Metade dos
módulos do Umbler — Atendentes, Setores, atribuição de conversa, relatório por atendente —
só existe se várias contas do Auth puderem compartilhar o MESMO tenant. Por isso a Fase 0
vem antes de qualquer tela bonita: sem ela, "Atendentes" é uma lista decorativa.

**O que NÃO copiamos, e por quê:**

| Módulo do Umbler | Decisão |
|---|---|
| Créditos | Fora. É o modelo comercial deles (cobrança por mensagem), não nosso. |
| Templates WhatsApp (HSM) | Fora. São da Cloud API oficial da Meta. Rodamos Baileys (WhatsApp Web), onde template aprovado não existe. Nosso equivalente é "Respostas rápidas" + variáveis. |
| Formulários do WhatsApp | Fora, mesma razão — recurso da API oficial. |
| Canais de atendimento (multi-canal) | Parcial. Só temos WhatsApp via daemon; a tela existe, mas lista um canal. |
| Tokens de acesso (API pública) | Adiado. Só compensa quando houver integração externa pedindo. |

**Aviso honesto sobre Campanhas:** disparo em massa por uma conexão não-oficial
(Baileys) é a via mais rápida de tomar ban no número. Fica com throttle forte por
decisão explícita: teto por hora, intervalo aleatório entre envios, aquecimento
progressivo e opt-out automático. Envio lento é característica, não defeito.

## Estado

| Fase | Situação |
|---|---|
| 0 — Multi-seat | **Feita.** members, papéis, convite por e-mail, regras por vínculo. |
| 1 — Atendimento em Contatos | **Feita.** abas, responsável, setor, etiquetas, histórico de ciclos. |
| 2 — Configurações | **Feita**, menos Boards de contatos (ver abaixo). |
| 3 — Relatórios | **Feita.** Geral, Agora, por atendente/setor/etiqueta. Sem CSAT. |
| 4 — Campanhas | **Feita**, com throttle, aquecimento, cota e opt-out. |
| 5 — Chatbots e bases de conhecimento | **Não feita.** |

Também ficou de fora, dentro de fases entregues:

- **Boards de contatos** (Kanban de contatos reaproveitando `KanbanBoard`).
- **Avaliação (CSAT)** — o campo `rating` já existe em `ConversationRecord`, mas nada
  o preenche: falta mandar a pergunta ao finalizar e ler a nota da resposta.
- **Mensagem de ausência** fora do horário: o texto é configurável e
  `isWithinBusinessHours` já decide a janela, mas só as campanhas respeitam o horário —
  responder automaticamente depende do motor de chatbot da Fase 5.
- **Saudação do setor** ao transferir: idem, o texto é gravado e ainda não é enviado.

## Fases

### Fase 0 — Multi-seat (fundação)

Várias contas dentro de um tenant, com papéis.

- `users/{tenantUid}/members/{memberUid}` — `{ name, email, role, sectorIds, active }`.
  Papéis: `dono` (tudo), `gestor` (tudo menos faturamento/configurações sensíveis),
  `atendente` (conversas atribuídas + contatos).
- `invites/{emailMinusculo}` (top-level) — `{ tenantUid, role, sectorIds }`. O convidado
  lê só o convite endereçado ao e-mail dele; a callable `aceitarConvite` cria o
  `members/{uid}` com o Admin SDK (o cliente não escreve no tenant alheio).
- `firestore.rules`: troca `owner(uid)` por `owner(uid) || isMember(uid)`, via
  `exists(/users/$(uid)/members/$(request.auth.uid))`.
- `tenantStore` passa a resolver o tenant por vínculo, não só por `auth.uid`.

### Fase 1 — Atendimento dentro de Contatos

O estado do atendimento vive no próprio doc do contato (a lista continua uma consulta só):

```
conv: { status: 'entrada' | 'esperando' | 'finalizado',
        assignedTo, sectorId, tagIds[], openedAt, firstResponseAt, closedAt }
```

- Abas **Entrada · Esperando · Finalizados** na lista da esquerda, com filtro por
  atendente/setor/etiqueta.
- Atribuir a um atendente, mover de setor, etiquetar, finalizar e reabrir.
- Cada ciclo aberto→finalizado grava um registro em `users/{uid}/conversations/{convId}`
  — é dele que os Relatórios vivem. Sem esse histórico, "conversas finalizadas no
  período" não tem como ser respondido. Coleção plana do tenant de propósito: aninhada
  sob o contato, o relatório viraria `collectionGroup`, e aí a regra teria de se apoiar
  em `resource.data` — o que não fecha para atendente convidado.
- O daemon reabre a conversa (`entrada`) quando chega mensagem em contato finalizado.

### Fase 2 — Configurações

Área nova (`/configuracoes`) com sub-navegação, espelhando o que faz sentido:
Perfil · Atendentes · Setores · Etiquetas · Horários de atendimento ·
Respostas rápidas · Campos personalizados · Canais · Dados cadastrais.

Também entra aqui **Boards de contatos** — é o nosso Kanban já pronto
(`KanbanBoard`) apontando para contatos em vez de negócios. Barato e de bom efeito.

### Fase 3 — Relatórios

`/relatorios` sobre os dados da Fase 1: total de conversas, abertas, finalizadas,
tempo de primeira resposta, tempo de finalização; recortes por atendente, setor e
etiqueta; aba "Agora" (fila viva). Avaliação (CSAT) é viável: mandar a pergunta ao
finalizar e ler a nota da resposta.

### Fase 4 — Campanhas

`users/{uid}/campaigns/{id}` + `campaigns/{id}/targets/{contactId}` com status por
destinatário. Público montado por filtro (etiqueta, setor, origem). Disparo pelo
daemon reaproveitando o `scheduler.ts`, com throttle forte e opt-out.

### Fase 5 — Chatbots e Bases de conhecimento

Os **Fluxos** que já existem (`src/components/flows`, `@xyflow/react`) hoje são só
desenho. Virar chatbot = executá-los no daemon quando chega mensagem, com nós de
condição/resposta/transferência-para-humano. O **Agente de IA** ganha base de
conhecimento e passa a poder responder a conversa e devolver para um humano.
É a fase de maior valor e a de maior trabalho — por isso vem por último.
