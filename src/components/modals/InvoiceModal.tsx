import { useState } from 'react'
import Modal from './Modal'
import MaterialIcon from '../common/MaterialIcon'
import RingButton from '../common/RingButton'
import { sx, C } from '../../styles/sx'
import {
  saveInvoice, updateInvoice, deleteInvoice, deleteInvoiceSeries, billingPreview,
  PAYMENT_METHODS, type Billing, type InvoiceForm,
} from '../../hooks/useInvoices'
import { parseValueBR, fmtMoney, dateKeyOf } from '../../lib/format'
import ClientCombo, { type ClientOption } from '../common/ClientCombo'
import type { Invoice, PaymentMethod } from '../../types'

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

  const parsedValue = parseValueBR(value)
  const billing: Billing =
    kind === 'parcelada' ? { kind: 'parcelada', parcels }
    : kind === 'mensal' ? { kind: 'mensal', months }
    : { kind: 'avista' }
  const preview = !editing && kind !== 'avista' && parsedValue > 0 && due
    ? billingPreview({ value: parsedValue, due }, billing)
    : []

  function form(): InvoiceForm {
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
    if (!client.trim()) { setError('Informe o cliente desta nota.'); return }
    if (parsedValue <= 0) { setError('Informe um valor maior que zero.'); return }
    if (!due) { setError('Escolha a data de vencimento.'); return }
    if (kind === 'parcelada' && (parcels < 2 || parcels > 60)) { setError('O parcelamento vai de 2 a 60 vezes.'); return }
    if (kind === 'mensal' && (months < 2 || months > 60)) { setError('A recorrência vai de 2 a 60 meses.'); return }
    void run(
      () => (editing ? updateInvoice(invoice.id, form()) : saveInvoice(form(), invoices, billing)),
      editing ? 'Falha ao salvar a nota.' : 'Falha ao emitir a nota.',
    )
  }

  const kinds: { id: Billing['kind']; label: string }[] = [
    { id: 'avista', label: 'À vista' },
    { id: 'parcelada', label: 'Parcelada' },
    { id: 'mensal', label: 'Mensal' },
  ]

  return (
    <Modal width={520} onClose={() => !busy && onClose()}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ ...sx.serif, fontSize: 23, fontWeight: 600, color: C.ink }}>
          {editing ? `Nota ${invoice.num}` : 'Emitir nota de faturamento'}
        </div>
        <MaterialIcon name="close" size={23} color={C.muted} style={{ cursor: 'pointer' }} onClick={onClose} />
      </div>

      <label style={sx.label}>Cliente</label>
      {/* Combo próprio, não o <datalist> nativo: aquele o navegador desenhava do jeito dele
          e não mostrava empresa, telefone nem foto. Segue aceitando texto livre — numa conta
          sem contato nenhum, é o que permite emitir a primeira nota. */}
      <div style={{ margin: '6px 0 14px' }}>
        <ClientCombo
          value={client}
          options={clientOptions}
          onChange={(label, id) => { setClient(label); setContactId(id) }}
          placeholder="Escolha um contato ou digite um cliente novo"
        />
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={sx.label}>Valor (R$)</label>
          <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="0,00" style={{ ...sx.input, margin: '6px 0 14px' }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={sx.label}>{kind === 'avista' || editing ? 'Vencimento' : 'Primeiro vencimento'}</label>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} style={{ ...sx.input, margin: '6px 0 14px' }} />
        </div>
      </div>

      {/* Cobrança só na emissão: reparcelar uma nota já emitida bagunçaria a numeração. */}
      {!editing && (
        <>
          <label style={sx.label}>Cobrança</label>
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
                {k.label}
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
                {preview.length} notas · total R$ {fmtMoney(preview.reduce((s, p) => s + p.value, 0))}
              </div>
              <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.6 }}>
                {preview.slice(0, 3).map((p, i) => (
                  <div key={i}>
                    {i + 1}/{preview.length} · R$ {fmtMoney(p.value)} · vence {p.dueAt.toLocaleDateString('pt-BR')}
                  </div>
                ))}
                {preview.length > 3 && <div>…e mais {preview.length - 3}, um por mês.</div>}
              </div>
              {kind === 'mensal' && (
                <div style={{ fontSize: 11.5, color: C.faint, marginTop: 7, lineHeight: 1.5 }}>
                  As {preview.length} notas são criadas agora, com os vencimentos já distribuídos —
                  não há cobrança sendo gerada automaticamente mês a mês.
                </div>
              )}
            </div>
          )}
        </>
      )}

      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1.4 }}>
          <label style={sx.label}>Descrição do serviço</label>
          <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Consultoria mensal" style={{ ...sx.input, margin: '6px 0 14px' }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={sx.label}>Forma de pagamento</label>
          <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod | '')} style={{ ...sx.input, margin: '6px 0 14px' }}>
            <option value="">Não definida</option>
            {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      <label style={sx.label}>Observações</label>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Anotações internas sobre esta cobrança" style={{ ...sx.input, margin: '6px 0 18px', resize: 'vertical', fontFamily: 'inherit' }} />

      {error && (
        <div style={{ fontSize: 12.5, color: C.roseDeep, background: 'rgba(193,77,119,0.08)', border: '1px solid rgba(193,77,119,0.25)', borderRadius: 10, padding: '9px 12px', marginBottom: 14, lineHeight: 1.45 }}>
          {error}
        </div>
      )}

      {confirming && invoice && (
        <div style={{ background: 'rgba(193,77,119,0.08)', border: '1px solid rgba(193,77,119,0.25)', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
          <div style={{ fontSize: 12.5, color: C.sub, lineHeight: 1.5 }}>
            {confirming === 'serie'
              ? `Excluir as ${invoices.filter((x) => x.seriesId === invoice.seriesId).length} notas desta série? Não dá para desfazer.`
              : `Excluir a nota ${invoice.num}? Não dá para desfazer.`}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 11 }}>
            <button
              onClick={() => void run(
                () => (confirming === 'serie' && invoice.seriesId
                  ? deleteInvoiceSeries(invoice.seriesId, invoices)
                  : deleteInvoice(invoice.id)),
                'Falha ao excluir.',
              )}
              disabled={busy}
              style={{ border: 'none', borderRadius: 10, padding: '8px 14px', background: '#c14d77', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: busy ? 'wait' : 'pointer' }}
            >
              {busy ? 'Excluindo…' : 'Sim, excluir'}
            </button>
            <button onClick={() => setConfirming(null)} disabled={busy} style={{ ...sx.btnGhost, padding: '8px 14px', fontSize: 12.5 }}>Manter</button>
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
              <MaterialIcon name="delete" size={18} /> Excluir
            </button>
            {invoice.seriesId && (
              <button
                onClick={() => setConfirming('serie')}
                disabled={busy}
                style={{ border: 'none', background: 'transparent', color: C.roseDeep, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', padding: '8px 2px' }}
              >
                Excluir a série
              </button>
            )}
          </>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={onClose} disabled={busy} style={sx.btnGhost}>Cancelar</button>
        <RingButton
          radius={11}
          disabled={busy}
          onClick={handleSave}
          wrapStyle={{ opacity: busy ? 0.6 : 1 }}
          style={{ ...sx.btnPrimary }}
        >
          <MaterialIcon name="check" size={18} />
          {busy ? 'Salvando…' : editing ? 'Salvar' : preview.length > 1 ? `Emitir ${preview.length} notas` : 'Emitir nota'}
        </RingButton>
      </div>
    </Modal>
  )
}
