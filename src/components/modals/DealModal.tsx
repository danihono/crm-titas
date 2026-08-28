import { useState } from 'react'
import Modal from './Modal'
import MaterialIcon from '../common/MaterialIcon'
import RingButton from '../common/RingButton'
import { sx } from '../../styles/sx'
import { tagMap } from '../../lib/theme'
import { fmtMoney, parseValueBR } from '../../lib/format'
import ClientCombo, { type ClientOption } from '../common/ClientCombo'
import type { DealForm } from '../../hooks/useDeals'
import type { Deal } from '../../types'

const TAGS = Object.keys(tagMap)

/**
 * Criar/editar um negócio do Kanban. Antes o card era só leitura: "Novo negócio"
 * gravava um placeholder que não tinha como ser alterado nem apagado depois.
 *
 * Coluna e ordem NÃO entram aqui de propósito — quem move o card é o arraste.
 */
export default function DealModal({ deal, preset, contactOptions, onClose, onSave, onDelete }: {
  deal?: Deal | null
  /** Valores iniciais ao criar (a agenda manda o contato já escolhido). Ignorado ao editar. */
  preset?: { contact: string; company: string; contactId: string }
  /** Agenda para o campo Contato. Vazia numa conta nova — o campo segue de texto livre. */
  contactOptions: ClientOption[]
  onClose: () => void
  onSave: (form: DealForm) => Promise<void>
  onDelete?: () => Promise<void>
}) {
  const editing = !!deal
  const [company, setCompany] = useState(deal?.company ?? preset?.company ?? '')
  const [contact, setContact] = useState(deal?.contact ?? preset?.contact ?? '')
  const [contactId, setContactId] = useState(deal?.contactId ?? preset?.contactId ?? '')
  const [value, setValue] = useState(deal?.value ? fmtMoney(deal.value) : '')
  const [tag, setTag] = useState(deal?.tag || 'Novo')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Etiqueta gravada por outra versão (ou pelo seed) não pode sumir só porque
  // não está no tagMap — ela entra na lista para o select não trocá-la sozinho.
  const tagOptions = deal?.tag && !TAGS.includes(deal.tag) ? [deal.tag, ...TAGS] : TAGS

  async function handleSave() {
    if (busy) return
    if (!company.trim() && !contact.trim()) {
      setError('Preencha ao menos a empresa ou o contato.')
      return
    }
    setError('')
    setBusy(true)
    try {
      await onSave({ company, contact, value: parseValueBR(value), tag, contactId })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar o negócio.')
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!onDelete || busy) return
    if (!confirm(`Excluir o negócio "${deal?.company || 'sem nome'}"? Isso não pode ser desfeito.`)) return
    setBusy(true)
    try {
      await onDelete()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao excluir o negócio.')
      setBusy(false)
    }
  }

  return (
    <Modal width={480} onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ ...sx.serif, fontSize: 23, fontWeight: 600, color: '#1d1726' }}>{editing ? 'Editar negócio' : 'Novo negócio'}</div>
        <MaterialIcon name="close" size={23} color="#9c95a8" style={{ cursor: 'pointer' }} onClick={onClose} />
      </div>
      <div style={{ fontSize: 12.5, color: '#6e6780', marginBottom: 18 }}>
        {editing ? 'Atualize os dados deste negócio.' : 'Cadastre o negócio que entra no pipeline.'}
      </div>

      <label style={sx.label}>Contato</label>
      {/* Escolher da agenda grava o vínculo — é ele que deixa o funil do painel seguir a
          MESMA pessoa até o fim. Digitar um nome solto continua valendo: numa conta nova não
          há contato nenhum, e exigir vínculo travaria o primeiro lead. */}
      <div style={{ margin: '6px 0 14px' }}>
        <ClientCombo
          value={contact}
          options={contactOptions}
          onChange={(label, id) => {
            setContact(label)
            setContactId(id ?? '')
            // Empresa vazia se completa sozinha com a do contato; se o usuário já digitou
            // algo ali, a escolha dele manda.
            const opt = id ? contactOptions.find((o) => o.contactId === id) : undefined
            const empresa = opt?.company && opt.company !== '—' ? opt.company : ''
            if (empresa && !company.trim()) setCompany(empresa)
          }}
          placeholder="Escolha um contato ou digite um nome novo"
        />
      </div>

      <Field label="Empresa" value={company} onChange={setCompany} placeholder="Ex: Atlas Cloud" />

      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={sx.label}>Valor (R$)</label>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Ex: 48.000"
            inputMode="decimal"
            style={{ ...sx.input, margin: '6px 0 14px' }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={sx.label}>Etiqueta</label>
          <select value={tag} onChange={(e) => setTag(e.target.value)} style={{ ...sx.input, margin: '6px 0 14px' }}>
            {tagOptions.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {error && (
        <div style={{ fontSize: 12.5, color: '#b73d6d', background: 'rgba(193,77,119,0.08)', border: '1px solid rgba(193,77,119,0.25)', borderRadius: 10, padding: '9px 12px', marginBottom: 14, lineHeight: 1.45 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 4 }}>
        {editing && onDelete && (
          <button
            onClick={handleDelete}
            disabled={busy}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(193,77,119,0.1)', border: '1px solid rgba(193,77,119,0.22)', borderRadius: 11, padding: '10px 14px', color: '#b73d6d', fontSize: 13, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}
          >
            <MaterialIcon name="delete" size={17} /> Excluir
          </button>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={onClose} style={{ background: '#f3f1f7', border: '1px solid #e6e3ee', borderRadius: 11, padding: '10px 18px', color: '#4a4458', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
        <RingButton radius={11} onClick={handleSave} style={{ background: 'linear-gradient(140deg,#7a52a0,#553578)', border: '1px solid rgba(200,160,230,0.3)', padding: '10px 20px', color: '#f4eefa', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.7 : 1 }}>
          {editing ? 'Salvar alterações' : 'Criar negócio'}
        </RingButton>
      </div>
    </Modal>
  )
}

function Field(props: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; flex?: boolean }) {
  return (
    <div style={{ flex: props.flex ? 1 : undefined }}>
      <label style={sx.label}>{props.label}</label>
      <input
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        style={{ ...sx.input, margin: '6px 0 14px' }}
      />
    </div>
  )
}
