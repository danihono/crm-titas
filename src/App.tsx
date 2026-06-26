import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
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
import Agent from './pages/Agent'
import SuperHome from './pages/super/SuperHome'
import GeneralDashboard from './pages/super/GeneralDashboard'
import ClientsList from './pages/super/ClientsList'

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
              { path: 'agente', element: <Agent /> },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  )
}
