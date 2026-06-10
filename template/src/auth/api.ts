import axios from 'axios'

// Chave do JWT no localStorage. Use um valor único por app para não colidir
// com outros apps VS servidos no mesmo domínio.
export const TOKEN_KEY = '{{APP_SLUG}}_token'

// ── Instância base ────────────────────────────────────────────────────────────
// VITE_API_URL é definido em .env.local (dev) e nas env vars da Vercel (prod).
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:{{BACKEND_PORT}}',
  timeout: 12000,
  headers: { 'Content-Type': 'application/json' },
})

// Request interceptor: injeta o JWT em todas as chamadas autenticadas.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Response interceptor: 401 limpa a sessão e recarrega (volta ao Gatekeeper).
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY)
      window.location.reload()
    }
    return Promise.reject(err)
  },
)

// ── Tipos ──────────────────────────────────────────────────────────────────────
export interface AuthUser {
  id: string
  email: string
  nome: string
  isMember: boolean
  memberUntil: string | null
}

export interface LoginResponse {
  token: string
  user: AuthUser
}

// ── Chamadas de auth ────────────────────────────────────────────────────────────
export const loginUser = (email: string, password: string) =>
  api.post<LoginResponse>('/api/auth/login', { email, password })

export const loginWithGoogle = (idToken: string) =>
  api.post<LoginResponse>('/api/auth/google', { idToken })

export const getMe = () => api.get<AuthUser>('/api/auth/me')

export default api
