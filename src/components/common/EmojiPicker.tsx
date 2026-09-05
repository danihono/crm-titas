import { useEffect, useMemo, useRef, useState } from 'react'
import { EMOJI_CATEGORIES, emojiByChar, searchEmojis, type EmojiEntry } from '../../lib/emojis'
import MaterialIcon from './MaterialIcon'
import { C } from '../../styles/sx'

/**
 * Seletor de emojis no layout do teclado do iPhone: busca no topo, grade no meio e as abas
 * de categoria fixas embaixo, com "usados com frequência" na frente.
 *
 * O desenho de cada emoji é o da FONTE DO SISTEMA (pilha abaixo) — em iPhone/Mac sai a arte
 * da Apple, no Windows/Android a da própria plataforma. Não há imagem baixada de CDN.
 *
 * Posicionamento é do chamador: este componente só desenha o painel. Ele fecha sozinho em
 * clique fora e Esc.
 */

const RECENTS_KEY = 'titas.emojiRecents'
const RECENTS_MAX = 30

/** Pilha de fontes coloridas de emoji, por plataforma. */
const EMOJI_FONT =
  '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Android Emoji",sans-serif'

function readRecents(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]')
    return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string').slice(0, RECENTS_MAX) : []
  } catch {
    return [] // localStorage indisponível/corrompido é enfeite quebrado, não erro
  }
}

/** Registra o emoji escolhido no topo dos frequentes (sem duplicar). */
function pushRecent(char: string): string[] {
  const next = [char, ...readRecents().filter((c) => c !== char)].slice(0, RECENTS_MAX)
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next))
  } catch {
    // Modo privativo/quota cheia: seguir sem histórico é melhor que quebrar o envio.
  }
  return next
}

interface Props {
  /** Recebe o caractere escolhido. O painel NÃO fecha sozinho — quem decide é o chamador. */
  onPick: (emoji: string) => void
  onClose: () => void
  /**
   * Botão que abriu o painel. Clique nele NÃO conta como "clique fora": sem isto o painel
   * fecharia no mousedown e o próprio botão o reabriria no click seguinte, e ele nunca
   * fecharia por ali.
   */
  anchorRef?: { current: HTMLElement | null }
  width?: number
  height?: number
}

export default function EmojiPicker({ onPick, onClose, anchorRef, width = 336, height = 372 }: Props) {
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<string>('recentes')
  const [recents, setRecents] = useState<string[]>(readRecents)
  const rootRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  // Fecha em clique fora e Esc. 'mousedown' (e não 'click') para o painel sumir antes de o
  // clique chegar ao botão que o abriu — senão ele reabriria na sequência.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      const t = e.target as Node
      if (rootRef.current?.contains(t) || anchorRef?.current?.contains(t)) return
      onClose()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose, anchorRef])

  const results = useMemo(() => searchEmojis(query), [query])
  const searching = query.trim().length > 0

  // Frequentes vazio na primeira vez: abre nos smileys para não mostrar grade vazia.
  useEffect(() => {
    if (tab === 'recentes' && recents.length === 0) setTab(EMOJI_CATEGORIES[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const category = EMOJI_CATEGORIES.find((c) => c.id === tab)
  const items: EmojiEntry[] = searching
    ? results
    : tab === 'recentes'
      ? recents.map((c) => emojiByChar(c) ?? { e: c, k: '' })
      : (category?.items ?? [])
  const title = searching ? `Resultados para "${query.trim()}"` : tab === 'recentes' ? 'Usados com frequência' : (category?.label ?? '')

  function choose(char: string) {
    setRecents(pushRecent(char))
    onPick(char)
  }

  function selectTab(id: string) {
    setQuery('')
    setTab(id)
    if (gridRef.current) gridRef.current.scrollTop = 0
  }

  return (
    <div
      ref={rootRef}
      style={{
        width,
        height,
        display: 'flex',
        flexDirection: 'column',
        background: C.surface,
        border: `1px solid ${C.fieldBorder}`,
        borderRadius: 16,
        boxShadow: '0 10px 34px rgba(28,20,50,0.18)',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: 10, borderBottom: `1px solid ${C.lineHair}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.raised, border: `1px solid ${C.fieldBorder}`, borderRadius: 10, padding: '7px 10px' }}>
          <MaterialIcon name="search" size={16} color={C.faint} />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar emoji..."
            style={{ background: 'transparent', border: 'none', outline: 'none', color: C.ink, fontSize: 12.5, width: '100%' }}
          />
          {query && (
            <button onClick={() => setQuery('')} title="Limpar busca" style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', display: 'flex' }}>
              <MaterialIcon name="close" size={14} color={C.faint} />
            </button>
          )}
        </div>
      </div>

      <div ref={gridRef} style={{ flex: 1, overflowY: 'auto', padding: '8px 10px 10px' }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4, margin: '2px 2px 6px' }}>{title}</div>
        {items.length === 0 ? (
          <div style={{ padding: '28px 10px', textAlign: 'center', fontSize: 12.5, color: C.faint }}>
            {searching ? 'Nenhum emoji encontrado.' : 'Os emojis que você usar aparecem aqui.'}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: 2 }}>
            {items.map((it, i) => (
              <button
                key={`${it.e}-${i}`}
                type="button"
                title={it.k.split(' ')[0]}
                onClick={() => choose(it.e)}
                style={{ border: 'none', background: 'transparent', borderRadius: 8, cursor: 'pointer', fontFamily: EMOJI_FONT, fontSize: 23, lineHeight: '34px', height: 34, padding: 0 }}
                onMouseEnter={(e) => (e.currentTarget.style.background = C.raised)}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                {it.e}
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '6px 8px', borderTop: `1px solid ${C.lineHair}`, background: C.surfaceAlt }}>
        <TabButton icon="🕘" label="Usados com frequência" on={!searching && tab === 'recentes'} onClick={() => selectTab('recentes')} />
        {EMOJI_CATEGORIES.map((c) => (
          <TabButton key={c.id} icon={c.icon} label={c.label} on={!searching && tab === c.id} onClick={() => selectTab(c.id)} />
        ))}
      </div>
    </div>
  )
}

function TabButton({ icon, label, on, onClick }: { icon: string; label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      style={{
        flex: 1,
        height: 30,
        border: 'none',
        borderRadius: 8,
        cursor: 'pointer',
        background: on ? C.tintPurpleStrong : 'transparent',
        fontFamily: EMOJI_FONT,
        fontSize: 16,
        lineHeight: '30px',
        padding: 0,
        opacity: on ? 1 : 0.7,
      }}
    >
      {icon}
    </button>
  )
}
