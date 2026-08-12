import { useEffect, useState } from 'react'
import { subscribeDaemonHeartbeat, daemonOnline, daemonStorageOk, daemonStorageCode } from '../lib/whatsapp'

/**
 * Há um daemon de WhatsApp vivo do outro lado da fila?
 *
 * O daemon é self-hosted (PC/VM caseira) e pode simplesmente estar desligado. Como os
 * comandos vão para o Firestore, um daemon fora do ar não dá erro imediato — o comando
 * só fica parado. Este hook lê o `whatsappDaemon/heartbeat` para a UI decidir antes:
 * é ele que alimenta o fallback local de expurgo em Contacts.
 */
export function useDaemonOnline(): boolean {
  const [online, setOnline] = useState(daemonOnline)

  useEffect(() => {
    const update = () => setOnline(daemonOnline())
    const unsub = subscribeDaemonHeartbeat(update)
    // O valor precisa ENVELHECER sozinho: sem este tick, um daemon que parou de bater
    // continuaria sendo reportado como online (não chega snapshot para reavaliar).
    const timer = setInterval(update, 30_000)
    update()
    return () => {
      clearInterval(timer)
      unsub()
    }
  }, [])

  return online
}

/**
 * O daemon consegue salvar arquivos? `null` enquanto não dá para afirmar (daemon offline,
 * versão antiga sem a sonda, ou primeira leitura ainda não chegou).
 *
 * Assina o MESMO heartbeat (o listener é ref-counted), então não custa leitura extra.
 */
export function useDaemonStorageOk(): { ok: boolean | null; code: string | null } {
  const [state, setState] = useState(() => ({ ok: daemonStorageOk(), code: daemonStorageCode() }))

  useEffect(() => {
    const update = () => setState({ ok: daemonStorageOk(), code: daemonStorageCode() })
    const unsub = subscribeDaemonHeartbeat(update)
    // Mesmo motivo do hook acima: o veredito precisa envelhecer junto com o heartbeat.
    const timer = setInterval(update, 30_000)
    update()
    return () => {
      clearInterval(timer)
      unsub()
    }
  }, [])

  return state
}
