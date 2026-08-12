import { useUIStore, type PipelineView } from '../store/uiStore'
import TabBar, { type TabDef } from '../components/common/TabBar'
import KanbanBoard from '../components/pipeline/KanbanBoard'
import FlowsView from '../components/flows/FlowsView'

const TABS: TabDef<PipelineView>[] = [
  { id: 'kanban', label: 'Kanban', icon: 'view_kanban' },
  { id: 'fluxos', label: 'Fluxos', icon: 'account_tree' },
]

/**
 * Casca da tela de Pipeline: a barra de abas e a visão ativa. O conteúdo do
 * Kanban vive em components/pipeline/KanbanBoard.
 */
export default function Pipeline() {
  const view = useUIStore((s) => s.pipelineView)
  const setView = useUIStore((s) => s.setPipelineView)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flexShrink: 0 }}>
        <TabBar tabs={TABS} active={view} onChange={setView} />
      </div>
      <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
        {view === 'kanban' ? <KanbanBoard /> : <FlowsView />}
      </div>
    </div>
  )
}
