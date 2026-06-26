import { useState } from 'react'
import Modal from './Modal'
import MaterialIcon from '../common/MaterialIcon'
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

  async function handleSave() {
    if (!client || busy) return
    setBusy(true)
    try {
      await saveInvoice({ client, value: parseValueBR(value), due }, invoices)
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
      <select value={client} onChange={(e) => setClient(e.target.value)} style={{ ...sx.input, margin: '6px 0 14px' }}>
        {clientOptions.length === 0 && <option value="">—</option>}
        {clientOptions.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>

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

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={{ background: '#f3f1f7', border: '1px solid #e6e3ee', borderRadius: 11, padding: '10px 18px', color: '#4a4458', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
        <button onClick={handleSave} style={{ background: 'linear-gradient(140deg,#7a52a0,#553578)', border: '1px solid rgba(200,160,230,0.3)', borderRadius: 11, padding: '10px 20px', color: '#f4eefa', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.7 : 1 }}>Emitir nota</button>
      </div>
    </Modal>
  )
}
