# Espelhamento de WhatsApp — spec do módulo

> ⚠️ **SAIU DO CLOUD RUN — agora é self-hosted.**
> O daemon precisa ficar ligado 24/7 (o Baileys mantém um WebSocket vivo), o que no Cloud Run
> exigia `min-instances=1` + CPU sempre alocada e dominava a fatura. O serviço foi deletado e o
> transporte mudou de HTTP para uma **fila no Firestore**, então o daemon roda em qualquer
> máquina com internet de saída — sem porta, sem TLS, sem domínio.
>
> A UI está ligada (`WHATSAPP_KILL_SWITCH = false`), mas **o espelho só funciona com o daemon
> rodando em algum lugar** — veja **`docs/whatsapp-selfhost.md`**. Sem daemon, o CRM mostra
> "Serviço de WhatsApp offline" em vez de travar.

Módulo que espelha, em tempo real, as conversas de WhatsApp de um usuário dentro do CRM
(aba Contatos). É **leitura/espelho primeiro** — enviar pelo CRM é fase posterior.

- Conexão: `@whiskeysockets/baileys` (protocolo do WhatsApp Web / dispositivo vinculado).
  **Não** é a Cloud API oficial (que não espelha conversa). Fixado em `7.0.0-rc13` (v7).
- Daemon long-lived **self-hosted** (`whatsapp-daemon/`), separado das Cloud Functions.
- Frontend e daemon conversam **só pelo Firestore** — nada de HTTP entre eles.

## Arquitetura

```
Frontend (React)                    whatsapp-daemon (self-hosted, atrás de NAT)
  ├─ runCommand ─addDoc──► users/{uid}/waCommands/{id} ──onSnapshot──► dispatcher
  │     └─ onSnapshot ◄─── mesmo doc (status/result/error) ◄── ACK do daemon
  ├─ useWhatsappStatus  ──onSnapshot── whatsappStatus/{uid}  ◄── writeStatus (Admin)
  ├─ useDaemonOnline    ──onSnapshot── whatsappDaemon/heartbeat ◄── heartbeat (Admin)
  └─ useMessages        ──onSnapshot── users/{uid}/contacts/{c}/messages ◄── ingest (Admin)

Baileys socket  ─(Map<uid,sock> em memória)─  auth em whatsappSessions/{uid}(+/keys) (Admin)
```

O daemon precisa apenas de **internet de saída**: nenhuma porta aberta, nenhum TLS, nenhum
domínio, nenhum CORS. Autorização vem do **path** do doc — a rule `users/{uid}/{document=**}
allow write: if owner(uid)` garante que só o dono conseguiu enfileirar ali, o que substitui
o `verifyIdToken` que existia no transporte HTTP.

> As security rules do Firestore são UNIÃO permissiva, então **não** dá para restringir o
> schema/volume da fila por rule. A validação (whitelist de `type`, cap de args, rate-limit
> por uid) é feita no daemon, em `actions.ts`/`commands.ts` — não remova.

- **connectionId = uid** (CRM é single-tenant-por-uid; um número por conta no v1).
- **Registro em memória:** `Map<uid, sock>` — efêmero, reconstruído no boot (rehidratação).
- **Auth durável no Firestore** via `useFirestoreAuthState` (NÃO `useMultiFileAuthState`, que grava em disco local efêmero).

### Modelo de dados

| Path | Quem escreve | Quem lê | Conteúdo |
|---|---|---|---|
| `users/{uid}/waCommands/{id}` | app (cria) + daemon (executa/ACK) | dono | `type`, `args`, `status` (`pending`→`running`→`done`/`error`), `attempts`, `claimedBy`, `lockUntil`, `result`, `error`, `expireAt` (TTL) |
| `whatsappDaemon/heartbeat` | daemon (Admin) | qualquer autenticado | `instanceId`, `updatedAt` — sinal de vida; `storageOk`/`storageCode`/`storageCheckedAt` — veredito da sonda de Storage. **Sem dado de tenant**: só o enum, nunca bucket/projeto/erro (o doc é legível por qualquer usuário) |
| `whatsappSessions/{uid}` | daemon (Admin) | **ninguém** (default-deny) | `creds` (BufferJSON), `desiredState`, `phoneNumber`, `retentionDays`, `consentAt`, `lock` (lease), `lastMirrorAt` (watermark do gap-fill) |
| `whatsappSessions/{uid}/keys/{keyId}` | daemon (Admin) | **ninguém** | uma chave do Signal por doc (`{v}` BufferJSON) |
| `whatsappStatus/{uid}` | daemon (Admin) | dono + super-owner (read-only nas rules) | `status`, `qr` (data URL), `phoneNumber`, `lastError` |
| `users/{uid}/contacts/{c}` | daemon + app | dono | contato (auto-criado tem `source:'whatsapp'`) |
| `users/{uid}/contacts/{c}/messages/{id}` | daemon + app | dono | `{fromMe, text, sentAt, channel:'whatsapp', mediaType?, mediaUrl?, mediaPath?, mimeType?, fileName?, sizeBytes?, caption?, pending?, mediaError?, mediaRetry?}` — `mediaRetry` só existe enquanto a mídia está quebrada (ver §Mídia) |

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

- **`syncFullHistory: false`** — nunca pede o histórico COMPLETO ao WhatsApp. O sync
  inicial que o celular envia sozinho após o vínculo (`messaging-history.set` com
  `INITIAL_BOOTSTRAP`/`RECENT`) tem dois tratamentos automáticos:
  - **Primeiro pareamento** (espelho nunca viu nada — sem watermark): o snapshot de
    conversas recentes é ingerido INTEIRO — a aba Contatos já nasce populada com quem
    mandou mensagem, sem exigir cadastro manual. Respeita os marcadores de expurgo
    (`waPurges`): conversa apagada não ressuscita ao re-parear.
  - **Re-vínculo** (já espelhou antes): só o **gap-fill** (abaixo) — mensagens mais novas
    que o último instante espelhado, nunca mais antigas.
  Histórico mais antigo continua só via recuperação on-demand por contato.
- **Só UM processo pode segurar uma sessão por vez.** Dois processos no mesmo auth → o
  WhatsApp **desloga os dois** e exige QR novo. Isso é garantido pelo **lease** em
  `whatsappSessions/{uid}.lock` (`lease.ts`): transação + TTL de 90s + renovação a cada 30s.
  Quem não toma a lease não abre socket (`startSession` lança `session_lease_taken`); quem
  perde a lease em voo fecha o socket com `end` (nunca `logout`).
  Antes isso dependia do `max-instances=1` do Cloud Run — fora dele, o lease é a única
  proteção, e é por isso que ele existe.
- **O processo precisa ficar ligado 24/7.** O WebSocket morre se o processo dormir, então
  não existe versão "serverless" disto. É o motivo de ter saído do Cloud Run: lá, manter
  isso de pé significa `min-instances=1` + `--no-cpu-throttling`, que é justamente o que
  custa caro. Numa máquina que já fica ligada, o custo é zero.
- **Shutdown** faz `sock.end()` (fecha o WS **mantendo** o device — nunca `logout()`) e
  solta as leases, para reiniciar/trocar de máquina sem esperar o TTL.
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
- **`mediaRetry.mediaKey`** é material de descriptografia guardado em repouso, sob
  `users/{uid}/**`. O raio de exposição é o mesmo do `mediaUrl`, que já entrega o arquivo em
  claro a quem tem o link — e a chave sozinha não abre nada sem o blob cifrado, que expira na
  CDN do WhatsApp. É apagada assim que a mídia é salva, e some junto no expurgo (está dentro
  do doc da mensagem).

## Mídia

- Mensagens novas com imagem/vídeo/áudio/documento/figurinha são baixadas pelo daemon com
  `downloadMediaMessage` e salvas no Firebase Storage em
  `users/{uid}/contacts/{contactId}/whatsapp/{messageId}_{filename}`.
- A mensagem salva recebe `mediaType`, `mediaUrl`, `mediaPath`, `mimeType`, `fileName`,
  `sizeBytes` e `caption` quando disponíveis.
- Imagem renderiza inline no chat; demais mídias aparecem como link/download.
- `view once` não é baixado: fica como placeholder com `mediaError:'view_once_unsupported'`.

### Quando falha

Gravar uma mídia passa por duas operações que falham por motivos opostos — o download do
Baileys (rede/CDN do WhatsApp) e o `save()` no Storage (IAM da service account) — e por isso
têm códigos distintos em `mediaError`. Juntá-las num código só já mandou a investigação para o
lado errado durante semanas:

| `mediaError` | Significado | O que fazer |
|---|---|---|
| `download_failed` | O WhatsApp/CDN não entregou ou não descriptografou | Tentar de novo; olhar rede da VPS |
| `wa_media_expired` | Blob fora da CDN e o aparelho de origem não reenviou | Provavelmente irrecuperável |
| `storage_denied` | 403/401 do Storage — a service account não pode gravar | Corrigir o IAM; ver `docs/whatsapp-selfhost-hetzner.md` §5 |
| `storage_failed` | Outra falha do Storage (rede, 5xx, cota) | Tentar de novo |
| `view_once_unsupported` | Não é falha: `view once` não é espelhado | Nada |

O daemon sonda o Storage **no boot** (`storage.ts`) e publica o veredito no heartbeat, porque
essa falha é muda: o texto continua chegando e só a mídia some. A sonda grava um objeto e o
busca **pela URL pública, sem autenticação** — do jeito que o `<img src>` do CRM busca, que é
a única prova que interessa. `scripts/check-storage.mjs` faz o mesmo sob demanda, imprimindo
a identidade que está agindo.

### Por que a URL é montada à mão, e não com `getDownloadURL()`

`getDownloadURL()` do firebase-admin faz um GET autenticado em
`firebasestorage.googleapis.com` só para ler de volta o `firebaseStorageDownloadTokens` que o
daemon acabou de gravar, e então monta
`{endpoint}/b/{bucket}/o/{path}?alt=media&token={token}`. Como o token nasce aqui
(`randomUUID()`), a ida à rede é perda pura — e cara: aquela é **outra API, com autorização
própria**, que `roles/storage.objectAdmin` não cobre. Na prática ela derrubava 100% da mídia
com 403 enquanto a gravação funcionava perfeitamente. `downloadUrlFor()` em `storage.ts`
monta a mesma string localmente, então as URLs novas são idênticas às já gravadas.

### Recuperação

Toda falha grava um mapa `mediaRetry` no doc da mensagem com o mínimo que o Baileys precisa
para rebaixar depois — `mediaKey`, `directPath` e `url`, que é exatamente o que
`downloadContentFromMessage` consome. O comando `contact.mediaRetry` (botão **Recuperar
mídias** na conversa) remonta a mensagem a partir disso e tenta de novo, pedindo reenvio ao
aparelho de origem quando o blob expirou.

Duas limitações que vale conhecer:

- **Mensagens que falharam antes deste recurso não têm descritor** e são irrecuperáveis: o
  `WAMessage` cru é descartado após a ingestão e o `mediaKey` não ficou em lugar nenhum.
- **"Recuperar histórico" não substitui isso.** Ele ancora na mensagem mais ANTIGA já
  espelhada e pede o que vem antes dela; mídia quebrada está sempre numa janela recente, que
  ele nunca pede de volta.

## Envio pelo CRM

- O campo de mensagem chama `POST /message/send` quando a sessão está `connected`.
- O daemon resolve o contato pelo `contactId`, normaliza `whatsapp`/`phone`, envia com
  `sock.sendMessage` e grava a mensagem enviada no contato selecionado.
- Quando a sessão não está conectada, o app mantém o comportamento local anterior.

## Gap-fill (mensagens do período desconectado)

Quando o usuário **desvincula** o dispositivo (botão "Desconectar" / remoção pelo celular) e
depois reconecta com QR novo, as conversas do período desconectado formariam um buraco
permanente. O gap-fill preenche esse buraco automaticamente:

- **Watermark** `whatsappSessions/{uid}.lastMirrorAt` = "o espelho viu tudo até aqui".
  Atualizado na ingestão ao vivo (throttled, 1 write/60s por uid) e, com força, em todo
  fechamento de conexão que chegou a abrir (`close` recuperável, `stopSession`, SIGTERM).
  Sobrevive ao `clearAuth` do logout — é ele que delimita o buraco.
- **No re-vínculo**, o WhatsApp envia sozinho um sync inicial (`messaging-history.set` com
  syncType `INITIAL_BOOTSTRAP`/`RECENT`) mesmo com `syncFullHistory:false`. O daemon congela
  o watermark no início da sessão e ingere **apenas** as mensagens mais novas que ele, com
  semântica de mensagem viva (respeita purge markers, dedup idempotente por doc-id, preview
  do contato recomputado ao final do lote).
- **Janela**: o gap-fill só fica armado por `WA_GAP_FILL_WINDOW_MS` (default 5 min) após o
  `open`; depois, qualquer sync automático volta a ser ignorado.
- **Limitações**: o sync inicial cobre só as mensagens recentes de cada conversa — buracos
  muito longos ou conversas muito movimentadas podem não ser 100% cobertos. Conta que nunca
  espelhou nada (sem watermark) não faz gap-fill: continua estritamente forward-only.

Queda **recuperável** (rede/deploy/restart, device continua vinculado) não precisa de
gap-fill: o WhatsApp reentrega o período offline via `messages.upsert` (`notify`/`append`),
que o daemon já processa de forma idempotente.

## Histórico antigo

Dois caminhos distintos, ambos por `messaging-history.set` (`history.ts`):

- **Snapshot inicial (automático, SÓ no primeiro pareamento):** ao parear pelo QR sem
  nunca ter espelhado (sem watermark), o celular envia as conversas recentes
  (`INITIAL_BOOTSTRAP`/`RECENT`) e o daemon ingere tudo com `importedFromHistory: true` +
  `respectPurgeMarkers: true` — cria os contatos que faltarem e, ao final, recomputa o
  preview de cada contato afetado (`refreshContactPreview`), porque o histórico chega
  fora de ordem. No re-vínculo (já tem watermark) o que roda é o gap-fill (seção acima).
- **Recuperação on-demand (manual, por contato):** paginada para trás a partir da mensagem
  mais antiga espelhada (âncora), com teto de páginas e janela opcional em dias. Ignora
  marcadores de expurgo de propósito — é pedido explícito do usuário. Não atualiza o
  preview para mensagens mais antigas que o atual.

## Feature-flag (subir "no escuro")

O botão "Conectar WhatsApp" só aparece quando `users/{uid}.features.whatsapp === true`
(lido por `useFeatures`). Para habilitar um tenant, defina esse campo no doc do usuário:

```
# no console do Firestore, doc users/{uid}:
features: { whatsapp: true }
```

## Deploy

O daemon é self-hosted — ver **`docs/whatsapp-selfhost.md`** para o passo a passo (Windows,
VM e credenciais). Não há mais URL para apontar no frontend: o canal é a fila no Firestore.

Antes de subir o daemon, publique as regras e o índice:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

> O índice de `waCommands` é **`COLLECTION_GROUP`** (os demais do projeto são `COLLECTION`).
> Sem ele o listener do daemon morre com `FAILED_PRECONDITION` — e o emulador **não** valida
> índices, então isso só aparece em produção. Espere sair de *Building* antes de seguir.

## Desenvolvimento local

1. Emuladores: `firebase emulators:start` (Auth 9099, Firestore 8080).
2. Daemon (sem `WA_HTTP_PORT` ele não abre porta nenhuma):
   ```bash
   cd whatsapp-daemon && npm install
   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
   GOOGLE_CLOUD_PROJECT=titas-c8967 npm run dev
   ```
3. Frontend: `.env.local` com `VITE_USE_EMULATORS=true`, depois `npm run dev`.
4. Clique em "Conectar WhatsApp" (o kill-switch já está desligado).

Limitações do emulador: não valida índices compostos, não executa TTL, e o Baileys tenta
parear de verdade (use um número de teste).

## Verificação end-to-end

Ver a seção "Verificação" do plano do módulo. Casos críticos: reconexão sem QR após
restart (rehidratação), e o ramo `loggedOut` (sem loop de reconexão).

## Fora de escopo (v1)

Enviar mensagens pelo CRM; importação geral de histórico antigo; sharding horizontal; caminho da
Cloud API oficial.
