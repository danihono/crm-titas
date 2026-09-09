# Auditoria de segurança — Titãs CRM

Escopo: o sistema web e a infraestrutura Firebase do projeto `titas-c8967`. Sem aplicativo
móvel. Data: setembro de 2026. Branch: `claude/web-security-audit-upwjks`.

---

## Como ler este documento

Cada achado traz de onde veio a conclusão. A distinção importa mais do que a gravidade:

| Marca | O que significa |
|---|---|
| **[T]** | Confirmado por **teste executado**. Ou uma sondagem somente-leitura contra o projeto real (nada foi criado, alterado ou apagado), ou um teste automatizado nos emuladores. |
| **[R]** | Identificado na **revisão** de código e configuração. Não foi exercitado. |
| **[?]** | **Não verificado.** Depende de acesso ao Console/CLI que esta auditoria não tinha. Ver a seção 8. |

E o estado de cada um:

| Estado | O que significa |
|---|---|
| ✅ **Corrigido e provado** | A correção está no branch e um teste automatizado falha se ela for desfeita. |
| 🟢 **Corrigido** | A correção está no branch, verificada por revisão e typecheck, sem teste automatizado. |
| 🟡 **Parcial** | O dano foi contido; a causa segue aberta. Está dito o que falta. |
| 🔵 **Com você** | Depende de uma ação no Console do Firebase/GCP. O código já está pronto. |
| ⚪ **Não corrigido** | Decisão consciente, com o motivo. |

> **Aviso que vale mais do que qualquer achado desta lista:** os arquivos `firestore.rules`
> e `storage.rules` deste repositório **não são prova do que está publicado**. A API de
> regras exige OAuth e não foi possível ler o ruleset em produção. Se o que está no ar
> divergir do repositório, boa parte deste relatório descreve um sistema diferente do seu.
> O primeiro comando da seção 8 resolve isso em trinta segundos, e é por onde eu começaria.

---

## 1. O que está em uso

| Serviço | Em uso | Como se sabe |
|---|---|---|
| Hosting (clássico, site `titas-c8967`) | Sim | `firebase.json`, SPA rewrite `**→/index.html` |
| App Hosting | Não | ausente do `firebase.json` |
| Authentication — só e-mail/senha, cadastro aberto | Sim | **[T]** o provedor aceitou uma tentativa de `signUp` |
| Cloud Firestore | Sim | `firestore.rules`, `firestore.indexes.json` |
| Realtime Database | Não | sem `database.rules.json`, sem import de `firebase/database` |
| Cloud Storage | Sim | `storage.rules`, seis pontos de upload |
| Cloud Functions v2 (`southamerica-east1`) | Sim | agora seis callables |
| App Check (reCAPTCHA v3) | Código presente, **nunca ativado** | `README.md:130-149`, `vite.config.ts:37-52` |
| Fora do Firebase | Gemini API (Secret Manager) e um daemon de WhatsApp self-hosted com **service account** | `functions/src/ia.ts`, `whatsapp-daemon/src/firebase.ts` |

O daemon é o ponto que mais pesa no modelo de ameaça: ele usa **Admin SDK**, ou seja, ignora
as Security Rules por completo e alcança todos os ambientes. A chave dele é uma credencial
global.

---

## 2. O que já estava certo

Vale dizer, porque é o que evita a conclusão errada de que "tudo estava aberto":

- **[T]** Sem autenticação, o Firestore nega tudo. `get`, `list` e `create` voltam
  `403 PERMISSION_DENIED`, inclusive em `users`, `invites` e `whatsappSessions`. O
  `allow read, write: if false` do fim do arquivo está funcionando.
- **[T]** Storage sem autenticação: `403` na listagem e no objeto.
- **[T]** As chaves do Signal/Baileys em `whatsappSessions/**` não têm regra nenhuma e caem
  no deny padrão — só o Admin SDK chega lá. Confirmado com requisição real.
- **[T]** A **proteção contra enumeração de e-mail está ligada** no projeto (`sendOobCode`
  responde 200 para endereço inexistente). Isso também fecha o sequestro da allowlist
  SUPER TITAN por troca de e-mail.
- **[T]** Isolamento entre ambientes: nenhum dos testes de travessia entre tenants passou —
  nem leitura, nem escrita, nem Storage.
- **[R]** Histórico do git limpo: 50 commits varridos, nenhuma chave privada, PEM, token ou
  service account. O `.gitignore` cobre `.env`, `service-account.json`, `*-sa.json`.
- **[R]** O daemon amarra os caminhos vindos da fila ao ambiente do path
  (`actions.ts:100-114`) — sem isso o Admin SDK leria qualquer objeto do bucket.
- **[R]** `excluirCliente` refaz a autorização no servidor contra a allowlist e recusa
  apagar contas de dono.
- **[R]** Log do daemon disciplinado: `pino` com `redact`, Baileys preso em `warn`, zero
  `console.*`.
- **[R]** Nenhum `dangerouslySetInnerHTML`, `innerHTML`, `eval` ou `new Function` em `src/`.

---

## 3. Achados

| # | Achado | Gravidade | Origem | Estado |
|---|---|---|---|---|
| [C1](#c1) | Qualquer atendente destrói o ambiente pela fila `waCommands` | **Crítica** | [R] | ✅ |
| [C2](#c2) | Aceite de convite baseado em e-mail não verificado | **Alta** | [T] | ✅ |
| [C3](#c3) | `askTitaIA` é um proxy Gemini pago, aberto e sem cota | **Alta** | [R] | 🟡 |
| [C4](#c4) | Gestor se promove a dono criando um convite | **Alta** | [T] | ✅ |
| [C5](#c5) | Membro desativado mantém acesso total ao Storage | **Alta** | [T] | ✅ |
| [C6](#c6) | Arquivo privado vira link público eterno | **Alta** | [R] | 🟡 |
| [M1](#m1) | Zero validação de dados nas regras | Média | [T] | ✅ |
| [M2](#m2) | Exclusão em massa liberada ao menor privilégio | Média | [T] | ✅ |
| [M3](#m3) | Setor não é fronteira de acesso | Média | [R] | ⚪ |
| [M4](#m4) | Leitura irrestrita dentro do ambiente | Média | [T] | ✅ |
| [M5](#m5) | SUPER TITAN lê o conteúdo dos clientes | Média | [T] | ✅ |
| [M6](#m6) | Sem proteção contra bots; senha mínima de 6 caracteres | Média | [T] | 🔵 |
| [M7](#m7) | App Check nunca ativado; `excluirCliente` quebrada no ar | Média | [T] | 🔵 |
| [M8](#m8) | Sem verificação de e-mail, recuperação de senha ou revogação de token | Média | [R] | ✅ |
| [M9](#m9) | Hosting sem cabeçalhos de segurança | Média | [R] | 🟢 |
| [M10](#m10) | Upload sem validação de tipo, tamanho e nome | Média | [T] | ✅ |
| [M11](#m11) | Rate limit em memória; fila sem teto | Média | [R] | 🟢 |
| [M12](#m12) | `retentionDays` (LGPD) é gravado e nunca aplicado | Média | [R] | ⚪ |
| [M13](#m13) | Gestor cria convites que não consegue listar | Baixa | [T] | ✅ |
| [B1–B10](#baixos) | Dez itens de baixa gravidade | Baixa | [R] | 🟢 / ⚪ |

---

### Por que tantos achados têm a mesma raiz

Firestore e Storage avaliam regras por **união permissiva**: se *qualquer* `match` conceder,
está concedido. Um `match` aninhado mais estrito **não revoga** um `allow` mais amplo que já
casou.

Enquanto existiu `match /users/{uid}/{document=**} { allow write: if ... }`, era
**impossível** restringir papel, exclusão ou formato de campo em coleção nenhuma do ambiente.
Os comentários do arquivo original reconheciam isso e concluíam que a validação teria de
morar noutro lugar — o que, na prática, significou não existir. C1, M1, M2 e M4 são todos
consequência dessa única decisão estrutural.

A correção não foi acrescentar regras: foi **remover o `allow write` recursivo** e declarar
escrita e leitura coleção por coleção. Coleção nova sem regra própria agora cai no
default-deny — some da tela até ganhar a sua. É o único jeito de o silêncio ser seguro.

A mesma armadilha me pegou durante a correção, e vale registrar: `{sub=**}` casa também com
**zero** segmentos, então um `match .../contacts/{id}/{sub=**}` com escrita livre devolvia ao
documento do contato exatamente a permissão que a regra ao lado acabara de restringir. Quem
encontrou foi o teste do `createdAt`. Não há curinga recursivo de escrita no arquivo final.

---

<a id="c1"></a>
### C1 — Qualquer atendente destrói o ambiente pela fila `waCommands` · Crítica · ✅

**Componente:** `firestore.rules`, `whatsapp-daemon/src/commands.ts`, `src/lib/whatsapp.ts`

**Evidência [R].** `firestore.rules:51` incluía `waCommands` na lista `agentWritable`, e o
daemon derivava o ambiente **apenas do caminho do documento** (`commands.ts:85-90`) — ele
nunca soube *quem* enfileirou. Nem `session.disconnect` com `purge:true`
(`actions.ts:229-234`) nem `contact.purge` (`actions.ts:375-390`) checavam papel. Na
interface, o caminho estava atrás de um `confirm()` apenas.

**Impacto.** O papel mais raso do sistema apagava, sem volta, todos os contatos espelhados do
WhatsApp, suas mensagens e as mídias no Storage (`purge.ts` usa `deleteFiles({force:true})`),
e desconectava o número da empresa. Não era preciso nem usar a interface: um `addDoc` direto
pelo SDK bastava. Um atendente insatisfeito no último dia de trabalho esvaziava a operação.

**Correção.** A fila saiu de `users/{uid}/waCommands` para a coleção de topo
`waCommands/{ambiente}/queue`. Fora do ambiente, ela tem regra própria e o **tipo do
comando** decide o papel exigido: purgar contato, desconectar a sessão e definir a retenção
passam a exigir gestor. O campo `by` amarra o comando a quem pediu, e o daemon **reconfere o
papel dessa pessoa contra o Firestore** antes de executar. Isso não duplica a regra: o daemon
usa Admin SDK e ignora regras — se um dia algo escrever na fila por outro caminho, o expurgo
continua exigindo gestor. Na interface os botões somem para quem não administra.

**Como testar.** `npm run test:rules` — bloco *C1*. Sete testes cobrem quem pode o quê,
inclusive `o caminho antigo users/{uid}/waCommands não aceita mais nada`. Manualmente: entre
como atendente, abra um contato — os botões *Apagar* e *Limpar conversa* não aparecem, e
*Conectar WhatsApp* mostra o aviso de somente leitura. Como gestor, tudo continua.

---

<a id="c2"></a>
### C2 — Aceite de convite baseado em e-mail não verificado · Alta · ✅

**Componente:** `firestore.rules`, `src/contexts/AuthContext.tsx`, `src/lib/team.ts`

**Evidência [T].** O teste `com e-mail NÃO verificado, o convidado é barrado` reprovava: a
criação do vínculo era aceita. A regra provava apenas
`exists(invites/{request.auth.token.email})`, sem exigir `email_verified`, e o cadastro nunca
enviou confirmação — `sendEmailVerification` não existia no repositório.

**Impacto.** O convite é endereçado a um **endereço**, e o Firebase Auth deixa qualquer
pessoa criar conta com o e-mail de outra sem provar acesso à caixa postal. Quem descobrisse
um convite pendente para `fulano@empresa.com` — e o padrão de e-mail de uma empresa não é
difícil de adivinhar — criava a conta antes do convidado e entrava no ambiente da vítima com
o papel do convite: contatos, conversas, mensagens e faturamento. É uma corrida contra o
convidado legítimo, e é isso que a mantém em Alta e não em Crítica.

**Correção.** A regra exige `email_verified == true` na criação do vínculo; o cadastro envia
a confirmação; o aceite espera por ela e um aviso no topo diz o que está faltando, com botão
de reenvio. Quem **já é membro** não é afetado — a exigência vale só na criação.

**Como testar.** `npm run test:rules` — bloco *C2*, três testes. Manualmente: crie uma conta
nova com um convite pendente e confirme que ela só entra na equipe depois de clicar no link
do e-mail.

---

<a id="c3"></a>
### C3 — `askTitaIA` é um proxy Gemini pago, aberto e sem cota · Alta · 🟡 Parcial

**Componente:** `functions/src/index.ts`, `functions/src/ia.ts`

**Evidência [R].** `enforceAppCheck: false` nas três callables de IA; a única porta era
`if (!request.auth)`; `cors: true`; nenhum limite por usuário; nenhum `maxInstances`. O
`system` chegava **inteiro do cliente** e era usado verbatim como `systemInstruction`
(`index.ts:66` → `ia.ts:75`), e o array `history` não tinha teto na entrada — só era cortado
depois de desserializado.

**Impacto.** Com cadastro aberto, qualquer pessoa cria uma conta em segundos e passa a usar o
Gemini pago do projeto para o que quiser, de qualquer origem, sem teto. `request.auth`
sozinho nunca foi controle de custo — só de identidade. Há também um agravante de
privacidade que não é falha, mas convém saber: o `system` legítimo já carrega o CRM inteiro
do ambiente para o LLM, incluindo o **texto da última mensagem das 30 conversas mais
recentes** (`Agent.tsx:83-108`).

**Correção aplicada.** Cota de **40 chamadas por hora por usuário**, gravada no Firestore —
cada instância da função é um processo novo, então um contador em memória zeraria a cada
chamada fria e não valeria nada. Mais `maxInstances`, recusa de payload absurdo antes de
percorrê-lo, e o App Check unificado (ver M7).

**O que falta.** O `system` continua vindo do cliente. Montá-lo no servidor exigiria que a
função lesse contatos, negócios, faturas e conversas do ambiente — é uma refatoração do
recurso de IA, não uma correção de segurança, e mudaria o comportamento do assistente.
Registro a recomendação e a deixo como decisão sua. Vale dizer que, para o **próprio**
ambiente da pessoa, isso não abre nada que ela não pudesse pedir ao assistente de qualquer
forma; o que a cota e o App Check endereçam é o abuso de custo, que era o risco real.

---

<a id="c4"></a>
### C4 — Gestor se promove a dono criando um convite · Alta · ✅

**Componente:** `firestore.rules`

**Evidência [T].** O teste `gestor NÃO convida ninguém como dono` reprovava — a escrita era
aceita. A regra de criação de convite exigia apenas `isManager` e não restringia o `role`,
e a regra do vínculo copiava esse papel adiante. A interface só oferecia
`atendente`/`gestor`, mas `inviteMember` aceitava `'dono'`, e a interface nunca foi a trava.

**Impacto.** Um gestor convidava um endereço que ele mesmo controla com papel `dono`, entrava
com essa conta e passava a mandar em tudo que é configuração — equipe, setores, etiquetas,
campos, base de conhecimento — inclusive desativando o dono real do ambiente.

**Correção.** Gestor convida `atendente` e `gestor`; só o dono do ambiente convida outro
`dono`. Papel fora da lista é recusado, o id do documento tem de bater com o campo `email` e
os campos são limitados por `hasOnly`.

**Como testar.** `npm run test:rules` — bloco *C4*, cinco testes, incluindo o caso legítimo
(`o dono do ambiente pode convidar como dono`), que precisa continuar passando.

---

<a id="c5"></a>
### C5 — Membro desativado mantém acesso total ao Storage · Alta · ✅

**Componente:** `storage.rules`

**Evidência [T].** Quatro testes reprovavam: o membro com `active: false` **lia, subia,
sobrescrevia e apagava** arquivos normalmente. O `isMember()` do Storage testava apenas se o
vínculo **existia**; o do Firestore testava `active != false`.

**Impacto.** O produto "bloqueia" alguém marcando `active: false` — e não apagando o vínculo,
para o histórico não ficar órfão. O Firestore cortava na hora; o Storage não cortava nunca. A
pessoa desligada seguia com acesso a toda mídia de conversa, foto de contato, biblioteca e
logo — inclusive para **apagar**. É a resposta direta à sua pergunta sobre o que acontece
quando uma conta é bloqueada.

**Correção.** O `isMember()` do Storage passa a ler `active != false`, e apagar arquivo sobe
para nível de gestor. Junto com M8, desativar também derruba as sessões abertas.

**Como testar.** `npm run test:rules` — bloco *C5*, quatro testes.

---

<a id="c6"></a>
### C6 — Arquivo privado vira link público eterno · Alta · 🟡 Parcial

**Componente:** `src/hooks/useFiles.ts`, `useLibrary.ts`, `useMessages.ts`, `useContacts.ts`,
`useProfile.ts`, `useClients.ts`, `whatsapp-daemon/src/storage.ts`

**Evidência [R].** Todos os seis pontos de upload chamam `getDownloadURL()` e **gravam a URL
no Firestore** (`downloadURL`, `mediaUrl`, `photoUrl`, `logoUrl`). O daemon faz o mesmo por
conta própria, montando a URL com um token que ele gera.

**Impacto.** `?alt=media&token=…` é uma **credencial ao portador**: ignora `storage.rules`
por completo — sem sessão, sem vínculo, sem validade. Quem receber o link baixa para sempre:
ex-funcionário, print compartilhado, histórico do navegador. É exatamente o cenário de
"documento privado acessível a quem recebeu só o link". Revogar exige trocar o token objeto a
objeto.

**Correção aplicada.** `Referrer-Policy: strict-origin-when-cross-origin` (a biblioteca de
mídias abre essas URLs em nova aba, e sem isso o token ia no `Referer` para terceiros). E um
script de revogação: `npm run storage:revogar-tokens <uid>` troca o token de cada objeto do
ambiente **e reescreve o campo correspondente em cada documento** — trocar só o token
quebraria a tela, porque as URLs antigas continuam gravadas. Prévia por padrão, `--apply`
para valer.

**O que falta.** A causa. Enquanto o app gravar `getDownloadURL()`, **cada upload novo nasce
com um link eterno**. Fechar de vez pede exibir a mídia por `getBlob()` autenticado e parar
de persistir a URL — mexe em toda a renderização de anexo (avatar, áudio, balão de mensagem,
biblioteca, painel SUPER TITAN) e não dá para validar sem navegador. Fica para a próxima
rodada; o script é o botão de pânico até lá.

---

<a id="m1"></a>
### M1 — Zero validação de dados nas regras · Média · ✅

**Componente:** `firestore.rules`

**Evidência [T].** Seis testes reprovavam. Era possível gravar responsável inexistente, setor
inventado, status de fatura fora da lista, valor de negócio como texto, campo desconhecido
(`isAdmin: true`) e reescrever `createdAt`.

**Impacto.** É a resposta ao seu item 3. Qualquer atendente forjava `assignedTo`,
`assignedName`, `closedBy` e `firstResponseAt` — os relatórios de SLA por atendente não eram
confiáveis, e alguém podia atribuir o próprio atendimento a um responsável que não existe. O
`value` do negócio era arbitrário **e alimentava os indicadores do painel SUPER TITAN**. Os
sinalizadores `nameSource`/`photoSource` do contato deixavam um membro fixar ou suprimir o
dado que vem do daemon.

**Correção.** Responsável só aceita uid que exista em `members`; setor só aceita id que
exista em `sectors`; status de fatura por lista; valores numéricos com tipo conferido; campos
por `hasOnly`. Nas coleções que o daemon também escreve, a validação é sobre o que **mudou**
(`diff().affectedKeys()`), e não sobre o documento inteiro — assim o cliente não encosta em
`waJid`, `historyImport` e afins, e `createdAt` deixa de ser reescrevível.

**Como testar.** `npm run test:rules` — bloco *M1*, oito testes, incluindo
`atendente ainda cria contato e negócio normais`.

---

<a id="m2"></a>
### M2 — Exclusão em massa liberada ao menor privilégio · Média · ✅

**Evidência [T].** Três testes reprovavam: o atendente apagava contato, negócio e quadro.
`allow write` inclui `delete`, e a regra ampla concedia os três verbos de uma vez.

**Correção.** `create`, `update` e `delete` são declarados separadamente; apagar sobe para
gestor em todo o atendimento. **Como testar:** bloco *M2*, quatro testes.

---

<a id="m3"></a>
### M3 — Setor não é fronteira de acesso · Média · ⚪ Não corrigido

**Evidência [R].** `sectorIds` é gravado no vínculo e **nunca usado em nenhuma consulta**. A
varredura de todas as cláusulas `where()` do cliente não achou uma sequer envolvendo setor; os
únicos usos são filtros em memória para exibição em Relatórios.

**Impacto.** Um atendente "do setor A" lê todos os contatos, mensagens e negócios do
ambiente, pelo app ou direto pelo SDK.

**Por que não corrigi.** Isto é decisão de produto, não conserto de bug. Transformar setor em
fronteira real muda o que cada atendente enxerga hoje, exige filtro nas consultas, índices
compostos novos e uma resposta para conversa sem setor. Fazer isso sem você decidir seria
mudar o comportamento do sistema por conta própria. **Se setor é para segregar**, é o próximo
trabalho e eu recomendo; **se é rótulo de relatório**, convém dizer isso na tela de Equipe,
porque a caixa de seleção de setores no convite sugere o contrário.

---

<a id="m4"></a>
### M4 — Leitura irrestrita dentro do ambiente · Média · ✅

**Evidência [T].** Dois testes reprovavam: o atendente lia faturamento e base de
conhecimento. A regra era `allow read: if owner(uid) || isMember(uid)` para tudo. A interface
escondia; as regras não.

**Correção.** A leitura passou a ser declarada coleção por coleção, e **`invoices`** sai do
alcance do atendente. O que ele precisa para atender — contatos, mensagens, equipe, setores,
etiquetas, respostas rápidas, variáveis e base de conhecimento — continua.

**Uma correção da correção, que vale registrar.** A primeira versão tirou também `variables`
e `knowledge` do atendente. Estava errado: `variables` alimenta a substituição nas respostas
rápidas (uso diário dele) e `knowledge` alimenta o Titã IA, que ele pode usar. Esconder
qualquer um dos dois de quem já lê todas as conversas do ambiente não protege nada — e
quebrava calado, porque `useCollection` engole o erro de permissão e devolve lista vazia. Os
testes de "não pode regredir" cobriam contatos e mensagens, não esses dois: foi essa lacuna
que deixou o erro passar, e agora há teste para os três casos.

**Nota técnica.** A primeira tentativa foi um `match` amplo com lista de exceções
(`document[0]`), e ela **não funciona**: numa consulta de coleção o curinga `**` não está
ligado e o Firestore recusa a query inteira com *"Variable is not bound in path template"*.
Foi o teste `atendente ainda lê contatos e mensagens` que pegou. **Como testar:** bloco *M4*,
cinco testes.

---

<a id="m5"></a>
### M5 — SUPER TITAN lê o conteúdo dos clientes · Média · ✅

**Evidência [T].** Três testes reprovavam: o dono do sistema listava contatos e faturas de um
cliente, por caminho direto e por consulta de grupo.

**Impacto.** O painel abria quatro `collectionGroup` **pelo navegador** sobre `deals`,
`invoices`, `contacts` e `activities` de todos os ambientes. A tela mostrava apenas somas,
mas o navegador recebia os documentos inteiros: nome da empresa, contato e valor de cada
negócio; cliente, valor, vencimento, forma de pagamento e observações de cada nota; nome,
telefone e última mensagem de cada contato. O README e os comentários das próprias regras
afirmam que esse dado está fora do alcance dele — e não estava. A confidencialidade dependia
de a interface escolher não renderizar o que já tinha em mãos. Relevante para LGPD.

**Correção.** As regras de `collectionGroup` saíram. A conta agora sai da callable
`estatisticasClientes`, onde os dados não deixam o servidor, e só os totais atravessam.
Perde-se o "ao vivo": é uma visão geral administrativa, e recarregar a página basta.
Conversas e mensagens seguiam corretamente fora do alcance e continuam.

**Como testar.** Bloco *M5*, oito testes — três provando o bloqueio, e os demais provando que
o dono do sistema **continua** listando a ficha administrativa e editando nome, cor e logo.

---

<a id="m6"></a>
### M6 — Sem proteção contra bots; senha mínima de 6 caracteres · Média · 🔵 Com você

**Evidência [T], colhida ao vivo do projeto real:**

- política de senha: `minPasswordLength: 6`, **nenhum** requisito de complexidade;
- `EMAIL_PASSWORD_PROVIDER: ENFORCEMENT_STATE_UNSPECIFIED` — a proteção contra bots do
  Identity Platform está **desligada**;
- sem MFA; cadastro aberto.

**Impacto.** É a resposta ao seu item 6. Tentativa repetida de login e criação automatizada
de contas esbarram apenas na cota genérica do Firebase. `senha123` é aceita.

**O que fazer (só no Console, não dá para código):** ligar o bot protection do Identity
Platform em **AUDIT** primeiro, observar, depois **ENFORCE**; subir a política de senha para
10+ com complexidade. Considere também fechar o cadastro: todo usuário real deste sistema
chega por convite ou é cliente seu — a tela de criar conta aberta ao público não parece
necessária, e é ela que torna C3 e este item exploráveis por qualquer um.

---

<a id="m7"></a>
### M7 — App Check nunca ativado; `excluirCliente` quebrada no ar · Média · 🔵 Com você

**Evidência [T]/[R].** `src/lib/firebase.ts` só inicializa o App Check se
`VITE_RECAPTCHA_SITE_KEY` existir, e a build de produção nunca a recebeu (o próprio
`README.md:130-149` e o aviso em `vite.config.ts` dizem isso). Confirmei indiretamente que
**não há enforcement no Firestore**: a requisição anônima volta com o erro de regra, não com
erro de App Check.

**Impacto.** Estava pela metade, e o resultado era o pior dos dois mundos: as funções de IA
sem defesa alguma contra o token de um usuário ser usado fora do site, e a `excluirCliente`
exigindo um token que o site nunca enviou — ou seja, **a exclusão de cliente está quebrada em
produção**. Um caminho destrutivo que nunca roda é um caminho que nunca foi testado.

**Correção aplicada.** As agora seis callables seguem **uma** chave,
`APP_CHECK_EXIGIDO`. Ligar virou passo de configuração, documentado no código:

1. reCAPTCHA v3 no console + *secret key* em Firebase Console → App Check
2. `VITE_RECAPTCHA_SITE_KEY` no `.env.local` e **rebuild do site**
3. `TITA_APP_CHECK_ENFORCED=true` em `functions/.env` e redeploy das functions

**A ordem importa** — inverter 2 e 3 derruba as chamadas do site. No Console, ligue o
enforcement de Firestore e Storage em **AUDIT** antes de ENFORCE.

---

<a id="m8"></a>
### M8 — Sem verificação de e-mail, recuperação de senha ou revogação de token · Média · ✅

**Evidência [R].** `sendPasswordResetEmail` não existia no repositório inteiro; tampouco
`sendEmailVerification`; `emailVerified` nunca era lido; `revokeRefreshTokens` em lugar
nenhum.

**Impacto.** Quem esquecia a senha dependia de alguém com acesso ao console — o que empurra a
operação para senha anotada e compartilhada. E desativar um membro só valia para escritas
novas: o token de ID na aba aberta seguia válido por até uma hora e o *refresh token*
renovava indefinidamente, então quem foi desligado ficava com o CRM aberto e funcionando.

**Correção.** Recuperação de senha na tela de login, com confirmação **idêntica** para
endereço cadastrado e não cadastrado — dizer "não existe" transformaria a tela num
verificador de quem é cliente. Verificação de e-mail no cadastro (ver C2). E a callable
`revogarAcesso`, chamada ao desativar um membro, que derruba as sessões abertas dele.

---

<a id="m9"></a>
### M9 — Hosting sem cabeçalhos de segurança · Média · 🟢

**Evidência [R].** O `firebase.json` só definia `Cache-Control`.

**Correção.** `frame-ancestors 'none'` + `X-Frame-Options` (clickjacking), `nosniff`,
`Referrer-Policy`, `Permissions-Policy`, HSTS e `Cross-Origin-Opener-Policy`. A CSP completa
vai em **`Content-Security-Policy-Report-Only`**: sem navegador para validar a build
publicada, ligar tudo de uma vez é o tipo de mudança que derruba o site numa diretiva errada.
Enforcing vai só o subconjunto que não tem como quebrar este app.

**Como testar.** Depois do deploy, abra o site, veja o console do navegador e procure
violações de CSP. Se não houver nenhuma por alguns dias, mova o valor de `Report-Only` para
`Content-Security-Policy`.

---

<a id="m10"></a>
### M10 — Upload sem validação de tipo, tamanho e nome · Média · ✅

**Evidência [T].** Cinco testes reprovavam: HTML, SVG, executável e `application/octet-stream`
eram aceitos como mídia de conversa, e a foto de perfil aceitava PDF.

**Impacto.** Dava para hospedar HTML, SVG ou executável no bucket do cliente e servi-los pela
URL do Firebase. Não é XSS no CRM (origem distinta), mas serve para phishing e distribuição
de malware sob a infraestrutura do cliente. `uploadContactFile` ainda interpolava o nome do
arquivo **cru** no caminho — e barra em nome de arquivo vira **pasta** no Storage, que é como
um upload sai do prefixo em que as regras o confinam.

**Correção.** `storage.rules` valida `contentType` e tamanho por pasta. `src/lib/upload.ts`
centraliza tamanho, tipo e nome seguro, espelhando as regras — lá é a trava, aqui é para a
pessoa ver um erro em português. SVG fica fora das imagens em todos os caminhos, inclusive na
logo do painel, onde o aviso chegava a **oferecer** SVG: é XML e carrega script.

**Como testar.** Bloco *M10*, seis testes, incluindo `aceita imagem, PDF e áudio`.

---

<a id="m11"></a>
### M11 — Rate limit em memória; fila sem teto · Média · 🟢

**Evidência [R].** A janela de 30 comandos/60 s é um `Map` em memória: zera a cada restart e
não soma entre instâncias. O teto de 50 documentos por leitura é limite de consulta, não
profundidade de fila.

**Impacto.** Protege o daemon de ser afogado, não a conta do Firestore de crescer: nada
impedia gravar dezenas de milhares de documentos pendentes, cada um uma escrita cobrada.

**Correção.** Teto de 200 pendentes por ambiente, aplicado na varredura, descartando o
excedente mais novo. **[?]** Confirme também se existe política de TTL para
`expireAt` (comando na seção 8) — é ela que limpa o resto.

---

<a id="m12"></a>
### M12 — `retentionDays` é gravado e nunca aplicado · Média · ⚪ Não corrigido

**Evidência [R].** `actions.ts:192` grava `retentionDays`; **nada** o lê. Não existe rotina de
expurgo por retenção em lugar nenhum do daemon.

**Impacto.** O modal de consentimento oferece "apagar após 30/90/180 dias" e registra a
escolha. Mensagens e mídias ficam para sempre. É uma promessa de privacidade exibida ao
usuário e não cumprida — o tipo de coisa que pesa numa discussão de LGPD justamente porque
está escrito na tela.

**Por que não corrigi.** A correção é uma rotina que **apaga dados reais de clientes de forma
irreversível**, e eu não tenho como validá-la contra dados de verdade. Escrever um job de
deleção em massa que roda sozinho, sem ninguém poder testá-lo antes num ambiente com
conteúdo, é o tipo de "correção" que causa um incidente pior do que o achado.

**Recomendação concreta**, se quiser seguir: rotina diária no daemon, por ambiente com
`retentionDays > 0`; primeiro em modo relatório (contar e registrar o que apagaria, sem
apagar) por pelo menos um ciclo completo; depois apagando em lotes, mensagens e objetos do
Storage juntos, com log do volume. Enquanto isso não existir, o honesto é **tirar as opções
de prazo do modal** ou deixar explícito que a retenção ainda não é aplicada automaticamente.

---

<a id="m13"></a>
### M13 — Gestor cria convites que não consegue listar · Baixa · ✅

**Evidência [T].** Achado **pelo próprio teste**, não pela leitura: o teste
`gestor lista os convites pendentes` reprovou com
`Null value error for 'list' @ L129, false for 'list' @ L130`. A regra de leitura só aceitava
`resource.data.tenantUid == request.auth.uid`, isto é, **apenas o titular da conta** — mas as
regras de escrita aceitavam `isManager`, e a tela de Equipe roda a consulta para qualquer um
que a abra. Bug funcional com raiz em regra. **Correção:** a leitura passa a aceitar quem
administra o ambiente, casando com o `where()` que a tela já faz.

---

<a id="baixos"></a>
### Baixa gravidade

| # | Achado | Estado |
|---|---|---|
| B1 | `seed.ts` usava `\|\|=` para apontar aos emuladores: um ambiente com essas variáveis já definidas — ou com credencial de produção — mandava o seed ao projeto real **em silêncio**, e `demo@titas.crm` / `titas123` virava conta de verdade | 🟢 exige loopback ou não roda |
| B2 | `reset-connection.mjs` apagava a identidade do aparelho de qualquer uid do argv, sem prévia nem confirmação — um uid errado desconectava o WhatsApp de outro cliente. `repair-contact-names.mjs` tinha dry-run como *opt-in*, ou seja, o descuido escrevia | 🟢 os dois fazem prévia por padrão |
| B3 | `mediaUrl` aceitava qualquer `https://` e ia gravada na mensagem, que o CRM renderiza como `src`: um membro plantava um endereço externo que os colegas carregavam ao abrir a conversa, entregando quem leu, quando e de qual IP | 🟢 restrito ao Storage do projeto |
| B4 | O cadastro devolvia `auth/email-already-in-use`, reabrindo enumeração num projeto que tem a proteção ligada nos demais fluxos | 🟢 mensagem genérica |
| B5 | `whatsappDaemon/{doc}` legível por qualquer autenticado | ⚪ mantido: é sinal de vida sem dado de ambiente, e é o que evita o cliente esperar por um comando que ninguém vai atender |
| B6 | Telefone de cliente em log nível `info` (`chatJid`, `peer.lid`) — acabaria em qualquer coletor | 🟢 desceu para `debug` |
| B7 | Diagnóstico interno embutido na mensagem de erro mostrada ao usuário | 🟢 foi para o log |
| B8 | Chave web real fixada como *fallback* em `src/lib/firebase.ts` | ⚪ **não é vazamento** — é pública por design, como você separou no pedido. Mas amarra todo clone à produção: sem `.env.local`, o `dev` aponta para o projeto real. Vale trocar por falha explícita |
| B9 | `agentWritable` citava `agentMessages` e `leads`, que não existem: a coleção real do chat é `agentChat`, que caía em nível de gestor — **o atendente não conseguia usar o Titã IA** | 🟢 resolvido na reescrita |
| B10 | `readOnly` no `tenantStore` é código morto: nada o liga, mas aparenta ser proteção em nove telas | ⚪ mantido; o comentário no código já avisa. Agora que o papel decide de verdade, é redundância inofensiva |

---

## 4. Resultado dos testes

Suíte nova em `tests/rules/`, 98 testes contra os emuladores. Metade prova que o uso
legítimo de cada papel **continua funcionando** — é a metade que costuma faltar, e é ela que
distingue "seguro" de "quebrado".

```
antes  →  31 reprovados | 63 aprovados  (94)
depois →   0 reprovados | 98 aprovados  (98)
```

Papéis cobertos: visitante sem sessão, titular da conta, dono do ambiente, gestor, atendente,
atendente desativado, dono do sistema e autenticado sem vínculo.

```bash
npm run test:rules
```

---

## 5. Ordem do deploy — leia antes de publicar

**Estas mudanças não são compatíveis com a versão que está no ar.** A fila de comandos mudou
de lugar, então regras, site e daemon precisam subir **juntos**. Publicar só as regras deixa o
WhatsApp mudo; publicar só o site deixa os comandos sem quem os execute.

```bash
# 1. Confira o que está publicado hoje (seção 8) e guarde uma cópia — é o seu rollback.
firebase firestore:rules get --project titas-c8967 > rollback-firestore.rules

# 2. Índices primeiro: o listener do daemon depende do índice de collectionGroup `queue`,
#    e ele leva alguns minutos em "Building". Espere ficar "Enabled".
firebase deploy --only firestore:indexes

# 3. Functions (estatisticasClientes e revogarAcesso são NOVAS — o site já as chama).
firebase deploy --only functions

# 4. Regras e site juntos.
firebase deploy --only firestore:rules,storage,hosting

# 5. Daemon: rebuild e restart na máquina que o hospeda.
```

Não se esqueça do TTL do novo caminho da fila:

```bash
gcloud firestore fields ttls update expireAt \
  --collection-group=queue --enable-ttl --project=titas-c8967
```

**Como saber se deu certo:** entre como atendente e mande uma mensagem pelo WhatsApp (a fila
funciona); abra o painel SUPER TITAN e veja os números (a callable nova responde); tente
apagar um contato como atendente (o botão não existe) e como gestor (funciona).

---

## 6. Ordem de prioridade sugerida

1. **Confirmar as regras publicadas** (seção 8, comando 1). Sem isso, tudo aqui é hipótese.
2. **Deploy coordenado** — fecha C1, C2, C4, C5, M1, M2, M4, M5, M10, M13.
3. **Console:** bot protection em AUDIT e política de senha (M6). Minutos, sem deploy.
4. **App Check** na ordem da seção M7 — fecha M7 e a parte que falta de C3, e desentrava a
   exclusão de cliente.
5. **Revogar os links já espalhados** (`npm run storage:revogar-tokens`) se alguém saiu da
   empresa recentemente.
6. **Decidir M3** (setor é fronteira ou rótulo?) e **M12** (retenção: implementar ou tirar da
   tela). São decisões suas, não conserto.
7. **Terminar C6** — exibir mídia por `getBlob()` autenticado e parar de persistir a URL.

---

## 7. Sobre o que NÃO foi verificado

Não conclua que o sistema está seguro porque a suíte está verde. O que ela cobre são as
regras do Firestore e do Storage, contra os arquivos deste repositório. Ficaram de fora:

- **O que está publicado.** Ver o aviso do topo.
- **Qualquer teste com sessão real em produção.** Por escolha sua, os testes ficaram nos
  emuladores. As sondagens contra o projeto real foram todas somente-leitura.
- **A interface no navegador.** O ambiente desta auditoria não alcança `titas-c8967.web.app`
  (bloqueio de rede de saída). Nada foi clicado; o front foi lido, não exercitado.
- **As Cloud Functions em execução.** Foram lidas e compilam; não foram chamadas.
- **O daemon rodando.** Compila; não foi executado contra um WhatsApp real.
- **Autenticação anônima.** Não deu para determinar se está ligada sem criar uma conta — e
  criar contas em produção estava fora do combinado. Comando 3 da seção 8.
- **Tudo da seção 8.**

---

## 8. Comandos para você rodar

Todos de leitura. Me passe a saída e eu fecho os itens **[?]**.

```bash
# 1. O MAIS IMPORTANTE: o que está publicado bate com o repositório?
firebase firestore:rules get --project titas-c8967 > publicado-firestore.rules
diff publicado-firestore.rules firestore.rules
gcloud firebase rules releases list --project titas-c8967   # inclui o ruleset do Storage

# 2. App Check: existe app registrado? qual o enforcement por serviço?
firebase apps:list --project titas-c8967
gcloud alpha services firebase appcheck services list --project titas-c8967

# 3. Provedores de login ativos — INCLUSIVE se o anônimo está ligado
gcloud identity-platform config describe --project titas-c8967 --format=json

# 4. Restrições da chave de API do navegador
gcloud services api-keys list --project titas-c8967 --format=json

# 5. Quem manda no projeto: IAM humano e contas de serviço
gcloud projects get-iam-policy titas-c8967 --format=json
gcloud iam service-accounts list --project titas-c8967

# 6. Backups do Firestore e PITR — existem, e a restauração já foi validada?
gcloud firestore databases describe --database='(default)' --project titas-c8967
gcloud firestore backups schedules list --database='(default)' --project titas-c8967

# 7. TTL da fila e alertas de orçamento
gcloud firestore fields ttls list --database='(default)' --project titas-c8967
gcloud billing budgets list --billing-account=SEU_BILLING_ACCOUNT
```

Três perguntas que os comandos não respondem e que valem uma olhada:

- **A chave da service account do daemon.** É uma credencial global: alcança todos os
  ambientes e ignora todas as regras. Onde ela está, quem tem cópia, e quando foi rotada pela
  última vez? Os próprios documentos de deploy mandam apagar as cópias locais — vale conferir
  se foi feito.
- **Backup com restauração validada.** Backup que nunca foi restaurado é hipótese de backup.
- **Separação entre teste e produção.** Só existe o projeto `titas-c8967`. Um projeto de
  homologação separado é o que permitiria testar regra, função e daemon antes de publicar —
  hoje o teste é em produção, e foi essa restrição que manteve esta auditoria nos emuladores.
