import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Request, Response } from 'express'

// Mock do Prisma: controlamos o upsert/findUnique sem banco real.
const upsert = vi.fn()
const findUnique = vi.fn()
// O login também emite o refresh token (a tabela de renovação é testada de verdade em refresh.test.ts).
vi.mock('../../lib/prisma.js', () => ({
  default: {
    user: { upsert, findUnique },
    sessaoDeRenovacao: { create: vi.fn(), deleteMany: vi.fn() },
  },
}))

const { login, loginGoogle, loginComCodigoDoMeuEcoo, getMe } = await import('../authController.js')

// Requisição de login como o Express a entrega: corpo e o endereço da conexão (de onde sai o IP do cliente).
const reqDe = (body: unknown, extras: Record<string, unknown> = {}) =>
  ({ body, headers: {}, socket: { remoteAddress: '203.0.113.9' }, ...extras }) as unknown as Request

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
    await login(reqDe({}), res)
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
    await login(reqDe({ email: 'Maria@b.com', password: 'x' }), res)

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

  it('mostra "conta desativada" (403) quando o provedor diz CONTA_DESATIVADA, em vez de erro de configuração', async () => {
    global.fetch = mockFetchOnce(false, 403, { error: 'texto do provedor', code: 'CONTA_DESATIVADA' }) as unknown as typeof fetch
    const res = mockRes()
    await login(reqDe({ email: 'a@b.com', password: 'x' }), res)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith({ error: 'Conta desativada. Fale com o suporte.' })
    expect(upsert).not.toHaveBeenCalled()
  })

  it('pede a confirmação do e-mail (403) quando o provedor diz CONTA_NAO_VERIFICADA', async () => {
    global.fetch = mockFetchOnce(false, 403, { code: 'CONTA_NAO_VERIFICADA' }) as unknown as typeof fetch
    const res = mockRes()
    await login(reqDe({ email: 'a@b.com', password: 'x' }), res)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith({ error: expect.stringMatching(/Confirme seu e-mail/) })
  })

  it('403 SERVICO_NAO_AUTORIZADO ou com code desconhecido segue como erro de configuração (502)', async () => {
    for (const corpo of [{ code: 'SERVICO_NAO_AUTORIZADO' }, { code: 'OUTRA_COISA' }]) {
      global.fetch = mockFetchOnce(false, 403, corpo) as unknown as typeof fetch
      const res = mockRes()
      await login(reqDe({ email: 'a@b.com', password: 'x' }), res)
      expect(res.status).toHaveBeenCalledWith(502)
      expect(res.json).toHaveBeenCalledWith({ error: 'Erro de configuração do serviço. Contate o suporte.' })
    }
  })

  it('mostra "muitas tentativas" no 429 do provedor e a mensagem de `error` no 401', async () => {
    global.fetch = mockFetchOnce(false, 429, { error: 'Muitas tentativas.' }) as unknown as typeof fetch
    const limite = mockRes()
    await login(reqDe({ email: 'a@b.com', password: 'x' }), limite)
    expect(limite.status).toHaveBeenCalledWith(429)
    expect(limite.json).toHaveBeenCalledWith({ error: 'Muitas tentativas. Aguarde alguns minutos.' })

    global.fetch = mockFetchOnce(false, 401, { error: 'Credenciais inválidas.' }) as unknown as typeof fetch
    const recusada = mockRes()
    await login(reqDe({ email: 'a@b.com', password: 'x' }), recusada)
    expect(recusada.status).toHaveBeenCalledWith(401)
    expect(recusada.json).toHaveBeenCalledWith({ error: 'Credenciais inválidas.' })
  })

  it('mapeia 403 do VS (token de serviço inválido, sem code) para 502 sem vazar a causa', async () => {
    global.fetch = mockFetchOnce(false, 403, { detail: 'service token invalid' }) as unknown as typeof fetch
    const res = mockRes()
    await login(reqDe({ email: 'a@b.com', password: 'x' }), res)

    expect(res.status).toHaveBeenCalledWith(502)
    expect(res.json).toHaveBeenCalledWith({
      error: 'Erro de configuração do serviço. Contate o suporte.',
    })
    expect(upsert).not.toHaveBeenCalled()
  })

  it('repassa 401 (credenciais inválidas) com a mensagem do VS', async () => {
    global.fetch = mockFetchOnce(false, 401, { detail: 'Credenciais inválidas' }) as unknown as typeof fetch
    const res = mockRes()
    await login(reqDe({ email: 'a@b.com', password: 'x' }), res)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(upsert).not.toHaveBeenCalled()
  })

  it('responde 502 quando o VS está indisponível (fetch falha)', async () => {
    global.fetch = vi.fn().mockRejectedValueOnce(new Error('network')) as unknown as typeof fetch
    const res = mockRes()
    await login(reqDe({ email: 'a@b.com', password: 'x' }), res)

    expect(res.status).toHaveBeenCalledWith(502)
    expect(upsert).not.toHaveBeenCalled()
  })
})

describe('loginGoogle (POST /api/auth/google)', () => {
  it('conta desativada no provedor: 403 com a mensagem da conta, e 429 vira "muitas tentativas"', async () => {
    global.fetch = mockFetchOnce(false, 403, { code: 'CONTA_DESATIVADA' }) as unknown as typeof fetch
    const desativada = mockRes()
    await loginGoogle(reqDe({ idToken: 'tok' }), desativada)
    expect(desativada.status).toHaveBeenCalledWith(403)
    expect(desativada.json).toHaveBeenCalledWith({ error: 'Conta desativada. Fale com o suporte.' })

    global.fetch = mockFetchOnce(false, 429, { error: 'x' }) as unknown as typeof fetch
    const limite = mockRes()
    await loginGoogle(reqDe({ idToken: 'tok' }), limite)
    expect(limite.status).toHaveBeenCalledWith(429)
  })

  it('valida entrada: 400 quando falta idToken', async () => {
    const res = mockRes()
    await loginGoogle(reqDe({}), res)
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
    await loginGoogle(reqDe({ idToken: 'firebase-token' }), res)

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
    await loginGoogle(reqDe({ idToken: 'x' }), res)

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

/**
 * IP do cliente no limite do Meu Ecoo: o login por senha e o Google mandam `X-Client-IP` com o IP que
 * `lib/clientIp.ts` calcula (o X-Real-IP da borda do Railway; fora dele, o endereço da conexão), e só
 * se for um IP válido. O refresh token sai ao lado do JWT nos dois logins.
 */
describe('X-Client-IP e refresh token nos logins', () => {
  const resposta = (body: unknown) =>
    vi.fn().mockImplementation(async () => ({ ok: true, status: 200, json: async () => body }))
  const CONTA = { user: { email: 'maria@b.com', name: 'Maria', is_member_active: true } }
  const USUARIO = { id: 'u1', email: 'maria@b.com', nome: 'Maria', isMember: true, memberUntil: null }

  beforeEach(() => {
    process.env.PARTNER_AUTH_SERVICE_TOKEN = 'token-de-servico'
    delete process.env.RAILWAY_ENVIRONMENT_ID
    global.fetch = resposta(CONTA) as unknown as typeof fetch
    upsert.mockResolvedValue(USUARIO)
  })

  const fluxos = [
    ['senha', (req: Request, res: Response) => login(req, res), { email: 'maria@b.com', password: 'x' }],
    ['Google', (req: Request, res: Response) => loginGoogle(req, res), { idToken: 'tok' }],
  ] as const
  const cabecalhos = () => (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].headers

  it.each(fluxos)('%s: manda o endereço da conexão fora do Railway', async (_nome, entrar, corpo) => {
    await entrar(reqDe(corpo), mockRes())

    expect(cabecalhos()['X-Client-IP']).toBe('203.0.113.9')
  })

  it.each(fluxos)('%s: no Railway manda o X-Real-IP da borda', async (_nome, entrar, corpo) => {
    process.env.RAILWAY_ENVIRONMENT_ID = 'ambiente-de-teste'
    try {
      await entrar(reqDe(corpo, { headers: { 'x-real-ip': '198.51.100.7' }, socket: { remoteAddress: '46.151.194.129' } }), mockRes())
    } finally {
      delete process.env.RAILWAY_ENVIRONMENT_ID
    }

    expect(cabecalhos()['X-Client-IP']).toBe('198.51.100.7')
  })

  it.each(fluxos)('%s: sem IP válido omite o cabeçalho e o login segue', async (_nome, entrar, corpo) => {
    const res = mockRes()
    await entrar(reqDe(corpo, { socket: { remoteAddress: 'não-é-ip' } }), res)

    expect(cabecalhos()).not.toHaveProperty('X-Client-IP')
    expect(upsert).toHaveBeenCalled()
  })

  it('o Google leva o token de serviço (o Meu Ecoo só aceita o X-Client-IP junto dele) e segue sem ele', async () => {
    await loginGoogle(reqDe({ idToken: 'tok' }), mockRes())
    expect(cabecalhos()['X-Service-Token']).toBe('token-de-servico')

    global.fetch = resposta(CONTA) as unknown as typeof fetch
    delete process.env.PARTNER_AUTH_SERVICE_TOKEN
    const res = mockRes()
    await loginGoogle(reqDe({ idToken: 'tok' }), res)
    expect(cabecalhos()).not.toHaveProperty('X-Service-Token')
    expect((res.json as ReturnType<typeof vi.fn>).mock.calls[0][0].token).toBeTypeOf('string')
  })

  it.each(fluxos)('%s: devolve o refresh token ao lado do token de acesso, sem mudar o resto da resposta', async (_nome, entrar, corpo) => {
    const res = mockRes()
    await entrar(reqDe(corpo), res)

    expect(res.json).toHaveBeenCalledWith({
      token: expect.any(String),
      refreshToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      user: { id: 'u1', email: 'maria@b.com', nome: 'Maria', isMember: true, memberUntil: null },
    })
  })
})

/**
 * Login único (B7 do Meu Ecoo): o "Abrir" do Meu Ecoo leva um código de uso único para este app na URL
 * (`?meuecoo_codigo=`), o front o manda para cá e o servidor o troca por sessão no Meu Ecoo, com o token de
 * serviço do app. Daí em diante é o caminho do login de parceiro: membership, espelho do usuário, JWT e refresh token.
 */
describe('loginComCodigoDoMeuEcoo (POST /api/auth/meu-ecoo)', () => {
  const USUARIO = { id: 'u1', email: 'maria@b.com', nome: 'Maria', isMember: true, memberUntil: null }
  const SESSAO = {
    data: {
      tokens: { access: 'vs-access' },
      user: { email: 'Maria@B.com', name: 'Maria', is_member_active: true, member_until: '2030-01-01' },
    },
  }
  const chamada = () =>
    (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [URL, { method: string; body: string; headers: Record<string, string> }]

  beforeEach(() => {
    process.env.PARTNER_AUTH_SERVICE_TOKEN = 'token-de-servico'
    delete process.env.RAILWAY_ENVIRONMENT_ID
    upsert.mockResolvedValue(USUARIO)
  })

  it('valida entrada: 400 sem código, vazio, que não é texto ou grande demais, sem chamar o Meu Ecoo', async () => {
    global.fetch = vi.fn() as unknown as typeof fetch
    for (const corpo of [undefined, {}, { codigo: '   ' }, { codigo: 42 }, { codigo: 'x'.repeat(201) }]) {
      const res = mockRes()
      await loginComCodigoDoMeuEcoo(reqDe(corpo), res)
      expect(res.status).toHaveBeenCalledWith(400)
    }
    expect(global.fetch).not.toHaveBeenCalled()
    expect(upsert).not.toHaveBeenCalled()
  })

  it('troca o código no Meu Ecoo com o token de serviço e o IP, e abre a sessão do e-mail que ele devolve', async () => {
    global.fetch = mockFetchOnce(true, 200, SESSAO) as unknown as typeof fetch
    const res = mockRes()
    await loginComCodigoDoMeuEcoo(reqDe({ codigo: '  c0d1g0  ' }), res)

    const [url, init] = chamada()
    expect(String(url)).toBe('https://vs.example/api/partner/auth/trocar-codigo')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ codigo: 'c0d1g0' })
    expect(init.headers['X-Service-Token']).toBe('token-de-servico')
    expect(init.headers['X-Client-IP']).toBe('203.0.113.9')

    // O e-mail vem do Meu Ecoo (em minúsculas): o app não recebe e-mail nenhum no corpo.
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { email: 'maria@b.com' } }))
    expect(res.json).toHaveBeenCalledWith({
      token: expect.any(String),
      refreshToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      user: { id: 'u1', email: 'maria@b.com', nome: 'Maria', isMember: true, memberUntil: null },
    })
  })

  it('código inválido ou expirado: repassa o 401 do Meu Ecoo e não abre sessão', async () => {
    global.fetch = mockFetchOnce(false, 401, { error: 'Código inválido ou expirado.' }) as unknown as typeof fetch
    const res = mockRes()
    await loginComCodigoDoMeuEcoo(reqDe({ codigo: 'velho' }), res)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: 'Código inválido ou expirado.' })
    expect(upsert).not.toHaveBeenCalled()
  })

  it('sem mensagem do Meu Ecoo, o 401 leva a frase padrão do código', async () => {
    global.fetch = mockFetchOnce(false, 401, {}) as unknown as typeof fetch
    const res = mockRes()
    await loginComCodigoDoMeuEcoo(reqDe({ codigo: 'velho' }), res)

    expect(res.json).toHaveBeenCalledWith({ error: 'Código inválido ou expirado.' })
  })

  it('conta desativada ou sem e-mail confirmado: 403 com a mensagem da conta', async () => {
    for (const [code, mensagem] of [
      ['CONTA_DESATIVADA', 'Conta desativada. Fale com o suporte.'],
      ['CONTA_NAO_VERIFICADA', 'Confirme seu e-mail para entrar. Use o link que enviamos quando você criou a conta.'],
    ]) {
      global.fetch = mockFetchOnce(false, 403, { error: 'texto do provedor', code }) as unknown as typeof fetch
      const res = mockRes()
      await loginComCodigoDoMeuEcoo(reqDe({ codigo: 'c0d1g0' }), res)
      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith({ error: mensagem })
    }
    expect(upsert).not.toHaveBeenCalled()
  })

  it('403 sem code (token de serviço recusado) vira erro de configuração (502), sem vazar a causa', async () => {
    global.fetch = mockFetchOnce(false, 403, { error: 'Serviço não autorizado.' }) as unknown as typeof fetch
    const res = mockRes()
    await loginComCodigoDoMeuEcoo(reqDe({ codigo: 'c0d1g0' }), res)

    expect(res.status).toHaveBeenCalledWith(502)
    expect(res.json).toHaveBeenCalledWith({ error: 'Erro de configuração do serviço. Contate o suporte.' })
    expect(upsert).not.toHaveBeenCalled()
  })

  it('429 do Meu Ecoo vira "muitas tentativas"', async () => {
    global.fetch = mockFetchOnce(false, 429, { error: 'Muitas tentativas.' }) as unknown as typeof fetch
    const res = mockRes()
    await loginComCodigoDoMeuEcoo(reqDe({ codigo: 'c0d1g0' }), res)

    expect(res.status).toHaveBeenCalledWith(429)
    expect(res.json).toHaveBeenCalledWith({ error: 'Muitas tentativas. Aguarde alguns minutos.' })
  })

  it('Meu Ecoo fora do ar (fetch falha): 502', async () => {
    global.fetch = vi.fn().mockRejectedValueOnce(new Error('network')) as unknown as typeof fetch
    const res = mockRes()
    await loginComCodigoDoMeuEcoo(reqDe({ codigo: 'c0d1g0' }), res)

    expect(res.status).toHaveBeenCalledWith(502)
    expect(upsert).not.toHaveBeenCalled()
  })

  it('resposta sem e-mail: 502 e nada é gravado', async () => {
    global.fetch = mockFetchOnce(true, 200, { data: { user: { name: 'Sem Email' } } }) as unknown as typeof fetch
    const res = mockRes()
    await loginComCodigoDoMeuEcoo(reqDe({ codigo: 'c0d1g0' }), res)

    expect(res.status).toHaveBeenCalledWith(502)
    expect(upsert).not.toHaveBeenCalled()
  })
})

/**
 * Id estável da conta no Meu Ecoo (`data.user.id`): todo login que passa pelo Meu Ecoo o grava na conta,
 * para os avisos de exclusão e troca de e-mail (POST /api/meuecoo/eventos) acharem a conta por ele.
 */
describe('id do Meu Ecoo gravado nos logins', () => {
  const USUARIO = { id: 'u1', email: 'maria@b.com', nome: 'Maria', isMember: true, memberUntil: null }
  const CONTA = { data: { user: { id: 'me-maria', email: 'Maria@b.com', name: 'Maria', is_member_active: true } } }

  beforeEach(() => {
    process.env.PARTNER_AUTH_SERVICE_TOKEN = 'token-de-servico'
    upsert.mockResolvedValue(USUARIO)
  })

  const fluxos = [
    ['senha', (req: Request, res: Response) => login(req, res), { email: 'maria@b.com', password: 'x' }],
    ['código do "Abrir"', (req: Request, res: Response) => loginComCodigoDoMeuEcoo(req, res), { codigo: 'c0d1g0' }],
    ['Google', (req: Request, res: Response) => loginGoogle(req, res), { idToken: 'tok' }],
  ] as const

  it.each(fluxos)('%s: grava o id na conta nova e na que já existe', async (_nome, entrar, corpo) => {
    global.fetch = mockFetchOnce(true, 200, CONTA) as unknown as typeof fetch
    await entrar(reqDe(corpo), mockRes())

    expect(upsert).toHaveBeenCalledWith({
      where: { email: 'maria@b.com' },
      update: expect.objectContaining({ meuEcooId: 'me-maria' }),
      create: expect.objectContaining({ email: 'maria@b.com', meuEcooId: 'me-maria' }),
    })
  })

  it.each(fluxos)('%s: id que já é de outra conta (troca de e-mail cujo aviso ainda não chegou) não é gravado, e o login segue', async (_nome, entrar, corpo) => {
    global.fetch = mockFetchOnce(true, 200, CONTA) as unknown as typeof fetch
    findUnique.mockResolvedValueOnce({ email: 'maria.antiga@b.com' })
    const res = mockRes()
    await entrar(reqDe(corpo), res)

    const { update, create } = upsert.mock.calls[0][0]
    expect(update).not.toHaveProperty('meuEcooId')
    expect(create).not.toHaveProperty('meuEcooId')
    expect((res.json as ReturnType<typeof vi.fn>).mock.calls[0][0].token).toBeTypeOf('string')
  })

  it.each(fluxos)('%s: resposta sem id não apaga o id guardado', async (_nome, entrar, corpo) => {
    global.fetch = mockFetchOnce(true, 200, { data: { user: { email: 'maria@b.com', name: 'Maria' } } }) as unknown as typeof fetch
    await entrar(reqDe(corpo), mockRes())

    const { update, create } = upsert.mock.calls[0][0]
    expect(update).not.toHaveProperty('meuEcooId')
    expect(create).not.toHaveProperty('meuEcooId')
  })
})
