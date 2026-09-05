import type { CSSProperties, ReactNode } from 'react'
import MaterialIcon from '../common/MaterialIcon'
import RingButton from '../common/RingButton'
import { sx, C } from '../../styles/sx'

/** Paleta oferecida para setores e etiquetas — a mesma família roxa/quente do CRM. */
export const SETTING_COLORS = [
  '#7a52a0', '#4f7fc0', '#2f9e6f', '#b3801f', '#c14d77', '#5fa9c9', '#cf9b6f', '#6e6780',
]

/** Cartão branco de uma seção, com título, subtítulo e ação opcional no canto. */
export function SettingsCard({ title, subtitle, action, children }: {
  title: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div style={{ ...sx.card, borderRadius: 20, overflow: 'hidden', marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '18px 22px', borderBottom: '1px solid ' + C.lineSoft }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12.5, color: C.sub, marginTop: 3 }}>{subtitle}</div>}
        </div>
        {action}
      </div>
      <div style={{ padding: '16px 22px 20px' }}>{children}</div>
    </div>
  )
}

/** Linha de uma lista editável, com bolinha de cor à esquerda e ações à direita. */
export function Row({ color, children, actions }: {
  color?: string
  children: ReactNode
  actions?: ReactNode
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 2px', borderBottom: `1px solid ${C.lineHair}` }}>
      {color && <span style={{ width: 11, height: 11, borderRadius: '50%', background: color, flexShrink: 0 }} />}
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{actions}</div>}
    </div>
  )
}

export function EmptyLine({ children }: { children: ReactNode }) {
  return <div style={{ padding: '18px 0', color: C.faint, fontSize: 13 }}>{children}</div>
}

export function IconAction({ icon, title, color, onClick }: {
  icon: string
  title: string
  color?: string
  onClick: () => void
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', border: 'none', background: 'transparent', cursor: 'pointer', color: color ?? C.muted, padding: 4 }}
    >
      <MaterialIcon name={icon} size={18} />
    </button>
  )
}

export function Field({ label, children, style }: { label: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, ...style }}>
      <span style={sx.label}>{label}</span>
      {children}
    </label>
  )
}

/** Seletor de cor em bolinhas — evita um input[type=color] destoando do visual. */
export function ColorDots({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
      {SETTING_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={`Cor ${c}`}
          style={{
            width: 24, height: 24, borderRadius: '50%', background: c, cursor: 'pointer',
            border: c === value ? '2px solid ' + C.ink : '2px solid transparent',
            outline: c === value ? '2px solid ' + c + '55' : 'none',
          }}
        />
      ))}
    </div>
  )
}

export function PrimaryButton({ icon, children, onClick, disabled }: {
  icon: string
  children: ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <RingButton
      radius={11}
      disabled={disabled}
      onClick={onClick}
      style={{ ...sx.btnPrimary, opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
    >
      <MaterialIcon name={icon} size={18} /> {children}
    </RingButton>
  )
}

/** Aviso de que a seção é somente leitura para o papel atual. */
export function ReadOnlyNote({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(150,110,200,0.10)', border: '1px solid rgba(150,110,200,0.25)', borderRadius: 12, padding: '11px 14px', color: C.purple, fontSize: 12.5, fontWeight: 600, marginBottom: 18 }}>
      <MaterialIcon name="lock" size={17} /> {children}
    </div>
  )
}
