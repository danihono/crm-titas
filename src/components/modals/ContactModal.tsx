import { useState } from 'react'
import Modal from './Modal'
import MaterialIcon from '../common/MaterialIcon'
import { sx } from '../../styles/sx'
import { saveContact, updateContact, type NewContactForm } from '../../hooks/useContacts'
import type { Contact } from '../../types'

const EMPTY: NewContactForm = { name: '', role: '', company: '', email: '', phone: '', whats: '' }
const dash = (v: string) => (v === '—' ? '' : v)

function formFromContact(c?: Contact): NewContactForm {
  if (!c) return EMPTY
  return {
    name: c.name, role: dash(c.role), company: dash(c.company),
    email: c.email || '', phone: c.phone || '', whats: c.whatsapp || '',
  }
}

export default function ContactModal({ contact, onClose, onSaved }: { contact?: Contact; onClose: () => void; onSaved: (id: string) => void }) {
  const editing = !!contact
  const [form, setForm] = useState<NewContactForm>(() => formFromContact(contact))
  const [busy, setBusy] = useState(false)
  const set = (k: keyof NewContactForm) => (v: string) => setForm((f) => ({ ...f, [k]: v }))

  async function handleSave() {
    if (!form.name.trim() || busy) return
    setBusy(true)
    try {
      if (editing) {
        await updateContact(contact!.id, form)
        onSaved(contact!.id)
      } else {
        const id = await saveContact(form)
        onSaved(id)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal width={500} onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ ...sx.serif, fontSize: 23, fontWeight: 600, color: '#1d1726' }}>{editing ? 'Editar contato' : 'Novo contato'}</div>
        <MaterialIcon name="close" size={23} color="#9c95a8" style={{ cursor: 'pointer' }} onClick={onClose} />
      </div>
      <div style={{ fontSize: 12.5, color: '#6e6780', marginBottom: 18 }}>{editing ? 'Atualize as informações do cliente.' : 'Cadastre todas as informações do cliente.'}</div>

      <div style={{ display: 'flex', gap: 12 }}>
        <Field flex label="Nome completo" value={form.name} onChange={set('name')} placeholder="Ex: João Silva" />
        <Field flex label="Cargo" value={form.role} onChange={set('role')} placeholder="Ex: Diretor" />
      </div>
      <Field label="Empresa" value={form.company} onChange={set('company')} placeholder="Ex: Acme Ltda" />
      <Field label="E-mail" value={form.email} onChange={set('email')} placeholder="email@empresa.com" />
      <div style={{ display: 'flex', gap: 12 }}>
        <Field flex label="Telefone" value={form.phone} onChange={set('phone')} placeholder="+55 11 90000-0000" />
        <Field flex label="WhatsApp" value={form.whats} onChange={set('whats')} placeholder="+55 11 90000-0000" />
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
        <button onClick={onClose} style={{ background: '#f3f1f7', border: '1px solid #e6e3ee', borderRadius: 11, padding: '10px 18px', color: '#4a4458', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
        <button onClick={handleSave} style={{ background: 'linear-gradient(140deg,#7a52a0,#553578)', border: '1px solid rgba(200,160,230,0.3)', borderRadius: 11, padding: '10px 20px', color: '#f4eefa', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.7 : 1 }}>{editing ? 'Salvar alterações' : 'Salvar contato'}</button>
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
