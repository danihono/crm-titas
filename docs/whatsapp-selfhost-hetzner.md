# Rodar o daemon numa VM da Hetzner Cloud (~€4,50/mês, 24/7)

Tira o espelho de WhatsApp da máquina pessoal. O daemon precisa ficar ligado direto (o Baileys
mantém um WebSocket vivo), e a Hetzner é a opção paga mais barata que **sempre tem máquina
disponível** — diferente da Oracle Always Free, onde a capacidade ARM vive esgotada e a VM pode
ser recuperada pela Oracle sem aviso.

Pré-requisito: o daemon já funcionando em algum lugar (ver `whatsapp-selfhost.md`). Este guia é
a mudança de casa, não a primeira instalação. Se você estiver vindo da Oracle em vez do PC, o
roteiro é o mesmo — só troque "PC" por "VM antiga" nos passos 6 e 8.

Alternativa gratuita: `whatsapp-selfhost-oracle.md`.

---

## 0. Avisos antes de começar

- **A Hetzner não tem região no Brasil.** Os locais são Alemanha, Finlândia, EUA e Singapura. Na
  prática isso significa duas coisas: latência maior até o Firestore (~200 ms da Alemanha para
  `southamerica-east1`), o que só atrasa em frações de segundo o eco de um comando do CRM; e o
  WhatsApp passa a ver sua sessão saindo de um IP estrangeiro. Sessão de WhatsApp Web em VPS
  fora do país é comum e não costuma dar problema, mas é um risco a mais em relação a rodar no
  Brasil — se isso te incomoda, fique na Oracle (São Paulo/Vinhedo).
- **Conta nova passa por verificação.** A Hetzner pede documento e às vezes segura o cadastro
  por algumas horas. Contas recém-criadas também nascem com limite baixo de servidores. Não
  deixe para criar a conta no dia da migração.
- **Cobrança em euro, no cartão internacional** — some IOF e spread ao valor da tabela.
- **Firewall não vem ligado.** Ao contrário da Oracle, um servidor da Hetzner sobe com IP
  público e **nada bloqueado**. O passo 2 cria a firewall; não pule.
- **A chave da service account vai para o disco da VM.** Quem tem esse arquivo alcança o CRM
  inteiro, incluindo as mensagens espelhadas.

---

## 1. Escolher o plano

O daemon é leve: um processo Node com um WebSocket por sessão. O que consome é memória durante
o sync inicial e o processamento de mídia (o `sharp`, que vem com o Baileys). 4 GB sobra.

| Plano | vCPU / RAM | Arquitetura | Locais | Preço (ago/2026) |
|---|---|---|---|---|
| **CX23** ← recomendado | 2 / 4 GB | x86 (Intel) | Alemanha, Finlândia | €3,99 + €0,50 do IPv4 |
| CAX11 | 2 / 4 GB | ARM (Ampere) | Alemanha, Finlândia | €4,49 + €0,50 do IPv4 |
| CPX11 | 2 / 2 GB | x86 (AMD) | + EUA, Singapura | €5,49 / US$ 6,99 |

- **CX23 em Falkenstein (`fsn1`)** é a escolha padrão: mais barato e com RAM de sobra.
- **CPX11 em Ashburn (`ash`)** só se a latência incomodar — os EUA ficam a ~120 ms do Firestore
  em São Paulo, contra ~200 ms da Europa. Custa mais e tem metade da memória (com 2 GB, crie
  swap; veja o passo 11).
- Os tipos ARM (CAX) **não existem nos EUA nem em Singapura**.
- **Não contrate backup nem snapshot.** Todo o estado — pareamento, credenciais do Signal,
  mensagens — vive no Firestore. A VM é descartável: se ela morrer, você sobe outra e o
  `rehydrateAll()` reconecta sem pedir QR.

Preços mudam (a Hetzner reajustou duas vezes em 2026); confira em hetzner.com/cloud antes.

---

## 2. Criar o servidor e a firewall

No console (console.hetzner.cloud): *Servers* → *Add Server*.

| Campo | Valor |
|---|---|
| Location | Falkenstein (`fsn1`) |
| Image | Ubuntu 24.04 |
| Type | Shared vCPU → x86 → **CX23** |
| Networking | IPv4 **e** IPv6 |
| SSH key | **cole sua chave pública** |
| Backups / Volumes / Placement | nada |

Sobre a chave SSH: adicione uma no formulário. Sem chave, a Hetzner manda a senha de root por
e-mail — e o servidor fica exposto a força bruta desde o primeiro minuto.

Deixe **IPv4 ligado**. Dá para economizar €0,50 indo de IPv6-only, mas aí você depende de a sua
operadora ter IPv6 para entrar por SSH, e alguns endpoints de saída ainda são só IPv4.

### Firewall

Ainda no formulário (ou depois, em *Firewalls* → *Create Firewall*):

- **Inbound:** uma única regra — TCP **22**, origem `0.0.0.0/0` e `::/0`. Se o seu IP em casa
  for fixo, restrinja a ele; se for dinâmico, deixe aberto e confie na chave.
- **Outbound:** não mexa (liberado).

Nenhuma outra porta. O daemon fala com o CRM por uma fila no Firestore e **não escuta em porta
alguma** — precisa só de internet de saída.

> Se um dia você se trancar do lado de fora com a firewall, a Hetzner tem console gráfico
> (*Console*, no menu do servidor) que entra sem passar pela rede.

---

## 3. Preparar a máquina

A imagem da Hetzner loga como `root` (não `ubuntu`). Crie um usuário sem privilégio para o
daemon — ele não tem motivo nenhum para rodar como root.

```bash
ssh root@<ip-do-servidor>

apt update && apt upgrade -y && apt install -y git

curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v   # tem que sair v20.x ou maior

adduser --disabled-password --gecos "" wa
install -d -m 700 -o wa -g wa /home/wa/.ssh
cp /root/.ssh/authorized_keys /home/wa/.ssh/authorized_keys
chown wa:wa /home/wa/.ssh/authorized_keys && chmod 600 /home/wa/.ssh/authorized_keys
```

Feche a porta para senha, já que você entra por chave:

```bash
echo 'PasswordAuthentication no' > /etc/ssh/sshd_config.d/99-no-password.conf
systemctl restart ssh
```

Confirme que `ssh wa@<ip>` funciona **em outro terminal** antes de encerrar a sessão de root.

---

## 4. Credencial

Crie uma chave **nova**, dedicada a esta VM — assim você revoga a da máquina antiga depois sem
derrubar a nova, e cada máquina tem a sua.

Na sua máquina (onde o gcloud está logado):

```powershell
gcloud iam service-accounts keys create C:\wa-daemon\hetzner-key.json --iam-account=whatsapp-daemon@titas-c8967.iam.gserviceaccount.com
```

Mande para a VM e apague o arquivo local em seguida:

```powershell
scp C:\wa-daemon\hetzner-key.json root@<ip-do-servidor>:/home/wa/service-account.json
del C:\wa-daemon\hetzner-key.json
```

Na VM, entregue o arquivo ao `wa` e tranque para que só ele leia:

```bash
chown wa:wa /home/wa/service-account.json
chmod 600 /home/wa/service-account.json
```

---

## 5. Instalar o daemon

Como `wa` (`ssh wa@<ip-do-servidor>`):

```bash
cd /home/wa
git clone https://github.com/danihono/crm-titas.git
cd crm-titas/whatsapp-daemon
npm ci
npm run build
```

> Rode o `npm ci` **na VM**. Nunca copie `node_modules` de outra máquina: o `sharp` (usado pelo
> Baileys) traz binário compilado por sistema e arquitetura — o do Windows não roda no Linux, e
> o de x64 não roda no ARM do CAX11.

Crie o `.env` (o daemon carrega esse arquivo sozinho no boot):

```bash
cat > .env <<'EOF'
FIREBASE_PROJECT_ID=titas-c8967
GOOGLE_APPLICATION_CREDENTIALS=/home/wa/service-account.json
EOF
```

---

## 6. Passar a sessão para a VM

**Ordem importa.** Duas cópias no mesmo pareamento fariam o WhatsApp deslogar as duas — o lease
(`whatsappSessions/{uid}.lock`) impede isso, mas a troca limpa evita esperar os 90s do TTL.

1. **Na máquina antiga:** `Ctrl+C` na janela do daemon (ou `sudo systemctl stop
   whatsapp-daemon`, se era outra VM). O desligamento solta o lease.
2. **Na Hetzner:** teste em primeiro plano, para ver o log:

```bash
node lib/index.js
```

Espere `heartbeat iniciado` e `rehidratando sessões`. **Não vai pedir QR** — o pareamento mora
no Firestore, não em disco. Confirme no CRM que saiu do "Serviço de WhatsApp offline", depois
`Ctrl+C`.

---

## 7. Serviço systemd

```bash
sudo tee /etc/systemd/system/whatsapp-daemon.service > /dev/null <<'EOF'
[Unit]
Description=WhatsApp mirror daemon (Titas CRM)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=wa
WorkingDirectory=/home/wa/crm-titas/whatsapp-daemon
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

## 8. Encerrar a máquina antiga

Só depois de ver o `whatsappDaemon/heartbeat` avançando com a Hetzner ligada:

1. Se era o PC: desative a tarefa no Agendador de Tarefas do Windows e apague
   `C:\wa-daemon\service-account.json`. Se era outra VM: `sudo systemctl disable --now
   whatsapp-daemon` e destrua a instância.
2. Revogue a chave antiga, para ela não valer mais nem se vazar:

```powershell
gcloud iam service-accounts keys list --iam-account=whatsapp-daemon@titas-c8967.iam.gserviceaccount.com
gcloud iam service-accounts keys delete <KEY_ID-da-chave-antiga> --iam-account=whatsapp-daemon@titas-c8967.iam.gserviceaccount.com
```

---

## 9. Atualizar o daemon depois

```bash
cd /home/wa/crm-titas
git pull origin main
cd whatsapp-daemon && npm install && npm run build
sudo systemctl restart whatsapp-daemon
```

Manutenção do sistema, de vez em quando: `sudo apt update && sudo apt upgrade -y` e reboot se
pedir — o systemd sobe o daemon sozinho depois.

---

## 10. Se algo não funcionar

| Sintoma | Causa provável |
|---|---|
| SSH recusa conexão logo após criar o servidor | A imagem ainda está subindo (~30s), ou a firewall não tem a regra da porta 22 |
| `Permission denied (publickey)` como `wa` | O `authorized_keys` não foi copiado, ou ficou com dono/permissão errados (passo 3) |
| Serviço reinicia em loop | `journalctl -u whatsapp-daemon -n 50`; quase sempre é caminho errado em `GOOGLE_APPLICATION_CREDENTIALS`, ou o arquivo não pertence ao `wa` |
| `lease detida por outra instância` | O daemon da máquina antiga ainda está rodando. Encerre-o |
| CRM diz "Serviço de WhatsApp offline" | `systemctl status`; se estiver ativo, veja no log se há erro de rede na saída |
| Erro do `sharp` ao subir | `node_modules` veio de outra arquitetura: `rm -rf node_modules && npm ci` na VM |
| Processo morto por falta de memória (`Killed` no log) | Só acontece no CPX11 de 2 GB. Crie swap: `sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`, e adicione `/swapfile none swap sw 0 0` ao `/etc/fstab` |
