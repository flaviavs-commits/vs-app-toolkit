import { Router } from 'express'
import { login, loginGoogle, getMe } from './authController.js'
import { requireAuth } from './requireAuth.js'

// ── Rotas de autenticação ──────────────────────────────────────────────────────
// Monte com: app.use(authRoutes) — registra:
//   POST /api/auth/login   (público — email+senha via VS)
//   POST /api/auth/google  (público — id_token Firebase via VS)
//   GET  /api/auth/me       (autenticado — restaura sessão; não exige membership)
const authRoutes = Router()

authRoutes.post('/api/auth/login', login)
authRoutes.post('/api/auth/google', loginGoogle)
authRoutes.get('/api/auth/me', requireAuth, getMe)

export default authRoutes

// Re-exporta os guards para o app gatear suas próprias rotas de negócio:
//   app.get('/api/algo', requireAuth, requireMember, handler)
export { requireAuth } from './requireAuth.js'
export { requireMember } from './requireMember.js'
export { serializeUser } from './authController.js'
