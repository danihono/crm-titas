import MaterialIcon from './MaterialIcon'
import { C } from '../../styles/sx'

export interface TabDef<T extends string> {
  id: T
  label: string
  icon: string
}

/**
 * Faixa de abas com sublinhado roxo na ativa — mesmo visual do seletor de
 * Mensagens/Info/Arquivos da tela de Contatos, aqui como componente reusável.
 */
export default function TabBar<T extends string>({ tabs, active, onChange }: {
  tabs: TabDef<T>[]
  active: T
  onChange: (id: T) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 4, padding: '0 30px', background: C.surface, borderBottom: `1px solid ${C.fieldBorder}` }}>
      {tabs.map((t) => {
        const on = t.id === active
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '13px 16px',
              border: 'none', background: 'transparent', cursor: 'pointer',
              fontSize: 13, fontWeight: 700,
              borderBottom: '2px solid ' + (on ? C.purple : 'transparent'),
              color: on ? C.purple : C.muted,
            }}
          >
            <MaterialIcon name={t.icon} size={18} /> {t.label}
          </button>
        )
      })}
    </div>
  )
}
