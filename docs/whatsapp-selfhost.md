# Rodar o daemon de WhatsApp por conta própria (custo zero)

O espelho de WhatsApp precisa de um processo ligado 24/7 — o Baileys mantém um WebSocket vivo
com o WhatsApp, e se o processo dorme o socket morre. Não existe versão "serverless" disso.

No Cloud Run, manter isso de pé significa `min-instances=1` + CPU sempre alocada, que é
exatamente o que sai caro. Numa máquina que **já fica ligada**, o custo é zero.

Como o daemon fala com o CRM por uma **fila no Firestore** (e não por HTTP), ele não precisa de
porta aberta, IP fixo, domínio nem certificado — só de internet de saída. Roda atrás do NAT de
casa sem configurar nada no roteador.

---

## 1. Onde rodar

| Opção | Custo | Chave em disco? | Observação |
|---|---|---|---|
| **VM e2-micro da GCP** (free tier, região EUA) | R$ 0 | **Não** — metadata server | Melhor postura de segurança; 1 GB de RAM é apertado (use swap) |
| **VM da Oracle Always Free** (ARM, até 24 GB) | R$ 0 | Sim | Bem folgada, pode ficar em região Brasil |
| **PC / mini-PC / Raspberry** | R$ 0 | Sim | Só espelha com a máquina ligada; ver §7 |

O passo a passo abaixo assume **Windows**; numa VM Linux é o mesmo, trocando o Agendador de
Tarefas por um serviço `systemd`.

---

## 2. Antes de tudo: publicar regras e índice

No repositório, uma vez:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

> O índice de `waCommands` é **`COLLECTION_GROUP`**. Sem ele o listener do daemon cai com
> `FAILED_PRECONDITION` — e como o emulador não valida índices, o erro só aparece em produção.
> Espere o índice sair de *Building* no console antes de seguir.

Opcional, mas recomendado — apagamento automático dos comandos velhos, sem custo de leitura:

```bash
gcloud firestore fields ttls update expireAt \
  --collection-group=waCommands --enable-ttl --project=titas-c8967
```

---

## 3. Credencial (só fora da GCP)

Crie uma service account **dedicada e mínima**. Não reaproveite a padrão do App Engine/Compute
— ela costuma ser *Editor*, o que é poder demais.

```bash
gcloud iam service-accounts create whatsapp-daemon --project titas-c8967

gcloud projects add-iam-policy-binding titas-c8967 \
  --member=serviceAccount:whatsapp-daemon@titas-c8967.iam.gserviceaccount.com \
  --role=roles/datastore.user

gsutil iam ch \
  serviceAccount:whatsapp-daemon@titas-c8967.iam.gserviceaccount.com:objectAdmin \
  gs://titas-c8967.firebasestorage.app

gcloud iam service-accounts keys create service-account.json \
  --iam-account=whatsapp-daemon@titas-c8967.iam.gserviceaccount.com
```

**Nunca** conceda Owner/Editor. Também **não** precisa de `firebaseauth.admin` (o daemon
deixou de verificar ID tokens quando o HTTP saiu) nem de `serviceAccountTokenCreator` (as URLs
de mídia usam token de download do Firebase, não signed URLs).

Guarde o `service-account.json` **fora da pasta do repositório** (ex.: `C:\wa-daemon\`). Ele
ignora todas as security rules e alcança todos os tenants.

---

## 4. Instalar e compilar

Precisa de **Node 20+**.

```powershell
cd C:\Users\marce\crm-titas\whatsapp-daemon
npm ci
npm run build
```

---

## 5. Configurar

Crie `whatsapp-daemon\.env` (copie de `.env.example`). O mínimo:

```
FIREBASE_PROJECT_ID=titas-c8967
GOOGLE_APPLICATION_CREDENTIALS=C:\wa-daemon\service-account.json
```

Deixe `WA_HTTP_PORT` **vazio** — assim o daemon não abre porta nenhuma. Defina-a só se quiser
um `/healthz` local para depurar (ele escuta apenas em `127.0.0.1`).

---

## 6. Rodar

```powershell
node lib\index.js
```

No log você deve ver, em ordem: `whatsapp-daemon iniciando` → `dispatcher de comandos iniciado`
→ `heartbeat iniciado` → `rehidratando sessões` (ou "nenhuma sessão conectada").

Confirme no console do Firestore que `whatsappDaemon/heartbeat` tem o `updatedAt` avançando a
cada 30s. **Esse é o sinal de que está tudo de pé.**

### Auto-start no Windows

Para o daemon voltar sozinho depois de reiniciar a máquina:

1. Abra o **Agendador de Tarefas** → *Criar Tarefa* (não "tarefa básica").
2. Aba **Geral**: marque *Executar estando o usuário conectado ou não* e *Executar com
   privilégios mais altos*.
3. Aba **Disparadores**: novo disparador → *Ao iniciar o sistema*.
4. Aba **Ações**: iniciar programa → `node`, argumentos `lib\index.js`, iniciar em
   `C:\Users\marce\crm-titas\whatsapp-daemon`.
5. Aba **Configurações**: marque *Reiniciar se a tarefa falhar* (a cada 1 minuto).

Alternativas: [NSSM](https://nssm.cc/) ou PM2, se preferir gerenciar como serviço.

---

## 7. Ligar no CRM

A UI já vem ligada (`WHATSAPP_KILL_SWITCH = false` em `src/lib/whatsapp.ts`), então basta
publicar o hosting uma vez:

```powershell
npm run build
firebase deploy --only hosting
```

Depois: CRM → Contatos → **Conectar WhatsApp** → escaneie o QR.

Se abrir antes do daemon estar de pé, o botão aparece do mesmo jeito e o modal avisa
"Serviço de WhatsApp offline" — nada trava, e não é preciso publicar de novo quando o daemon
subir.

Para desativar a feature por completo: `WHATSAPP_KILL_SWITCH = true` + deploy do hosting. O
pareamento continua intacto.

---

## 8. O que esperar

- **Trocar de máquina não pede QR de novo.** O auth (creds + chaves do Signal) vive no
  Firestore, não em disco. Ao subir em outro lugar, `rehydrateAll()` reconecta em silêncio, e
  o gap-fill ainda preenche as mensagens do período parado.
- **Desligar a máquina para o espelho.** Ao religar, ele reconecta sozinho. Enquanto estiver
  fora, o CRM mostra "Serviço de WhatsApp offline" em vez de travar num spinner.
- **Nunca rode duas cópias ao mesmo tempo.** O lease (`whatsappSessions/{uid}.lock`) impede que
  a segunda abra a sessão — sem ele, o WhatsApp deslogaria as duas e exigiria QR novo. Se vir
  `lease detida por outra instância` no log, é isso funcionando.

---

## 9. Riscos de rodar no PC de casa

Aceite conscientemente (ou prefira a VM da GCP, que elimina o primeiro item):

- A chave de admin fica numa máquina doméstica. Se vazar, vaza o CRM inteiro — incluindo as
  mensagens espelhadas de terceiros, que são dado sensível sob LGPD. Use disco criptografado
  (BitLocker), usuário dedicado, e rotacione a chave a cada ~90 dias
  (`gcloud iam service-accounts keys list` para auditar).
- Sem energia/internet, sem espelho.
- IP residencial: em tese o WhatsApp pode considerar suspeito; na prática é o mesmo IP de onde
  você já usa o WhatsApp Web.

---

## 10. Se algo não funcionar

| Sintoma | Causa provável |
|---|---|
| Log repete `listener de waCommands caiu` | Índice `COLLECTION_GROUP` ausente ou ainda em *Building* (§2) |
| Processo sobe e sai na hora | Falha ao autenticar (confira `GOOGLE_APPLICATION_CREDENTIALS`) — o log mostra o erro |
| CRM diz "Serviço de WhatsApp offline" | Daemon parado, ou `whatsappDaemon/heartbeat` sem escrita há mais de 2 min |
| `lease detida por outra instância` | Há outra cópia rodando (outro terminal, ou a tarefa agendada). Encerre uma |
| Comando fica parado e dá timeout | Daemon vivo mas sem processar: veja o log; comando órfão volta a `pending` em até 10 min |
