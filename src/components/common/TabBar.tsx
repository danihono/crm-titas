import MaterialIcon from './MaterialIcon'

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
    <div style={{ display: 'flex', gap: 4, padding: '0 30px', background: '#ffffff', borderBottom: '1px solid #e6e3ee' }}>
      {tabs.map((t) => {
        const on = t.id === active
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '13px 16px',
              border: 'none', background: 'transparent', cursor: 'pointer',
              fontSize: 13, fontWeight: 700, fontFamily: "'Manrope',sans-serif",
              borderBottom: '2px solid ' + (on ? '#7a52a0' : 'transparent'),
              color: on ? '#7a52a0' : '#9c95a8',
            }}
          >
            <MaterialIcon name={t.icon} size={18} /> {t.label}
          </button>
        )
      })}
    </div>
  )
}
