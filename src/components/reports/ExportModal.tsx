import { useState } from 'react'
import Modal from '../modals/Modal'
import MaterialIcon from '../common/MaterialIcon'
import RingButton from '../common/RingButton'
import { sx, C } from '../../styles/sx'
import { ALL_SECTIONS, SECTION_DEFS, type ReportSections, type SectionId } from '../../lib/xlsx'

const STORAGE_KEY = 'titas.report.sections'

/**
 * Última escolha de seções do usuário.
 *
 * Em try/catch porque navegador em janela anônima ou com dados de site bloqueados faz o
 * acesso ao localStorage LANÇAR — e uma preferência cosmética não pode derrubar a
 * exportação inteira.
 */
export function loadSections(): ReportSections {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...ALL_SECTIONS }
    const saved = JSON.parse(raw) as Partial<ReportSections>
    // Mescla com o padrão: uma seção criada depois desta gravação entra ligada, em vez
    // de sumir silenciosamente do relatório de quem já exportou antes.
    return { ...ALL_SECTIONS, ...saved }
  } catch {
    return { ...ALL_SECTIONS }
  }
}

function saveSections(s: ReportSections): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    // Sem persistência a exportação segue igual — só não lembra na próxima.
  }
}

export default function ExportModal({ onClose, onExport }: {
  onClose: () => void
  onExport: (format: 'pdf' | 'xlsx', sections: ReportSections) => Promise<void> | void
}) {
  const [sections, setSections] = useState<ReportSections>(loadSections)
  const [busy, setBusy] = useState<'pdf' | 'xlsx' | null>(null)

  const anySelected = Object.values(sections).some(Boolean)

  function toggle(id: SectionId) {
    setSections((s) => {
      const next = { ...s, [id]: !s[id] }
      saveSections(next)
      return next
    })
  }

  function setAll(value: boolean) {
    const next = SECTION_DEFS.reduce((acc, d) => ({ ...acc, [d.id]: value }), {} as ReportSections)
    setSections(next)
    saveSections(next)
  }

  async function run(format: 'pdf' | 'xlsx') {
    if (!anySelected || busy) return
    setBusy(format)
    try {
      await onExport(format, sections)
      onClose()
    } catch (err) {
      console.error('[ExportModal]', err)
      alert(err instanceof Error ? err.message : 'Não foi possível gerar o relatório.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal onClose={onClose} width={520}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <MaterialIcon name="download" size={22} color={C.purple} />
        <div style={{ fontSize: 18, fontWeight: 700, color: C.ink }}>Exportar relatório</div>
      </div>
      <div style={{ fontSize: 12.5, color: C.sub, marginBottom: 16 }}>
        Escolha o que entra no arquivo. Vale para os dois formatos.
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
        <button onClick={() => setAll(true)} style={linkBtn}>Marcar todas</button>
        <button onClick={() => setAll(false)} style={linkBtn}>Desmarcar todas</button>
      </div>

      <div style={{ border: '1px solid ' + C.fieldBorder, borderRadius: 12, overflow: 'hidden' }}>
        {SECTION_DEFS.map((d, i) => (
          <label
            key={d.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 11, padding: '11px 14px', cursor: 'pointer',
              borderTop: i === 0 ? 'none' : `1px solid ${C.lineHair}`,
              background: sections[d.id] ? 'rgba(150,110,200,0.06)' : C.surface,
            }}
          >
            <input
              type="checkbox"
              checked={sections[d.id]}
              onChange={() => toggle(d.id)}
              style={{ accentColor: C.purple, width: 16, height: 16 }}
            />
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: C.ink }}>{d.label}</span>
              <span style={{ display: 'block', fontSize: 11.5, color: C.sub }}>{d.hint}</span>
            </span>
          </label>
        ))}
      </div>

      {!anySelected && (
        <div style={{ fontSize: 12.5, color: C.rose, marginTop: 10 }}>
          Marque ao menos uma seção para gerar o relatório.
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <button onClick={onClose} style={sx.btnGhost}>Cancelar</button>
        <button
          onClick={() => run('xlsx')}
          disabled={!anySelected || busy !== null}
          style={{ ...sx.btnGhost, opacity: anySelected && !busy ? 1 : 0.5, color: '#1f7a4c', borderColor: '#bfe3cd' }}
        >
          <MaterialIcon name="table_view" size={18} />
          {busy === 'xlsx' ? 'Gerando…' : 'Excel'}
        </button>
        <RingButton
          radius={11}
          onClick={() => run('pdf')}
          disabled={!anySelected || busy !== null}
          style={{ ...sx.btnPrimary, opacity: anySelected && !busy ? 1 : 0.5 }}
        >
          <MaterialIcon name="picture_as_pdf" size={18} />
          {busy === 'pdf' ? 'Abrindo…' : 'PDF'}
        </RingButton>
      </div>

      <div style={{ fontSize: 11.5, color: C.faint, marginTop: 12, lineHeight: 1.5 }}>
        O PDF abre a caixa de impressão do navegador — escolha <b>Salvar como PDF</b>.
      </div>
    </Modal>
  )
}

const linkBtn: React.CSSProperties = {
  border: 'none', background: 'transparent', color: C.purple,
  fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0,
}
