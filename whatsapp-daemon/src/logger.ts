import pino from 'pino'

/**
 * Logger da aplicação (eventos operacionais: boot, sessão, erros).
 * NUNCA passe conteúdo de mensagem nem credenciais para cá — `redact` é só
 * cinto-e-suspensório caso algum objeto escorra.
 */
export const logger = pino({
  level: process.env.WA_LOG_LEVEL ?? 'info',
  redact: {
    paths: ['creds', 'keys', 'key', 'message', 'messages'],
    censor: '[redacted]',
  },
})

/**
 * Logger entregue ao Baileys. Mantido em 'warn'+ porque o Baileys loga corpo de
 * mensagem e chaves do Signal em debug/trace — nunca deixe abaixo de 'warn'.
 */
export const waLogger = pino({ level: process.env.WA_BAILEYS_LOG_LEVEL ?? 'warn' })
