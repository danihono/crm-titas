import { useEffect, useMemo, useRef, useState } from 'react'
import { fmtPhoneBR, initialsOf, looksLikePhone, searchable } from '../../lib/format'
import { avPalette } from '../../lib/theme'
import { sx, C } from '../../styles/sx'
import Avatar from './Avatar'
import MaterialIcon from './MaterialIcon'
import type { Contact } from '../../types'

/** Uma sugestão de cliente. `contactId` só existe quando veio da agenda de contatos. */
export interface ClientOption {
  label: string
  contactId?: string
  /** Nome da pessoa. Quando o rótulo é a empresa, é por aqui que se acha o contato. */
  name?: string
  company?: string
  phone?: string
  photoUrl?: string
  /** 'contato' = da agenda; 'nota' = nome que só aparece em notas antigas. */
  origem: 'contato' | 'nota'
}

/**
 * Transforma a agenda em opções do combo.
 *
 * O rótulo muda com o campo: a NOTA sai para a empresa, então lá a empresa manda; o
 * negócio tem campo de empresa separado, então lá o rótulo é a pessoa. Nos dois casos nome,
 * empresa, telefone e foto vão junto — é o que o combo usa para dizer quem é cada um, e o
 * que permite achar alguém digitando qualquer um dos dois nomes.
 */
export function contactOptions(contacts: Contact[], rotulo: 'nome' | 'empresa'): ClientOption[] {
  const byLabel = new Map<string, ClientOption>()
  for (const c of contacts) {
    // '—' é como saveContact grava "sem empresa"; não serve de rótulo.
    const empresa = c.company && c.company !== '—' ? c.company : ''
    const label = rotulo === 'empresa' ? empresa || c.name : c.name || empresa
    if (!label.trim() || byLabel.has(label)) continue
    byLabel.set(label, {
      label,
      contactId: c.id,
      name: c.name,
      company: c.company,
      phone: c.phone || c.whatsapp,
      photoUrl: c.photoUrl,
      origem: 'contato',
    })
  }
  return [...byLabel.values()].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
}

/**
 * Junta opções da agenda com nomes soltos que só existem em registros antigos, sem duplicar.
 * Os contatos ficam na frente; dentro de cada grupo, ordem alfabética.
 */
export function withLegacyNames(base: ClientOption[], nomes: string[]): ClientOption[] {
  const byLabel = new Map(base.map((o) => [o.label, o]))
  for (const n of nomes) {
    const label = n.trim()
    if (label && !byLabel.has(label)) byLabel.set(label, { label, origem: 'nota' })
  }
  return [...byLabel.values()].sort((a, b) =>
    a.origem === b.origem
      ? a.label.localeCompare(b.label, 'pt-BR')
      : a.origem === 'contato' ? -1 : 1)
}

/**
 * Campo de cliente com lista própria, no lugar do `<datalist>` nativo — que o navegador
 * desenha do jeito dele (abria preto dentro do modal claro) e não aceita mostrar telefone,
 * empresa nem foto.
 *
 * Continua sendo um campo de TEXTO LIVRE: numa conta nova não há contato nenhum, e sem poder
 * digitar um nome solto não daria para emitir a primeira nota.
 */
export default function ClientCombo({ value, options, onChange, placeholder }: {
  value: string
  options: ClientOption[]
  /** Devolve o texto e, quando veio da lista, o contato vinculado. */
  onChange: (label: string, contactId?: string) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(0)
  const wrap = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const q = searchable(value)
  const matches = useMemo(() => {
    if (!q) return options
    return options.filter((o) =>
      searchable(o.label).includes(q)
      || searchable(o.name ?? '').includes(q)
      || searchable(o.company ?? '').includes(q)
      || searchable(o.phone ?? '').includes(q))
  }, [options, q])

  // Oferece o que foi digitado quando não é igual a nenhuma opção — é o que mantém o
  // texto livre visível como escolha, em vez de parecer que só a lista vale.
  const exact = options.some((o) => searchable(o.label) === q)
  const livre = value.trim() && !exact ? value.trim() : ''

  const rows: ({ kind: 'livre'; label: string } | { kind: 'opt'; opt: ClientOption })[] = [
    ...(livre ? [{ kind: 'livre' as const, label: livre }] : []),
    ...matches.map((opt) => ({ kind: 'opt' as const, opt })),
  ]

  // A lista muda a cada tecla; sem religar o índice, a seta apontaria para um item que
  // já saiu do filtro.
  useEffect(() => { setIndex(0) }, [q, open])

  // Mantém o item destacado visível ao navegar com as setas.
  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector<HTMLElement>(`[data-i="${index}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [index, open])

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  function pick(row: typeof rows[number]) {
    if (row.kind === 'livre') onChange(row.label, undefined)
    else onChange(row.opt.label, row.opt.contactId)
    setOpen(false)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!open) { setOpen(true); return }
      if (!rows.length) return
      e.preventDefault()
      setIndex((i) => (e.key === 'ArrowDown' ? i + 1 : i - 1 + rows.length) % rows.length)
    } else if (e.key === 'Enter' && open && rows[index]) {
      e.preventDefault()
      pick(rows[index])
    } else if (e.key === 'Escape' && open) {
      e.preventDefault()
      setOpen(false)
    } else if (e.key === 'Tab') {
      setOpen(false)
    }
  }

  // Cabeçalho de seção só aparece quando a seção existe e há a outra para distinguir.
  const temContato = matches.some((o) => o.origem === 'contato')
  const temNota = matches.some((o) => o.origem === 'nota')

  return (
    <div ref={wrap} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input
          value={value}
          onChange={(e) => { onChange(e.target.value, undefined); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          style={{ ...sx.input, paddingRight: 38 }}
        />
        <button
          type="button"
          tabIndex={-1}
          title={open ? 'Fechar' : 'Ver contatos'}
          onClick={() => setOpen((v) => !v)}
          style={{
            position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
            width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: 8,
            overflow: 'hidden',
          }}
        >
          <MaterialIcon name={open ? 'expand_less' : 'expand_more'} size={20} color={C.muted} />
        </button>
      </div>

      {open && (
        <div
          ref={listRef}
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 30,
            background: '#fff', border: '1px solid ' + C.fieldBorder, borderRadius: 14,
            padding: 6, boxShadow: '0 18px 44px rgba(20,14,40,0.18)',
            maxHeight: 288, overflowY: 'auto',
          }}
        >
          {rows.length === 0 && (
            <div style={{ padding: '14px 12px', fontSize: 12.5, color: C.faint }}>
              Nenhum contato encontrado. Digite o nome do cliente para usá-lo assim mesmo.
            </div>
          )}

          {rows.map((row, i) => {
            const on = i === index
            if (row.kind === 'livre') {
              return (
                <Linha key="livre" i={i} on={on} onEnter={() => setIndex(i)} onClick={() => pick(row)}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(150,110,200,0.12)', flexShrink: 0 }}>
                    <MaterialIcon name="add" size={18} color={C.purple} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.purple, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      Usar “{row.label}”
                    </div>
                    <div style={{ fontSize: 11.5, color: C.sub }}>Cliente novo, sem contato cadastrado</div>
                  </div>
                </Linha>
              )
            }

            const o = row.opt
            // Contato do WhatsApp sem nome guarda o telefone no lugar do nome: mostrar o
            // número como se fosse gente é o que deixava a lista com cara de erro.
            const semNome = looksLikePhone(o.label)
            const titulo = semNome ? 'Sem nome' : o.label
            // A segunda linha diz QUEM é: a pessoa por trás da empresa, ou o telefone. Sem ela,
            // procurar "Marina" não achava nada porque o rótulo era "Nexa Software".
            const detalhes = semNome
              ? [fmtPhoneBR(o.label)]
              : [
                  o.name && o.name !== o.label ? o.name : '',
                  o.company && o.company !== o.label && o.company !== '—' ? o.company : '',
                  o.phone ? fmtPhoneBR(o.phone) : '',
                ].filter(Boolean)
            const sub = detalhes.length ? detalhes.join(' · ') : (o.origem === 'nota' ? 'De uma nota anterior' : '')
            const primeiroDaSecao = matches.findIndex((m) => m.origem === o.origem) === matches.indexOf(o)

            return (
              <div key={o.label + (o.contactId ?? '')}>
                {temContato && temNota && primeiroDaSecao && (
                  <div style={{ fontSize: 10, letterSpacing: '.1em', color: C.faint, fontWeight: 700, padding: '9px 10px 5px' }}>
                    {o.origem === 'contato' ? 'CONTATOS' : 'DE NOTAS ANTERIORES'}
                  </div>
                )}
                <Linha i={i} on={on} onEnter={() => setIndex(i)} onClick={() => pick(row)}>
                  <Avatar
                    photoUrl={o.photoUrl}
                    initials={semNome ? '#' : (initialsOf(o.label) || '?')}
                    size={32}
                    bg={avPalette[i % avPalette.length]}
                    fontSize={12}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {titulo}
                    </div>
                    {sub && (
                      <div style={{ fontSize: 11.5, color: C.sub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {sub}
                      </div>
                    )}
                  </div>
                </Linha>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Linha({ i, on, onEnter, onClick, children }: {
  i: number
  on: boolean
  onEnter: () => void
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      data-i={i}
      onMouseEnter={onEnter}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
        border: 'none', borderRadius: 10, padding: '8px 10px', cursor: 'pointer',
        fontFamily: "'Manrope',sans-serif",
        background: on ? 'rgba(150,110,200,0.12)' : 'transparent',
      }}
    >
      {children}
    </button>
  )
}
