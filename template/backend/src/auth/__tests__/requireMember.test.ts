import { describe, it, expect, vi } from 'vitest'
import type { Request, Response, NextFunction } from 'express'

// O middleware lê o membership no banco — mockamos o Prisma para controlar a
// resposta sem precisar de um Postgres real.
const findUnique = vi.fn()
vi.mock('../../lib/prisma.js', () => ({
  default: { user: { findUnique } },
}))

const { requireMember } = await import('../requireMember.js')

function mockReq(userId = 'u1'): Request {
  return { user: { userId, email: 'a@b.com' } } as unknown as Request
}

function mockRes() {
  const res = {} as Response
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  return res
}

describe('requireMember', () => {
  it('libera (next) quando o usuário é membro ativo', async () => {
    findUnique.mockResolvedValueOnce({ isMember: true })
    const res = mockRes()
    const next = vi.fn() as NextFunction

    await requireMember(mockReq(), res, next)

    expect(next).toHaveBeenCalledOnce()
    expect(res.status).not.toHaveBeenCalled()
  })

  it('bloqueia com 403 e code NOT_MEMBER quando não é membro', async () => {
    findUnique.mockResolvedValueOnce({ isMember: false })
    const res = mockRes()
    const next = vi.fn() as NextFunction

    await requireMember(mockReq(), res, next)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith({
      error: 'Acesso restrito a membros ativos do Descontos VIP.',
      code: 'NOT_MEMBER',
    })
    expect(next).not.toHaveBeenCalled()
  })

  it('responde 404 quando o usuário não existe no banco', async () => {
    findUnique.mockResolvedValueOnce(null)
    const res = mockRes()
    const next = vi.fn() as NextFunction

    await requireMember(mockReq(), res, next)

    expect(res.status).toHaveBeenCalledWith(404)
    expect(next).not.toHaveBeenCalled()
  })

  it('responde 500 sem vazar detalhes quando o banco falha', async () => {
    findUnique.mockRejectedValueOnce(new Error('db down'))
    const res = mockRes()
    const next = vi.fn() as NextFunction

    await requireMember(mockReq(), res, next)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao verificar acesso.' })
    expect(next).not.toHaveBeenCalled()
  })
})
