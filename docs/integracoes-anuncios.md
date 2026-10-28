# Integrações de anúncio: Meta Ads, Google Ads e formulários do site

Cada lead gerado num anúncio (ou num formulário do site) entra **sozinho** no quadro **Leads**,
na coluna *Novo lead*, já com a campanha, o anúncio e as UTMs de onde veio. As métricas das
campanhas (gasto, impressões, cliques) chegam de hora em hora e aparecem cruzadas com o funil
do CRM em **Campanhas → Anúncios**. E, se ligado, quando um card chega a *Qualificado* ou
*Ganho* o CRM avisa a Meta e o Google, para os algoritmos otimizarem por **quem compra**, e não
só por quem preenche o formulário.

```
Meta Graph API ──(poll 5 min: leads)───┐
Google Ads lead form ──(webhook)───────┤
Site / landing page (snippet) ─(webhook)┼─► Cloud Functions ─► users/{uid}/deals  (coluna "novo")
                                        │                     users/{uid}/contacts
Meta Insights / Google Ads API ──(1 h)──┴─► users/{uid}/adCampaigns, users/{uid}/adDaily
deals: card muda de etapa ──(trigger)──► Meta Conversions API / Google uploadClickConversions
```

Tudo é configurado em **Configurações → Integrações** (só o dono do ambiente altera; o gestor
consulta). Nenhum token passa pelo navegador depois de salvo: ele vai para o cofre cifrado e a
tela só mostra o final ("…a1b2").

---

## 1. Antes de tudo (uma vez por projeto, quem faz o deploy)

```bash
# Chave do cofre dos tokens: 32+ caracteres aleatórios. Trocar depois invalida os tokens salvos.
openssl rand -base64 32 | firebase functions:secrets:set INTEGRATIONS_KEY --data-file=-
npm --prefix functions run build
firebase deploy --only functions,firestore:rules
```

As funções novas: `receberLead` (HTTP público), `sincronizarLeadsMeta` (a cada 5 min),
`sincronizarAnuncios` (de hora em hora), `enviarConversoes` (trigger em `deals`) e as
callables `salvarIntegracao`, `testarIntegracao`, `gerarChaveWebhook` e
`sincronizarAnunciosAgora`. As agendadas exigem o plano Blaze (Cloud Scheduler).

Variáveis opcionais em `functions/.env`:

| Variável | Para quê | Padrão |
|---|---|---|
| `TITA_META_GRAPH_VERSION` | versão da Graph/Marketing API | `v25.0` |
| `TITA_GOOGLE_ADS_VERSION` | versão da Google Ads API | `v26` |

Na Marketing API da Meta, uma chamada para versão expirada **falha** (não cai para a seguinte),
e o Google desliga cada versão um ano depois de lançar. Quando uma das duas começar a dar erro
de versão, troque o número aqui e faça o redeploy. Não precisa mudar código.

No front, `VITE_LEAD_WEBHOOK_URL` permite trocar a URL pública do webhook (por exemplo, por um
rewrite do Hosting num domínio próprio).

---

## 2. Meta Ads (Facebook e Instagram)

**O que funciona:** leads dos formulários instantâneos (a cada 5 minutos), gasto, impressões,
cliques e leads por campanha (de hora em hora) e conversões de volta pelo pixel (Conversions API).

1. Em [developers.facebook.com](https://developers.facebook.com/apps), crie um app do tipo
   **Empresa** (Business), ligado ao portfólio empresarial do cliente, e adicione o produto
   **Marketing API**. Para ler os dados das próprias contas, o acesso padrão basta: não é
   preciso App Review.
2. Em **business.facebook.com → Configurações do negócio → Usuários → Usuários do sistema**,
   crie um usuário do sistema (Admin) e **atribua os ativos**:
   - a **Página** que recebe os leads;
   - a **Conta de anúncios**;
   - o **Pixel / conjunto de dados**, se for usar as conversões.
3. No mesmo usuário, clique em **Gerar novo token**, escolha o app e marque as permissões
   `ads_read`, `ads_management`, `leads_retrieval`, `pages_show_list`,
   `pages_read_engagement`, `pages_manage_ads` e `business_management`. Escolha a validade
   **Nunca**.
4. Se a Página usa o **Gerenciador de acesso a leads** (Página → Configurações → Acesso a
   leads), dê acesso ao app/usuário do sistema. Sem isso a Meta devolve a lista de leads vazia.
5. No CRM, em **Integrações → Meta Ads**, cole o token e clique em **Testar e buscar contas**.
   Escolha a conta de anúncio, a Página e o pixel, e clique em **Salvar**.
   Depois clique em **Sincronizar agora**: na primeira vez o CRM traz 30 dias de métricas e os
   leads dos últimos 3 dias.

**Para testar:** use a [Ferramenta de teste de anúncios de cadastro](https://developers.facebook.com/tools/lead-ads-testing),
gere um lead na Página e aguarde até 5 minutos (ou clique em **Sincronizar agora**).

---

## 3. Google Ads

São duas partes independentes.

### 3a. Formulário de lead → CRM (sem aprovação do Google)

1. Em **Integrações → Site e formulários**, gere a chave.
2. No Google Ads, abra o **recurso de formulário de lead** da campanha, vá em
   **Opções de entrega de leads → Integração de webhook** e cole a **URL do webhook** e a
   **chave** que o cartão do Google mostra.
3. Clique em **Enviar dados de teste**. O card aparece em *Novo lead* com a marca **TESTE**, e
   pode ser apagado depois.

O lead do formulário já chega com o `gclid`, que é o que permite a conversão offline (3c).

### 3b. Métricas (Google Ads API)

Exige um **developer token** com acesso *Básico*. O token de *teste* só enxerga contas de teste.

1. Numa conta de administrador (MCC), vá em **Ferramentas → Central de API** e solicite o
   developer token. A aprovação costuma levar alguns dias.
2. No Google Cloud (qualquer projeto): ative a **Google Ads API**, configure a tela de
   consentimento OAuth e crie uma credencial **ID do cliente OAuth** (tipo *App da Web*, com
   `https://developers.google.com/oauthplayground` nos URIs de redirecionamento).
3. No [OAuth Playground](https://developers.google.com/oauthplayground), em ⚙️ marque
   *Use your own OAuth credentials*, cole o client ID e o client secret, autorize o escopo
   `https://www.googleapis.com/auth/adwords` com uma conta que acesse a conta de anúncios e
   troque o código pelo **refresh token**.
4. No CRM, em **Integrações → Google Ads**, preencha:
   - o **ID da conta** (customer ID);
   - o **ID da MCC**, se o acesso for por ela;
   - o developer token, o client ID, o client secret e o refresh token.

   Clique em **Testar e buscar contas** e depois em **Salvar**.

### 3c. Conversões offline

1. No Google Ads: **Metas → Conversões → Nova ação de conversão → Importar → Outra fonte de
   dados ou CRM → Rastrear conversões a partir de cliques**. Crie uma ação para cada etapa que
   quiser medir (ex.: "Lead qualificado", "Venda").
2. Deixe a **codificação automática** (auto-tagging) ligada na conta, senão o anúncio não gera `gclid`.
3. No CRM, clique em **Testar** no cartão do Google: as ações aparecem na lista do cartão
   **Conversões de volta**.

Só leads com `gclid` podem ser enviados: os que vêm do formulário do Google e os do site com o
snippet instalado.

---

## 4. Site, landing pages e outras ferramentas

Em **Integrações → Site e formulários**, gere a chave e copie o código para o site, antes do
`</body>`. Ele:

- guarda `utm_*`, `gclid` e `fbclid` por 90 dias quando a pessoa chega pelo anúncio, mesmo
  que ela navegue antes de preencher;
- envia ao CRM todo formulário marcado com `data-titas`, sem atrapalhar o envio que o
  formulário já fazia.

```html
<form data-titas>
  <input name="nome" required>
  <input name="email" type="email">
  <input name="telefone">
  <textarea name="mensagem"></textarea>
  <!-- anti-robô: humano não vê, não preenche -->
  <input name="_hp" style="display:none" tabindex="-1" autocomplete="off">
  <button>Enviar</button>
</form>
```

Também dá para mandar direto, de Zapier, Make, RD Station, Elementor ou um backend próprio:

```bash
curl -X POST "https://southamerica-east1-SEU-PROJETO.cloudfunctions.net/receberLead?k=SUA_CHAVE" \
  -H 'content-type: application/json' \
  -d '{"nome":"Ana","email":"ana@ex.com","telefone":"(11) 99999-8888","utm_source":"facebook","utm_medium":"cpc","utm_campaign":"black-friday"}'
```

O endpoint aceita JSON, `text/plain` com JSON e `application/x-www-form-urlencoded`. Com
`_redirect=https://…` num formulário HTML puro, ele devolve 303 para essa página.

Campos reconhecidos (em português ou inglês): nome/name/full_name, email, telefone/phone/
whatsapp/celular, empresa/company. Qualquer outro campo vira resposta do formulário e aparece
no bloco **Origem** do card.

Telefone sem DDI com 10 ou 11 dígitos ganha o 55, para o WhatsApp casar a conversa com o
mesmo contato.

---

## 5. Conversões de volta

Em **Integrações → Conversões de volta**, ligue o envio e escolha, por etapa do quadro Leads, o
evento da Meta e a ação de conversão do Google. O padrão é:

- *Qualificado* → `QualifiedLead`;
- *Ganho* → `Purchase`, com o valor do negócio.

- Só a **primeira** chegada em cada etapa é enviada. Voltar e avançar de novo não duplica: o
  registro fica em `deals.conversionsSent`, e `event_id` e `orderId` fazem a própria
  plataforma descartar repetições.
- **Meta:** vai como evento de CRM (`action_source: system_generated`). O lead do formulário
  da Meta é identificado pelo `lead_id`. Os demais são identificados por e-mail e telefone em
  hash (SHA-256) e pelo `fbc`, quando o site capturou o `fbclid`.
- **Código de teste da Meta:** com ele, os eventos aparecem em *Gerenciador de Eventos →
  Eventos de teste*. Apague-o depois de conferir, senão os eventos não contam.
- O resultado de cada envio aparece no bloco **Origem** do card e no cartão de conversões
  (último erro, se houver).

---

## 6. Onde fica cada coisa (para quem mantém o código)

| Caminho | Quem escreve | Quem lê |
|---|---|---|
| `integrationSecrets/{tenant}` | callables (tokens cifrados, AES-256-GCM) | só o servidor (sem regra = default-deny) |
| `leadWebhooks/{sha256(chave)}` | `gerarChaveWebhook` | só o servidor |
| `users/{uid}/integrations/{meta,google,site,conversoes}` | callables e agendamentos | dono e gestor |
| `users/{uid}/adCampaigns/{campaignKey}` | `sincronizarAnuncios` | dono e gestor |
| `users/{uid}/adDaily/{campaignKey}_{yyyy-mm-dd}` | `sincronizarAnuncios` | dono e gestor |
| `deals.source`, `deals.conversionsSent` | ingestão e trigger | todos os membros; o navegador **não** grava |

- **Código:** `functions/src/anuncios/` (a normalização pura está em `normalizar.ts`, coberta
  por `tests/unit/anuncios.test.ts`) e `tests/rules/anuncios.test.ts` para as regras.
- **Ids determinísticos:** o card do lead tem id `meta_<leadId>`, `google_<leadId>` ou
  `site_<event_id>`, então reentrega do webhook e poll sobreposto não duplicam.
- **Exclusão de cliente:** `excluirCliente` também apaga `integrationSecrets/{uid}` e as
  chaves de webhook do tenant.
- **Limites:** o webhook aceita 600 leads por chave por hora e corpo de até 32 KB.

**Limitações conhecidas:**

- Leads da Meta chegam por poll a cada 5 minutos, e não por webhook em tempo real. O webhook
  exigiria um app central da Titãs com App Review e fica para quando entrar o login OAuth.
- Métricas do Google exigem developer token aprovado. Antes disso, só os leads do formulário
  funcionam.
- Moeda: o gasto é guardado na moeda da conta, e a tela mostra em BRL.
