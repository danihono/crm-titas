import { useState } from 'react'
import { C, sx } from '../../styles/sx'
import { agendaDoContato } from '../../lib/contactAgenda'
import { toggleActivity } from '../../hooks/useActivities'
import { sugerirTarefa, daParaSugerir, type TarefaSugerida } from '../../hooks/useTaskSuggestion'
import { dueInfo } from '../../lib/format'
import MaterialIcon from '../common/MaterialIcon'
import RingButton from '../common/RingButton'
import type { ActType, Activity, Contact, Message } from '../../types'

/**
 * Agenda e tarefas DESTA conversa.
 *
 * O CRM já criava o compromisso na Agenda junto com a atividade; o que faltava
 * era o caminho de volta — de dentro do atendimento, ver e marcar o próximo
 * passo sem sair para outra tela e procurar o cliente na lista.
 */
export default function ContactAgenda({ contact, activities, types, messages, canWrite, onNova }: {
  contact: Contact
  activities: Activity[]
  types: ActType[]
  messages: Message[]
  canWrite: boolean
  /** Abre o modal de nova atividade já preenchido. */
  onNova: (sugestao?: TarefaSugerida) => void
}) {
  const { abertas, concluidas, atrasadas } = agendaDoContato(activities, contact)
  const typeMap = Object.fromEntries(types.map((t) => [t.id, t]))
  const [pensando, setPensando] = useState(false)
  const [erro, setErro] = useState('')

  async function pedirSugestao() {
    setErro('')
    setPensando(true)
    try {
      onNova(await sugerirTarefa(messages, types, contact.company || contact.name))
    } catch (e) {
      // A IA é um atalho, não o caminho: falhou, o botão de criar à mão continua ali.
      const code = (e as { code?: string })?.code ?? ''
      setErro(
        code === 'functions/not-found'
          ? 'A função sugerirTarefaIA ainda não foi publicada neste projeto.'
          : 'Não deu para falar com o Titã IA agora. Crie a tarefa à mão.',
      )
    } finally {
      setPensando(false)
    }
  }

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 22px 26px' }}>
      {canWrite && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <RingButton radius={11} onClick={() => onNova()} style={{ ...sx.btnPrimary, flex: 1, justifyContent: 'center' }}>
            <MaterialIcon name="add_task" size={17} /> Nova atividade
          </RingButton>
          <RingButton
            radius={11}
            onClick={pedirSugestao}
            disabled={pensando || !daParaSugerir(messages) || types.length === 0}
            title={daParaSugerir(messages) ? 'O Titã IA lê a conversa e propõe o próximo passo' : 'Sem mensagens para a IA ler'}
            style={{
              ...sx.btnGhost,
              justifyContent: 'center',
              color: C.purple,
              borderColor: C.selBorder,
              opacity: pensando || !daParaSugerir(messages) || types.length === 0 ? 0.55 : 1,
              cursor: pensando ? 'default' : 'pointer',
            }}
          >
            <MaterialIcon name="auto_awesome" size={17} className={pensando ? 'icon-spin' : undefined} />
            {pensando ? 'Lendo...' : 'Sugerir'}
          </RingButton>
        </div>
      )}
      {erro && (
        <div style={{ fontSize: 12, color: C.roseDeep, background: C.tintRose, borderRadius: 10, padding: '9px 12px', marginBottom: 14 }}>{erro}</div>
      )}

      <Secao titulo="Em aberto" contagem={abertas.length} alerta={atrasadas} />
      {abertas.length === 0 && <Vazio>Nenhuma tarefa marcada para este cliente.</Vazio>}
      {abertas.map((a) => (
        <Linha key={a.id} a={a} t={typeMap[a.type]} canWrite={canWrite} />
      ))}

      {concluidas.length > 0 && (
        <>
          <div style={{ height: 18 }} />
          <Secao titulo="Concluídas" contagem={concluidas.length} alerta={0} />
          {concluidas.slice(0, 8).map((a) => (
            <Linha key={a.id} a={a} t={typeMap[a.type]} canWrite={canWrite} />
          ))}
        </>
      )}
    </div>
  )
}

function Secao({ titulo, contagem, alerta }: { titulo: string; contagem: number; alerta: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', color: C.muted, textTransform: 'uppercase' }}>{titulo}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: C.sub }}>{contagem}</span>
      {alerta > 0 && (
        <span style={{ fontSize: 10.5, fontWeight: 800, color: C.roseDeep, background: C.tintRose, borderRadius: 20, padding: '2px 8px' }}>
          {alerta} atrasada{alerta > 1 ? 's' : ''}
        </span>
      )}
    </div>
  )
}

function Vazio({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 12.5, color: C.faint, border: `1px dashed ${C.fieldBorder}`, borderRadius: 12, padding: '16px 14px', textAlign: 'center' }}>
      {children}
    </div>
  )
}

function Linha({ a, t, canWrite }: { a: Activity; t?: ActType; canWrite: boolean }) {
  const prazo = dueInfo(a.dueAt, a.done)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 0', borderBottom: `1px solid ${C.lineHair}` }}>
      <MaterialIcon
        name={a.done ? 'check_circle' : (t?.icon ?? 'event')}
        size={17}
        color={a.done ? C.green : (t?.color ?? C.purple)}
        onClick={canWrite ? () => void toggleActivity(a) : undefined}
        title={canWrite ? (a.done ? 'Reabrir' : 'Marcar como concluída') : undefined}
        style={{
          background: a.done ? C.tintGreen : (t?.bg ?? C.tintPurpleStrong),
          width: 32, height: 32, borderRadius: 10, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: canWrite ? 'pointer' : 'default',
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 600, color: a.done ? C.muted : C.ink,
          textDecoration: a.done ? 'line-through' : 'none',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {a.title}
        </div>
        <div style={{ fontSize: 11, color: prazo.overdue ? C.roseDeep : C.muted }}>
          {t?.label ? t.label + ' · ' : ''}{prazo.text}
        </div>
      </div>
    </div>
  )
}
