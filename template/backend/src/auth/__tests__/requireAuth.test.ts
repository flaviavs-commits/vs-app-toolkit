import { describe, it, expect, beforeEach, vi } from 'vitest'
import jwt from 'jsonwebtoken'
import type { Request, Response, NextFunction } from 'express'
import { requireAuth } from '../requireAuth.js'

// Helpers para simular o ciclo req/res/next do Express sem subir o servidor.
function mockReq(headers: Record<string, string> = {}): Request {
  return { headers } as unknown as Request
}

function mockRes() {
  const res = {} as Response
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  return res
}

const SECRET = 'segredo-de-teste'

describe('requireAuth', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = SECRET
  })

  it('rejeita com 401 quando o header Authorization está ausente', () => {
    const req = mockReq()
    const res = mockRes()
    const next = vi.fn() as NextFunction

    requireAuth(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: 'Token não fornecido' })
    expect(next).not.toHaveBeenCalled()
  })

  it('rejeita com 401 quando o header não usa o esquema Bearer', () => {
    const req = mockReq({ authorization: 'Basic abc123' })
    const res = mockRes()
    const next = vi.fn() as NextFunction

    requireAuth(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('rejeita com 401 e mensagem genérica quando o token é inválido', () => {
    const req = mockReq({ authorization: 'Bearer token-falso' })
    const res = mockRes()
    const next = vi.fn() as NextFunction

    requireAuth(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: 'Token inválido' })
    expect(next).not.toHaveBeenCalled()
  })

  it('rejeita com 401 e mensagem de sessão expirada quando o token expirou', () => {
    const expired = jwt.sign({ userId: 'u1', email: 'a@b.com' }, SECRET, { expiresIn: -10 })
    const req = mockReq({ authorization: `Bearer ${expired}` })
    const res = mockRes()
    const next = vi.fn() as NextFunction

    requireAuth(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({
      error: 'Sessão expirada — faça login novamente',
    })
    expect(next).not.toHaveBeenCalled()
  })

  it('aceita um token válido, popula req.user e chama next()', () => {
    const token = jwt.sign({ userId: 'u1', email: 'a@b.com' }, SECRET)
    const req = mockReq({ authorization: `Bearer ${token}` })
    const res = mockRes()
    const next = vi.fn() as NextFunction

    requireAuth(req, res, next)

    expect(req.user).toMatchObject({ userId: 'u1', email: 'a@b.com' })
    expect(next).toHaveBeenCalledOnce()
    expect(res.status).not.toHaveBeenCalled()
  })
})
