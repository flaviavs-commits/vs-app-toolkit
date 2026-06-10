import jwt from 'jsonwebtoken'
import type { Request, Response, NextFunction } from 'express'

// Payload do nosso JWT (emitido por este backend após o login no VS).
export interface AuthPayload {
  userId: string
  email: string
}

// Estende o Request do Express para carregar o usuário autenticado.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthPayload
    }
  }
}

// ── requireAuth ────────────────────────────────────────────────────────────────
// Valida o JWT no header Authorization e popula `req.user`. Rejeita com 401.
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization

  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não fornecido' })
  }

  try {
    const token = header.slice(7)
    req.user = jwt.verify(token, process.env.JWT_SECRET as string) as AuthPayload
    next()
  } catch (err) {
    const expired = (err as Error).name === 'TokenExpiredError'
    res.status(401).json({
      error: expired ? 'Sessão expirada — faça login novamente' : 'Token inválido',
    })
  }
}
