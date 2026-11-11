import { AuthProvider, useAuth } from './auth/AuthContext'
import AvisoContaAberta from './auth/AvisoContaAberta'
import Gatekeeper from './auth/Gatekeeper'
import MembershipGate from './auth/MembershipGate'
import { Carregador } from './components/Carregador'
import AppContent from './AppContent'

// Roteamento por estado de sessão. NÃO mude a ordem dos gates:
//   bootstrapping → carregando; sem login → Gatekeeper; sem assinatura → MembershipGate;
//   assinante → o app. Logado, o aviso de conta do login único (quando há) fica acima das duas telas.
function AppRouter() {
  const { isLoggedIn, isMember, isBootstrapping } = useAuth()

  if (isBootstrapping) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Carregador />
      </div>
    )
  }

  if (!isLoggedIn) return <Gatekeeper />
  return (
    <>
      <AvisoContaAberta />
      {isMember ? <AppContent /> : <MembershipGate />}
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  )
}
