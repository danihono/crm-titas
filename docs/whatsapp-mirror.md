# Espelhamento de WhatsApp — spec do módulo

Módulo que espelha, em tempo real, as conversas de WhatsApp de um usuário dentro do CRM
(aba Contatos). É **leitura/espelho primeiro** — enviar pelo CRM é fase posterior.

- Conexão: `@whiskeysockets/baileys` (protocolo do WhatsApp Web / dispositivo vinculado).
  **Não** é a Cloud API oficial (que não espelha conversa). Fixado em `7.0.0-rc13` (v7).
- Daemon long-lived em **Cloud Run** (`whatsapp-daemon/`), separado das Cloud Functions.
- Frontend lê status/QR e mensagens **só por `onSnapshot`** (nada de polling).

## Arquitetura

```
Frontend (React)                    whatsapp-daemon (Cloud Run, sempre ligado)
  ├─ useWhatsappStatus  ──onSnapshot── whatsappStatus/{uid}  ◄── writeStatus (Admin)
  ├─ WhatsappConnectModal ─HTTP+IDtoken─► /session/{consent,connect,disconnect}
  ├─ sendWhatsappMessage ─HTTP+IDtoken─► /message/send
  └─ useMessages        ──onSnapshot── users/{uid}/contacts/{c}/messages ◄── ingest (Admin)

Baileys socket  ─(Map<uid,sock> em memória)─  auth em whatsappSessions/{uid}(+/keys) (Admin)
```

- **connectionId = uid** (CRM é single-tenant-por-uid; um número por conta no v1).
- **Registro em memória:** `Map<uid, sock>` — efêmero, reconstruído no boot (rehidratação).
- **Auth durável no Firestore** via `useFirestoreAuthState` (NÃO `useMultiFileAuthState`, que grava em disco local efêmero).

### Modelo de dados

| Path | Quem escreve | Quem lê | Conteúdo |
|---|---|---|---|
| `whatsappSessions/{uid}` | daemon (Admin) | **ninguém** (default-deny) | `creds` (BufferJSON), `desiredState`, `phoneNumber`, `retentionDays`, `consentAt`, `lock` |
| `whatsappSessions/{uid}/keys/{keyId}` | daemon (Admin) | **ninguém** | uma chave do Signal por doc (`{v}` BufferJSON) |
| `whatsappStatus/{uid}` | daemon (Admin) | dono + super-owner (read-only nas rules) | `status`, `qr` (data URL), `phoneNumber`, `lastError` |
| `users/{uid}/contacts/{c}` | daemon + app | dono | contato (auto-criado tem `source:'whatsapp'`) |
| `users/{uid}/contacts/{c}/messages/{id}` | daemon + app | dono | `{fromMe, text, sentAt, channel:'whatsapp', mediaType?, mediaUrl?, mediaPath?, mimeType?, fileName?, sizeBytes?, caption?, pending?, mediaError?}` |

Chaves do Signal ficam em **um doc por chave** (mudam a quase cada mensagem): escritas em
lote, lidas em um único `getAll`, e envolvidas por `makeCacheableSignalKeyStore`.
`creds` são um doc só (mudam raramente). Nada de auth vai para `users/{uid}/**` — as rules
dão leitura de todo o subtree ao dono, o que vazaria as chaves.

## Ciclo de vida da conexão (a parte que mais se erra)

`connection.update` (em `sessionManager.ts`):
- `qr` presente → renderiza data URL e grava em `whatsappStatus/{uid}`.
- `open` → status `connected`, zera backoff, persiste `desiredState:'connected'`.
- `close` → inspeciona `lastDisconnect.error.output.statusCode`:
  - **`DisconnectReason.loggedOut` (401)** → dispositivo desvinculado; sessão MORTA.
    Limpa o auth, status `loggedOut`, exige QR novo. **NÃO reconecta** (reconectar =
    loop infinito + risco de ban pela Meta).
  - **Qualquer outro** (queda, 515 restart, conflito) → **reconecta** com backoff
    exponencial (cap 60s) + jitter.

> Nota: logo após escanear o QR, o WhatsApp força um `close` recuperável (não-loggedOut)
> para você reconectar apresentando as creds — isso é normal.

## Restrições duras (não-negociáveis)

- **`syncFullHistory: false`** — só espelha dali pra frente no fluxo normal (não puxa histórico).
- **Só UM processo pode segurar uma sessão por vez.** Dois processos no mesmo auth →
  o WhatsApp desloga os dois. Por isso `max-instances=1`.
- **Cloud Run:** `min-instances=1`, `max-instances=1` e **CPU sempre alocada**
  (`--no-cpu-throttling`). CPU estrangulada entre requests mata o WebSocket. Um daemon
  stateful de conexões vivas às vezes vive melhor numa VM pequena sempre-ligada ou
  Fly.io/Railway — aqui usamos Cloud Run porque o projeto já é GCP.
- **Overlap em deploy** (revisão nova sobe enquanto a antiga drena) é o risco real de
  duplo-holder. Mitigação: SIGTERM faz `sock.end()` (fecha o WS **mantendo** o device —
  nunca `logout()` no shutdown) e a rehidratação da nova revisão roda após o boot HTTP.
  Reforço planejado: lease por sessão em `whatsappSessions/{uid}.lock` (transação + TTL +
  heartbeat) para a nova instância só abrir depois da antiga soltar.
- **Segurança:** nunca logar conteúdo de mensagem nem creds. O logger do Baileys fica em
  `warn`+ (ele loga corpo/chaves em debug/trace). Creds/chaves só em `whatsappSessions/**`.

## LGPD

- **Consentimento** obrigatório antes de abrir socket: `/session/connect` recusa (412) se
  `consentAt` não estiver setado. O modal exige o aceite explícito do aviso.
- **Retenção** por conexão (`retentionDays`; 0 = para sempre). _TODO: job diário de expurgo
  por retenção (Cloud Scheduler → endpoint interno)._
- **Desconectar + expurgar em uma operação:** `POST /session/disconnect?purge=1` →
  `logout` + `clearAuth` + apaga contatos `source:'whatsapp'` (com mensagens) e varre
  mensagens `channel:'whatsapp'` em contatos manuais. Mídias salvas no Storage sob
  `users/{uid}/contacts/{contactId}/...` também são apagadas.
- **Expurgo por contato:** `POST /contact/purge { contactId, keepContact? }` — Firestore
  recursivo + Storage por prefixo (`keepContact:true` limpa só a conversa, preservando o
  cadastro e a foto). Grava um marcador em `users/{uid}/waPurges/{digitsKey}`: replays de
  mensagens anteriores ao expurgo são ignorados na ingestão (a conversa apagada não
  ressuscita), mas mensagem nova recria o contato normalmente (comportamento de espelho).

## Mídia

- Mensagens novas com imagem/vídeo/áudio/documento/figurinha são baixadas pelo daemon com
  `downloadMediaMessage` e salvas no Firebase Storage em
  `users/{uid}/contacts/{contactId}/whatsapp/{messageId}_{filename}`.
- A mensagem salva recebe `mediaType`, `mediaUrl`, `mediaPath`, `mimeType`, `fileName`,
  `sizeBytes` e `caption` quando disponíveis.
- Imagem renderiza inline no chat; demais mídias aparecem como link/download.
- `view once` não é baixado: fica como placeholder com `mediaError:'view_once_unsupported'`.
- Se o download falhar, a mensagem textual é preservada com `mediaError:'download_failed'`.

## Envio pelo CRM

- O campo de mensagem chama `POST /message/send` quando a sessão está `connected`.
- O daemon resolve o contato pelo `contactId`, normaliza `whatsapp`/`phone`, envia com
  `sock.sendMessage` e grava a mensagem enviada no contato selecionado.
- Quando a sessão não está conectada, o app mantém o comportamento local anterior.

## Histórico antigo

Histórico antigo permanece separado e desligado por padrão. Qualquer importação futura deve ser
manual/experimental, com limite de 50 mensagens por chamada, baseada em âncora local conhecida e
processando `messaging.history-set`, sem promessa de importar toda a conversa nem mídia antiga. O
modal de WhatsApp exibe essa opção como experimental/desabilitada para não parecer que o recurso
está ativo no v1.

## Feature-flag (subir "no escuro")

O botão "Conectar WhatsApp" só aparece quando `users/{uid}.features.whatsapp === true`
(lido por `useFeatures`). Para habilitar um tenant, defina esse campo no doc do usuário:

```
# no console do Firestore, doc users/{uid}:
features: { whatsapp: true }
```

## Deploy (Cloud Run)

```bash
cd whatsapp-daemon
gcloud run deploy whatsapp-daemon \
  --source . \
  --project titas-c8967 --region southamerica-east1 \
  --min-instances=1 --max-instances=1 --no-cpu-throttling \
  --port=8080 --timeout=3600 --concurrency=80 \
  --set-env-vars WA_ALLOWED_ORIGIN=https://titas-c8967.web.app,WA_DEFAULT_RETENTION_DAYS=0
```

A service account do runtime precisa de acesso ao Firestore (papel
`roles/datastore.user`) e à verificação de tokens (Firebase Admin já resolve com ADC).
Depois, aponte o frontend com `VITE_WHATSAPP_DAEMON_URL=<url-do-cloud-run>` e faça o build/deploy do hosting.

## Desenvolvimento local

1. Emuladores: `firebase emulators:start` (Auth 9099, Firestore 8080).
2. Daemon:
   ```bash
   cd whatsapp-daemon && npm install
   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
   GOOGLE_CLOUD_PROJECT=titas-c8967 npm run dev
   ```
3. Frontend: `.env.local` com `VITE_USE_EMULATORS=true` e
   `VITE_WHATSAPP_DAEMON_URL=http://127.0.0.1:8080`, depois `npm run dev`.
4. Habilite a flag no doc do usuário de teste e clique em "Conectar WhatsApp".

## Verificação end-to-end

Ver a seção "Verificação" do plano do módulo. Casos críticos: reconexão sem QR após
restart (rehidratação), e o ramo `loggedOut` (sem loop de reconexão).

## Fora de escopo (v1)

Enviar mensagens pelo CRM; importação geral de histórico antigo; sharding horizontal; caminho da
Cloud API oficial.
