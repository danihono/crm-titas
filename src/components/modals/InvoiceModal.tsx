import { useState } from 'react'
import Modal from './Modal'
import MaterialIcon from '../common/MaterialIcon'
import RingButton from '../common/RingButton'
import { sx } from '../../styles/sx'
import { saveInvoice } from '../../hooks/useInvoices'
import { parseValueBR, dateKeyOf } from '../../lib/format'
import type { Invoice } from '../../types'

export default function InvoiceModal({ invoices, clientOptions, onClose, onSaved }: {
  invoices: Invoice[]
  clientOptions: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const [client, setClient] = useState(clientOptions[0] ?? '')
  const [value, setValue] = useState('24.000,00')
  const [due, setDue] = useState(dateKeyOf(new Date()))
  const [desc, setDesc] = useState('Assinatura plano Enterprise')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (busy) return
    // Validação explícita: antes o botão simplesmente não fazia nada quando faltava
    // cliente, o que numa conta nova (lista de sugestões vazia) travava a tela toda.
    const c = client.trim()
    if (!c) { setError('Informe o cliente desta nota.'); return }
    const v = parseValueBR(value)
    if (v <= 0) { setError('Informe um valor maior que zero.'); return }
    if (!due) { setError('Escolha a data de vencimento.'); return }
    setError('')
    setBusy(true)
    try {
      await saveInvoice({ client: c, value: v, due }, invoices)
      onSaved()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal width={480} onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ ...sx.serif, fontSize: 23, fontWeight: 600, color: '#1d1726' }}>Emitir nota de faturamento</div>
        <MaterialIcon name="close" size={23} color="#9c95a8" style={{ cursor: 'pointer' }} onClick={onClose} />
      </div>

      <label style={sx.label}>Cliente</label>
      {/* Texto livre + sugestões (datalist): um <select> só com os clientes de notas
          antigas impedia a primeira nota de qualquer conta nova. */}
      <input
        value={client}
        onChange={(e) => setClient(e.target.value)}
        list="invoice-client-options"
        placeholder="Escolha um contato ou digite um cliente novo"
        style={{ ...sx.input, margin: '6px 0 14px' }}
      />
      <datalist id="invoice-client-options">
        {clientOptions.map((c) => <option key={c} value={c} />)}
      </datalist>

      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={sx.label}>Valor (R$)</label>
          <input value={value} onChange={(e) => setValue(e.target.value)} style={{ ...sx.input, margin: '6px 0 14px' }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={sx.label}>Vencimento</label>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} style={{ ...sx.input, margin: '6px 0 14px' }} />
        </div>
      </div>

      <label style={sx.label}>Descrição do serviço</label>
      <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} style={{ ...sx.input, margin: '6px 0 18px', resize: 'none' }} />

      {error && (
        <div style={{ fontSize: 12.5, color: '#b73d6d', background: 'rgba(193,77,119,0.08)', border: '1px solid rgba(193,77,119,0.25)', borderRadius: 10, padding: '9px 12px', marginBottom: 14, lineHeight: 1.45 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={{ background: '#f3f1f7', border: '1px solid #e6e3ee', borderRadius: 11, padding: '10px 18px', color: '#4a4458', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
        <RingButton radius={11} onClick={handleSave} style={{ background: 'linear-gradient(140deg,#7a52a0,#553578)', border: '1px solid rgba(200,160,230,0.3)', padding: '10px 20px', color: '#f4eefa', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.7 : 1 }}>Emitir nota</RingButton>
      </div>
    </Modal>
  )
}
