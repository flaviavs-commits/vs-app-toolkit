import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import authRoutes, { requireAuth, requireMember } from './auth/authRoutes.js'
import { corsOrigin } from './lib/corsOrigin.js'

const app = express()

// ── CORS ─────────────────────────────────────────────────────────────────────
// Em produção, permite apenas o domínio exato do frontend (Vercel); sem
// FRONTEND_URL o boot falha (ver lib/corsOrigin.ts).
app.use(
  cors({
    origin: corsOrigin(),
    credentials: true,
  }),
)

app.use(express.json())

// ── Healthcheck ────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }))

// ── Autenticação (módulo VS) ────────────────────────────────────────────────────
// /api/auth/login, /api/auth/google, /api/auth/me
app.use(authRoutes)

// ── Rotas de negócio do {{APP_NAME}} ────────────────────────────────────────────
// Exemplo: rota restrita a membros ativos. `requireAuth` valida o JWT e
// `requireMember` bloqueia não-membros (403). Substitua/expanda com as rotas
// reais do seu app.
app.get('/api/exemplo', requireAuth, requireMember, (req, res) => {
  res.json({ message: `Olá, membro! (${req.user!.email})` })
})

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Rota não encontrada' }))

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err)
  res.status(500).json({ error: 'Erro interno do servidor' })
})

const PORT = process.env.PORT || {{BACKEND_PORT}}
app.listen(PORT, () => {
  console.log(`✓  {{APP_NAME}} API → porta ${PORT}`)
})
