import { useUIStore } from '../store/uiStore'
import { useTenantStore } from '../store/tenantStore'
import { useInvoices, invoiceStatus } from '../hooks/useInvoices'
import { invoiceStatusMap } from '../lib/theme'
import { fmtMoney, dueDateShort } from '../lib/format'
import MaterialIcon from '../components/common/MaterialIcon'
import InvoiceModal from '../components/modals/InvoiceModal'
import { sx } from '../styles/sx'

export default function Invoices() {
  const { docs: invoices } = useInvoices()
  const ui = useUIStore()
  const readOnly = useTenantStore((s) => s.readOnly)

  const withStatus = invoices.map((iv) => ({ iv, status: invoiceStatus(iv) }))
  const sumBy = (s: string) => withStatus.filter((x) => x.status === s).reduce((a, x) => a + x.iv.value, 0)
  const faturado = sumBy('Paga')
  const aReceber = sumBy('Pendente')
  const vencido = sumBy('Vencida')

  const clientOptions = Array.from(new Set(invoices.map((iv) => iv.client)))

  return (
    <div style={{ padding: '28px 30px 40px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 22 }}>
        <SummaryCard icon="paid" color="#2f9e6f" label="Faturado (pago)" value={faturado} />
        <SummaryCard icon="hourglass_top" color="#b3801f" label="A receber" value={aReceber} />
        <SummaryCard icon="warning" color="#c14d77" label="Vencido" value={vencido} />
      </div>

      <div style={{ background: '#ffffff', border: '1px solid #ececf3', borderRadius: 20, overflow: 'hidden', boxShadow: '0 1px 2px rgba(28,20,50,0.04),0 8px 22px rgba(28,20,50,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid #eeebf3' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1d1726' }}>Notas de faturamento</div>
          {!readOnly && <button onClick={ui.openInvoiceModal} style={{ ...sx.btnPrimary }}><MaterialIcon name="receipt_long" size={18} /> Emitir nota</button>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '90px 1.4fr 1fr 1fr 110px 40px', gap: 14, padding: '12px 22px', fontSize: 11, color: '#9c95a8', fontWeight: 700, letterSpacing: '.04em', borderBottom: '1px solid #f0eef5' }}>
          <span>NOTA</span><span>CLIENTE</span><span>VALOR</span><span>VENCIMENTO</span><span>STATUS</span><span />
        </div>
        {withStatus.map(({ iv, status }) => {
          const [color, bg] = invoiceStatusMap[status]
          return (
            <div key={iv.id} style={{ display: 'grid', gridTemplateColumns: '90px 1.4fr 1fr 1fr 110px 40px', gap: 14, padding: '15px 22px', alignItems: 'center', borderBottom: '1px solid #f4f2f8' }}>
              <span style={{ fontSize: 13, color: '#7a52a0', fontWeight: 700 }}>{iv.num}</span>
              <span style={{ fontSize: 13.5, color: '#1d1726', fontWeight: 600 }}>{iv.client}</span>
              <span style={{ fontSize: 13.5, color: '#1d1726', fontWeight: 700 }}>R$ {fmtMoney(iv.value)}</span>
              <span style={{ fontSize: 12.5, color: '#6e6780' }}>{dueDateShort(iv.dueAt)}</span>
              <span style={{ fontSize: 11.5, fontWeight: 700, color, background: bg, borderRadius: 20, padding: '4px 11px', textAlign: 'center', justifySelf: 'start' }}>{status}</span>
              <MaterialIcon name="download" size={19} color="#c4bfd0" style={{ cursor: 'pointer' }} />
            </div>
          )
        })}
        {invoices.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: '#a39bb0', fontSize: 13 }}>Nenhuma nota emitida ainda.</div>
        )}
      </div>

      {ui.showInvoiceModal && (
        <InvoiceModal
          invoices={invoices}
          clientOptions={clientOptions}
          onClose={ui.closeInvoiceModal}
          onSaved={ui.closeInvoiceModal}
        />
      )}
    </div>
  )
}

function SummaryCard({ icon, color, label, value }: { icon: string; color: string; label: string; value: number }) {
  return (
    <div style={{ background: '#ffffff', border: '1px solid #ececf3', borderRadius: 18, padding: 20, boxShadow: '0 1px 2px rgba(28,20,50,0.04),0 8px 22px rgba(28,20,50,0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color, fontSize: 12.5, fontWeight: 700, marginBottom: 10 }}>
        <MaterialIcon name={icon} size={18} /> {label}
      </div>
      <div style={{ fontSize: 27, fontWeight: 800, color: '#1d1726' }}>R$ {fmtMoney(value)}</div>
    </div>
  )
}
