import { useRef, useState } from 'react'
import Modal from './Modal'
import MaterialIcon from '../common/MaterialIcon'
import RingButton from '../common/RingButton'
import { sx, C } from '../../styles/sx'
import { t, type Chave } from '../../i18n'
import { dataCurta } from '../../i18n/formato'
import { rotuloPagamento } from '../../i18n/sistema'
import {
  saveInvoice, updateInvoice, deleteInvoice, deleteInvoiceSeries, billingPreview,
  uploadInvoiceAttachment, deleteInvoiceFiles, MAX_INVOICE_ATTACHMENTS,
  PAYMENT_METHODS, type Billing, type InvoiceForm,
} from '../../hooks/useInvoices'
import { parseValueBR, fmtBRL, fmtMoney, fmtSize, dateKeyOf, extToType } from '../../lib/format'
import { validarAnexo } from '../../lib/upload'
import { fileTypeMap } from '../../lib/theme'
import ClientCombo, { type ClientOption } from '../common/ClientCombo'
import type { Invoice, InvoiceAttachment, PaymentMethod } from '../../types'

export type { ClientOption }

/**
 * Emite e edita a nota de faturamento. Registro interno — sem emissão fiscal.
 *
 * Criar aceita cobrança à vista, parcelada ou mensal recorrente; editar mexe só na nota
 * aberta (número e série são imutáveis, senão a numeração deixaria de fazer sentido).
 */
export default function InvoiceModal({ invoice, invoices, clientOptions, onClose, onSaved }: {
  invoice: Invoice | null
  invoices: Invoice[]
  clientOptions: ClientOption[]
  onClose: () => void
  onSaved: () => void
}) {
  const editing = !!invoice
  const [client, setClient] = useState(invoice?.client ?? '')
  const [contactId, setContactId] = useState(invoice?.contactId)
  const [value, setValue] = useState(invoice ? fmtMoney(invoice.value) : '')
  const [due, setDue] = useState(dateKeyOf(invoice?.dueAt ?? new Date()))
  const [desc, setDesc] = useState(invoice?.desc ?? '')
  const [method, setMethod] = useState<PaymentMethod | ''>(invoice?.paymentMethod ?? '')
  const [notes, setNotes] = useState(invoice?.notes ?? '')
  const [kind, setKind] = useState<Billing['kind']>('avista')
  const [parcels, setParcels] = useState(3)
  const [months, setMonths] = useState(12)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState<'nota' | 'serie' | null>(null)
  // Anexos já gravados que continuam na nota, e os escolhidos agora — estes só sobem no salvar.
  const [kept, setKept] = useState<InvoiceAttachment[]>(invoice?.attachments ?? [])
  const [pending, setPending] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const parsedValue = parseValueBR(value)
  const billing: Billing =
    kind === 'parcelada' ? { kind: 'parcelada', parcels }
    : kind === 'mensal' ? { kind: 'mensal', months }
    : { kind: 'avista' }
  const preview = !editing && kind !== 'avista' && parsedValue > 0 && due
    ? billingPreview({ value: parsedValue, due }, billing)
    : []

  function form(attachments: InvoiceAttachment[]): InvoiceForm {
    // O vínculo vem de quem foi escolhido na lista; se o nome foi digitado à mão e bate
    // com uma opção, aproveita o id dela do mesmo jeito.
    const opt = clientOptions.find((o) => o.label.toLowerCase() === client.trim().toLowerCase())
    return {
      client: client.trim(),
      contactId: contactId ?? opt?.contactId,
      value: parsedValue,
      due,
      desc,
      paymentMethod: method || undefined,
      notes,
      attachments,
    }
  }

  /** Valida na escolha, para o erro aparecer já — e não só depois de clicar em salvar. */
  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!picked.length) return
    setError('')
    if (kept.length + pending.length + picked.length > MAX_INVOICE_ATTACHMENTS) {
      setError(t('nota.limiteAnexos', { n: MAX_INVOICE_ATTACHMENTS }))
      return
    }
    try {
      picked.forEach((f) => validarAnexo(f))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('nota.falhaAnexo'))
      return
    }
    setPending((p) => [...p, ...picked])
  }

  /**
   * Sobe os anexos novos e grava a nota. Se a gravação falhar depois do upload, o que acabou
   * de subir é apagado — senão ficaria no Storage um arquivo que nenhuma nota referencia.
   */
  async function persist(): Promise<void> {
    const uploaded: InvoiceAttachment[] = []
    try {
      if (pending.length) {
        setUploading(true)
        for (const f of pending) uploaded.push(await uploadInvoiceAttachment(f))
        setUploading(false)
      }
      const data = form([...kept, ...uploaded])
      await (editing ? updateInvoice(invoice.id, data, invoices) : saveInvoice(data, invoices, billing))
    } catch (err) {
      setUploading(false)
      await deleteInvoiceFiles(uploaded.map((a) => a.storagePath))
      throw err
    }
  }

  async function run(fn: () => Promise<void>, fallback: string) {
    setBusy(true)
    setError('')
    try {
      await fn()
      onSaved()
    } catch (err) {
      console.error('[InvoiceModal]', err)
      setError(err instanceof Error ? err.message : fallback)
      setBusy(false)
    }
  }

  function handleSave() {
    if (busy) return
    if (!client.trim()) { setError(t('nota.informeCliente')); return }
    if (parsedValue <= 0) { setError(t('nota.valorMaiorZero')); return }
    if (!due) { setError(t('nota.escolhaVencimento')); return }
    if (kind === 'parcelada' && (parcels < 2 || parcels > 60)) { setError(t('nota.parcelamentoFaixa')); return }
    if (kind === 'mensal' && (months < 2 || months > 60)) { setError(t('nota.recorrenciaFaixa')); return }
    void run(persist, t(editing ? 'nota.falhaSalvar' : 'nota.falhaEmitir'))
  }

  const kinds: { id: Billing['kind']; label: Chave }[] = [
    { id: 'avista', label: 'nota.avista' },
    { id: 'parcelada', label: 'nota.parcelada' },
    { id: 'mensal', label: 'nota.mensal' },
  ]

  return (
    <Modal width={520} onClose={() => !busy && onClose()}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ ...sx.serif, fontSize: 23, color: C.ink }}>
          {editing ? t('nota.tituloEditar', { num: invoice.num }) : t('nota.tituloEmitir')}
        </div>
        <MaterialIcon name="close" size={23} color={C.muted} style={{ cursor: 'pointer' }} onClick={onClose} />
      </div>

      <label style={sx.label}>{t('comum.cliente')}</label>
      {/* Combo próprio, não o <datalist> nativo: aquele o navegador desenhava do jeito dele
          e não mostrava empresa, telefone nem foto. Segue aceitando texto livre — numa conta
          sem contato nenhum, é o que permite emitir a primeira nota. */}
      <div style={{ margin: '6px 0 14px' }}>
        <ClientCombo
          value={client}
          options={clientOptions}
          onChange={(label, id) => { setClient(label); setContactId(id) }}
          placeholder={t('nota.escolhaCliente')}
        />
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={sx.label}>{t('modal.valorReais')}</label>
          <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="0,00" style={{ ...sx.input, margin: '6px 0 14px' }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={sx.label}>{t(kind === 'avista' || editing ? 'nota.vencimento' : 'nota.primeiroVencimento')}</label>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} style={{ ...sx.input, margin: '6px 0 14px' }} />
        </div>
      </div>

      {/* Cobrança só na emissão: reparcelar uma nota já emitida bagunçaria a numeração. */}
      {!editing && (
        <>
          <label style={sx.label}>{t('nota.cobranca')}</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '7px 0 12px', flexWrap: 'wrap' }}>
            {kinds.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => setKind(k.id)}
                style={{
                  border: '1px solid ' + (kind === k.id ? C.purple : C.fieldBorder),
                  background: kind === k.id ? C.tintPurple : C.surface,
                  color: kind === k.id ? C.purple : C.sub,
                  borderRadius: 10, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                }}
              >
                {t(k.label)}
              </button>
            ))}
            {kind === 'parcelada' && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: C.sub }}>
                em
                <input type="number" min={2} max={60} value={parcels} onChange={(e) => setParcels(Number(e.target.value))} style={{ ...sx.input, width: 72, padding: '8px 10px' }} />
                vezes
              </span>
            )}
            {kind === 'mensal' && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: C.sub }}>
                por
                <input type="number" min={2} max={60} value={months} onChange={(e) => setMonths(Number(e.target.value))} style={{ ...sx.input, width: 72, padding: '8px 10px' }} />
                meses
              </span>
            )}
          </div>

          {preview.length > 0 && (
            <div style={{ background: C.field, border: '1px solid ' + C.fieldBorder, borderRadius: 12, padding: '11px 13px', marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.ink, marginBottom: 6 }}>
                {t('nota.previaTotal', { n: preview.length, valor: fmtBRL(preview.reduce((s, p) => s + p.value, 0)) })}
              </div>
              <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.6 }}>
                {preview.slice(0, 3).map((p, i) => (
                  <div key={i}>
                    {t('nota.previaLinha', { i: i + 1, n: preview.length, valor: fmtBRL(p.value), data: dataCurta(p.dueAt) })}
                  </div>
                ))}
                {preview.length > 3 && <div>{t('nota.previaMais', { n: preview.length - 3 })}</div>}
              </div>
              {kind === 'mensal' && (
                <div style={{ fontSize: 11.5, color: C.faint, marginTop: 7, lineHeight: 1.5 }}>
                  {t('nota.previaAviso', { n: preview.length })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1.4 }}>
          <label style={sx.label}>{t('nota.descricaoServico')}</label>
          <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={t('nota.descricaoExemplo')} style={{ ...sx.input, margin: '6px 0 14px' }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={sx.label}>{t('nota.formaPagamento')}</label>
          <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod | '')} style={{ ...sx.input, margin: '6px 0 14px' }}>
            <option value="">{t('nota.naoDefinida')}</option>
            {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{rotuloPagamento(m)}</option>)}
          </select>
        </div>
      </div>

      <label style={sx.label}>{t('comum.observacoes')}</label>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder={t('nota.observacoesExemplo')} style={{ ...sx.input, margin: '6px 0 14px', resize: 'vertical', fontFamily: 'inherit' }} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <label style={sx.label}>{t('nota.anexos')}</label>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={busy || kept.length + pending.length >= MAX_INVOICE_ATTACHMENTS}
          style={{ display: 'flex', alignItems: 'center', gap: 5, border: 'none', background: 'transparent', color: C.purple, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', padding: '2px 0' }}
        >
          <MaterialIcon name="attach_file" size={17} /> {t('nota.anexarArquivo')}
        </button>
        <input ref={fileInput} type="file" multiple hidden onChange={onPickFiles} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, margin: '7px 0 18px' }}>
        {kept.map((a) => (
          <AttachmentRow
            key={a.storagePath}
            name={a.name}
            type={a.type}
            size={a.sizeBytes}
            href={a.downloadURL}
            disabled={busy}
            onRemove={() => setKept((k) => k.filter((x) => x.storagePath !== a.storagePath))}
          />
        ))}
        {pending.map((f, i) => (
          <AttachmentRow
            key={i + ':' + f.name}
            name={f.name}
            type={extToType(f.name)}
            size={f.size}
            hint={t('nota.anexoNovo')}
            disabled={busy}
            onRemove={() => setPending((p) => p.filter((_, j) => j !== i))}
          />
        ))}
        {kept.length + pending.length === 0 && (
          <div style={{ fontSize: 12, color: C.faint, border: '1px dashed ' + C.fieldBorder, borderRadius: 10, padding: '10px 12px' }}>
            {t('nota.semAnexos')}
          </div>
        )}
        {!editing && preview.length > 1 && kept.length + pending.length > 0 && (
          <div style={{ fontSize: 11.5, color: C.faint, lineHeight: 1.5 }}>{t('nota.anexosSerie', { n: preview.length })}</div>
        )}
      </div>

      {error && (
        <div style={{ fontSize: 12.5, color: C.roseDeep, background: 'rgba(193,77,119,0.08)', border: '1px solid rgba(193,77,119,0.25)', borderRadius: 10, padding: '9px 12px', marginBottom: 14, lineHeight: 1.45 }}>
          {error}
        </div>
      )}

      {confirming && invoice && (
        <div style={{ background: 'rgba(193,77,119,0.08)', border: '1px solid rgba(193,77,119,0.25)', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
          <div style={{ fontSize: 12.5, color: C.sub, lineHeight: 1.5 }}>
            {confirming === 'serie'
              ? t('nota.confirmarSerie', { n: invoices.filter((x) => x.seriesId === invoice.seriesId).length })
              : t('nota.confirmarNota', { num: invoice.num })}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 11 }}>
            <button
              onClick={() => void run(
                () => (confirming === 'serie' && invoice.seriesId
                  ? deleteInvoiceSeries(invoice.seriesId, invoices)
                  : deleteInvoice(invoice.id, invoices)),
                t('nota.falhaExcluir'),
              )}
              disabled={busy}
              style={{ border: 'none', borderRadius: 10, padding: '8px 14px', background: '#c14d77', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: busy ? 'wait' : 'pointer' }}
            >
              {t(busy ? 'nota.excluindo' : 'nota.simExcluir')}
            </button>
            <button onClick={() => setConfirming(null)} disabled={busy} style={{ ...sx.btnGhost, padding: '8px 14px', fontSize: 12.5 }}>{t('nota.manter')}</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {editing && !confirming && (
          <>
            <button
              onClick={() => setConfirming('nota')}
              disabled={busy}
              style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'transparent', color: C.roseDeep, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', padding: '8px 2px' }}
            >
              <MaterialIcon name="delete" size={18} /> {t('comum.excluir')}
            </button>
            {invoice.seriesId && (
              <button
                onClick={() => setConfirming('serie')}
                disabled={busy}
                style={{ border: 'none', background: 'transparent', color: C.roseDeep, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', padding: '8px 2px' }}
              >
                {t('nota.excluirSerie')}
              </button>
            )}
          </>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={onClose} disabled={busy} style={sx.btnGhost}>{t('comum.cancelar')}</button>
        <RingButton
          radius={11}
          disabled={busy}
          onClick={handleSave}
          wrapStyle={{ opacity: busy ? 0.6 : 1 }}
          style={{ ...sx.btnPrimary }}
        >
          <MaterialIcon name="check" size={18} />
          {uploading ? t('nota.enviandoAnexos') : busy ? t('comum.salvando') : editing ? t('comum.salvar') : preview.length > 1 ? t('nota.emitirVarias', { n: preview.length }) : t('nota.emitirNota')}
        </RingButton>
      </div>
    </Modal>
  )
}

/** Uma linha da lista de anexos: salvo (com link para baixar) ou recém-escolhido. */
function AttachmentRow({ name, type, size, href, hint, disabled, onRemove }: {
  name: string
  type: string
  size: number
  href?: string
  hint?: string
  disabled: boolean
  onRemove: () => void
}) {
  const [icon, color, bg] = fileTypeMap[type] || fileTypeMap.doc
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.field, border: '1px solid ' + C.fieldBorder, borderRadius: 10, padding: '7px 10px' }}>
      <MaterialIcon name={icon} size={18} color={color} style={{ background: bg, width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {href
          ? <a href={href} target="_blank" rel="noreferrer" style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: 'none' }}>{name}</a>
          : <div style={{ fontSize: 12.5, fontWeight: 700, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>}
        <div style={{ fontSize: 11, color: C.muted }}>{fmtSize(size)}{hint ? ' · ' + hint : ''}</div>
      </div>
      {href && (
        <a href={href} target="_blank" rel="noreferrer" title={t('nota.baixarAnexo')} style={{ display: 'flex' }}>
          <MaterialIcon name="download" size={18} color={C.purple} />
        </a>
      )}
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        title={t('nota.removerAnexo')}
        style={{ display: 'flex', border: 'none', background: 'transparent', padding: 2, cursor: disabled ? 'wait' : 'pointer' }}
      >
        <MaterialIcon name="close" size={17} color={C.muted} />
      </button>
    </div>
  )
}
