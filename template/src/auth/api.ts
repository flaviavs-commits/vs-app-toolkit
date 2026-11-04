import axios, { type InternalAxiosRequestConfig } from 'axios'

// Chave do JWT no localStorage. Use um valor único por app para não colidir
// com outros apps VS servidos no mesmo domínio.
export const TOKEN_KEY = '{{APP_SLUG}}_token'
// Sessão curta: o JWT de acesso dura minutos e o refresh token, guardado ao lado,
// o renova. Fica no localStorage porque o front (Vercel) e a API (Railway) são de
// sites diferentes, e cookie httpOnly de terceiros não é confiável nos navegadores.
export const REFRESH_KEY = '{{APP_SLUG}}_refresh'

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

const ROTA_LOGIN = '/api/auth/login'
const ROTA_GOOGLE = '/api/auth/google'
const ROTA_REFRESH = '/api/auth/refresh'
const ROTA_LOGOUT = '/api/auth/logout'
const ROTAS_DE_LOGIN = [ROTA_LOGIN, ROTA_GOOGLE]
const ROTAS_SEM_RENOVACAO = [...ROTAS_DE_LOGIN, ROTA_REFRESH, ROTA_LOGOUT]

// Quem escuta a renovação recebe o usuário atualizado (assinatura, nome).
const ouvintesDeRenovacao = new Set<(user: AuthUser) => void>()
export function aoRenovarSessao(ouvinte: (user: AuthUser) => void): () => void {
  ouvintesDeRenovacao.add(ouvinte)
  return () => ouvintesDeRenovacao.delete(ouvinte)
}

// Guarda o par de tokens de um login ou de uma renovação. Backend ainda sem refresh
// token (o front sai antes dele): guarda só o JWT e descarta um refresh de outra sessão.
export function guardarSessao(sessao: LoginResponse) {
  localStorage.setItem(TOKEN_KEY, sessao.token)
  if (sessao.refreshToken) localStorage.setItem(REFRESH_KEY, sessao.refreshToken)
  else localStorage.removeItem(REFRESH_KEY)
}

export function limparSessao() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_KEY)
}

// Sair: revoga a família no backend (melhor esforço, sem travar a saída) e limpa o armazenamento.
export function sairDaSessao() {
  const refreshToken = localStorage.getItem(REFRESH_KEY)
  limparSessao()
  if (refreshToken) api.post(ROTA_LOGOUT, { refreshToken }).catch(() => {})
}

// Só o servidor dizendo que a conta não tem mais acesso (403/404) apaga a sessão no bootstrap.
// O 401 o interceptor já tratou (renovou, ou encerrou e recarregou); rede caída e 5xx não derrubam.
export function sessaoRecusada(err: unknown): boolean {
  const status = (err as { response?: { status?: number } } | null)?.response?.status
  return status === 403 || status === 404
}

const statusDe = (err: unknown) => (err as { response?: { status?: number } } | null)?.response?.status

// 409: a outra aba está renovando com o mesmo refresh token. Espera (até ~3 s) ela gravar o par
// novo no armazenamento e devolve o refresh token dela; null se ele não mudou ou a outra aba saiu.
async function esperarOutraAba(usado: string): Promise<string | null> {
  for (let i = 0; i < 12; i += 1) {
    const atual = localStorage.getItem(REFRESH_KEY)
    if (atual !== usado) return atual
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return null
}

async function renovar(refreshToken: string, podeRepetir = true): Promise<void> {
  try {
    const { data } = await api.post<RenovacaoResponse>(ROTA_REFRESH, { refreshToken })
    guardarSessao(data)
    ouvintesDeRenovacao.forEach((ouvinte) => ouvinte(data.user))
  } catch (err) {
    if (podeRepetir && statusDe(err) === 409) {
      const novo = await esperarOutraAba(refreshToken)
      if (novo) return renovar(novo, false)
    }
    throw err
  }
}

// Uma renovação por vez: as requisições que falharam juntas esperam a mesma promessa.
let renovacaoEmCurso: Promise<void> | null = null
function renovarSessao(refreshToken: string): Promise<void> {
  renovacaoEmCurso ??= renovar(refreshToken).finally(() => {
    renovacaoEmCurso = null
  })
  return renovacaoEmCurso
}

function encerrarSessao() {
  limparSessao()
  window.location.reload()
}

type ConfigRepetivel = InternalAxiosRequestConfig & { _renovada?: boolean }

// Response interceptor: 401 renova a sessão e repete a requisição uma vez; sem refresh token
// (sessão antiga) ou sem sucesso, limpa a sessão e recarrega (volta ao Gatekeeper).
// Fora do jogo ficam as rotas de login, da renovação e da saída: ali o 401 é tentativa recusada
// (senha errada, Google recusado, refresh inválido), não sessão expirada. O erro
// volta para a tela sem recarregar, e a sessão já guardada continua valendo.
// Renovação que não deu por rede caída ou 5xx não derruba a sessão: devolve o erro original.
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const config: ConfigRepetivel | undefined = err.config
    if (err.response?.status !== 401 || !config || ROTAS_SEM_RENOVACAO.includes(config.url ?? '')) {
      return Promise.reject(err)
    }
    if (config._renovada) {
      encerrarSessao()
      return Promise.reject(err)
    }

    const refreshToken = localStorage.getItem(REFRESH_KEY)
    if (!refreshToken) {
      encerrarSessao()
      return Promise.reject(err)
    }

    // Outra renovação (aba ao lado, ou a que acabou de terminar aqui) já trocou o JWT que esta
    // requisição levou: basta repetir com o atual, sem gastar outro refresh token.
    if (config.headers.Authorization !== `Bearer ${localStorage.getItem(TOKEN_KEY)}`) {
      config._renovada = true
      return api(config)
    }

    try {
      await renovarSessao(refreshToken)
    } catch (falha) {
      if ([401, 403, 409].includes(statusDe(falha) ?? 0)) encerrarSessao()
      return Promise.reject(err)
    }
    config._renovada = true
    return api(config)
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
  refreshToken?: string
  user: AuthUser
}

export interface RenovacaoResponse {
  token: string
  refreshToken: string
  user: AuthUser
}

// ── Chamadas de auth ────────────────────────────────────────────────────────────
export const loginUser = (email: string, password: string) =>
  api.post<LoginResponse>(ROTA_LOGIN, { email, password })

export const loginWithGoogle = (idToken: string) =>
  api.post<LoginResponse>(ROTA_GOOGLE, { idToken })

export const getMe = () => api.get<AuthUser>('/api/auth/me')

export default api
