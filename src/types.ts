// Tipos de domínio do CRM (lado app — datas já convertidas para Date pelos converters).
// Espelham o modelo Firestore users/{uid}/... do plano.

export type FileType = 'pdf' | 'doc' | 'img' | 'xls'
export type ThemeMode = 'light' | 'dark' | 'system'
export type ActivityStatus = 'pendente' | 'atrasada' | 'concluida'
export type InvoiceStatus = 'Paga' | 'Pendente' | 'Vencida'
export type AgentRole = 'agent' | 'user'
export type ContactNameSource = 'phone' | 'profile' | 'agenda' | 'manual'
export type HistoryImportStatus = 'loading' | 'done' | 'error'
/** Origem da foto do contato: migrada do WhatsApp, enviada à mão, ou removida pelo usuário. */
export type PhotoSource = 'whatsapp' | 'manual' | 'removed'

/** Estado da recuperação de histórico antigo do WhatsApp de um contato. */
export interface HistoryImport {
  status: HistoryImportStatus
  /** total de mensagens trazidas nas respostas on-demand. */
  imported?: number
  error?: string
  at?: Date
}

/** Estado da recuperação das mídias que ficaram sem arquivo salvo. */
export interface MediaRecovery {
  status: HistoryImportStatus
  /** mensagens que a rodada tentou. */
  total?: number
  recovered?: number
  failed?: number
  /** código dominante da falha — diz se adianta tentar de novo (ex.: storage_denied não). */
  error?: string
  at?: Date
}

export interface Column {
  id: string
  title: string
  color: string
  order: number
  /** Etapa que existe no quadro mas NÃO é degrau do funil (a coluna Perdido). */
  outOfFunnel?: boolean
}

export interface Board {
  id: string
  name: string
  icon: string
  /** Cor do quadro, escolhida pelo usuário. Hex. */
  color: string
  columns: Column[]
  createdAt?: Date
  /**
   * Quadro do sistema — nome, etapas e existência são fixos. Hoje só o 'leads', que é o
   * trilho do funil do painel: se as etapas pudessem ser renomeadas ou apagadas, o funil
   * mudaria de significado sozinho e o histórico de avanço perderia o pé.
   */
  system?: 'leads'
}

/** Card do Kanban — normalizado em users/{uid}/deals. value em reais (inteiro). */
export interface Deal {
  id: string
  company: string
  contact: string
  value: number
  initials: string
  tag: string
  boardId: string
  columnId: string
  order: number
  createdAt?: Date
  /** Contato vinculado, quando escolhido da lista. Digitar o nome à mão continua valendo. */
  contactId?: string
  /**
   * Quando o card alcançou cada etapa, por id de coluna. Só é escrito na PRIMEIRA vez que
   * ele chega — voltar atrás não reescreve a data. É isso que deixa o funil contar "passou
   * por aqui" em vez de "está aqui agora", e o que permite medir o tempo de cada degrau.
   */
  reachedAt?: Record<string, Date>
}

/** Tipo de caixa do fluxograma — define a cor da faixa e o ícone. */
export type FlowNodeKind = 'start' | 'step' | 'decision' | 'end'
/** Como o fluxo nasceu: desenhado à mão ou gerado pelo Titã IA. */
export type FlowSource = 'manual' | 'ia'

/** Caixa do quadro de fluxos. x/y em coordenadas do canvas. */
export interface FlowNode {
  id: string
  title: string
  subtitle: string
  kind: FlowNodeKind
  x: number
  y: number
}

/** Seta ligando duas caixas. `label` vazio = seta sem rótulo. */
export interface FlowEdge {
  id: string
  from: string
  to: string
  label: string
}

/**
 * Fluxograma livre — um doc por fluxo em users/{uid}/flows, com nós e setas
 * embutidos (mesma escolha de Board.columns: são poucos e salvam juntos).
 */
export interface Flow {
  id: string
  name: string
  description: string
  nodes: FlowNode[]
  edges: FlowEdge[]
  source: FlowSource
  createdAt?: Date
  updatedAt?: Date
}

/** Papéis dentro de um tenant. `dono` é quem criou a conta; os demais entram por convite. */
export type MemberRole = 'dono' | 'gestor' | 'atendente'

/**
 * Atendente com acesso ao tenant — users/{tenantUid}/members/{memberUid}.
 * O id do doc É o uid do Auth: as security rules checam vínculo por
 * exists(.../members/$(request.auth.uid)), e isso só funciona com o uid na chave.
 */
export interface Member {
  id: string
  name: string
  email: string
  role: MemberRole
  /** Setores em que o atendente atua. Vazio = todos. */
  sectorIds: string[]
  active: boolean
  /** Nome do tenant, desnormalizado — o atendente lista os vínculos dele sem ler cada dono. */
  tenantName?: string
  createdAt?: Date
}

/** Convite pendente — invites/{email}, criado pelo tenant e aceito pelo convidado. */
export interface Invite {
  id: string
  email: string
  tenantUid: string
  tenantName: string
  role: MemberRole
  sectorIds: string[]
  createdAt?: Date
}

/** Fila/departamento de atendimento (Comercial, Suporte, Financeiro...). */
export interface Sector {
  id: string
  name: string
  color: string
  /** Mensagem automática ao transferir a conversa para o setor. Vazio = nenhuma. */
  greeting: string
  order: number
  createdAt?: Date
}

/** Etiqueta aplicável a contatos/conversas. */
export interface Tag {
  id: string
  label: string
  color: string
  order: number
  createdAt?: Date
}

/** Resposta pronta, chamada no chat por `/atalho`. Suporta variáveis {{nome}}. */
export interface QuickReply {
  id: string
  shortcut: string
  title: string
  text: string
  sectorId: string
  createdAt?: Date
}

export type CustomFieldType = 'texto' | 'numero' | 'data' | 'lista' | 'booleano'

/** Campo extra do cadastro de contato — o valor fica em Contact.custom[fieldId]. */
export interface CustomField {
  id: string
  label: string
  type: CustomFieldType
  /** Opções quando type === 'lista'. */
  options: string[]
  order: number
  createdAt?: Date
}

/**
 * Janela de atendimento de um dia. `open`/`close` em "HH:MM".
 * Fora da janela o CRM avisa o atendente e o chatbot responde a mensagem de ausência.
 */
export interface DayHours {
  enabled: boolean
  open: string
  close: string
}

/** Horários de atendimento, domingo (0) a sábado (6). */
export interface BusinessHours {
  days: DayHours[]
  /** Resposta automática fora do horário. Vazio = não responde. */
  awayMessage: string
  timezone: string
}

/** Estado do atendimento, espelhando as abas Entrada · Esperando · Finalizados. */
export type ConvStatus = 'entrada' | 'esperando' | 'finalizado'

/**
 * Atendimento corrente do contato — gravado como mapa `conv` no PRÓPRIO doc do contato.
 * Fica junto (e não em coleção separada) porque a lista de conversas e a lista de
 * contatos são a mesma tela: assim a caixa de entrada continua sendo UMA consulta.
 */
export interface ConvState {
  status: ConvStatus
  /** Doc correspondente em users/{uid}/conversations — o ciclo atual no histórico. */
  recordId: string
  /** uid do atendente responsável. Vazio = na fila, sem dono. */
  assignedTo: string
  assignedName: string
  sectorId: string
  tagIds: string[]
  openedAt?: Date
  /** Primeira resposta NOSSA depois que o cliente escreveu — base do relatório. */
  firstResponseAt?: Date
  closedAt?: Date
  closedBy?: string
}

/**
 * Ciclo de atendimento — users/{uid}/conversations/{convId}.
 * Só existe para os Relatórios: o mapa `conv` do contato guarda apenas o ciclo atual,
 * e "conversas finalizadas no período" precisa do histórico. Fica numa coleção PLANA do
 * tenant (e não sob o contato) para o relatório ser uma consulta simples, sem
 * collectionGroup — que exigiria regra baseada em `resource.data` e não fecharia para
 * atendentes convidados.
 */
export interface ConversationRecord {
  id: string
  contactId: string
  contactName: string
  assignedTo: string
  assignedName: string
  sectorId: string
  tagIds: string[]
  openedAt: Date
  firstResponseAt?: Date
  closedAt?: Date
  closedBy?: string
  /** Nota de 1 a 5 da pesquisa de satisfação, quando respondida. */
  rating?: number
}

export interface Contact {
  id: string
  name: string
  company: string
  initials: string
  online: boolean
  role: string
  email: string
  phone: string
  whatsapp: string
  status: string
  /** Origem do contato: 'whatsapp' quando auto-criado pelo espelhamento (expurgo LGPD). */
  source?: string
  /** Origem do nome exibido no contato. */
  nameSource?: ContactNameSource
  /** URL da foto do contato (migrada do WhatsApp ou enviada à mão). Vazio = usa iniciais. */
  photoUrl?: string
  /** Caminho da foto no Storage (para remover/substituir). */
  photoPath?: string
  /** Origem da foto — controla se o daemon pode sobrescrever (respeita 'manual'/'removed'). */
  photoSource?: PhotoSource
  /** Estado da recuperação de histórico antigo do WhatsApp (por contato). */
  historyImport?: HistoryImport
  mediaRecovery?: MediaRecovery
  lastMessage?: string
  lastMessageAt?: Date
  /** Mensagens recebidas desde a última vez que a conversa foi aberta. */
  unreadCount?: number
  /** Atendimento corrente. Ausente em contatos criados antes dos módulos de atendimento. */
  conv?: ConvState
  /** Valores dos campos personalizados, por id do CustomField. */
  custom?: Record<string, string>
  /** Pediu para não receber campanhas ("SAIR", "PARE"). Nenhum disparo alcança quem tem isto. */
  optOut?: boolean
  createdAt?: Date
}

export interface Message {
  id: string
  fromMe: boolean
  text: string
  sentAt: Date
  mediaType?: 'image' | 'video' | 'audio' | 'document' | 'sticker'
  mediaUrl?: string
  mediaPath?: string
  mimeType?: string
  fileName?: string
  sizeBytes?: number
  caption?: string
  /**
   * Por que a mídia não tem arquivo. Fica `string` de propósito, e não uma união: docs
   * antigos carregam códigos anteriores a esta lista, e estreitar o tipo os quebraria.
   * Hoje: 'view_once_unsupported' | 'download_failed' | 'wa_media_expired'
   *     | 'storage_denied' | 'storage_failed'
   */
  mediaError?: string
  importedFromHistory?: boolean
  /** true quando a mídia ainda não está disponível para renderização/download. */
  pending?: boolean
  /** Canal de origem: 'whatsapp' para mensagens espelhadas. */
  channel?: string
}

export interface FileMeta {
  id: string
  name: string
  type: FileType
  sizeBytes: number
  storagePath: string
  downloadURL: string
  uploadedAt: Date
}

export interface Activity {
  id: string
  /** id de um ActType */
  type: string
  title: string
  /** Nome do cliente, como aparece na lista. Continua sendo o que se lê na tela. */
  contact: string
  /**
   * Contato a que esta atividade pertence — o vínculo com a CONVERSA.
   *
   * Opcional porque tudo o que foi criado antes deste campo só tem o nome em
   * `contact`. Quem cruza os dois (a aba Agenda da conversa) casa por id quando
   * existe e cai no nome quando não existe, senão a tela nasceria vazia para
   * quem já usa o sistema.
   */
  contactId?: string
  dueAt: Date
  done: boolean
  createdAt?: Date
}

export interface ActType {
  id: string
  label: string
  icon: string
  color: string
  bg: string
  evColor: string
}

/** Forma de pagamento registrada na nota. Livre o bastante para servir de registro. */
export type PaymentMethod = 'Pix' | 'Boleto' | 'Cartão' | 'Transferência' | 'Dinheiro' | 'Outro'

/**
 * Nota de faturamento — registro interno, não documento fiscal.
 *
 * Os campos abaixo de `createdAt` são todos opcionais de propósito: notas emitidas antes
 * deste módulo ganhar corpo não têm nenhum deles, e precisam continuar abrindo.
 */
export interface Invoice {
  id: string
  num: string
  client: string
  value: number
  dueAt: Date
  status: InvoiceStatus
  createdAt?: Date
  /** Número em forma de inteiro — `num` é string e ordena mal a partir de #1000. */
  seq?: number
  desc?: string
  /** Contato vinculado, quando o cliente foi escolhido da lista. */
  contactId?: string
  paymentMethod?: PaymentMethod
  notes?: string
  /** Quando a baixa foi dada. Só existe em nota paga. */
  paidAt?: Date
  /** Agrupa as notas geradas juntas (parcelamento ou recorrência mensal). */
  seriesId?: string
  /** Posição na série: 2 de 12. */
  installment?: { n: number; of: number }
  /** 'mensal' quando a série veio de uma cobrança recorrente. */
  recurrence?: 'mensal'
}

export interface EventDoc {
  id: string
  title: string
  date: Date
  dateKey: string
  time: string
  color: string
  subtitle: string
  activityId?: string
  scheduledMessageId?: string
  /** Contato do compromisso — mesma história do Activity.contactId. */
  contactId?: string
  createdAt?: Date
}

export type ScheduledMessageStatus = 'pending' | 'sent' | 'failed' | 'canceled'

export interface ScheduledMessage {
  id: string
  contactId: string
  contactName: string
  text: string
  dueAt: Date
  dateKey: string
  time: string
  eventId?: string
  status: ScheduledMessageStatus
  attempts: number
  lastError?: string
  sentMessageId?: string
  sentAt?: Date
  createdAt?: Date
  updatedAt?: Date
}

export interface Lead {
  id: string
  name: string
  company: string
  initials: string
  source: string
  value: number
  createdAt?: Date
}

/**
 * Variável de texto reutilizável — users/{uid}/variables/{id}.
 * Vale em respostas rápidas e campanhas: `{{chave}}` sai trocado pelo valor.
 */
export interface Variable {
  id: string
  key: string
  value: string
  description: string
  createdAt?: Date
}

/** Arquivo guardado na biblioteca de mídias — users/{uid}/mediaLibrary/{id}. */
export interface MediaAsset {
  id: string
  name: string
  type: FileType
  mimeType: string
  sizeBytes: number
  storagePath: string
  downloadURL: string
  uploadedAt: Date
}

/**
 * Documento da base de conhecimento — users/{uid}/knowledge/{id}.
 * É o material que o Titã IA passa a ter à mão ao responder.
 */
export interface KnowledgeDoc {
  id: string
  title: string
  content: string
  /** Fora, o documento fica guardado mas não entra no contexto do agente. */
  enabled: boolean
  createdAt?: Date
  updatedAt?: Date
}

/** Preferências da CONTA logada (não do tenant) — avisos de mensagem nova. */
export interface UserPrefs {
  notifyDesktop: boolean
  notifySound: boolean
  /**
   * Tema da interface. Espelho do que o dispositivo já gravou no localStorage
   * (src/store/themeStore.ts) — serve para o tema seguir a pessoa quando ela
   * entra de outro computador, não para mandar no que já está pintado.
   */
  theme: ThemeMode
}

export type CampaignStatus = 'rascunho' | 'enviando' | 'pausada' | 'concluida'
/** `enviando` é a reserva feita pelo daemon entre escolher o destinatário e o envio sair. */
export type CampaignTargetStatus = 'pendente' | 'enviando' | 'enviado' | 'falhou' | 'optout'

/**
 * Disparo de campanha por WhatsApp.
 *
 * O envio é deliberadamente lento: a conexão é Baileys (WhatsApp Web, não-oficial), e
 * disparo em massa rápido é a via curta para o número ser banido. `ratePerHour` é um
 * teto por campanha, e o daemon ainda aplica cota diária, aquecimento e horário.
 */
export interface Campaign {
  id: string
  name: string
  text: string
  /** Público: contatos com QUALQUER uma destas etiquetas. Vazio = todos os contatos. */
  tagIds: string[]
  status: CampaignStatus
  ratePerHour: number
  /** Só dispara dentro do horário de atendimento configurado. */
  respectBusinessHours: boolean
  total: number
  sent: number
  failed: number
  skipped: number
  createdBy: string
  startedAt?: Date
  finishedAt?: Date
  /** Quando o daemon pode mandar a próxima — é o intervalo com jitter já sorteado. */
  nextSendAt?: Date
  lastError?: string
  createdAt?: Date
}

/** Um destinatário da campanha — users/{uid}/campaigns/{id}/targets/{contactId}. */
export interface CampaignTarget {
  id: string
  contactId: string
  name: string
  phone: string
  status: CampaignTargetStatus
  sentAt?: Date
  error?: string
}

export interface AgentSources {
  pipeline: boolean
  contatos: boolean
  atividades: boolean
  conversas: boolean
  faturamento: boolean
}

export interface AgentConfig {
  name: string
  persona: string
  instructions: string
  sources: AgentSources
}

export interface AgentMessage {
  id: string
  role: AgentRole
  text: string
  createdAt?: Date
}

export interface Features {
  /** Espelhamento de WhatsApp habilitado para este tenant (feature-flag "no escuro"). */
  whatsapp?: boolean
}

export interface UserProfile {
  displayName: string
  role: string
  agent: AgentConfig
  features?: Features
  /** Nome da empresa/organização — cabeçalho de Configurações e dos convites. */
  orgName?: string
  businessHours?: BusinessHours
  /** Assinatura anexada às mensagens enviadas por esta conta. Vazio = nenhuma. */
  signature?: string
  phone?: string
  /** Texto enviado ao finalizar um atendimento. Só sai com `closingEnabled`. */
  closingMessage?: string
  closingEnabled?: boolean
  prefs?: UserPrefs
}
