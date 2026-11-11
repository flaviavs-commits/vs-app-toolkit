import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  type ReactNode,
} from 'react'
import * as api from './api'
import {
  TOKEN_KEY,
  aoRenovarSessao,
  guardarSessao,
  limparSessao,
  sairDaSessao,
  sessaoRecusada,
  type AuthUser,
} from './api'
import { MEUECOO_FALHOU, avisoDaContaAberta, entrarPeloMeuEcoo, temCodigoDoMeuEcoo } from './loginUnico'

interface AuthContextValue {
  // Estado de sessão
  isLoggedIn: boolean
  isMember: boolean
  user: AuthUser | null
  isLoading: boolean
  isBootstrapping: boolean
  error: string | null
  // O código do Meu Ecoo falhou e o app entrou pela sessão guardada: de quem é a conta (AvisoContaAberta).
  avisoContaAberta: string | null
  // Ações
  login: (email: string, password: string) => Promise<void>
  loginGoogle: () => Promise<void>
  logout: () => void
  fecharAvisoContaAberta: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

// Com o armazenamento bloqueado (cookies desativados, navegação privada), ler lança: o app abre
// sem sessão em vez de cair antes da primeira tela.
function tokenGuardado(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(tokenGuardado)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isBootstrapping, setIsBootstrapping] = useState(() => !!tokenGuardado() || temCodigoDoMeuEcoo())
  const [error, setError] = useState<string | null>(null)
  // Chegando do "Abrir" do Meu Ecoo (?meuecoo_codigo=), a sessão guardada só é restaurada depois da troca
  // do código (ou se ela falhar): assim um token velho não corre contra a troca.
  const [codigoPendente, setCodigoPendente] = useState(temCodigoDoMeuEcoo)
  // O StrictMode (desenvolvimento) monta o provider duas vezes e o código é de uso único: a troca roda
  // uma vez só, e a segunda montagem reaproveita a mesma promessa.
  const troca = useRef<ReturnType<typeof entrarPeloMeuEcoo> | null>(null)
  // A troca falhou: se o app entrar pela sessão guardada (que pode ser de outra pessoa no mesmo aparelho),
  // avisa de quem é a conta. Só em memória: recarregar a página não traz o aviso de volta.
  const [trocaFalhou, setTrocaFalhou] = useState(false)

  const isLoggedIn = !!token && !!user
  const isMember = user?.isMember ?? false
  const avisoContaAberta = isLoggedIn && trocaFalhou ? avisoDaContaAberta(user) : null

  // ── Renovação da sessão (api.ts): o usuário volta atualizado (assinatura, nome) ──
  useEffect(() => aoRenovarSessao(setUser), [])

  // ── Login único: troca o código do Meu Ecoo por sessão (loginUnico.ts) ───────
  // Deu certo: entra como a conta do Meu Ecoo (mesmo havendo outra sessão guardada). Não deu certo
  // (vencido, já usado, Meu Ecoo fora do ar): segue o caminho de sempre, com o aviso na tela de login
  // ou, se entrar pela sessão guardada, o aviso de conta dentro do app.
  useEffect(() => {
    if (!codigoPendente) return undefined
    let ativo = true
    troca.current ??= entrarPeloMeuEcoo()
    void troca.current.then((entrada) => {
      if (!ativo) return
      if (entrada && 'sessao' in entrada) {
        guardarSessao(entrada.sessao)
        setToken(entrada.sessao.token)
        setUser(entrada.sessao.user)
      } else if (entrada) {
        setError(MEUECOO_FALHOU)
        setTrocaFalhou(true)
      }
      setCodigoPendente(false)
    })
    return () => {
      ativo = false
    }
  }, [codigoPendente])

  // ── Bootstrap: restaura a sessão via /auth/me ───────────────────────────────
  // Usa /auth/me (liberado a qualquer logado) — assim um não-membro também
  // restaura a sessão e cai no MembershipGate, em vez de ser deslogado em loop.
  useEffect(() => {
    if (codigoPendente) return
    if (!token) {
      setIsBootstrapping(false)
      return
    }
    api
      .getMe()
      .then(({ data }) => {
        setUser(data)
        // Entrou pela sessão guardada: o aviso de uma troca de código que falhou não vale mais.
        setError(null)
      })
      .catch((err: unknown) => {
        // Só a conta sem acesso encerra aqui. O 401 o interceptor já tratou (renovou, ou
        // encerrou e recarregou); rede caída e 5xx não derrubam a sessão guardada.
        if (sessaoRecusada(err)) {
          limparSessao()
          setToken(null)
        }
      })
      .finally(() => setIsBootstrapping(false))
  }, [token, codigoPendente])

  // Aplica a sessão após um login bem-sucedido (email/senha ou Google).
  async function runLogin(
    authRequest: () => Promise<{ data: api.LoginResponse }>,
    fallbackMsg: string,
  ) {
    setIsLoading(true)
    setError(null)
    // Quem entra pela tela de login escolheu a conta: o aviso da sessão guardada não vale para ela.
    setTrocaFalhou(false)
    try {
      const { data } = await authRequest()
      guardarSessao(data)
      setToken(data.token)
      setUser(data.user)
    } catch (err: any) {
      const msg = err.response?.data?.error || fallbackMsg
      setError(msg)
      throw new Error(msg)
    } finally {
      setIsLoading(false)
    }
  }

  function login(email: string, password: string) {
    return runLogin(
      () => api.loginUser(email, password),
      'Falha no login. Verifique suas credenciais.',
    )
  }

  async function loginGoogle() {
    setIsLoading(true)
    setError(null)
    let idToken: string
    try {
      const { signInWithGoogle } = await import('./firebase')
      idToken = await signInWithGoogle()
    } catch (err: any) {
      setIsLoading(false)
      // Popup fechado/cancelado pelo usuário não é erro a exibir.
      if (
        err?.code === 'auth/popup-closed-by-user' ||
        err?.code === 'auth/cancelled-popup-request'
      ) {
        return
      }
      const msg = 'Não foi possível autenticar com o Google. Tente novamente.'
      setError(msg)
      throw new Error(msg)
    }
    return runLogin(
      () => api.loginWithGoogle(idToken),
      'Não foi possível autenticar com o Google.',
    )
  }

  function logout() {
    sairDaSessao()
    setToken(null)
    setUser(null)
    setError(null)
  }

  return (
    <AuthContext.Provider
      value={{
        isLoggedIn,
        isMember,
        user,
        isLoading,
        isBootstrapping,
        error,
        avisoContaAberta,
        login,
        loginGoogle,
        logout,
        fecharAvisoContaAberta: () => setTrocaFalhou(false),
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>')
  return ctx
}
