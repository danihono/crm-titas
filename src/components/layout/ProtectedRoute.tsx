import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

/** Splash enquanto carrega a sessão; redireciona para /login se não autenticado. */
export default function ProtectedRoute() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div
        style={{
          height: '100vh',
          width: '100vw',
          background: '#0a080c',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        {[0, 0.2, 0.4].map((d) => (
          <span
            key={d}
            style={{
              width: 9,
              height: 9,
              borderRadius: '50%',
              background: '#9a6fb8',
              animation: `blink 1s infinite ${d}s`,
            }}
          />
        ))}
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}
