/**
 * Todo texto da interface, nos três idiomas, lado a lado.
 *
 * A forma é `'chave': [português, español, english]`. Ter os três na MESMA
 * linha é a escolha central deste arquivo: com um arquivo por idioma, uma
 * tradução esquecida é um item faltando numa lista de mil — aqui ela é uma
 * tupla com dois elementos, e o `satisfies Record<string, Tri>` lá embaixo
 * recusa o build. Revisar uma tradução também vira ler uma linha, não caçar a
 * mesma chave em três arquivos.
 *
 * `{nome}` é interpolação (ver src/i18n/index.ts). Chave terminada em `_1` e
 * `_n` é par de singular/plural, consumido por `plural()`.
 *
 * O que NÃO entra aqui: nada que a pessoa tenha digitado. Etiqueta, setor,
 * nome de quadro, título de card, resposta rápida e campo personalizado saem
 * como ela escreveu, em qualquer idioma. Traduz-se o sistema, não o conteúdo.
 */

type Tri = readonly [pt: string, es: string, en: string]

export const CATALOGO = {
  // ── Comum: botões e palavras que se repetem em toda tela ──────────────
  'comum.salvar': ['Salvar', 'Guardar', 'Save'],
  'comum.cancelar': ['Cancelar', 'Cancelar', 'Cancel'],
  'comum.excluir': ['Excluir', 'Eliminar', 'Delete'],
  'comum.remover': ['Remover', 'Quitar', 'Remove'],
  'comum.editar': ['Editar', 'Editar', 'Edit'],
  'comum.criar': ['Criar', 'Crear', 'Create'],
  'comum.adicionar': ['Adicionar', 'Añadir', 'Add'],
  'comum.fechar': ['Fechar', 'Cerrar', 'Close'],
  'comum.voltar': ['Voltar', 'Volver', 'Back'],
  'comum.buscar': ['Buscar', 'Buscar', 'Search'],
  'comum.filtrar': ['Filtrar', 'Filtrar', 'Filter'],
  'comum.exportar': ['Exportar', 'Exportar', 'Export'],
  'comum.enviar': ['Enviar', 'Enviar', 'Send'],
  'comum.confirmar': ['Confirmar', 'Confirmar', 'Confirm'],
  'comum.sim': ['Sim', 'Sí', 'Yes'],
  'comum.nao': ['Não', 'No', 'No'],
  'comum.todos': ['Todos', 'Todos', 'All'],
  'comum.nenhum': ['Nenhum', 'Ninguno', 'None'],
  'comum.opcional': ['opcional', 'opcional', 'optional'],
  'comum.carregando': ['Carregando…', 'Cargando…', 'Loading…'],
  'comum.salvando': ['Salvando…', 'Guardando…', 'Saving…'],
  'comum.enviando': ['Enviando…', 'Enviando…', 'Sending…'],
  'comum.hoje': ['Hoje', 'Hoy', 'Today'],
  'comum.ontem': ['Ontem', 'Ayer', 'Yesterday'],
  'comum.amanha': ['Amanhã', 'Mañana', 'Tomorrow'],
  'comum.periodo': ['Período', 'Período', 'Period'],
  'comum.total': ['Total', 'Total', 'Total'],
  'comum.nome': ['Nome', 'Nombre', 'Name'],
  'comum.email': ['E-mail', 'Correo', 'Email'],
  'comum.telefone': ['Telefone', 'Teléfono', 'Phone'],
  'comum.valor': ['Valor', 'Importe', 'Amount'],
  'comum.data': ['Data', 'Fecha', 'Date'],
  'comum.hora': ['Hora', 'Hora', 'Time'],
  'comum.status': ['Status', 'Estado', 'Status'],
  'comum.descricao': ['Descrição', 'Descripción', 'Description'],
  'comum.observacoes': ['Observações', 'Notas', 'Notes'],
  'comum.contato': ['Contato', 'Contacto', 'Contact'],
  'comum.cliente': ['Cliente', 'Cliente', 'Client'],
  'comum.empresa': ['Empresa', 'Empresa', 'Company'],
  'comum.responsavel': ['Responsável', 'Responsable', 'Owner'],
  'comum.etiquetas': ['Etiquetas', 'Etiquetas', 'Tags'],
  'comum.semRegistros': ['Nada registrado neste período.', 'Nada registrado en este período.', 'Nothing recorded in this period.'],
  'comum.naoDaParaDesfazer': ['Não dá para desfazer.', 'No se puede deshacer.', 'This cannot be undone.'],

  // ── Formatação: rótulos derivados de data e hora ──────────────────────
  'formato.agora': ['agora', 'ahora', 'now'],
  'formato.haMin': ['há {n}min', 'hace {n}min', '{n}m ago'],
  'formato.haHoras': ['há {n}h', 'hace {n}h', '{n}h ago'],
  'formato.ontemMinusculo': ['ontem', 'ayer', 'yesterday'],
  'formato.haDias': ['há {n}d', 'hace {n}d', '{n}d ago'],
  'formato.atrasada': ['Atrasada', 'Atrasada', 'Overdue'],
  'formato.atrasadaEm': ['Atrasada · {data}', 'Atrasada · {data}', 'Overdue · {data}'],
  'formato.hojeAs': ['Hoje, {hora}', 'Hoy, {hora}', 'Today, {hora}'],
  'formato.amanhaAs': ['Amanhã, {hora}', 'Mañana, {hora}', 'Tomorrow, {hora}'],
  'formato.dataAs': ['{data}, {hora}', '{data}, {hora}', '{data}, {hora}'],
  'formato.vencimento': ['Venc. {data}', 'Vence {data}', 'Due {data}'],
  'formato.bomDia': ['Bom dia', 'Buenos días', 'Good morning'],
  'formato.boaTarde': ['Boa tarde', 'Buenas tardes', 'Good afternoon'],
  'formato.boaNoite': ['Boa noite', 'Buenas noches', 'Good evening'],
  'formato.saudacao': ['{parte}, {nome} · {dia}, {data}', '{parte}, {nome} · {dia}, {data}', '{parte}, {nome} · {dia}, {data}'],
  'formato.midiaImagem': ['[imagem]', '[imagen]', '[image]'],
  'formato.midiaVideo': ['[vídeo]', '[vídeo]', '[video]'],
  'formato.midiaAudio': ['[áudio]', '[audio]', '[audio]'],
  'formato.midiaDocumento': ['[documento]', '[documento]', '[document]'],
  'formato.midiaFigurinha': ['[figurinha]', '[sticker]', '[sticker]'],

  // ── Menu lateral ─────────────────────────────────────────────────────
  'nav.dashboard': ['Dashboard', 'Panel', 'Dashboard'],
  'nav.pipeline': ['Pipeline', 'Pipeline', 'Pipeline'],
  'nav.contatos': ['Contatos', 'Contactos', 'Contacts'],
  'nav.atividades': ['Atividades', 'Actividades', 'Activities'],
  'nav.agenda': ['Agenda', 'Agenda', 'Calendar'],
  'nav.assistente': ['Assistente', 'Asistente', 'Assistant'],
  'nav.campanhas': ['Campanhas', 'Campañas', 'Campaigns'],
  'nav.faturamento': ['Faturamento', 'Facturación', 'Billing'],
  'nav.relatorios': ['Relatórios', 'Informes', 'Reports'],
  'nav.configuracoes': ['Configurações', 'Configuración', 'Settings'],
  'nav.grupoOperacao': ['OPERAÇÃO', 'OPERACIÓN', 'OPERATIONS'],
  'nav.grupoCrescimento': ['CRESCIMENTO', 'CRECIMIENTO', 'GROWTH'],
  'nav.grupoGestao': ['GESTÃO', 'GESTIÓN', 'MANAGEMENT'],

  // ── Configurações · Preferências pessoais ─────────────────────────────
  'prefs.titulo': ['Preferências pessoais', 'Preferencias personales', 'Personal preferences'],
  'prefs.subtitulo': ['Valem só para a sua conta, em qualquer equipe que você atenda.', 'Valen solo para tu cuenta, en cualquier equipo que atiendas.', 'They apply to your account only, on every team you work in.'],
  'prefs.tema': ['Tema da interface', 'Tema de la interfaz', 'Interface theme'],
  'prefs.temaDica': ['"Sistema" acompanha o que o seu computador estiver usando.', '"Sistema" sigue lo que use tu computadora.', '"System" follows whatever your computer is using.'],
  'prefs.temaClaro': ['Claro', 'Claro', 'Light'],
  'prefs.temaEscuro': ['Escuro', 'Oscuro', 'Dark'],
  'prefs.temaSistema': ['Sistema', 'Sistema', 'System'],
  'prefs.idioma': ['Idioma da interface', 'Idioma de la interfaz', 'Interface language'],
  'prefs.idiomaDica': ['Vale só para os textos do sistema. O que você e sua equipe escrevem — etiquetas, setores, quadros, respostas rápidas — continua como foi digitado.', 'Vale solo para los textos del sistema. Lo que tú y tu equipo escriben — etiquetas, sectores, tableros, respuestas rápidas — sigue como se escribió.', 'It applies to the system\'s own text. Whatever you and your team write — tags, sectors, boards, quick replies — stays exactly as typed.'],
  'prefs.avisoDesktop': ['Aviso na área de trabalho', 'Aviso en el escritorio', 'Desktop notification'],
  'prefs.avisoDesktopDica': ['Notificação do sistema quando chega mensagem com o CRM em segundo plano.', 'Notificación del sistema cuando llega un mensaje con el CRM en segundo plano.', 'A system notification when a message arrives while the CRM is in the background.'],
  'prefs.som': ['Som ao receber mensagem', 'Sonido al recibir un mensaje', 'Sound on incoming message'],
  'prefs.somDica': ['Um toque curto junto do aviso.', 'Un toque corto junto al aviso.', 'A short chime alongside the notification.'],
  'prefs.permitido': ['Navegador autorizado a notificar.', 'Navegador autorizado a notificar.', 'Browser is allowed to send notifications.'],
  'prefs.permissaoPendente': ['O navegador ainda não autorizou as notificações.', 'El navegador todavía no autorizó las notificaciones.', 'The browser hasn\'t allowed notifications yet.'],
  'prefs.autorizar': ['Autorizar', 'Autorizar', 'Allow'],
  'prefs.bloqueado': ['Notificações bloqueadas para este site — a liberação é no cadeado da barra de endereço.', 'Notificaciones bloqueadas para este sitio — se habilitan en el candado de la barra de direcciones.', 'Notifications are blocked for this site — unblock them from the padlock in the address bar.'],
  'prefs.semSuporte': ['Este navegador não suporta notificações do sistema.', 'Este navegador no admite notificaciones del sistema.', 'This browser doesn\'t support system notifications.'],
  'prefs.rodape': ['Os avisos só funcionam com o CRM aberto em alguma aba. Notificação com o CRM fechado exigiria push do servidor, que ainda não existe aqui.', 'Los avisos solo funcionan con el CRM abierto en alguna pestaña. Notificar con el CRM cerrado exigiría push del servidor, que todavía no existe aquí.', 'Notifications only work while the CRM is open in some tab. Notifying with the CRM closed would need server push, which doesn\'t exist here yet.'],

  // ── Rótulos do sistema gravados no banco (ver src/i18n/sistema.ts) ────
  'sistema.leads.quadro': ['Leads', 'Leads', 'Leads'],
  'sistema.leads.novo': ['Novo lead', 'Nuevo lead', 'New lead'],
  'sistema.leads.contato': ['Contato feito', 'Contacto hecho', 'Contacted'],
  'sistema.leads.qualificado': ['Qualificado', 'Cualificado', 'Qualified'],
  'sistema.leads.proposta': ['Proposta enviada', 'Propuesta enviada', 'Proposal sent'],
  'sistema.leads.ganho': ['Ganho', 'Ganado', 'Won'],
  'sistema.leads.perdido': ['Perdido', 'Perdido', 'Lost'],
  'sistema.atividade.call': ['Ligação', 'Llamada', 'Call'],
  'sistema.atividade.meeting': ['Reunião', 'Reunión', 'Meeting'],
  'sistema.atividade.email': ['E-mail', 'Correo', 'Email'],
  'sistema.atividade.task': ['Tarefa', 'Tarea', 'Task'],
  'sistema.notaPaga': ['Paga', 'Pagada', 'Paid'],
  'sistema.notaPendente': ['Pendente', 'Pendiente', 'Pending'],
  'sistema.notaVencida': ['Vencida', 'Vencida', 'Overdue'],
  'sistema.atividadePendente': ['Pendente', 'Pendiente', 'Pending'],
  'sistema.atividadeAtrasada': ['Atrasada', 'Atrasada', 'Overdue'],
  'sistema.atividadeConcluida': ['Concluída', 'Completada', 'Done'],

  // ── Só para a suíte de testes (tests/unit/i18n.test.ts) ───────────────
  'teste.umContato': ['1 contato', '1 contacto', '1 contact'],
  'teste.nContatos': ['{n} contatos', '{n} contactos', '{n} contacts'],
  'teste.ola': ['Olá, {nome}!', '¡Hola, {nome}!', 'Hi, {nome}!'],
} satisfies Record<string, Tri>
