import type { Request, Response, NextFunction } from 'express'
import prisma from '../lib/prisma.js'

// ── requireMember ──────────────────────────────────────────────────────────────
// Bloqueia o acesso de quem NÃO é membro ativo. Deve rodar SEMPRE depois de
// `requireAuth` (que valida o JWT e popula `req.user`).
//
// O status `isMember` é espelhado no banco a cada login (a partir do que o VS
// devolve). Checar no banco — e não confiar no frontend — impede que um token
// válido de não-membro use a API direto (curl/DevTools).
export async function requireMember(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { isMember: true },
    })

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' })
    }

    if (!user.isMember) {
      return res.status(403).json({
        error: 'Acesso restrito a membros ativos do Descontos VIP.',
        code: 'NOT_MEMBER',
      })
    }

    next()
  } catch (err) {
    console.error('[requireMember] erro:', (err as Error).message)
    res.status(500).json({ error: 'Erro ao verificar acesso.' })
  }
}
