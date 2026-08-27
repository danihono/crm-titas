import MaterialIcon from './MaterialIcon'

/** Botão redondo pequeno das ações de foto (trocar/remover), com estado "trabalhando". */
export default function PhotoAction({ icon, title, onClick, disabled, busy, rose, green }: {
  icon: string
  title: string
  onClick: () => void
  disabled?: boolean
  busy?: boolean
  rose?: boolean
  green?: boolean
}) {
  const color = rose ? '#b73d6d' : green ? '#1f8a4c' : '#7a52a0'
  const bg = rose ? 'rgba(193,77,119,0.1)' : green ? 'rgba(52,199,89,0.12)' : 'rgba(150,110,200,0.1)'
  return (
    <button type="button" title={busy ? 'Trabalhando…' : title} onClick={onClick} disabled={disabled} style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 8, background: bg, cursor: disabled ? 'wait' : 'pointer', opacity: disabled && !busy ? 0.5 : 1 }}>
      <MaterialIcon name={busy ? 'progress_activity' : icon} size={16} color={color} className={busy ? 'icon-spin' : undefined} />
    </button>
  )
}
