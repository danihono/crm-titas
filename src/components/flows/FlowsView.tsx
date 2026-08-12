import { useEffect, useState } from 'react'
import { useUIStore } from '../../store/uiStore'
import { addFlow, useFlows, type GeneratedFlow } from '../../hooks/useFlows'
import FlowsList from './FlowsList'
import FlowEditor from './FlowEditor'
import AiFlowModal from './AiFlowModal'

/** Aba "Fluxos": lista de fluxos ou o editor do fluxo aberto. */
export default function FlowsView() {
  const { docs: flows, loading } = useFlows()
  const activeFlow = useUIStore((s) => s.activeFlow)
  const openFlow = useUIStore((s) => s.openFlow)
  const closeFlow = useUIStore((s) => s.closeFlow)
  const [showAi, setShowAi] = useState(false)

  const current = flows.find((f) => f.id === activeFlow)

  async function handleCreate() {
    try {
      openFlow(await addFlow('Novo fluxo'))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Falha ao criar o fluxo.')
    }
  }

  async function handleGenerated(generated: GeneratedFlow) {
    try {
      const id = await addFlow(generated.name, {
        nodes: generated.nodes,
        edges: generated.edges,
        source: 'ia',
      })
      setShowAi(false)
      openFlow(id)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Falha ao salvar o fluxo gerado.')
    }
  }

  // O fluxo aberto pode ter sido excluído noutra aba (ou o id ficou no store de
  // uma sessão anterior): cai de volta na lista em vez de renderizar vazio.
  useEffect(() => {
    if (activeFlow && !current && !loading) closeFlow()
  }, [activeFlow, current, loading, closeFlow])

  return (
    <>
      {current ? (
        // key remonta o editor ao trocar de fluxo, para o estado local do
        // canvas recomeçar do doc certo.
        <FlowEditor key={current.id} flow={current} onBack={closeFlow} />
      ) : (
        <FlowsList
          flows={flows}
          loading={loading}
          onOpen={openFlow}
          onCreate={handleCreate}
          onCreateWithAI={() => setShowAi(true)}
        />
      )}
      {showAi && <AiFlowModal onClose={() => setShowAi(false)} onConfirm={handleGenerated} />}
    </>
  )
}
