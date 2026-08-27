import { createPortal } from 'react-dom'
import { fmtDate, fmtDuration, type ReportModel, type ReportRow } from '../../lib/reportData'
import { RankedBars, StatusStack, TrendArea } from './Charts'
import BrandMark from '../common/BrandMark'
import type { ReportSections } from '../../lib/xlsx'

const INK = '#1d1726'
const SUB = '#6e6780'
const MUTED = '#9c95a8'
const LINE = '#e6e3ee'
const PURPLE = '#7a52a0'

/** Largura útil de uma A4 retrato com margem de 12mm, em px de impressão (~96dpi). */
const DOC_W = 700

function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div style={{ flex: 1, minWidth: 0, border: `1px solid ${LINE}`, borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ fontSize: 10, letterSpacing: '.08em', color: MUTED, fontWeight: 700, textTransform: 'uppercase' }}>
        {label}
      </div>
      {/* Figuras proporcionais: tabular-nums daria a todo dígito a largura do zero e
          deixaria um número curto solto neste tamanho. */}
      <div style={{ fontSize: 24, fontWeight: 800, color: INK, marginTop: 6, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 10.5, color: SUB, marginTop: 3 }}>{hint}</div>
    </div>
  )
}

function Section({ title, subtitle, children }: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section className="print-section" style={{ marginTop: 26 }}>
      <h2 style={{ fontSize: 13, fontWeight: 800, color: INK, margin: 0, letterSpacing: '.01em' }}>{title}</h2>
      {subtitle && <div style={{ fontSize: 11, color: SUB, marginTop: 2 }}>{subtitle}</div>}
      <div style={{ marginTop: 12 }}>{children}</div>
    </section>
  )
}

function BreakdownTable({ rows, entity }: { rows: ReportRow[]; entity: string }) {
  const cols = '1.6fr 78px 88px 1fr 1fr'
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 10, padding: '0 0 6px',
        fontSize: 9.5, color: MUTED, fontWeight: 700, letterSpacing: '.05em', borderBottom: `1px solid ${LINE}` }}>
        <span>{entity.toUpperCase()}</span><span>CONVERSAS</span><span>FINALIZADAS</span>
        <span>1ª RESPOSTA</span><span>ATÉ FINALIZAR</span>
      </div>
      {rows.map((r) => (
        <div key={r.key} style={{ display: 'grid', gridTemplateColumns: cols, gap: 10,
          padding: '7px 0', alignItems: 'center', borderBottom: '1px solid #f4f2f8', fontSize: 11 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7, color: INK, fontWeight: 600 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: r.color, flexShrink: 0 }} />
            {r.label}
          </span>
          {/* tabular-nums aqui SIM: são colunas de números que precisam alinhar. */}
          <span style={{ color: INK, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{r.total}</span>
          <span style={{ color: SUB, fontVariantNumeric: 'tabular-nums' }}>{r.closed}</span>
          <span style={{ color: SUB }}>{fmtDuration(r.firstResponseMs)}</span>
          <span style={{ color: SUB }}>{fmtDuration(r.resolutionMs)}</span>
        </div>
      ))}
    </div>
  )
}

function Breakdown({ title, entity, rows }: { title: string; entity: string; rows: ReportRow[] }) {
  if (rows.length === 0) {
    return (
      <Section title={title}>
        <div style={{ fontSize: 11.5, color: MUTED }}>Nada registrado neste período.</div>
      </Section>
    )
  }
  return (
    <Section title={title}>
      <RankedBars rows={rows} width={DOC_W} />
      <BreakdownTable rows={rows} entity={entity} />
    </Section>
  )
}

/**
 * Documento imprimível do relatório.
 *
 * Vai num portal para `document.body` porque na tela ele vive fundo na árvore
 * (Layout > main > Outlet > Reports). Do body, o `@media print` isola com uma regra
 * só — sem portal seria preciso caçar e esconder cada ancestral.
 */
export default function ReportDocument({ model, orgName, sections, trendRef }: {
  model: ReportModel
  orgName: string
  sections: ReportSections
  /** Ref do SVG de tendência — é este gráfico que a planilha rasteriza. */
  trendRef?: React.Ref<SVGSVGElement>
}) {
  const k = model.kpis

  const doc = (
    <div className="print-doc" style={{ fontFamily: "'Manrope',sans-serif", color: INK, background: '#fff', width: DOC_W, margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 14, paddingBottom: 14, borderBottom: `2px solid ${PURPLE}` }}>
        <BrandMark />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 24, fontWeight: 600, letterSpacing: '.16em', lineHeight: 1 }}>
            TITÃS
          </div>
          <div style={{ fontSize: 9, letterSpacing: '.36em', color: MUTED, fontWeight: 700, marginTop: 2 }}>C R M</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 13, fontWeight: 800 }}>Relatório de atendimento</div>
          <div style={{ fontSize: 11, color: SUB, marginTop: 2 }}>
            {fmtDate(model.from)} a {fmtDate(model.to)} · {model.days} dias
          </div>
          {orgName && <div style={{ fontSize: 10.5, color: MUTED, marginTop: 2 }}>{orgName}</div>}
        </div>
      </header>

      {sections.resumo && (
        <>
          <div className="print-section" style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <Kpi label="Conversas" value={String(k.total)} hint="Iniciadas no período" />
            <Kpi label="Em aberto" value={String(k.open)} hint="Sem finalização" />
            <Kpi label="Finalizadas" value={String(k.closed)} hint="Encerradas pela equipe" />
          </div>
          <div className="print-section" style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <Kpi label="1ª resposta" value={fmtDuration(k.firstResponseMs)} hint="Média entre abrir e responder" />
            <Kpi label="Até finalizar" value={fmtDuration(k.resolutionMs)} hint="Média entre abrir e encerrar" />
          </div>
        </>
      )}

      {/* O gráfico fica sempre montado, mesmo com a seção desmarcada: é dele que a
          planilha tira a imagem, e desmontá-lo deixaria a aba Resumo sem gráfico.
          Quando a seção sai do relatório, some só da vista impressa. */}
      <div style={sections.porDia ? undefined : { display: 'none' }}>
        <Section title="Conversas por dia" subtitle="Volume diário de atendimentos iniciados.">
          <TrendArea points={model.byDay} width={DOC_W} svgRef={trendRef} />
        </Section>
      </div>

      {sections.agora && (
        <Section title="Fila agora" subtitle="Estado das conversas abertas no momento da emissão.">
          <StatusStack fila={model.live.fila} atendimento={model.live.atendimento}
            esperando={model.live.esperando} width={DOC_W} />
        </Section>
      )}

      {sections.atendentes && <Breakdown title="Por atendente" entity="Atendente" rows={model.byAgent} />}
      {sections.setores && <Breakdown title="Por setor" entity="Setor" rows={model.bySector} />}
      {sections.etiquetas && <Breakdown title="Por etiqueta" entity="Etiqueta" rows={model.byTag} />}

      <footer style={{ marginTop: 30, paddingTop: 12, borderTop: `1px solid ${LINE}`,
        display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: MUTED }}>
        <span>Titãs CRM · Relatório de atendimento</span>
        <span>Emitido em {new Date().toLocaleString('pt-BR')}</span>
      </footer>
    </div>
  )

  return createPortal(doc, document.body)
}
