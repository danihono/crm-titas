# Rodar o daemon numa VPS da Hetzner (espelho 24/7)

Este é o caminho **em produção hoje**. O daemon precisa ficar ligado direto — o Baileys mantém
um WebSocket vivo com o WhatsApp, e se o processo dorme o socket morre. Rodando no PC, o
espelho para toda vez que a máquina desliga.

## Por que a Hetzner, e não as gratuitas

| Opção | Custo real | Por que não |
|---|---|---|
| **Hetzner CX23** | ~US$ 7/mês | — é a escolha atual |
| VM Ampere da Oracle | R$ 0 | Capacidade ARM vive esgotada (`Out of host capacity`); pode levar dias |
| VM e2-micro da GCP | ~US$ 3,50/mês | A instância é free tier, mas o **IPv4 externo é cobrado** desde 2024 |
| PC/notebook em casa | R$ 0 | Só espelha com a máquina ligada |

O CX23 traz 2 vCPU, 4 GB de RAM e 40 GB de disco, na Alemanha. **A distância não importa
aqui:** o daemon conversa com o WhatsApp e com o Firestore em segundo plano, não com o
usuário — algumas centenas de milissegundos não mudam nada num espelho de mensagens.

---

## 1. Conta

[console.hetzner.cloud](https://console.hetzner.cloud) → *Sign up*. Exige cartão ou PayPal, e
contas novas passam por verificação (cartão ou documento) antes de liberar a criação de
servidores.

> **A autenticação em dois fatores é obrigatória.** Use um app que sincronize na nuvem (Google
> Authenticator com backup, 1Password, Bitwarden) e **guarde os códigos de recuperação fora do
> celular**. Perder o segundo fator numa conta paga que sustenta o WhatsApp do CRM é um
> problema sério — e já aconteceu neste projeto com a conta da Oracle.

---

## 2. Criar o servidor

**Add Server**, com:

| Campo | Valor |
|---|---|
| Location | **Falkenstein** |
| Image | **Ubuntu 24.04** |
| Type | *Shared vCPU* → **Cost-Optimized** → x86 (Intel/AMD) → **CX23** |
| Networking | **Public IPv4** marcado |
| SSH keys | **nenhuma** |
| Backups | **não marque** — custa +20% e é desnecessário: o pareamento e as mensagens vivem no Firestore, não no disco |
| Name | `whatsapp-daemon` |

Deixar sem chave SSH faz a Hetzner **mandar a senha de root por e-mail**, o que é bem mais
simples no Windows do que gerar um par de chaves.

Anote o **IP público** que aparece na lista.

---

## 3. Primeiro acesso

```powershell
ssh root@<IP>
```

Responda `yes` na pergunta de autenticidade e cole a senha do e-mail. **A senha não aparece na
tela enquanto é digitada** — é o comportamento normal do SSH. No Prompt de Comando do Windows,
cole com **botão direito**; `Ctrl+V` costuma não funcionar.

Na primeira entrada o sistema obriga a trocar a senha: pede a atual, depois a nova duas vezes.

### Se der `Permission denied`

Não insista — resete pelo painel: servidor → menu **Rescue** → **Reset root password**. A senha
nova aparece **na tela** (copie na hora, some ao fechar). Se o painel pedir, reinicie a máquina
em **Power → Restart** antes de tentar de novo.

---

## 4. Instalar

```bash
apt update && apt install -y git
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v          # v20 ou maior
```

```bash
cd /root
git clone https://github.com/danihono/crm-titas.git
cd crm-titas/whatsapp-daemon
npm ci
npm run build
```

> Rode o `npm ci` **na própria VM**. Nunca copie `node_modules` de outra máquina: o `sharp`,
> que vem junto com o Baileys, traz binário compilado por arquitetura.

---

## 5. Credencial

O daemon usa o Admin SDK e ignora as security rules, então precisa da chave da service account.
Mande do seu PC, **numa segunda janela** (deixe a do SSH aberta):

```powershell
scp C:\wa-daemon\service-account.json root@<IP>:/root/service-account.json
```

Na VM, restrinja a leitura ao dono:

```bash
chmod 600 /root/service-account.json
```

Crie o `.env` — o daemon carrega esse arquivo sozinho no boot (`src/config.ts` importa
`dotenv/config`):

```bash
cat > /root/crm-titas/whatsapp-daemon/.env <<'EOF'
FIREBASE_PROJECT_ID=titas-c8967
GOOGLE_APPLICATION_CREDENTIALS=/root/service-account.json
EOF
```

### Permissões que a service account precisa

Sem **as duas**, o daemon sobe mas falha pela metade — mensagem de texto funciona e toda mídia
falha com 403:

```bash
gcloud projects add-iam-policy-binding titas-c8967 \
  --member=serviceAccount:whatsapp-daemon@titas-c8967.iam.gserviceaccount.com \
  --role=roles/datastore.user

gcloud projects add-iam-policy-binding titas-c8967 \
  --member=serviceAccount:whatsapp-daemon@titas-c8967.iam.gserviceaccount.com \
  --role=roles/storage.objectAdmin
```

> Use `gcloud projects add-iam-policy-binding` para as duas. A variante com `gsutil iam ch`
> falhou silenciosamente neste projeto, e o sintoma só apareceu semanas depois, na forma de
> mídia que não carregava.

**Confira em vez de torcer.** O daemon traz um diagnóstico que responde isso em uma tela:

```bash
cd /root/crm-titas/whatsapp-daemon && node scripts/check-storage.mjs
```

Ele imprime **qual identidade está de fato agindo** (o `client_email` do JSON), o bucket, e
testa gravação, URL de download e remoção **separadamente** — `save()` fala com a API do GCS e
`getDownloadURL()` com a do Firebase Storage, em outro host, então uma pode passar e a outra
não. Quando falha, mostra o erro cru com a etapa.

> Confira se o `client_email` impresso é exatamente o principal que recebeu a permissão.
> Conceder ao principal errado é a falha mais comum aqui, e o sintoma é idêntico ao de não ter
> concedido nada.

**Um 403 em `storage.buckets.get` não quer dizer nada.** `roles/storage.objectAdmin` concede
`storage.objects.*` e **não** inclui leitura de metadado do bucket — então consultar se o
bucket existe falha com 403 mesmo com a permissão perfeitamente concedida. O daemon nunca lê
metadado de bucket; o que importa é gravar objeto. Por isso o script trata essa consulta como
aviso e segue para a prova de escrita. A permissão que faltar de verdade aparece como 403 em
`storage.objects.create`.

Para ver o que a conta tem hoje:

```bash
gcloud projects get-iam-policy titas-c8967 \
  --flatten="bindings[].members" \
  --filter="bindings.members:whatsapp-daemon@titas-c8967.iam.gserviceaccount.com" \
  --format="table(bindings.role)"
```

A partir da versão com esta seção o daemon roda essa mesma sonda **sozinho, no boot**, e
publica o veredito no heartbeat: sem permissão, o CRM mostra a tarja "O serviço não consegue
salvar arquivos" em vez de simplesmente perder mídia em silêncio.

---

## 6. Passar a sessão da máquina antiga

**A ordem importa.** Duas cópias no mesmo pareamento fariam o WhatsApp deslogar as duas; o lease
(`whatsappSessions/{uid}.lock`, ver `src/lease.ts`) impede isso, mas a troca limpa evita esperar
os 90 s do TTL.

1. **Na máquina antiga:** `Ctrl+C` no processo, ou Agendador de Tarefas → **Finalizar** e
   **Desabilitar**. O desligamento limpo solta o lease na hora.
2. **Na VM**, em primeiro plano, para ver o log:

```bash
cd /root/crm-titas/whatsapp-daemon && node lib/index.js
```

Espere `heartbeat iniciado` e `rehidratando sessões`. **Não pode aparecer** `lease detida por
outra instância` — se aparecer, a máquina antiga ainda está de pé.

**Não vai pedir QR:** o pareamento mora no Firestore, não em disco. Confirme no CRM que a tarja
"Serviço de WhatsApp offline" sumiu e encerre com `Ctrl+C`.

---

## 7. Serviço systemd

Fechar o terminal mata um processo em primeiro plano junto com a sessão SSH. O systemd resolve:
roda no fundo, sobe no boot e reinicia se travar.

```bash
cat > /etc/systemd/system/whatsapp-daemon.service <<'EOF'
[Unit]
Description=WhatsApp mirror daemon (Titas CRM)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/crm-titas/whatsapp-daemon
ExecStart=/usr/bin/node lib/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now whatsapp-daemon
systemctl status whatsapp-daemon      # tem que dizer active (running)
```

Não precisa de `EnvironmentFile`: o daemon lê o `.env` a partir do `WorkingDirectory`.

Dia a dia:

```bash
journalctl -u whatsapp-daemon -f       # log ao vivo (Ctrl+C sai do log, não do serviço)
journalctl -u whatsapp-daemon -n 50    # últimas 50 linhas
systemctl restart whatsapp-daemon
```

---

## 8. Encerrar a máquina antiga

Só depois de confirmar que o CRM segue conectado com a VM ligada:

1. Desabilite a tarefa do Agendador de Tarefas no Windows.
2. **Apague o `service-account.json` de todos os PCs.** A partir daqui a VM é o único lugar que
   precisa dele, e quem tem esse arquivo alcança o CRM inteiro.
3. Se a chave chegou a ficar numa máquina que não é sua, revogue:

```powershell
gcloud iam service-accounts keys list --iam-account=whatsapp-daemon@titas-c8967.iam.gserviceaccount.com
gcloud iam service-accounts keys delete <KEY_ID> --iam-account=whatsapp-daemon@titas-c8967.iam.gserviceaccount.com
```

---

## 9. Atualizar o daemon

Sempre que algo mudar em `whatsapp-daemon/`:

```bash
ssh root@<IP>
cd /root/crm-titas && git pull origin main
cd whatsapp-daemon && npm install && npm run build
systemctl restart whatsapp-daemon
```

> **Alteração em `src/` (o site) não se atualiza aqui.** São dois programas separados que
> conversam pelo Firestore: o site vai para o Firebase Hosting
> (`npm run build && firebase deploy --only hosting`), o daemon vive nesta VM. Quando uma
> mudança pega os dois lados, os dois passos são necessários.

---

## 10. Se algo não funcionar

| Sintoma | Causa provável |
|---|---|
| `Permission denied` no SSH | Senha errada; resete em **Rescue → Reset root password** |
| Serviço reinicia em loop | `journalctl -u whatsapp-daemon -n 50`; quase sempre caminho errado em `GOOGLE_APPLICATION_CREDENTIALS` |
| `lease detida por outra instância` | Outra cópia ainda rodando (PC antigo, ou tarefa do Windows habilitada) |
| Bolha diz **"o serviço não pôde salvá-la"** (`storage_denied`) | 403 do Storage: falta `roles/storage.objectAdmin`, ou ela foi para o principal errado (§5). Rode `node scripts/check-storage.mjs` |
| Bolha diz **"falhou ao salvar o arquivo"** (`storage_failed`) | Storage acessível mas a gravação falhou (rede, 5xx, cota). O log traz `stage` e `err.code` |
| Bolha diz **"não foi possível baixar do WhatsApp"** (`download_failed`) | Lado do WhatsApp/rede da VPS — nada a ver com permissão. Log: `falha ao BAIXAR mídia do WhatsApp` |
| Bolha diz **"o WhatsApp não tem mais este arquivo"** (`wa_media_expired`) | Blob saiu da CDN e o aparelho de origem não reenviou. Irrecuperável se o celular não tem mais o arquivo |
| Texto chega, **mídia nunca**, sem tarja nem código | Daemon anterior a esta versão. Atualize: o erro atual é genérico e não diz o passo |
| Foto de contato não aparece | Mesma causa das duas primeiras — `photo.ts` grava no mesmo bucket |
| Mídia antiga quebrada não volta com **Recuperar mídias** | Falhou antes de o daemon guardar o material de retentativa (sem `mediaKey`, não há como rebaixar). "Recuperar histórico" também não resolve: ele só pede mensagens ANTERIORES à mais antiga espelhada |
| CRM diz "Serviço de WhatsApp offline" | `systemctl status`; se estiver ativo, confira o relógio do PC (a comparação do heartbeat usa a hora local do navegador) |
| Contato como "Contato WhatsApp" | Conversa chegou por `@lid` e o mapeamento ainda não veio. `node scripts/lid-report.mjs` mede quantos faltam |
| Erro do `sharp` ao subir | `node_modules` de outra arquitetura: `rm -rf node_modules && npm ci` na VM |

---

## 11. Custo

- **Servidor CX23:** ~US$ 6,49/mês
- **IPv4 público:** ~US$ 0,50/mês (cobrado à parte, e necessário — sem ele não há saída para a
  internet nem acesso SSH)
- **Firestore/Storage:** dentro da cota gratuita diária para poucas conexões

Nada de Cloud Run: o serviço foi deletado, e era ele — instância always-on com CPU sempre
alocada — que dominava a fatura e motivou toda esta migração.
