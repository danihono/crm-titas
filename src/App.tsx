import { useEffect } from 'react'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ouvirSistema } from './store/themeStore'
import { useLocaleStore } from './store/localeStore'
import ProtectedRoute from './components/layout/ProtectedRoute'
import { OwnerRoute, CrmRoute } from './components/layout/RouteGuards'
import Layout from './components/layout/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Pipeline from './pages/Pipeline'
import Contacts from './pages/Contacts'
import Activities from './pages/Activities'
import Invoices from './pages/Invoices'
import Agenda from './pages/Agenda'
import Assistant from './pages/Assistant'
import Reports from './pages/Reports'
import Campaigns from './pages/Campaigns'
import Settings from './pages/Settings'
import SuperHome from './pages/super/SuperHome'
import GeneralDashboard from './pages/super/GeneralDashboard'
import ClientsList from './pages/super/ClientsList'
import AssistantSession from './pages/super/AssistantSession'

const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  {
    element: <ProtectedRoute />,
    children: [
      // SUPER TITAN — somente donos
      {
        element: <OwnerRoute />,
        children: [
          { path: 'super', element: <SuperHome /> },
          { path: 'super/geral', element: <GeneralDashboard /> },
          { path: 'super/clientes', element: <ClientsList /> },
          { path: 'super/assistente', element: <AssistantSession /> },
        ],
      },
      // CRM — usuários comuns (próprios dados) ou dono visualizando um cliente
      {
        element: <CrmRoute />,
        children: [
          {
            element: <Layout />,
            children: [
              { index: true, element: <Dashboard /> },
              { path: 'pipeline', element: <Pipeline /> },
              { path: 'contatos', element: <Contacts /> },
              { path: 'atividades', element: <Activities /> },
              { path: 'faturamento', element: <Invoices /> },
              { path: 'agenda', element: <Agenda /> },
              { path: 'assistente', element: <Assistant /> },
              // O módulo se chamava "Agente de IA" e virou "Assistente". O redirect fica:
              // link antigo em favorito ou colado num histórico de conversa não pode
              // cair no catch-all e mandar a pessoa para o Dashboard sem explicação.
              { path: 'agente', element: <Navigate to="/assistente" replace /> },
              { path: 'campanhas', element: <Campaigns /> },
              { path: 'relatorios', element: <Reports /> },
              { path: 'configuracoes', element: <Settings /> },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])

export default function App() {
  // O tema já foi pintado pelo script do index.html; aqui só passamos a seguir o
  // sistema operacional quando a preferência é 'system' (a pessoa troca o tema
  // do macOS/Windows com o CRM aberto).
  useEffect(() => ouvirSistema(), [])

  // A `key` é o que faz a troca de idioma valer na tela inteira, e não é
  // decoração: as rotas são elementos criados em escopo de módulo, então a
  // referência nunca muda e o React pula a re-renderização do subtree quando só
  // o App re-renderiza. Com a key, ele remonta. A URL sobrevive — o `router` é o
  // mesmo objeto e guarda a própria localização. O que se perde é estado de
  // tela (modal aberto, rolagem), aceitável numa ação que a pessoa faz uma vez.
  const idioma = useLocaleStore((s) => s.idioma)

  return (
    <AuthProvider>
      <RouterProvider key={idioma} router={router} />
    </AuthProvider>
  )
}
