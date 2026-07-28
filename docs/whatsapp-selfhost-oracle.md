# Rodar o daemon numa VM da Oracle Always Free (custo zero, 24/7)

Tira o espelho de WhatsApp da máquina pessoal sem passar a pagar por isso. O daemon precisa
ficar ligado direto (o Baileys mantém um WebSocket vivo), e a Always Free da Oracle é a única
opção realmente gratuita que encontramos: **o IPv4 público está incluído**, ao contrário da GCP,
que passou a cobrar ~US$ 3/mês por endereço mesmo no free tier.

Pré-requisito: o daemon já funcionando no PC (ver `whatsapp-selfhost.md`). Este guia é a
mudança de casa, não a primeira instalação.

---

## 0. Avisos antes de começar

- **A capacidade ARM vive esgotada.** "Out of host capacity" ao criar a VM Ampere é comum em
  São Paulo. Tente Vinhedo (`sa-vinhedo-1`), ou repita mais tarde — costuma liberar. Em último
  caso dá para usar a `VM.Standard.E2.1.Micro` (AMD, 1 GB), mas aí precisa de swap.
- **Cartão de crédito é exigido no cadastro**, para verificação. Não há cobrança enquanto você
  ficar dentro do Always Free, mas fique atento a não criar recurso fora dele por engano.
- **A chave da service account vai para o disco da VM.** É a diferença para a GCP, onde o
  metadata server resolve sem arquivo. Quem tem esse arquivo alcança o CRM inteiro.

---

## 1. Criar a VM

No console da Oracle: *Compute* → *Instances* → *Create instance*.

| Campo | Valor |
|---|---|
| Image | Canonical Ubuntu 24.04 |
| Shape | `VM.Standard.A1.Flex` (Ampere ARM) |
| OCPU / memória | 1 OCPU e 6 GB já sobra |
| Região | `sa-saopaulo-1` ou `sa-vinhedo-1` |
| Rede | VCN padrão, **com** IP público |

Salve a chave SSH que o console oferece — sem ela você não entra.

**Não abra porta nenhuma** na security list. O daemon fala com o CRM por uma fila no Firestore
e só precisa de internet de saída, que já vem por padrão.

---

## 2. Preparar a máquina

```bash
ssh -i sua-chave.key ubuntu@<ip-publico>

sudo apt update && sudo apt install -y git
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # tem que sair v20.x ou maior
```

---

## 3. Credencial

Crie uma chave **nova**, dedicada a esta VM — assim você revoga a do PC depois sem derrubar a
VM, e cada máquina tem a sua.

Na sua máquina (onde o gcloud está logado):

```powershell
gcloud iam service-accounts keys create C:\wa-daemon\oracle-key.json --iam-account=whatsapp-daemon@titas-c8967.iam.gserviceaccount.com
```

Mande para a VM e apague o arquivo local em seguida:

```powershell
scp -i sua-chave.key C:\wa-daemon\oracle-key.json ubuntu@<ip-publico>:/home/ubuntu/service-account.json
del C:\wa-daemon\oracle-key.json
```

Na VM, tranque o arquivo para que só o dono leia:

```bash
chmod 600 /home/ubuntu/service-account.json
```

---

## 4. Instalar o daemon

```bash
cd /home/ubuntu
git clone https://github.com/danihono/crm-titas.git
cd crm-titas/whatsapp-daemon
npm ci
npm run build
```

> Rode o `npm ci` **na VM**. Nunca copie `node_modules` do Windows: o `sharp` (usado pelo
> Baileys) traz binário compilado por arquitetura, e o do x64 não roda no ARM.

Crie o `.env` (o daemon carrega esse arquivo sozinho no boot):

```bash
cat > .env <<'EOF'
FIREBASE_PROJECT_ID=titas-c8967
GOOGLE_APPLICATION_CREDENTIALS=/home/ubuntu/service-account.json
EOF
```

---

## 5. Passar a sessão do PC para a VM

**Ordem importa.** Duas cópias no mesmo pareamento fariam o WhatsApp deslogar as duas — o lease
(`whatsappSessions/{uid}.lock`) impede isso, mas a troca limpa evita esperar os 90s do TTL.

1. **No PC:** `Ctrl+C` na janela do daemon. O desligamento solta o lease.
2. **Na VM:** teste em primeiro plano, para ver o log:

```bash
node lib/index.js
```

Espere `heartbeat iniciado` e `rehidratando sessões`. **Não vai pedir QR** — o pareamento mora
no Firestore, não em disco. Confirme no CRM que saiu do "Serviço de WhatsApp offline", depois
`Ctrl+C`.

---

## 6. Serviço systemd (o equivalente ao Agendador de Tarefas)

```bash
sudo tee /etc/systemd/system/whatsapp-daemon.service > /dev/null <<'EOF'
[Unit]
Description=WhatsApp mirror daemon (Titas CRM)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/crm-titas/whatsapp-daemon
ExecStart=/usr/bin/node lib/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now whatsapp-daemon
```

O `.env` é lido pelo próprio daemon a partir do `WorkingDirectory`, então não precisa de
`EnvironmentFile`.

Comandos do dia a dia:

```bash
systemctl status whatsapp-daemon      # está de pé?
journalctl -u whatsapp-daemon -f      # log ao vivo
sudo systemctl restart whatsapp-daemon
```

---

## 7. Encerrar o PC

Só depois de ver o `whatsappDaemon/heartbeat` avançando com a VM ligada:

1. Se tiver criado a tarefa no Agendador de Tarefas do Windows, **desative**.
2. Apague `C:\wa-daemon\service-account.json`.
3. Revogue a chave antiga, para ela não valer mais nem se vazar:

```powershell
gcloud iam service-accounts keys list --iam-account=whatsapp-daemon@titas-c8967.iam.gserviceaccount.com
gcloud iam service-accounts keys delete <KEY_ID-da-chave-do-PC> --iam-account=whatsapp-daemon@titas-c8967.iam.gserviceaccount.com
```

---

## 8. Atualizar o daemon depois

```bash
cd /home/ubuntu/crm-titas
git pull origin main
cd whatsapp-daemon && npm install && npm run build
sudo systemctl restart whatsapp-daemon
```

---

## 9. Se algo não funcionar

| Sintoma | Causa provável |
|---|---|
| `Out of host capacity` ao criar a VM | Ampere esgotado na região; tente Vinhedo ou repita mais tarde |
| Serviço reinicia em loop | `journalctl -u whatsapp-daemon -n 50`; quase sempre é caminho errado em `GOOGLE_APPLICATION_CREDENTIALS` |
| `lease detida por outra instância` | O daemon do PC ainda está rodando. Encerre-o |
| CRM diz "Serviço de WhatsApp offline" | `systemctl status`; se estiver ativo, veja se a VM tem saída para a internet |
| Erro do `sharp` ao subir | `node_modules` veio de outra arquitetura: `rm -rf node_modules && npm ci` na VM |
