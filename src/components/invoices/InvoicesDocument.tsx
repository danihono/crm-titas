import { createPortal } from 'react-dom'
import BrandMark from '../common/BrandMark'
import { fmtMoney } from '../../lib/format'
import type { Invoice, InvoiceStatus } from '../../types'

const INK = '#1d1726'
const SUB = '#6e6780'
const MUTED = '#9c95a8'
const LINE = '#e6e3ee'
const PURPLE = '#7a52a0'

/** Largura útil de uma A4 retrato com margem de 12mm, em px de impressão (~96dpi). */
const DOC_W = 700

const STATUS_COLOR: Record<InvoiceStatus, string> = {
  Paga: '#2f9e6f',
  Pendente: '#b3801f',
  Vencida: '#c14d77',
}

function Total({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ flex: 1, minWidth: 0, border: `1px solid ${LINE}`, borderRadius: 12, padding: '10px 12px' }}>
      <div style={{ fontSize: 9.5, letterSpacing: '.08em', color: MUTED, fontWeight: 700, textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontSize: 17, fontWeight: 800, color, marginTop: 3 }}>R$ {fmtMoney(value)}</div>
    </div>
  )
}

const th: React.CSSProperties = {
  fontSize: 9.5, letterSpacing: '.06em', color: '#fff', fontWeight: 700,
  textTransform: 'uppercase', padding: '7px 8px', textAlign: 'left', background: PURPLE,
}
const td: React.CSSProperties = {
  fontSize: 10.5, color: INK, padding: '6px 8px', borderBottom: `1px solid ${LINE}`,
  verticalAlign: 'top',
}

/**
 * Documento de impressão do Faturamento — sai em PDF pelo "Salvar como PDF" do navegador.
 *
 * Vive num portal para ser IRMÃO do #root, e não filho: o `@media print` do index.css
 * esconde o #root e mostra só o `.print-doc`. É a mesma mecânica do relatório de
 * atendimento; as duas telas são rotas diferentes, então nunca há dois documentos montados.
 */
export default function InvoicesDocument({ rows, orgName, recorte }: {
  rows: { iv: Invoice; status: InvoiceStatus }[]
  orgName: string
  /** Descreve o recorte impresso: filtros aplicados e a ordenação. */
  recorte: string
}) {
  const somaDe = (s: InvoiceStatus) => rows.filter((r) => r.status === s).reduce((a, r) => a + r.iv.value, 0)
  const total = rows.reduce((a, r) => a + r.iv.value, 0)

  const doc = (
    <div
      className="print-doc"
      style={{
        display: 'none', width: DOC_W, margin: '0 auto', background: '#fff',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", color: INK,
      }}
    >
      <div className="print-section" style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 14, borderBottom: `2px solid ${PURPLE}` }}>
        <BrandMark gradientId="titas-mark-invoices" />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", fontSize: 22, fontWeight: 700, letterSpacing: '.12em' }}>
            TITÃS CRM
          </div>
          <div style={{ fontSize: 11, color: SUB }}>{orgName || 'Faturamento'}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Faturamento</div>
          <div style={{ fontSize: 10.5, color: SUB }}>{recorte}</div>
        </div>
      </div>

      <div className="print-section" style={{ display: 'flex', gap: 8, margin: '14px 0 16px' }}>
        <Total label="Faturado (pago)" value={somaDe('Paga')} color={STATUS_COLOR.Paga} />
        <Total label="A receber" value={somaDe('Pendente')} color={STATUS_COLOR.Pendente} />
        <Total label="Vencido" value={somaDe('Vencida')} color={STATUS_COLOR.Vencida} />
        <Total label="Total" value={total} color={INK} />
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th}>Nota</th>
            <th style={th}>Cliente</th>
            <th style={th}>Valor</th>
            <th style={th}>Vencimento</th>
            <th style={th}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ iv, status }) => (
            <tr key={iv.id}>
              <td style={{ ...td, fontWeight: 700, color: PURPLE, whiteSpace: 'nowrap' }}>
                {iv.num}
                {iv.installment && (
                  <div style={{ fontSize: 9, color: MUTED, fontWeight: 700 }}>
                    {iv.installment.n}/{iv.installment.of}
                  </div>
                )}
              </td>
              <td style={td}>
                <div style={{ fontWeight: 600 }}>{iv.client}</div>
                {iv.desc && <div style={{ fontSize: 9.5, color: SUB }}>{iv.desc}</div>}
              </td>
              <td style={{ ...td, fontWeight: 700, whiteSpace: 'nowrap' }}>
                R$ {fmtMoney(iv.value)}
                {iv.paymentMethod && <div style={{ fontSize: 9, color: MUTED, fontWeight: 600 }}>{iv.paymentMethod}</div>}
              </td>
              <td style={{ ...td, whiteSpace: 'nowrap' }}>
                {iv.dueAt.toLocaleDateString('pt-BR')}
                {iv.paidAt && (
                  <div style={{ fontSize: 9, color: STATUS_COLOR.Paga, fontWeight: 600 }}>
                    pago {iv.paidAt.toLocaleDateString('pt-BR')}
                  </div>
                )}
              </td>
              <td style={{ ...td, fontWeight: 700, color: STATUS_COLOR[status], whiteSpace: 'nowrap' }}>{status}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td style={{ ...td, color: MUTED, fontStyle: 'italic' }} colSpan={5}>Nenhuma nota neste recorte.</td></tr>
          )}
        </tbody>
      </table>

      <div style={{ fontSize: 9.5, color: MUTED, marginTop: 14, textAlign: 'right' }}>
        {rows.length} nota(s) · emitido em {new Date().toLocaleString('pt-BR')}
      </div>
    </div>
  )

  return createPortal(doc, document.body)
}
