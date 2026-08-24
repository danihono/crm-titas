# Prompt de QA — Titãs CRM

Prompt para colar num agente de navegador (Claude no Chrome) fazer o teste de ponta a
ponta do CRM. A conta já estará logada.

> **Atenção antes de usar:** este roteiro assume que o teste roda no **sistema de
> produção**, com WhatsApp real conectado e contatos reais. Por isso a seção de regras
> não é enfeite — sem ela, um agente de QA "explorando a interface" manda mensagem para
> cliente de verdade e apaga histórico que não volta.
>
> O roteiro usa **Daniel Honorato** como único destinatário permitido. Se o contato de
> teste tiver outro nome, troque em todas as ocorrências antes de usar o prompt.

---

## PROMPT (copiar daqui para baixo)

Você é um QA testando o **Titãs CRM**, um sistema de vendas e atendimento por WhatsApp.
A conta já está logada no navegador — não faça login nem logout.

Seu trabalho é percorrer o sistema inteiro, verificar se cada função faz o que promete, e
me entregar um relatório de defeitos no fim. Seja cético: teste o que a tela diz que faz,
não o que você imagina que ela faria.

### ⚠️ REGRAS DE SEGURANÇA — LEIA ANTES DE CLICAR EM QUALQUER COISA

Este é o **sistema de produção de uma empresa real**, com um número de WhatsApp real
conectado e conversas de clientes reais. Algumas ações da interface **enviam mensagem de
verdade** ou **apagam dados que não voltam**.

#### A regra que governa tudo: só existe UM destinatário permitido

Existe um contato de teste chamado **Daniel Honorato**. Ele é a única pessoa que pode
receber qualquer coisa vinda deste teste.

- ✅ **Pode enviar mensagem, finalizar conversa e disparar campanha — desde que o
  destinatário seja exclusivamente o Daniel Honorato.**
- 🚫 **Qualquer outro contato: só leitura.** Abrir a conversa e olhar é permitido; enviar,
  finalizar ou incluir em campanha, não.

Antes de **cada** envio, confirme no cabeçalho da conversa que o nome é **Daniel
Honorato**. Se tiver qualquer dúvida sobre em qual conversa você está, não envie.

#### Nunca, em hipótese alguma

1. **Não envie mensagem em nenhuma conversa que não seja a do Daniel Honorato.** Cada
   envio chega no celular de uma pessoa real.
2. **Não inicie uma campanha sem antes confirmar que o público é exatamente 1 contato e
   que esse contato é o Daniel Honorato.** O roteiro te dá o passo a passo dessa
   verificação — ela não é opcional. Público errado = mensagem em massa para clientes.
3. **Não apague contato, não limpe conversa, não exclua mensagem agendada.** São dados
   reais e irreversíveis. Qualquer caixa de confirmação falando em "apagar", "limpar" ou
   "TODO o histórico" → **clique em Cancelar**. Isso vale inclusive para o Daniel.
4. **Não desconecte o WhatsApp, não leia QR, não faça logout do aparelho.** Derrubar a
   conexão para a operação inteira.
5. **Não desative nem exclua atendentes existentes**, e não mude o papel de ninguém.
6. **Não exclua nada que você não tenha criado** — setor, etiqueta, campo, resposta
   rápida, variável, documento, arquivo, negócio, atividade, nota, fluxo, contato.
7. **Não faça mais de 2 perguntas ao Agente de IA.** Cada pergunta custa dinheiro.

**Se uma ação parecer arriscada e não estiver claramente permitida abaixo: não faça.
Anote como "não testado por segurança" e siga em frente.** Prefira reportar cobertura
incompleta a causar estrago.

### Convenção para os dados que você criar

Tudo que você criar deve começar com **`ZZTESTE`** no nome (ex.: setor `ZZTESTE Suporte`,
etiqueta `ZZTESTE VIP`, variável `zzteste_site`). Isso deixa óbvio o que é lixo de teste.

**No fim do roteiro, apague tudo que você criou** — e só isso. Se algo não puder ser
apagado, registre no relatório.

### Como reportar

Para cada defeito encontrado, registre:

- **Onde**: módulo e seção (ex.: "Configurações › Setores")
- **O que eu fiz**: passos exatos
- **O que esperava**
- **O que aconteceu**
- **Gravidade**: Crítico (impede o uso / perde dado) · Alto (função não funciona) ·
  Médio (funciona mal ou confunde) · Baixo (visual, texto)
- **Print** da tela, quando ajudar

**Mantenha o console do navegador aberto (F12 › Console) o tempo todo.** Anote qualquer
erro em vermelho, com o texto exato. Dois tipos importam muito:

- Erro contendo **`permission-denied`** ou **`Missing or insufficient permissions`** →
  reporte como **Crítico** e diga em que tela apareceu.
- Erro contendo **`The query requires an index`** → reporte como **Crítico** e copie o
  link que aparece na mensagem.

---

## ROTEIRO

### 0. Sanidade inicial

1. Abra o sistema. A página carrega sem tela branca?
2. O menu lateral esquerdo deve ter **10 itens**, nesta ordem: Dashboard, Pipeline,
   Contatos, Atividades, Faturamento, Agenda, Agente de IA, **Campanhas**, **Relatórios**,
   **Configurações**.
   - Se **Campanhas, Relatórios ou Configurações não aparecerem**, pare tudo e reporte
     imediatamente: a versão publicada está velha. Não adianta seguir o roteiro.
3. Clique em cada um dos 10 e confirme que a página abre sem erro.
4. Teste o botão de recolher/expandir a barra lateral (a setinha no topo).

### 1. Configurações › Perfil

1. Preencha **Nome**, **Telefone** e **Assinatura** (use `— ZZTESTE`).
2. O botão "Salvar perfil" deve estar **desabilitado** enquanto nada mudou, e habilitar
   ao editar. Confere?
3. Salve. Aparece "Salvo."?
4. **Recarregue a página (F5)** e volte em Perfil. Os valores continuam lá?
5. Ligue "Enviar mensagem ao finalizar a conversa". Aparece um campo de texto novo?
   Escreva algo e salve. **Depois desligue de novo e salve** — não queremos mensagem
   automática saindo para cliente.
6. No fim, limpe a assinatura de teste e salve.

### 2. Configurações › Preferências pessoais

1. Desligue e religue "Aviso na área de trabalho" e "Som ao receber mensagem".
2. Recarregue a página. O estado dos interruptores foi mantido?
3. Repare na linha sobre autorização do navegador — ela diz "autorizado", "não autorizou"
   ou "bloqueadas"? Só descreva o que aparece, **não clique em Autorizar**.

### 3. Configurações › Atendentes

1. A lista mostra pelo menos a sua conta, com o papel **Dono**?
2. Confirme que a sua própria linha **não** tem seletor de papel nem botão de desativar
   (o dono não pode se rebaixar).
3. Convide `zzteste-qa@exemplo.com` como **Atendente**.
4. Ele aparece em "Convites aguardando aceite"?
5. O texto de ajuda embaixo do seletor muda quando você troca entre Atendente e Gestor?
6. **Cancele o convite** que você criou (o X na linha dele).

### 4. Configurações › Setores

1. Crie o setor **`ZZTESTE Suporte`**, escolhendo uma cor.
2. Ele aparece na lista com a bolinha da cor certa?
3. Clique no ícone de balão para abrir "Mensagem de boas-vindas", escreva um texto e
   salve. O texto aparece resumido na linha?
4. Crie um segundo: **`ZZTESTE Financeiro`**.
5. Tente criar um com o nome vazio — o botão "Adicionar" deve estar desabilitado.

### 5. Configurações › Horários

1. No canto do cartão aparece "Atendendo agora" ou "Fora do horário"? Bate com o horário
   real de agora e com os dias marcados?
2. Desmarque um dia. Os campos de hora dele ficam apagados/desabilitados?
3. Mude um horário. O botão "Salvar horários" habilita?
4. Salve, recarregue a página, confira se manteve. **Depois devolva os horários ao que
   estavam antes** e salve.

### 6. Configurações › Etiquetas

1. Crie **`ZZTESTE VIP`** e **`ZZTESTE Urgente`**, com cores diferentes.
2. Elas aparecem como chips coloridos?
3. Tente criar com nome vazio — botão deve ficar desabilitado.

> `ZZTESTE VIP` vai ser usada mais à frente para montar o público da campanha. Ela
> **só pode ser aplicada ao Daniel Honorato** — em nenhum outro contato.

### 7. Configurações › Campos personalizados

1. Crie um campo `ZZTESTE CNPJ` do tipo **Texto**.
2. Crie um campo `ZZTESTE Plano` do tipo **Lista de opções** — ao escolher "Lista", deve
   aparecer um campo extra para as opções. Preencha `Bronze, Prata, Ouro`.
3. A linha da lista mostra as opções separadas por vírgula?

### 8. Configurações › Biblioteca de mídias

1. Clique em "Enviar arquivo" e suba uma imagem pequena (menos de 10 MB).
2. Ela aparece na lista com ícone, tamanho e "há poucos segundos"?
3. Clique no ícone de abrir (seta) — abre o arquivo numa aba nova?
4. Se tiver um arquivo **maior que 10 MB** à mão, tente subir: deve aparecer uma mensagem
   explicando o limite, **não** um erro cru.
5. Apague o arquivo de teste.

### 9. Configurações › Respostas rápidas

1. Crie uma com atalho **`zzteste`**, título `ZZTESTE Saudação` e texto:
   `Olá {{nome}}! Aqui é {{atendente}}, da {{empresa}}.`
2. Tente criar **outra com o mesmo atalho** — deve avisar que já existe e bloquear.
3. Teste a normalização: crie uma com atalho digitado como `/ZZ Teste 2` — ele deve ser
   salvo limpo (minúsculo, sem barra, sem espaço).

### 10. Configurações › Variáveis

1. Confira que existem três variáveis automáticas listadas: `{{nome}}`, `{{empresa}}`,
   `{{atendente}}`.
2. Crie a variável `zzteste_site` com valor `titas.com.br`.
3. Tente criar outra com a **mesma chave** — deve avisar e bloquear.
4. Tente criar uma com a chave `nome` — deve bloquear (conflita com a automática).

### 11. Configurações › Bases de conhecimento

1. Crie um documento: título `ZZTESTE Política`, conteúdo com algumas frases inventadas e
   fáceis de reconhecer (ex.: "O prazo de troca ZZTESTE é de 42 dias").
2. O contador "N em uso" no canto subiu?
3. Clique no interruptor para desligar o documento. Ele fica cinza e o contador cai?
4. Religue.
5. Clique em editar (lápis), mude o texto, salve. O resumo na linha atualizou?

### 12. Configurações › Agendamentos

1. A lista mostra os agendamentos existentes (ou "Nenhuma mensagem agendada")?
2. O contador "N na fila" bate com quantos estão marcados como "Agendada"?
3. **Não cancele nenhum agendamento.**

### 13. Configurações › Dados e canais

1. Preencha o "Nome da organização" com `ZZTESTE Titãs` e salve. Recarregue e confira.
2. Em "Canais de atendimento", o cartão de WhatsApp mostra o status da conexão e se o
   daemon está no ar? Anote exatamente o que diz.
3. Devolva o nome da organização ao valor anterior (ou deixe vazio, se estava vazio).

### 14. Contatos + Atendimento — o módulo mais importante

**Todo este bloco é feito na conversa do Daniel Honorato.** Localize-o pela busca e
confirme o nome no cabeçalho antes de continuar.

1. Abra **Contatos**. Acima da lista devem existir três abas: **Entrada · Esperando ·
   Finalizados**, cada uma com um contador.
2. Clique nas três. A lista muda? Os contadores batem com a quantidade de linhas?
3. Abra a conversa do **Daniel Honorato**. Logo abaixo do nome deve haver uma **faixa de
   atendimento** com: um selo de estado, seletor de responsável, seletor de setor, botão
   de etiquetar, e à direita "Esperando" e "Finalizar".
4. **Assumir**: se aparecer o botão "Assumir", clique. O seletor de responsável passa a
   mostrar seu nome? Na lista da esquerda, o nome do responsável aparece na linha do
   contato?
5. **Setor**: escolha `ZZTESTE Suporte` no seletor. Ficou salvo?
6. **Etiqueta**: clique em "Etiquetar", marque `ZZTESTE VIP`. O chip aparece na faixa
   **e** na linha da lista? Clique de novo para desmarcar — some dos dois lugares?
   **Marque de volta e deixe marcada** — a campanha vai usar essa etiqueta.
7. **Esperando**: clique em "Esperando". O selo muda? O contato **sai da aba Entrada e
   aparece na aba Esperando**? Os contadores acompanharam?
8. Clique em "Voltar à entrada". Volta para a aba Entrada?
9. **Busca**: digite parte do nome de um contato no campo de busca. Deve aparecer o aviso
   "Buscando em todas as abas do atendimento" e as abas somem. A busca acha contatos que
   estão em abas diferentes da atual?
10. Limpe a busca — as abas voltam?
11. **Resposta rápida**: com a conversa do Daniel aberta, clique no campo de mensagem e
    digite só `/`. Deve abrir uma lista com a resposta `zzteste` que você criou. Use as
    **setas** para navegar e **Enter** (ou clique) para escolher. O texto entra no campo
    **com as variáveis já trocadas** — deve aparecer **Daniel Honorato**, não `{{nome}}`.
12. Confira que `{{atendente}}` virou o nome que você salvou no Perfil.
13. Digite `/zzz` (que não existe) — a lista não deve aparecer, e o Enter deve voltar a
    ser o Enter normal do campo. Apague o `/zzz` antes de seguir.

#### 14b. Envio real — só no Daniel Honorato

14. **Confirme mais uma vez que o cabeçalho da conversa diz "Daniel Honorato".**
15. Escreva `ZZTESTE mensagem 1` e envie (Enter ou o botão verde).
16. A mensagem aparece na conversa, do lado direito (enviada)? Aparece o horário?
17. **Se você configurou uma assinatura no Perfil**, ela deveria vir colada no fim da
    mensagem enviada. Veio? (Se você limpou a assinatura no passo 1, ignore.)
18. Escreva `Oi {{nome}}, aqui é {{atendente}}` **manualmente** (sem usar a resposta
    rápida) e envie. A mensagem que aparece na conversa deve estar **com as variáveis
    trocadas** — variável escrita à mão também tem que funcionar.
19. A linha do Daniel na lista da esquerda atualizou o "última mensagem" e o horário?

#### 14c. Finalizar e reabrir — só no Daniel Honorato

20. Volte em **Configurações › Perfil**, ligue "Enviar mensagem ao finalizar a conversa",
    escreva `ZZTESTE despedida` e salve.
21. Volte na conversa do Daniel e clique em **Finalizar**.
22. A mensagem `ZZTESTE despedida` foi **enviada na conversa** (aparece como mensagem
    enviada)? Ela precisa aparecer **antes** de a conversa fechar.
23. O selo mudou para "Finalizado"? O contato **saiu da aba Entrada e apareceu em
    Finalizados**?
24. Com a conversa finalizada, os seletores de responsável e setor ficaram desabilitados,
    e no lugar de "Finalizar" apareceu **"Reabrir atendimento"**?
25. **Teste importante:** saia da conversa, entre em outro contato, e volte para o Daniel.
    A conversa **continua Finalizada**? (Só abrir para reler não pode reabrir sozinho.)
26. Clique em **Reabrir atendimento**. Volta para a aba Entrada com selo "Em atendimento"?
27. Volte em Configurações › Perfil e **desligue** a mensagem de finalização.

#### 14d. Painéis

28. Teste as abas do painel direito: **Mensagens**, **Informações**, **Arquivos**. Todas
    abrem?

### 15. Relatórios

1. Abra **Relatórios**. Devem existir 5 abas: Geral, Agora, Atendentes, Setores,
   Etiquetas; e três botões de período: 7, 30 e 90 dias.
2. **Geral**: cinco indicadores — Total de conversas, Em aberto, Finalizadas, Primeira
   resposta, Tempo até finalizar.
   - Como você atendeu, respondeu e finalizou a conversa do Daniel no passo 14,
     **"Total de conversas" e "Finalizadas" não podem estar zerados**, e "Primeira
     resposta" tem que mostrar um tempo (não "—"). Se estiverem zerados, é defeito: o
     ciclo de atendimento não está sendo gravado.
   - Números pequenos são normais (o histórico começou agora). O que **não** é normal é a
     tela quebrar, ficar carregando para sempre, ou mostrar `NaN` / `Invalid Date` /
     `undefined`.
3. Troque entre 7, 30 e 90 dias. Os números mudam ou pelo menos recarregam?
4. **Agora**: mostra "Na fila", "Em atendimento", "Esperando" e a lista de conversas
   abertas. O Daniel Honorato aparece com o **seu nome** como responsável?
5. **Atendentes**: sua conta aparece com contagens? Existe uma linha "Sem responsável"?
6. **Setores**: `ZZTESTE Suporte` deve aparecer com pelo menos 1 conversa — você
   classificou a conversa do Daniel nele.
7. **Etiquetas**: `ZZTESTE VIP` deve aparecer com pelo menos 1 conversa.
   - Se Setores ou Etiquetas aparecerem vazios mesmo depois de você ter classificado a
     conversa, é defeito.

### 16. Campanhas — o teste mais perigoso do roteiro

O disparo é real. O que torna este teste seguro é uma coisa só: **o público tem que ser
exatamente 1 contato, o Daniel Honorato.** A etiqueta `ZZTESTE VIP` foi aplicada só nele —
é isso que faz o filtro render um público de um.

1. Abra **Campanhas**. Deve haver um aviso amarelo explicando o ritmo do disparo. Leia.
2. Se aparecerem avisos vermelhos sobre daemon offline ou WhatsApp desconectado, anote o
   texto — e saiba que, com eles na tela, a campanha não vai sair do lugar.
3. Clique em "Nova campanha" e preencha:
   - Nome: `ZZTESTE Campanha`
   - Mensagem: `ZZTESTE campanha para {{nome}}`
   - Público: marque **somente** a etiqueta `ZZTESTE VIP`
   - Ritmo: deixe no mínimo
   - **Desmarque** "Enviar só dentro do horário de atendimento" (senão, fora do horário
     comercial, nada sai e você vai achar que está quebrado)
4. Observe o resumo no rodapé do formulário. Mexa no controle de **ritmo**: o tempo
   estimado muda junto? Ritmo menor tem que dar tempo maior.
5. Desmarque a etiqueta por um instante (público = base toda). O número de contatos
   aumenta muito? **Volte a marcar `ZZTESTE VIP` imediatamente.**
6. 🛑 **PORTÃO DE SEGURANÇA — pare aqui e verifique.** O rodapé do formulário tem que
   dizer literalmente **"1 contatos vão receber"**.
   - Se disser **qualquer outro número**: **NÃO crie e NÃO inicie a campanha.** Feche o
     formulário, reporte como defeito Crítico (o filtro por etiqueta está pegando gente
     que não devia) e pule para o passo 12.
7. Com o público confirmado em 1, clique em **"Criar rascunho"**.
8. O cartão aparece com selo **Rascunho**, barra de progresso zerada, "Público 1" e o
   ritmo escolhido?
9. 🛑 **Segunda verificação:** o cartão diz **Público 1**? Só siga se sim.
10. Clique em **"Iniciar"**. O selo vira **Enviando**.
11. Aguarde até 2 minutos, recarregando a página de vez em quando, e observe:
    - O contador **Enviadas** foi para 1?
    - A barra de progresso encheu?
    - O selo virou **Concluída**?
    - Abrindo a conversa do Daniel Honorato, a mensagem `ZZTESTE campanha para Daniel
      Honorato` apareceu lá, **com a variável trocada**?
    - Se nada acontecer em 2 minutos, anote o estado exato do cartão (selo, contadores,
      "Último erro" se houver). Provavelmente é o daemon parado — reporte com o que a
      tela mostra.
12. **Exclua a campanha de teste** (ícone de lixeira no cartão).

#### 16b. Opt-out (precisa de ajuda humana — pule se não puder)

Se você tiver como pedir para alguém responder do celular do Daniel Honorato:

13. Peça que ele responda exatamente **`SAIR`** na conversa do WhatsApp.
14. Em até um minuto, abra a conversa do Daniel no CRM. Na faixa de atendimento deve
    aparecer um selo vermelho **"Sem campanhas"**.
15. Clique na setinha de desfazer ao lado desse selo. O selo some?
16. Se não conseguir fazer isso, registre como "não testado" no relatório.

### 17. Regressão rápida dos módulos antigos

Passe por cada um e confirme que **continuam funcionando como antes** — as mudanças novas
não podem ter quebrado nada:

1. **Dashboard**: carrega, mostra números e o gráfico de receita?
2. **Pipeline**: o Kanban aparece? Arraste um card de uma coluna para outra e confirme que
   ele fica lá depois de recarregar a página. Abra a aba **Fluxos** — a lista carrega?
3. **Atividades**: lista aparece, os filtros (Todas/Pendente/Atrasada/Concluída) mudam a
   lista?
4. **Faturamento**: os três totais no topo e a lista de notas aparecem?
5. **Agenda**: o calendário aparece, dá para trocar de mês e clicar num dia?
6. **Agente de IA**: faça **no máximo 2 perguntas**. Na primeira, pergunte algo que só a
   base de conhecimento sabe responder — por exemplo: *"Qual é o prazo de troca ZZTESTE?"*
   Ele deve responder **42 dias** (o que você cadastrou), provando que a base está sendo
   usada. Se ele disser que não sabe ou inventar outro número, é defeito.
7. **Busca do topo**: digite o nome de um contato na barra de busca do cabeçalho. Aparecem
   resultados clicáveis?

### 18. Persistência

Recarregue a página (F5) e confirme que continuam salvos: o setor, a etiqueta, a resposta
rápida, a variável, o documento da base, o responsável e a etiqueta da conversa que você
mexeu.

Se algo apareceu salvo na tela mas **sumiu depois do F5**, isso é **Crítico** — significa
que a gravação não chegou no banco.

### 19. Limpeza

Apague **somente** o que você criou:

- [ ] Campanha `ZZTESTE Campanha` (se ainda existir)
- [ ] Etiquetas `ZZTESTE VIP` e `ZZTESTE Urgente` — tire a etiqueta da conversa antes
- [ ] Setores `ZZTESTE Suporte` e `ZZTESTE Financeiro` — tire o setor da conversa antes
- [ ] Campos `ZZTESTE CNPJ` e `ZZTESTE Plano`
- [ ] Respostas rápidas `zzteste` e `zz-teste-2`
- [ ] Variável `zzteste_site`
- [ ] Documento `ZZTESTE Política`
- [ ] Arquivo de teste na Biblioteca
- [ ] Convite `zzteste-qa@exemplo.com` (se ainda estiver pendente)
- [ ] Assinatura e nome da organização devolvidos ao original
- [ ] Horários devolvidos ao original
- [ ] Mensagem de finalização **desligada** no Perfil
- [ ] Se o selo "Sem campanhas" ficou no Daniel, desfaça

Na conversa do Daniel Honorato: tire a etiqueta e o setor de teste, devolva o responsável
ao que estava antes (se ninguém era, volte para "Sem responsável") e deixe a conversa no
estado em que ela estava.

**As mensagens `ZZTESTE` enviadas ficam no histórico — não tente apagá-las.** Limpar
conversa apaga tudo, inclusive o que é real. Se incomodarem, é o Daniel quem apaga do
celular dele.

---

## RELATÓRIO FINAL

Entregue neste formato:

**1. Resumo** — em duas ou três frases: o sistema está utilizável? O que mais preocupa?

**2. Defeitos**, agrupados por gravidade (Crítico → Baixo), no formato de reporte acima.

**3. Erros de console** — a lista completa dos erros vermelhos, com o texto exato e a tela
em que apareceram.

**4. Não testado** — o que você deixou de fazer por segurança ou por não conseguir, e o
motivo.

**5. Sobrou lixo?** — o que você criou e não conseguiu apagar.

Se você **não encontrou nenhum defeito**, diga isso claramente em vez de inventar
problemas pequenos para parecer produtivo. Mas antes de concluir, confirme que percorreu
todos os 19 passos — cobertura incompleta apresentada como "está tudo certo" é pior do que
um relatório com furos assumidos.
