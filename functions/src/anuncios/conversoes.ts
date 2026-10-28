import { onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { enviarCapi } from './meta'
import { enviarConversaoGoogle } from './google'
import { INTEGRATIONS_KEY, credGoogle, lerConfig, lerSegredos } from './segredos'
import { decidirEnvio, type ConfigConversoes, type OrigemDeal } from './normalizar'

const TZ_PADRAO = 'America/Sao_Paulo'

function mensagemDe(err: unknown): string {
  return String((err as Error)?.message ?? err).slice(0, 300)
}

/**
 * Card de anúncio mudou de etapa → a plataforma fica sabendo.
 *
 * O gatilho roda em TODA edição de card de todo tenant, então a primeira coisa é sair
 * barato: sem `source` (card criado à mão) ou sem troca de coluna não há leitura nenhuma.
 *
 * Idempotência em dois níveis: `conversionsSent.<etapa>` é reservado numa transação antes
 * de chamar a API (o Firestore entrega o mesmo evento mais de uma vez), e o `event_id` /
 * `orderId` enviados fazem a própria plataforma descartar repetição.
 */
export const enviarConversoes = onDocumentUpdated(
  {
    document: 'users/{uid}/deals/{dealId}',
    region: 'southamerica-east1',
    secrets: [INTEGRATIONS_KEY],
    maxInstances: 5,
  },
  async (event) => {
    const antes = event.data?.before.data()
    const depois = event.data?.after.data()
    if (!depois?.source || antes?.columnId === depois.columnId) return

    const { uid, dealId } = event.params
    const cfg = (await lerConfig(uid, 'conversoes')) as ConfigConversoes
    const envio = decidirEnvio(antes, depois as Parameters<typeof decidirEnvio>[1], cfg)
    if (!envio) return

    const db = getFirestore()
    const dealRef = db.doc(`users/${uid}/deals/${dealId}`)
    const reservado = await db.runTransaction(async (tx) => {
      const s = await tx.get(dealRef)
      const sent = (s.get('conversionsSent') ?? {}) as Record<string, unknown>
      if (envio.etapa in sent) return false
      tx.update(dealRef, { [`conversionsSent.${envio.etapa}`]: { status: 'enviando', at: FieldValue.serverTimestamp() } })
      return true
    })
    if (!reservado) return

    const src = depois.source as OrigemDeal & { receivedAt?: FirebaseFirestore.Timestamp }
    const valor = Number(depois.value) || 0
    const agora = new Date()
    const seg = await lerSegredos(uid)
    const resultado: Record<string, string> = {}

    if (envio.meta) {
      const meta = await lerConfig(uid, 'meta')
      if (!seg.metaToken || !meta.pixelId) resultado.meta = 'sem_config'
      else {
        try {
          await enviarCapi(seg.metaToken, {
            pixelId: String(meta.pixelId),
            eventName: envio.meta,
            eventId: `${dealId}_${envio.etapa}`,
            eventTime: agora,
            value: valor,
            currency: String(meta.moeda || 'BRL'),
            leadId: src.channel === 'meta' ? src.leadId : undefined,
            fbclid: src.fbclid,
            fbclidEm: src.receivedAt?.toMillis?.(),
            hashes: src.hashes,
            testCode: cfg.metaTestCode || undefined,
          })
          resultado.meta = 'ok'
        } catch (err) {
          resultado.meta = `erro: ${mensagemDe(err)}`
        }
      }
    }

    if (envio.google && src.gclid) {
      const gcfg = await lerConfig(uid, 'google')
      const cred = credGoogle(seg, gcfg)
      if (!cred) resultado.google = 'sem_config'
      else {
        try {
          const tz = String(((await db.doc(`users/${uid}`).get()).get('businessHours') as Record<string, unknown> | undefined)?.timezone ?? '') || TZ_PADRAO
          await enviarConversaoGoogle(cred, {
            conversionActionId: envio.google,
            gclid: src.gclid,
            quando: agora,
            valor,
            moeda: String(gcfg.moeda || 'BRL'),
            orderId: `${dealId}_${envio.etapa}`.slice(0, 64),
            timeZone: tz,
          })
          resultado.google = 'ok'
        } catch (err) {
          resultado.google = `erro: ${mensagemDe(err)}`
        }
      }
    }

    const algumErro = Object.values(resultado).find((v) => v !== 'ok')
    await dealRef.update({
      [`conversionsSent.${envio.etapa}`]: { status: algumErro ? 'erro' : 'ok', at: FieldValue.serverTimestamp(), ...resultado },
    })
    await db.doc(`users/${uid}/integrations/conversoes`).set({
      lastSentAt: FieldValue.serverTimestamp(),
      enviadas: FieldValue.increment(1),
      ...(algumErro ? { lastError: algumErro, lastErrorAt: FieldValue.serverTimestamp() } : { lastError: FieldValue.delete() }),
    }, { merge: true })
  },
)
