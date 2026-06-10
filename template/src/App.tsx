import { AuthProvider, useAuth } from './auth/AuthContext'
import Gatekeeper from './auth/Gatekeeper'
import MembershipGate from './auth/MembershipGate'
import AppContent from './AppContent'

// Roteamento por estado de sessão. NÃO mude a ordem dos gates:
//   bootstrapping → loading; sem login → Gatekeeper; não-membro → MembershipGate;
//   membro → o app.
function AppRouter() {
  const { isLoggedIn, isMember, isBootstrapping } = useAuth()

  if (isBootstrapping) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-600 text-sm">Carregando...</p>
        </div>
      </div>
    )
  }

  if (!isLoggedIn) return <Gatekeeper />
  if (!isMember) return <MembershipGate />
  return <AppContent />
}

export default function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  )
}
