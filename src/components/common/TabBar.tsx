import MaterialIcon from './MaterialIcon'
import { C } from '../../styles/sx'
import { t, type Chave } from '../../i18n'

export interface TabDef<T extends string> {
  id: T
  /**
   * CHAVE do catálogo, não o texto — quem traduz é a TabBar, na renderização.
   *
   * É de propósito, e o motivo é uma armadilha: as listas de abas são
   * constantes de módulo, avaliadas uma vez no import. Um `t()` ali dentro
   * congelaria o rótulo no idioma em que a página carregou, e trocar de idioma
   * deixaria justamente as abas para trás — em silêncio, porque o resto da tela
   * mudaria.
   */
  label: Chave
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
      {tabs.map((aba) => {
        const on = aba.id === active
        return (
          <button
            key={aba.id}
            onClick={() => onChange(aba.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '13px 16px',
              border: 'none', background: 'transparent', cursor: 'pointer',
              fontSize: 13, fontWeight: 700,
              borderBottom: '2px solid ' + (on ? C.purple : 'transparent'),
              color: on ? C.purple : C.muted,
            }}
          >
            <MaterialIcon name={aba.icon} size={18} /> {t(aba.label)}
          </button>
        )
      })}
    </div>
  )
}
