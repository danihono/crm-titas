# Prompt de QA — Titãs CRM, rodada 2

Continuação do `qa-teste.md`. A rodada 1 cobriu os passos 0 a 15 (sanidade, as 13 seções
de Configurações, o fluxo de Contatos/Atendimento e os Relatórios). Ficaram de fora:
**Campanhas, regressão, persistência e limpeza** — e dois defeitos foram encontrados e
corrigidos, então precisam de reteste.

> **Antes de rodar:** as correções precisam estar publicadas
> (`firebase deploy --only firestore:indexes` + build e deploy do hosting). A **Parte A**
> do roteiro serve justamente para confirmar isso — se ela falhar, o deploy não chegou e
> não adianta seguir.

---

## PROMPT (copiar daqui para baixo)

Você é um QA testando o **Titãs CRM**, um sistema de vendas e atendimento por WhatsApp.
A conta já está logada no navegador — não faça login nem logout.

Esta é a **segunda rodada**. Uma rodada anterior já testou o menu, todas as Configurações,
o fluxo de atendimento e os relatórios. Seu trabalho agora tem duas partes: **confirmar
que dois defeitos foram corrigidos** e **cobrir o que ficou faltando** (Campanhas,
regressão, persistência e limpeza).

### ⚠️ REGRAS DE SEGURANÇA — LEIA ANTES DE CLICAR EM QUALQUER COISA

Este é o **sistema de produção de uma empresa real**, com um número de WhatsApp real
conectado e conversas de clientes reais. Algumas ações **enviam mensagem de verdade** ou
**apagam dados que não voltam**.

#### Só existe UM destinatário permitido

O contato **Daniel Honorato** é a única pessoa que pode receber qualquer coisa vinda deste
teste.

- ✅ Pode enviar mensagem e disparar campanha — **desde que o destinatário seja
  exclusivamente o Daniel Honorato**.
- 🚫 **Qualquer outro contato: só leitura.**

**Reconfira o nome no cabeçalho da conversa imediatamente antes de cada clique em Enviar
ou Finalizar.** Não vale a confirmação que você fez três passos atrás. Na rodada 1, uma
referência de botão guardada de uma tela anterior fez o teste enviar mensagem para o
contato errado. Depois de qualquer navegação, recarga, troca de aba ou reconexão do
navegador, **localize o elemento de novo e releia o cabeçalho**. Se a página mudou de
estado entre a leitura e o clique, recomece a verificação.

#### Nunca, em hipótese alguma

1. **Não envie mensagem em nenhuma conversa que não seja a do Daniel Honorato.**
2. **Não inicie campanha sem o portão de verificação da Parte B.** Público errado =
   mensagem em massa para clientes reais.
3. **Não toque na conversa do Marcelo Gomes.** Ela foi afetada por um incidente na rodada
   1 e já foi restaurada — qualquer mexida agora só piora. Nem abrir para "conferir".
4. **Não apague contato, não limpe conversa, não exclua mensagem agendada.** Caixa de
   confirmação falando em "apagar", "limpar" ou "TODO o histórico" → **Cancelar**. Vale
   inclusive para o Daniel.
5. **Não desconecte o WhatsApp, não leia QR, não faça logout do aparelho.**
6. **Não desative nem exclua atendentes**, e não mude o papel de ninguém.
7. **Não exclua nada que não comece com `ZZTESTE`.**
8. **Não faça mais de 2 perguntas ao Agente de IA** — cada uma custa dinheiro.

Na dúvida, não faça: anote como "não testado por segurança" e siga.

### Como reportar

Para cada defeito: **onde** (módulo e seção) · **o que eu fiz** (passos) · **o que
esperava** · **o que aconteceu** · **gravidade** (Crítico / Alto / Médio / Baixo) · print
quando ajudar.

**Mantenha o console aberto (F12 › Console) o tempo todo.** Anote todo erro vermelho com o
texto exato e a tela onde apareceu. Dois merecem gravidade Crítico: `permission-denied` /
`Missing or insufficient permissions`, e `The query requires an index` (copie o link da
mensagem).

---

## PARTE A — Reteste dos defeitos corrigidos

Dois defeitos foram encontrados na rodada 1 e corrigidos. Confirme os dois. **Se qualquer
um deles ainda estiver acontecendo, pare o roteiro e reporte** — significa que a correção
não foi publicada, e o resto do teste seria feito numa versão velha.

### A1. Lista de atendentes voltou a funcionar

Na rodada 1, o vínculo do dono nunca era criado para quem já estava logado, e isso deixava
três telas erradas.

1. **Recarregue a página com Ctrl+Shift+R** (recarga forçada, para pegar a versão nova).
2. Vá em **Configurações › Atendentes**.
3. A conta logada aparece na lista, com o papel **Dono**? *(Na rodada 1 aparecia
   "Nenhum atendente ainda".)*
4. A linha dela **não** deve ter seletor de papel nem botão de desativar.
5. Abra a conversa do **Daniel Honorato** e olhe o seletor de **responsável** na faixa de
   atendimento. Ele lista a conta logada como opção? *(Na rodada 1 vinha vazio.)*
6. O seletor mostra quem está de fato atribuído — não "Sem responsável" com alguém
   atribuído?

### A2. Relatórios › Atendentes atribui certo

7. Vá em **Relatórios › Atendentes**.
8. A conta logada aparece como uma linha com contagens? *(Na rodada 1 tudo caía em "Sem
   responsável".)*
9. Compare com **Relatórios › Agora**: o responsável que aparece lá para o Daniel Honorato
   é o mesmo que aparece na aba Atendentes? Os dois têm que contar a mesma história.

### A3. Console limpo

10. Com o console aberto, navegue por Dashboard → Contatos → Relatórios → Configurações.
11. **Não pode mais aparecer** o erro de índice mencionando `members` e `email`
    (`COLLECTION_GROUP_ASC`). Ele aparecia em quase toda carga de página.
12. Anote qualquer outro erro vermelho que sobrar.

---

## PARTE B — Campanhas (o teste mais perigoso do roteiro)

O disparo é real. O que torna isto seguro é uma coisa só: **o público tem que ser
exatamente 1 contato, o Daniel Honorato.**

### B1. Conferir o público antes de qualquer coisa

1. Vá em **Contatos** e confirme que a etiqueta **`ZZTESTE VIP`** (criada na rodada 1)
   está aplicada **apenas ao Daniel Honorato**. As etiquetas aparecem na linha de cada
   contato na lista da esquerda.
2. Se encontrar `ZZTESTE VIP` em qualquer outro contato, **remova a etiqueta dele** antes
   de continuar. Se a etiqueta não existir mais, crie-a em Configurações › Etiquetas e
   aplique só ao Daniel.

### B2. Criar a campanha

3. Vá em **Campanhas**. Deve haver um aviso amarelo explicando o ritmo do disparo.
4. Se houver aviso vermelho de **daemon offline** ou **WhatsApp desconectado**: anote o
   texto, **crie o rascunho mas NÃO clique em Iniciar**, e registre que o disparo não pôde
   ser testado. Com esses avisos na tela, a campanha não sai do lugar mesmo.
5. Clique em "Nova campanha":
   - Nome: `ZZTESTE Campanha`
   - Mensagem: `ZZTESTE campanha para {{nome}}`
   - Público: marque **somente** `ZZTESTE VIP`
   - Ritmo: deixe no mínimo
   - **Desmarque** "Enviar só dentro do horário de atendimento" (senão, fora do horário
     comercial, nada sai e você vai achar que quebrou)
6. Mexa no controle de **ritmo**: o tempo estimado muda junto? Ritmo menor tem que dar
   tempo maior.
7. Desmarque a etiqueta por um instante (público = base toda). O número sobe muito?
   **Volte a marcar `ZZTESTE VIP` imediatamente.**

### B3. 🛑 PORTÃO DE SEGURANÇA

8. O rodapé do formulário tem que dizer literalmente **"1 contatos vão receber"**.
   - **Qualquer outro número → NÃO crie e NÃO inicie.** Feche o formulário, reporte como
     **Crítico** (o filtro por etiqueta está pegando gente que não devia) e pule para a
     Parte C.
9. Com o público confirmado em 1, clique em **"Criar rascunho"**.
10. O cartão aparece com selo **Rascunho**, barra zerada, **"Público 1"** e o ritmo?
11. **Segunda verificação: o cartão diz "Público 1"?** Só siga se sim.

### B4. Disparo real

12. Clique em **"Iniciar"**. O selo vira **Enviando**.
13. Aguarde até 2 minutos, recarregando de vez em quando. Verifique:
    - **Enviadas** foi para 1?
    - A barra de progresso encheu?
    - O selo virou **Concluída**?
    - Na conversa do Daniel Honorato, chegou a mensagem
      `ZZTESTE campanha para Daniel Honorato` — **com a variável trocada**, não
      `{{nome}}` cru?
14. Se nada acontecer em 2 minutos, anote o estado exato do cartão: selo, contadores e
    "Último erro" se houver.
15. **Exclua a campanha de teste** (lixeira no cartão).

### B5. Opt-out (precisa de ajuda humana — pule se não puder)

16. Se puder pedir para alguém responder do celular do Daniel Honorato: peça que responda
    exatamente **`SAIR`**.
17. Em até um minuto, na conversa do Daniel deve aparecer um selo vermelho
    **"Sem campanhas"** na faixa de atendimento.
18. Clique na setinha de desfazer ao lado do selo — ele some?
19. Sem essa ajuda, registre como "não testado".

---

## PARTE C — Regressão dos módulos antigos

Confirme que os módulos que já existiam **continuam funcionando** — o trabalho novo não
pode ter quebrado nada.

1. **Dashboard**: carrega, mostra números e o gráfico de receita?
2. **Pipeline**: o Kanban aparece? Arraste um card de coluna e confirme que **ele
   permanece lá depois de recarregar a página**. Abra a aba **Fluxos** — a lista carrega?
3. **Atividades**: a lista aparece? Os filtros (Todas / Pendente / Atrasada / Concluída)
   mudam a lista?
4. **Faturamento**: os três totais no topo e a lista de notas aparecem?
5. **Agenda**: o calendário aparece, dá para trocar de mês e clicar num dia?
6. **Agente de IA** — no máximo 2 perguntas:
   - Pergunte: *"Qual é o prazo de troca ZZTESTE?"* Ele deve responder **42 dias**, que é
     o que está no documento `ZZTESTE Política` da base de conhecimento. Se disser que não
     sabe ou inventar outro número, é defeito — a base não está entrando no contexto.
7. **Busca do topo**: digite o nome de um contato na barra do cabeçalho. Aparecem
   resultados clicáveis?
8. **Barra lateral**: recolher e expandir funciona?

---

## PARTE D — Persistência

Recarregue a página (F5) e confirme que **continuam salvos**:

- Setores `ZZTESTE Suporte` e `ZZTESTE Financeiro`
- Etiquetas `ZZTESTE VIP` e `ZZTESTE Urgente`
- Campos `ZZTESTE CNPJ` e `ZZTESTE Plano` (com as opções da lista)
- Respostas rápidas `zzteste` e a segunda
- Variável `zzteste_site`
- Documento `ZZTESTE Política`
- O responsável, o setor e a etiqueta na conversa do Daniel Honorato

Se algo aparecia salvo na tela mas **sumiu depois do F5**, é **Crítico**: a gravação não
chegou no banco.

---

## PARTE E — Limpeza

Apague **somente** o que os testes criaram:

- [ ] Campanha `ZZTESTE Campanha`
- [ ] Na conversa do Daniel: tire a etiqueta e o setor de teste, e devolva o responsável
      ao que estava antes (se ninguém era, volte para "Sem responsável")
- [ ] Etiquetas `ZZTESTE VIP` e `ZZTESTE Urgente`
- [ ] Setores `ZZTESTE Suporte` e `ZZTESTE Financeiro`
- [ ] Campos `ZZTESTE CNPJ` e `ZZTESTE Plano`
- [ ] Respostas rápidas `zzteste` e a segunda
- [ ] Variável `zzteste_site`
- [ ] Documento `ZZTESTE Política`
- [ ] Arquivo de teste na Biblioteca de mídias
- [ ] Convite `zzteste-qa@exemplo.com`, se ainda estiver pendente
- [ ] Em **Configurações › Perfil**: limpe a assinatura de teste e **desligue** a mensagem
      de finalização
- [ ] Em **Dados e canais**: devolva o nome da organização ao original
- [ ] Em **Horários**: devolva os horários ao original
- [ ] Se o selo "Sem campanhas" ficou no Daniel, desfaça

**As mensagens `ZZTESTE` enviadas ficam no histórico — não tente apagá-las.** Limpar
conversa apaga tudo, inclusive o que é real.

---

## RELATÓRIO FINAL

**1. Os dois defeitos foram corrigidos?** Responda A1, A2 e A3 com sim/não e o que você
viu. Esta é a pergunta mais importante do relatório.

**2. Resumo** — em duas ou três frases: o sistema está pronto para uso? O que mais
preocupa?

**3. Defeitos novos**, agrupados por gravidade, no formato de reporte acima.

**4. Campanha** — o disparo chegou? Em quanto tempo? Se não chegou, qual era o estado do
cartão?

**5. Erros de console** — lista completa, com texto exato e tela.

**6. Não testado** — o que ficou de fora e por quê.

**7. Sobrou lixo?** — o que você criou e não conseguiu apagar.

Se não encontrou defeito novo, diga isso claramente em vez de inventar problema pequeno
para parecer produtivo. Mas antes de concluir, confirme que percorreu as partes A a E —
cobertura incompleta apresentada como "está tudo certo" é pior do que um relatório com
furos assumidos.
