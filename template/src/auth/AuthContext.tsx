import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from 'react'
import * as api from './api'
import { TOKEN_KEY, type AuthUser } from './api'

interface AuthContextValue {
  // Estado de sessão
  isLoggedIn: boolean
  isMember: boolean
  user: AuthUser | null
  isLoading: boolean
  isBootstrapping: boolean
  error: string | null
  // Ações
  login: (email: string, password: string) => Promise<void>
  loginGoogle: () => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isBootstrapping, setIsBootstrapping] = useState(!!localStorage.getItem(TOKEN_KEY))
  const [error, setError] = useState<string | null>(null)

  const isLoggedIn = !!token && !!user
  const isMember = user?.isMember ?? false

  // ── Bootstrap: restaura a sessão via /auth/me ───────────────────────────────
  // Usa /auth/me (liberado a qualquer logado) — assim um não-membro também
  // restaura a sessão e cai no MembershipGate, em vez de ser deslogado em loop.
  useEffect(() => {
    if (!token) {
      setIsBootstrapping(false)
      return
    }
    api
      .getMe()
      .then(({ data }) => setUser(data))
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY)
        setToken(null)
      })
      .finally(() => setIsBootstrapping(false))
  }, [token])

  // Aplica a sessão após um login bem-sucedido (email/senha ou Google).
  async function runLogin(
    authRequest: () => Promise<{ data: api.LoginResponse }>,
    fallbackMsg: string,
  ) {
    setIsLoading(true)
    setError(null)
    try {
      const { data } = await authRequest()
      localStorage.setItem(TOKEN_KEY, data.token)
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
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setUser(null)
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
        login,
        loginGoogle,
        logout,
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
