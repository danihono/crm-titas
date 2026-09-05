import MaterialIcon from './MaterialIcon'
import { C } from '../../styles/sx'

/** Placeholder de módulo (Fase 0) — substituído pela tela real em cada fase. */
export default function Placeholder({ icon, title, note }: { icon: string; title: string; note: string }) {
  return (
    <div style={{ padding: '28px 30px 40px' }}>
      <div
        style={{
          background: C.surface,
          border: `1px dashed ${C.fieldBorder}`,
          borderRadius: 18,
          padding: '60px 30px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          color: C.muted,
        }}
      >
        <MaterialIcon name={icon} size={40} color="#b692d6" />
        <div style={{ fontSize: 18, fontWeight: 700, color: C.ink }}>{title}</div>
        <div style={{ fontSize: 13.5 }}>{note}</div>
      </div>
    </div>
  )
}
