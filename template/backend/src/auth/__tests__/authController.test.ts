import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Request, Response } from 'express'

// Mock do Prisma: controlamos o upsert/findUnique sem banco real.
const upsert = vi.fn()
const findUnique = vi.fn()
vi.mock('../../lib/prisma.js', () => ({
  default: { user: { upsert, findUnique } },
}))

const { login, loginGoogle, getMe } = await import('../authController.js')

function mockRes() {
  const res = {} as Response
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  return res
}

// fetch é a ponte com o VS — mockamos cada cenário (ok, 403, indisponível).
function mockFetchOnce(ok: boolean, status: number, body: unknown) {
  return vi.fn().mockResolvedValueOnce({
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
  })
}

beforeEach(() => {
  process.env.JWT_SECRET = 'segredo-de-teste'
  process.env.PARTNER_AUTH_URL = 'https://vs.example/api/partner/auth/login/'
  process.env.PARTNER_AUTH_GOOGLE_URL = 'https://vs.example/api/auth/firebase/google/'
  // Sem URL de verificação → verifyMembership usa o fallback do login (sem fetch extra).
  delete process.env.PARTNER_VERIFY_MEMBERSHIP_URL
})

describe('login (POST /api/auth/login)', () => {
  it('valida entrada: 400 quando faltam email/senha', async () => {
    const res = mockRes()
    await login({ body: {} } as Request, res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(upsert).not.toHaveBeenCalled()
  })

  it('autentica via VS, espelha membership e emite JWT próprio', async () => {
    global.fetch = mockFetchOnce(true, 200, {
      user: { name: 'Maria', is_member_active: true, member_until: '2030-01-01' },
      tokens: { access: 'vs-access' },
    }) as unknown as typeof fetch

    upsert.mockResolvedValueOnce({
      id: 'u1',
      email: 'maria@b.com',
      nome: 'Maria',
      isMember: true,
      memberUntil: new Date('2030-01-01'),
    })

    const res = mockRes()
    await login({ body: { email: 'Maria@b.com', password: 'x' } } as Request, res)

    // Email normalizado para minúsculas no upsert.
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'maria@b.com' } }),
    )
    const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(payload.token).toBeTypeOf('string')
    expect(payload.user).toMatchObject({ email: 'maria@b.com', isMember: true })
    // serializeUser não expõe campos sensíveis (ex.: accessToken do VS).
    expect(payload.user).not.toHaveProperty('accessToken')
  })

  it('mapeia 403 do VS (token de serviço inválido) para 502 sem vazar a causa', async () => {
    global.fetch = mockFetchOnce(false, 403, { detail: 'service token invalid' }) as unknown as typeof fetch
    const res = mockRes()
    await login({ body: { email: 'a@b.com', password: 'x' } } as Request, res)

    expect(res.status).toHaveBeenCalledWith(502)
    expect(res.json).toHaveBeenCalledWith({
      error: 'Erro de configuração do serviço. Contate o suporte.',
    })
    expect(upsert).not.toHaveBeenCalled()
  })

  it('repassa 401 (credenciais inválidas) com a mensagem do VS', async () => {
    global.fetch = mockFetchOnce(false, 401, { detail: 'Credenciais inválidas' }) as unknown as typeof fetch
    const res = mockRes()
    await login({ body: { email: 'a@b.com', password: 'x' } } as Request, res)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(upsert).not.toHaveBeenCalled()
  })

  it('responde 502 quando o VS está indisponível (fetch falha)', async () => {
    global.fetch = vi.fn().mockRejectedValueOnce(new Error('network')) as unknown as typeof fetch
    const res = mockRes()
    await login({ body: { email: 'a@b.com', password: 'x' } } as Request, res)

    expect(res.status).toHaveBeenCalledWith(502)
    expect(upsert).not.toHaveBeenCalled()
  })
})

describe('loginGoogle (POST /api/auth/google)', () => {
  it('valida entrada: 400 quando falta idToken', async () => {
    const res = mockRes()
    await loginGoogle({ body: {} } as Request, res)
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('autentica via VS com o id_token e emite JWT próprio', async () => {
    global.fetch = mockFetchOnce(true, 200, {
      user: { email: 'Joao@b.com', name: 'João', is_member_active: false },
    }) as unknown as typeof fetch

    upsert.mockResolvedValueOnce({
      id: 'u2',
      email: 'joao@b.com',
      nome: 'João',
      isMember: false,
      memberUntil: null,
    })

    const res = mockRes()
    await loginGoogle({ body: { idToken: 'firebase-token' } } as Request, res)

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'joao@b.com' } }),
    )
    const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(payload.token).toBeTypeOf('string')
    expect(payload.user).toMatchObject({ email: 'joao@b.com', isMember: false })
  })

  it('responde 502 quando a resposta do VS não traz email', async () => {
    global.fetch = mockFetchOnce(true, 200, { user: { name: 'Sem Email' } }) as unknown as typeof fetch
    const res = mockRes()
    await loginGoogle({ body: { idToken: 'x' } } as Request, res)

    expect(res.status).toHaveBeenCalledWith(502)
    expect(upsert).not.toHaveBeenCalled()
  })
})

describe('getMe (GET /api/auth/me)', () => {
  it('retorna o usuário serializado da sessão atual', async () => {
    findUnique.mockResolvedValueOnce({
      id: 'u1',
      email: 'a@b.com',
      nome: 'Ana',
      isMember: true,
      memberUntil: null,
    })
    const res = mockRes()
    await getMe({ user: { userId: 'u1', email: 'a@b.com' } } as Request, res)

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u1', email: 'a@b.com', isMember: true }),
    )
  })

  it('responde 404 quando o usuário do token não existe mais', async () => {
    findUnique.mockResolvedValueOnce(null)
    const res = mockRes()
    await getMe({ user: { userId: 'sumiu', email: 'x@b.com' } } as Request, res)

    expect(res.status).toHaveBeenCalledWith(404)
  })
})
