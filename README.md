# Titãs CRM

CRM de vendas em **React + Vite + TypeScript** sobre **Firebase** (Firestore, Auth, Storage, Hosting) com assistente de IA **Titã IA** (Gemini via Cloud Function). Migrado do protótipo de arquivo único `legacy/CRM Titãs.dc.html`.

## Stack
- **Vite + React 18 + TypeScript**, `react-router-dom`, **Zustand** (estado de UI).
- **Firebase SDK v11**: Auth (e-mail/senha), Firestore (tempo real via `onSnapshot`), Storage (arquivos), Hosting.
- **Cloud Functions (Node 20)** + `@google/genai` para o Titã IA (`gemini-3.5-flash-lite`).
- Visual portado 1:1 do protótipo (estilos inline, fontes Google + Material Symbols).

## Módulos
Dashboard · Pipeline (Kanban com drag&drop) · Contatos + WhatsApp + Atendimento + Arquivos ·
Atividades · Faturamento · Agenda · Assistente · Campanhas · Relatórios · Configurações.

**Pipeline e o funil.** O Kanban tem um quadro do sistema, **Leads** (`boards/leads`), com
seis etapas fixas — Novo lead · Contato feito · Qualificado · Proposta enviada · Ganho, mais
*Perdido* fora do funil. Nome e etapas não são editáveis (a trava está em `useDeals.ts`, não
só no botão), porque é esse trilho que o **Funil de Leads** do painel lê: cada card grava em
`reachedAt` a data da primeira vez que alcançou cada etapa, e o gráfico segue a coorte criada
no período — por isso ele só estreita, e a conversão de cada degrau quer dizer alguma coisa.
Qualquer outro quadro segue com CRUD completo de quadro, etapa e card. O card pode apontar
para um contato (`contactId`, opcional) pelo mesmo combo que o Faturamento usa.

**Contatos** tem duas abas: *Atendimento* (Entrada · Esperando · Finalizados, a caixa de
conversas) e *Contatos* (o cadastro — busca, telefone, etiquetas, último contato). Quem não
tem conversa aberta só aparece na segunda.

**Atendimento (multi-seat).** O tenant é `users/{uid}` e pode ter vários atendentes
(`users/{uid}/members/{memberUid}`, papéis dono/gestor/atendente, convite por e-mail).
Contatos e conversas ficam na MESMA tela: a lista da esquerda tem as abas
Entrada · Esperando · Finalizados, e o cabeçalho da conversa traz responsável, setor,
etiquetas e as transições de estado. Cada ciclo vira um registro em
`users/{uid}/conversations`, que é o que alimenta os Relatórios.
Ver `docs/modulos-atendimento.md` para o modelo de dados e o que ainda não foi feito.

> **Segurança:** `docs/auditoria-seguranca.md` traz a auditoria completa — o que foi
> confirmado por teste, o que foi corrigido, o que depende de uma ação sua no Console e o
> que ficou em aberto por decisão. Leia a seção "Ordem do deploy" antes de publicar: a fila
> de comandos do WhatsApp mudou de lugar, então regras, site e daemon sobem **juntos**.

## SUPER TITAN (dono do sistema)
As contas listadas em `src/lib/owners.ts` entram num painel próprio (`/super`), fora do CRM:

- **Visão Geral** — métricas agregadas de todos os clientes (pipeline, faturamento,
  contagens). Calculadas **no servidor**, pela callable `estatisticasClientes`: antes o
  painel abria `collectionGroup` pelo navegador e recebia os documentos inteiros dos
  clientes para mostrar só as somas.
- **Clientes** — a ficha administrativa de cada conta: **nome, cor e logo** (editáveis) e a
  **exclusão definitiva** da conta.

O dono do sistema **não entra no CRM de nenhum cliente**: conversas, mensagens, contatos e
arquivos são confidenciais. Isso vale nas rotas (`CrmRoute` devolve todo dono para `/super`)
e, principalmente, nas security rules — `users/{uid}/{document=**}` não é mais legível por
ele, e a escrita no doc do cliente é limitada a `displayName`, `brandColor`, `logoUrl` e
`logoPath`. A allowlist de e-mails vive em três lugares que precisam andar juntos:
`src/lib/owners.ts`, `firestore.rules` e `storage.rules` (+ `OWNER_EMAILS` em
`functions/src/index.ts`).

A exclusão roda na callable **`excluirCliente`** (Admin SDK): apaga `users/{uid}` e todas as
subcoleções, os arquivos em `users/{uid}/` no Storage, os convites, os vínculos de equipe e a
conta no Auth. Depende de deploy:
```bash
firebase deploy --only functions,firestore:rules,storage
```

## Pré-requisitos
- **Node 18+** e **npm** (testado em Node 24).
- **Firebase CLI** (`npm i -g firebase-tools`) — já instalado.
- **Java JDK 11+** — **necessário para os emuladores** Firestore/Auth/Storage. Sem Java, rode contra um projeto Firebase real (`VITE_USE_EMULATORS=false`).

## Rodar em desenvolvimento (emuladores)
```bash
npm install
npm run dev:full        # sobe emuladores (auth/firestore/storage) + Vite
# em outro terminal, popular dados de exemplo:
npm run seed
```
Abra http://localhost:5173 e entre com a conta demo criada pelo seed:
- **E-mail:** `demo@titas.crm`  ·  **Senha:** `titas123`

> `.env.local` já vem com `VITE_USE_EMULATORS=true` e um projeto demo (`demo-titas-crm`), então o dev roda offline contra os emuladores. O Emulator UI fica em http://localhost:4000.

> O `seed` **recusa rodar** se `FIRESTORE_EMULATOR_HOST`/`FIREBASE_AUTH_EMULATOR_HOST` não
> apontarem para loopback. Ele cria uma conta com senha conhecida e sobrescreve dados: antes
> usava `||=`, então um ambiente com essas variáveis já definidas mandava tudo para o
> projeto real em silêncio.

### Scripts
| Script | O que faz |
|---|---|
| `npm run dev` | Só o Vite |
| `npm run dev:full` | Emuladores (auth/firestore/storage) + Vite |
| `npm run seed` | Popula `users/{uid}/...` com os dados de exemplo (cria a conta demo) |
| `npm run build` | `tsc --noEmit` + build de produção (`dist/`) |
| `npm run emulators:all` | Emuladores incluindo Functions (após setup da Fase 7) |
| `npm run test:rules` | Suíte de Security Rules nos emuladores (98 testes) |
| `npm run storage:revogar-tokens <uid>` | Revoga as URLs de download já compartilhadas de um ambiente (prévia; `--apply` para valer) |

## Estrutura
```
src/
  lib/        firebase.ts, paths.ts, converters.ts, format.ts, theme.ts
  store/      uiStore.ts (Zustand)
  contexts/   AuthContext.tsx
  hooks/      useCollection + useDeals/useContacts/useMessages/useFiles/
              useActivities/useInvoices/useEvents/useLeads/useAgent/useCalendar/useRevenueChart
  components/ layout/ (Sidebar,Topbar,ProtectedRoute), kanban/, modals/, common/
  pages/      Login, Dashboard, Pipeline, Contacts, Activities, Invoices, Agenda, Agent
scripts/      seed-data.ts, seed.ts
functions/    src/index.ts (callable askTitaIA)
legacy/       protótipo original (referência)
firestore.rules · storage.rules · firestore.indexes.json · firebase.json
```

## Conectar ao Firebase real (produção)
1. Crie o projeto em https://console.firebase.google.com e ajuste o **Project ID** em `.firebaserc`.
2. Registre um **Web App** e copie a config para `.env.local` (`VITE_FIREBASE_*`) e ponha `VITE_USE_EMULATORS=false`.
3. **Authentication → Sign-in method → habilite E-mail/senha.**
4. **Upgrade para o plano Blaze** (necessário para Storage, Functions e a IA).
5. **Firestore** → criar database (produção) + região; **Storage** → criar bucket.
6. Deploy de regras/índices/hosting:
   ```bash
   firebase deploy --only firestore:rules,firestore:indexes,storage,hosting
   ```

> **`dist/` é gerada, nunca vem do git** (está no `.gitignore`). O `firebase deploy` publica
> o que estiver nessa pasta — sem compilar. Um `git pull` seguido de deploy sem build subiria
> a `dist/` antiga que ficou na máquina, e o site voltaria no tempo: menus somem, telas
> reaparecem numa versão velha. Por isso o `hosting` tem `"predeploy": ["npm run build"]` no
> `firebase.json` — o build passa a rodar sozinho antes de publicar. Se o menu do CRM não
> mostrar os 10 itens (até Configurações), é sinal de build velho no ar.

## Fase 7 — Titã IA (Cloud Function) + deploy
Requer o plano **Blaze**.
```bash
cd functions && npm install && cd ..
firebase functions:secrets:set GEMINI_API_KEY     # cole sua chave do Google AI Studio
```

> ⚠️ **A chave precisa ser de um projeto com billing vinculado.** No tier gratuito do
> Gemini o Google pode usar seus prompts e respostas para treinar os produtos dele — e o
> que trafega aqui é conversa de cliente, o mesmo dado que as security rules escondem até
> do dono do sistema. O pago custa centavos e encerra esse uso.

- **App Check (reCAPTCHA v3) — desligado, e todas as callables seguem UMA chave.**

  Estava pela metade e era o pior dos dois mundos: as funções de IA sem defesa alguma, e a
  `excluirCliente` exigindo um token que a build de produção **nunca enviou** — ou seja, a
  exclusão de cliente está quebrada no ar desde então. Hoje as seis callables leem
  `APP_CHECK_EXIGIDO` (`functions/src/index.ts`). Ligar é configuração, não código, **nesta
  ordem**:

  1. reCAPTCHA v3 no console + *secret key* em Firebase Console → App Check
  2. `VITE_RECAPTCHA_SITE_KEY` no `.env.local` e **rebuild do site**
  3. `TITA_APP_CHECK_ENFORCED=true` em `functions/.env` e redeploy das functions

  Inverter 2 e 3 derruba as chamadas do site. O `vite.config.ts` avisa em toda build de
  produção enquanto a site key estiver faltando. No Console, ligue o enforcement de
  Firestore e Storage em **AUDIT** antes de ENFORCE.

  O App Check não é a autorização: quem decide quem pode o quê são o `request.auth`, a
  allowlist e as security rules. Ele é a camada que impede um token válido de ser usado
  fora do site — num endpoint que gasta API paga, risco real.
- Modelos configuráveis por env, sem mexer em código: `TITA_MODEL` (chat, default
  `gemini-3.5-flash-lite`) e `TITA_FLOW_MODEL` (gerador de fluxos, mesmo default).
- **Antes de publicar, teste contra a API de verdade** — a lógica vive em
  `functions/src/ia.ts` justamente para poder ser exercitada fora do Firebase:
  ```bash
  cd functions
  GEMINI_API_KEY=... npm run ia:teste      # 17 checagens: chat, histórico e o grafo do fluxo
  GEMINI_API_KEY=... npm run ia:modelos    # o que esta chave enxerga hoje
  ```
  O `ia:teste` confere o que o schema NÃO garante: seta apontando para etapa inexistente,
  etapa órfã, decisão sem rótulo. É o que quebra quando se troca de modelo.
- **Modelo do Gemini sai de linha.** O `gemini-2.5-flash-lite` virou 404 com
  "no longer available to new users". Quando acontecer, rode `npm run ia:modelos` e ajuste
  o default — não chute o próximo nome.
- Deploy:
  ```bash
  npm run build
  firebase deploy            # hosting + rules + indexes + storage + functions
  ```
- Preview sem publicar em produção: `firebase hosting:channel:deploy preview`.

> Enquanto a Function não estiver no ar, o chat do Titã IA usa um **fallback scriptado** (respostas por palavra-chave) automaticamente.

### Sem a chave do Gemini ainda?
Dá para publicar o resto sem tocar nas functions — só o Titã IA e o gerador de fluxos
dependem da chave:
```bash
npm run build
firebase deploy --only firestore:rules,storage,hosting
```
E a exclusão de cliente (que **não** usa IA) pode ir sozinha, sem o secret:
```bash
firebase deploy --only functions:excluirCliente
```

> **`TS7006: Parameter 'request' implicitly has an 'any' type` no predeploy** não tem nada a
> ver com a chave: é o `functions/node_modules` faltando, então o `tsc` não acha os tipos de
> `firebase-functions` e todo callback vira `any`. O `predeploy` do `firebase.json` já roda
> `npm --prefix functions install` antes de compilar; se ainda assim acontecer, rode
> `npm --prefix functions ci` na mão.

## Modelo de dados (Firestore, single-tenant)
> A fila de comandos do WhatsApp vive em **`waCommands/{uid}/queue`**, coleção de TOPO —
> não em `users/{uid}/waCommands`. Ela saiu de dentro do ambiente porque as regras do
> Firestore são união permissiva: lá dentro, a regra ampla de escrita a alcançava e nenhuma
> condição aninhada impedia um atendente de enfileirar um expurgo. Ver `firestore.rules`.

`users/{uid}` (perfil + `agent`) com subcoleções: `boards`, `deals` (cards do kanban normalizados, com `order`, `contactId` e `reachedAt`), `contacts` (+ `messages`, `files`), `activities`, `actTypes`, `invoices`, `events`, `agentChat`. Regras garantem acesso só ao próprio `uid`.

> A coleção `leads` **não existe mais**: na primeira abertura do Pipeline, `ensureLeadsBoard()`
> cria o quadro Leads e migra cada lead para um card (id `lead-<id>`, origem virando etiqueta),
> apagando a lista antiga. É idempotente — o doc do quadro é gravado no último lote, então
> "quadro existe" significa "migração terminou".

## Notas
- Valores monetários em **reais (inteiro)**; datas em **Timestamp** (rótulos "Hoje/Ontem/há 2h" derivados na UI).
- A data "hoje" é dinâmica (`new Date()`); o seed gera datas relativas para o app nascer "vivo".
- O protótipo original está em `legacy/` apenas como referência visual.
