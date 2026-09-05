import { useMemo, useState } from 'react'
import { useTenantStore } from '../store/tenantStore'
import { useContacts } from '../hooks/useContacts'
import { useSelfProfile } from '../hooks/useProfile'
import { useInvoices, invoiceStatus, markPaid, markUnpaid } from '../hooks/useInvoices'
import { invoiceStatusMap } from '../lib/theme'
import { exportInvoicesXlsx } from '../lib/invoicesXlsx'
import { fmtMoney } from '../lib/format'
import MaterialIcon from '../components/common/MaterialIcon'
import RingButton from '../components/common/RingButton'
import InvoiceModal, { type ClientOption } from '../components/modals/InvoiceModal'
import { contactOptions, withLegacyNames } from '../components/common/ClientCombo'
import InvoicesDocument from '../components/invoices/InvoicesDocument'
import { sx, C } from '../styles/sx'
import type { Invoice, InvoiceStatus } from '../types'

type StatusFilter = 'todas' | InvoiceStatus
const STATUS_FILTERS: StatusFilter[] = ['todas', 'Pendente', 'Vencida', 'Paga']

/** Colunas por onde a lista pode ser ordenada — e o que sai nos dois exports. */
type SortKey = 'num' | 'client' | 'value' | 'dueAt' | 'status'
const SORT_LABEL: Record<SortKey, string> = {
  num: 'nota', client: 'cliente', value: 'valor', dueAt: 'vencimento', status: 'status',
}

const GRID = '86px 1.5fr 1fr 118px 104px 120px'

export default function Invoices() {
  const { docs: invoices } = useInvoices()
  const { docs: contacts } = useContacts()
  const profile = useSelfProfile()
  const readOnly = useTenantStore((s) => s.readOnly)

  const [modal, setModal] = useState<'novo' | Invoice | null>(null)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<StatusFilter>('todas')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('num')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')

  // Sugestões de cliente: os contatos cadastrados + quem já apareceu em notas antigas.
  // Tirar os contatos daqui deixava a lista VAZIA numa conta nova — e sem opção não havia
  // como emitir a primeira nota. O campo do modal aceita texto livre, então isto é só atalho.
  // `company` vem como '—' quando o contato foi salvo sem empresa (ver saveContact).
  const clientOptions = useMemo<ClientOption[]>(
    () => withLegacyNames(contactOptions(contacts, 'empresa'), invoices.map((iv) => iv.client)),
    [contacts, invoices],
  )

  const withStatus = useMemo(
    () => invoices.map((iv) => ({ iv, status: invoiceStatus(iv) })),
    [invoices],
  )

  // O recorte visível manda em TUDO: lista, totais, XLSX e PDF saem daqui — filtro e
  // ordenação são os mesmos da tela, sem configuração paralela de exportação.
  const visible = useMemo(() => {
    const term = q.trim().toLowerCase()
    const fromT = from ? new Date(from + 'T00:00:00').getTime() : null
    const toT = to ? new Date(to + 'T23:59:59').getTime() : null
    const filtered = withStatus.filter(({ iv, status: st }) => {
      if (status !== 'todas' && st !== status) return false
      if (fromT !== null && iv.dueAt.getTime() < fromT) return false
      if (toT !== null && iv.dueAt.getTime() > toT) return false
      if (!term) return true
      return iv.num.toLowerCase().includes(term)
        || iv.client.toLowerCase().includes(term)
        || (iv.desc ?? '').toLowerCase().includes(term)
    })
    const dir = sortDir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'client': return dir * a.iv.client.localeCompare(b.iv.client, 'pt-BR')
        case 'value': return dir * (a.iv.value - b.iv.value)
        case 'dueAt': return dir * (a.iv.dueAt.getTime() - b.iv.dueAt.getTime())
        case 'status': return dir * a.status.localeCompare(b.status, 'pt-BR')
        default: {
          // Pelo número: comparar como inteiro, porque '#1049' e '#999' em texto saem ao
          // contrário do esperado.
          const n = (x: Invoice) => x.seq ?? (parseInt(x.num.replace(/\D/g, ''), 10) || 0)
          return dir * (n(a.iv) - n(b.iv))
        }
      }
    })
  }, [withStatus, q, status, from, to, sortKey, sortDir])

  /** Clique no cabeçalho: ordena por ela, ou inverte se já era a coluna ativa. */
  function toggleSort(k: SortKey) {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir(k === 'client' || k === 'status' ? 'asc' : 'desc') }
  }

  const sumBy = (s: string) => visible.filter((x) => x.status === s).reduce((a, x) => a + x.iv.value, 0)
  const faturado = sumBy('Paga')
  const aReceber = sumBy('Pendente')
  const vencido = sumBy('Vencida')
  const total = visible.reduce((a, x) => a + x.iv.value, 0)

  const filtering = !!q.trim() || status !== 'todas' || !!from || !!to

  /** Frase que descreve o recorte — vai no cabeçalho do PDF e no subtítulo do XLSX. */
  const recorte = [
    status === 'todas' ? 'todas as notas' : `apenas ${status.toLowerCase()}s`,
    q.trim() && `busca "${q.trim()}"`,
    from && `de ${new Date(from + 'T12:00').toLocaleDateString('pt-BR')}`,
    to && `até ${new Date(to + 'T12:00').toLocaleDateString('pt-BR')}`,
    `por ${SORT_LABEL[sortKey]} ${sortDir === 'asc' ? '↑' : '↓'}`,
    `${visible.length} nota(s)`,
  ].filter(Boolean).join(' · ')

  async function togglePaid(iv: Invoice, isPaid: boolean) {
    setBusyId(iv.id)
    setError('')
    try {
      await (isPaid ? markUnpaid(iv.id) : markPaid(iv.id))
    } catch (err) {
      console.error('[Invoices]', err)
      setError('Não foi possível atualizar a baixa desta nota.')
    } finally {
      setBusyId(null)
    }
  }

  /**
   * PDF pela caixa de impressão do navegador, sobre o InvoicesDocument — mesma mecânica do
   * relatório de atendimento. O tique antes do print não é enfeite: sem esperar o React
   * repintar, o navegador captura o documento ainda com o recorte anterior.
   */
  async function handlePdf() {
    await new Promise((r) => setTimeout(r, 120))
    window.print()
  }

  async function handleExport() {
    setExporting(true)
    setError('')
    try {
      await exportInvoicesXlsx(visible.map((x) => x.iv), profile.displayName, recorte)
    } catch (err) {
      console.error('[Invoices/export]', err)
      setError('Não foi possível gerar a planilha.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div style={{ padding: '18px 30px 40px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 22 }}>
        <SummaryCard icon="paid" color={C.green} label="Faturado (pago)" value={faturado} />
        <SummaryCard icon="hourglass_top" color={C.amber} label="A receber" value={aReceber} />
        <SummaryCard icon="warning" color={C.rose} label="Vencido" value={vencido} />
        <SummaryCard icon="functions" color={C.purple} label={filtering ? 'Total do filtro' : 'Total emitido'} value={total} />
      </div>

      <div style={{ ...sx.card, borderRadius: 20, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '18px 22px', borderBottom: '1px solid ' + C.lineSoft, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>
            Notas de faturamento
            <span style={{ fontSize: 12.5, fontWeight: 600, color: C.sub, marginLeft: 8 }}>
              {visible.length}{filtering && ` de ${invoices.length}`}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <button onClick={() => void handleExport()} disabled={exporting} style={{ ...sx.btnGhost, opacity: exporting ? 0.6 : 1 }}>
              <MaterialIcon name="download" size={18} /> {exporting ? 'Gerando…' : 'Exportar XLSX'}
            </button>
            <button onClick={() => void handlePdf()} style={sx.btnGhost}>
              <MaterialIcon name="picture_as_pdf" size={18} /> Exportar PDF
            </button>
            {!readOnly && (
              <RingButton radius={11} onClick={() => setModal('novo')} style={{ ...sx.btnPrimary }}>
                <MaterialIcon name="receipt_long" size={18} /> Emitir nota
              </RingButton>
            )}
          </div>
        </div>

        {/* Busca e filtros */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 22px', borderBottom: '1px solid ' + C.lineSoft, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: C.field, border: '1px solid ' + C.fieldBorder, borderRadius: 11, padding: '0 11px', height: 38, minWidth: 240, flex: 1, maxWidth: 340 }}>
            <MaterialIcon name="search" size={17} color={C.muted} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nota, cliente ou descrição..."
              style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 13, color: C.ink, width: '100%', fontFamily: 'inherit' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 5 }}>
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                style={{
                  border: '1px solid ' + (status === s ? C.purple : C.fieldBorder),
                  background: status === s ? C.tintPurple : C.surface,
                  color: status === s ? C.purple : C.sub,
                  borderRadius: 10, padding: '8px 13px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                }}
              >
                {s === 'todas' ? 'Todas' : s}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: C.sub }}>
            <span>Vencimento</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ ...sx.input, width: 148, padding: '8px 10px' }} />
            <span>até</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ ...sx.input, width: 148, padding: '8px 10px' }} />
          </div>
          {filtering && (
            <button
              onClick={() => { setQ(''); setStatus('todas'); setFrom(''); setTo('') }}
              style={{ border: 'none', background: 'transparent', color: C.roseDeep, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
            >
              Limpar
            </button>
          )}
        </div>

        {error && (
          <div style={{ fontSize: 12.5, color: C.roseDeep, background: 'rgba(193,77,119,0.08)', padding: '10px 22px' }}>{error}</div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 14, padding: '12px 22px', fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: '.04em', borderBottom: '1px solid #f0eef5' }}>
          <SortHead k="num" label="NOTA" active={sortKey} dir={sortDir} onClick={toggleSort} />
          <SortHead k="client" label="CLIENTE" active={sortKey} dir={sortDir} onClick={toggleSort} />
          <SortHead k="value" label="VALOR" active={sortKey} dir={sortDir} onClick={toggleSort} />
          <SortHead k="dueAt" label="VENCIMENTO" active={sortKey} dir={sortDir} onClick={toggleSort} />
          <SortHead k="status" label="STATUS" active={sortKey} dir={sortDir} onClick={toggleSort} />
          <span style={{ textAlign: 'right' }}>AÇÕES</span>
        </div>

        {visible.map(({ iv, status: st }) => {
          const [color, bg] = invoiceStatusMap[st]
          const isPaid = st === 'Paga'
          const busy = busyId === iv.id
          return (
            <div
              key={iv.id}
              style={{
                display: 'grid', gridTemplateColumns: GRID, gap: 14, padding: '13px 22px',
                alignItems: 'center', borderBottom: `1px solid ${C.lineHair}`,
                // Vencida ganha um filete à esquerda: no meio de uma lista longa o selo
                // sozinho passa batido.
                boxShadow: st === 'Vencida' ? `inset 3px 0 0 ${C.rose}` : undefined,
              }}
            >
              <div>
                <div style={{ fontSize: 13, color: C.purple, fontWeight: 700 }}>{iv.num}</div>
                {iv.installment && (
                  <div style={{ fontSize: 10.5, color: C.faint, fontWeight: 700 }}>
                    {iv.installment.n}/{iv.installment.of}{iv.recurrence === 'mensal' ? ' · mensal' : ''}
                  </div>
                )}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, color: C.ink, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{iv.client}</div>
                {iv.desc && (
                  <div style={{ fontSize: 11.5, color: C.sub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{iv.desc}</div>
                )}
              </div>
              <div>
                <div style={{ fontSize: 13.5, color: C.ink, fontWeight: 700 }}>R$ {fmtMoney(iv.value)}</div>
                {iv.paymentMethod && <div style={{ fontSize: 11, color: C.faint }}>{iv.paymentMethod}</div>}
              </div>
              <div>
                <div style={{ fontSize: 12.5, color: C.sub }}>{iv.dueAt.toLocaleDateString('pt-BR')}</div>
                {iv.paidAt && <div style={{ fontSize: 11, color: C.green, fontWeight: 600 }}>pago {iv.paidAt.toLocaleDateString('pt-BR')}</div>}
              </div>
              <span style={{ fontSize: 11.5, fontWeight: 700, color, background: bg, borderRadius: 20, padding: '4px 11px', textAlign: 'center', justifySelf: 'start' }}>{st}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                {!readOnly && (
                  <>
                    <RowAction
                      icon={isPaid ? 'undo' : 'task_alt'}
                      title={isPaid ? 'Desfazer a baixa' : 'Dar baixa (marcar como paga)'}
                      color={isPaid ? C.muted : C.green}
                      busy={busy}
                      onClick={() => void togglePaid(iv, isPaid)}
                    />
                    <RowAction icon="edit" title="Editar nota" color={C.sub} onClick={() => setModal(iv)} />
                  </>
                )}
              </div>
            </div>
          )
        })}

        {visible.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: C.faint, fontSize: 13 }}>
            {invoices.length === 0 ? 'Nenhuma nota emitida ainda.' : 'Nenhuma nota bate com o filtro.'}
          </div>
        )}
      </div>

      <InvoicesDocument rows={visible} orgName={profile.displayName} recorte={recorte} />

      {modal && (
        <InvoiceModal
          invoice={modal === 'novo' ? null : modal}
          invoices={invoices}
          clientOptions={clientOptions}
          onClose={() => setModal(null)}
          onSaved={() => setModal(null)}
        />
      )}
    </div>
  )
}

/** Cabeçalho clicável: ordena pela coluna e inverte no segundo clique. */
function SortHead({ k, label, active, dir, onClick }: {
  k: SortKey
  label: string
  active: SortKey
  dir: 'asc' | 'desc'
  onClick: (k: SortKey) => void
}) {
  const on = k === active
  return (
    <button
      type="button"
      onClick={() => onClick(k)}
      title={`Ordenar por ${label.toLowerCase()}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 2, border: 'none', background: 'transparent',
        padding: 0, cursor: 'pointer', font: 'inherit', letterSpacing: 'inherit',
        color: on ? C.purple : C.muted, fontWeight: 700, textAlign: 'left',
      }}
    >
      {label}
      {on && <MaterialIcon name={dir === 'asc' ? 'arrow_upward' : 'arrow_downward'} size={13} />}
    </button>
  )
}

function RowAction({ icon, title, color, onClick, busy }: {
  icon: string
  title: string
  color: string
  onClick: () => void
  busy?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={busy}
      style={{
        width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: 'none', borderRadius: 9, background: 'transparent', cursor: busy ? 'wait' : 'pointer',
        overflow: 'hidden', flexShrink: 0,
      }}
    >
      <MaterialIcon name={busy ? 'progress_activity' : icon} size={18} color={color} className={busy ? 'icon-spin' : undefined} />
    </button>
  )
}

function SummaryCard({ icon, color, label, value }: { icon: string; color: string; label: string; value: number }) {
  return (
    <div style={{ ...sx.card, borderRadius: 18, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color, fontSize: 12.5, fontWeight: 700, marginBottom: 10 }}>
        <MaterialIcon name={icon} size={18} /> {label}
      </div>
      <div style={{ fontSize: 27, fontWeight: 800, color: C.ink }}>R$ {fmtMoney(value)}</div>
    </div>
  )
}
