# Titãs CRM

CRM de vendas em **React + Vite + TypeScript** sobre **Firebase** (Firestore, Auth, Storage, Hosting) com assistente de IA **Titã IA** (Claude via Cloud Function). Migrado do protótipo de arquivo único `legacy/CRM Titãs.dc.html`.

## Stack
- **Vite + React 18 + TypeScript**, `react-router-dom`, **Zustand** (estado de UI).
- **Firebase SDK v11**: Auth (e-mail/senha), Firestore (tempo real via `onSnapshot`), Storage (arquivos), Hosting.
- **Cloud Functions (Node 20)** + `@anthropic-ai/sdk` para o agente Claude (`claude-opus-4-8`).
- Visual portado 1:1 do protótipo (estilos inline, fontes Google + Material Symbols).

## Módulos
Dashboard · Pipeline (Kanban com drag&drop) · Contatos + WhatsApp + Arquivos · Atividades · Faturamento · Agenda · Agente de IA.

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

### Scripts
| Script | O que faz |
|---|---|
| `npm run dev` | Só o Vite |
| `npm run dev:full` | Emuladores (auth/firestore/storage) + Vite |
| `npm run seed` | Popula `users/{uid}/...` com os dados de exemplo (cria a conta demo) |
| `npm run build` | `tsc --noEmit` + build de produção (`dist/`) |
| `npm run emulators:all` | Emuladores incluindo Functions (após setup da Fase 7) |

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

## Fase 7 — Titã IA (Cloud Function) + deploy
Requer o plano **Blaze**.
```bash
cd functions && npm install && cd ..
firebase functions:secrets:set ANTHROPIC_API_KEY     # cole sua chave da Anthropic
```
- **App Check (reCAPTCHA v3):** registre o app no console, copie a *site key* para `VITE_RECAPTCHA_SITE_KEY` no `.env.local`. A função usa `enforceAppCheck: true`.
- Modelo configurável: variável de ambiente `TITA_MODEL` na função (default `claude-opus-4-8`; use `claude-haiku-4-5` para baratear).
- Deploy:
  ```bash
  npm run build
  firebase deploy            # hosting + rules + indexes + storage + functions
  ```
- Preview sem publicar em produção: `firebase hosting:channel:deploy preview`.

> Enquanto a Function não estiver no ar, o chat do Titã IA usa um **fallback scriptado** (respostas por palavra-chave) automaticamente.

## Modelo de dados (Firestore, single-tenant)
`users/{uid}` (perfil + `agent`) com subcoleções: `boards`, `deals` (cards do kanban normalizados, com `order`), `contacts` (+ `messages`, `files`), `activities`, `actTypes`, `invoices`, `events`, `leads`, `agentChat`. Regras garantem acesso só ao próprio `uid`.

## Notas
- Valores monetários em **reais (inteiro)**; datas em **Timestamp** (rótulos "Hoje/Ontem/há 2h" derivados na UI).
- A data "hoje" é dinâmica (`new Date()`); o seed gera datas relativas para o app nascer "vivo".
- O protótipo original está em `legacy/` apenas como referência visual.
