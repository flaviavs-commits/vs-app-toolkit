import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHash } from 'node:crypto'
import jwt from 'jsonwebtoken'
import type { Request, Response } from 'express'

/**
 * Sessão curta com renovação rotativa: o JWT dura 30 min e o refresh token (opaco, só o hash vai
 * ao banco) troca de valor a cada renovação. Token já usado que reaparece revoga a família. Antes
 * de consumir o refresh, o app reconsulta o Meu Ecoo (conta desativada, assinatura). O banco é uma
 * tabela falsa em memória com a mesma semântica dos filtros que o código usa, e o Meu Ecoo é o
 * `fetch` simulado; o resto (Express à parte) é o código de verdade.
 */

const banco = vi.hoisted(() => {
  type Linha = Record<string, any>
  const linhas: Linha[] = []
  const usuarios = new Map<string, { id: string; email: string }>()

  const bate = (linha: Linha, where: Record<string, any>) =>
    Object.entries(where).every(([campo, valor]) =>
      valor !== null && typeof valor === 'object' && !(valor instanceof Date)
        ? linha[campo] < valor.lt
        : linha[campo] === valor,
    )

  const sessaoDeRenovacao = {
    create: vi.fn(async ({ data }: { data: Linha }) => {
      const linha = { id: `s${linhas.length + 1}`, usadoEm: null, revogadoEm: null, criadoEm: new Date(), ...data }
      linhas.push(linha)
      return linha
    }),
    findUnique: vi.fn(async ({ where }: { where: Record<string, any> }) => {
      const linha = linhas.find((l) => bate(l, where))
      return linha ? { ...linha, user: { email: usuarios.get(linha.userId)?.email } } : null
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, any>; data: Linha }) => {
      const alvo = linhas.filter((l) => bate(l, where))
      alvo.forEach((l) => Object.assign(l, data))
      return { count: alvo.length }
    }),
    deleteMany: vi.fn(async ({ where }: { where: Record<string, any> }) => {
      const alvo = linhas.filter((l) => bate(l, where))
      alvo.forEach((l) => linhas.splice(linhas.indexOf(l), 1))
      return { count: alvo.length }
    }),
  }

  const prisma: Record<string, any> = {
    user: {
      upsert: vi.fn(async ({ where, create }: { where: { email: string }; create: Linha }) => {
        const existente = [...usuarios.values()].find((u) => u.email === where.email)
        const usuario = existente ?? { id: `u${usuarios.size + 1}`, ...create }
        usuarios.set(usuario.id, usuario)
        return { nome: 'Ana', isMember: true, memberUntil: null, ...usuario }
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Linha }) => ({
        ...usuarios.get(where.id)!,
        ...data,
      })),
    },
    sessaoDeRenovacao,
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
  }
  return { linhas, usuarios, prisma, sessaoDeRenovacao }
})

vi.mock('../../lib/prisma.js', () => ({ default: banco.prisma }))

import { emitirRefresh } from '../refreshTokens.js'
import { login, logout, refresh } from '../authController.js'

function fakeRes() {
  const res = {} as Response & { statusCode?: number; body?: unknown }
  res.status = vi.fn().mockImplementation((code: number) => {
    res.statusCode = code
    return res
  })
  res.json = vi.fn().mockImplementation((payload: unknown) => {
    res.body = payload
    return res
  })
  res.end = vi.fn().mockImplementation(() => res)
  return res
}

const hash = (valor: string) => createHash('sha256').update(valor).digest('hex')
const DIA = 24 * 60 * 60 * 1000

// Mesmo corpo do login de parceiro e da renovação: `data.user` com a assinatura.
const contaDoMeuEcoo = (extra: Record<string, unknown> = {}) => ({
  data: { user: { email: 'Ana@Exemplo.com', name: 'Ana', is_member_active: true, member_until: null, ...extra } },
})

const fetchMock = vi.fn()
// Uma Response nova a cada chamada: o corpo de uma só pode ser lido uma vez.
const responder = (status: number, corpo: unknown = {}) =>
  fetchMock.mockImplementation(async () => new globalThis.Response(JSON.stringify(corpo), { status }))

type Sessao = { token: string; refreshToken: string; user: Record<string, unknown> }

/** Abre uma sessão pelo caminho real de login (e-mail e senha). */
async function entrar(): Promise<Sessao> {
  responder(200, contaDoMeuEcoo())
  const res = fakeRes()
  await login(
    { body: { email: 'Ana@Exemplo.com', password: 'senha-de-teste' }, headers: {}, socket: { remoteAddress: '203.0.113.9' } } as unknown as Request,
    res,
  )
  return res.body as Sessao
}

async function renovar(refreshToken: unknown) {
  const res = fakeRes()
  await refresh({ body: { refreshToken } } as Request, res)
  return res
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-10T12:00:00Z'))
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubEnv('PARTNER_AUTH_URL', 'https://meuecoo.exemplo/api/partner/auth/login')
  vi.stubEnv('PARTNER_AUTH_SERVICE_TOKEN', 'token-de-servico')
  vi.stubEnv('PARTNER_VERIFY_MEMBERSHIP_URL', '')
  vi.stubEnv('JWT_SECRET', 'segredo-de-teste')
  banco.linhas.length = 0
  banco.usuarios.clear()
  fetchMock.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('emissão do par de tokens no login', () => {
  it('o JWT dura 30 min por padrão e o refresh é opaco, de 32 bytes em base64url', async () => {
    const { token, refreshToken } = await entrar()

    const { iat, exp } = jwt.decode(token) as { iat: number; exp: number }
    expect(exp - iat).toBe(30 * 60)
    expect(refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('JWT_EXPIRES_IN continua mandando na duração do JWT', async () => {
    vi.stubEnv('JWT_EXPIRES_IN', '5m')
    const { token } = await entrar()

    const { iat, exp } = jwt.decode(token) as { iat: number; exp: number }
    expect(exp - iat).toBe(5 * 60)
  })

  it('só o hash vai ao banco: 7 dias por token, família aberta agora', async () => {
    const { refreshToken } = await entrar()

    expect(banco.linhas).toHaveLength(1)
    const [linha] = banco.linhas
    expect(linha.tokenHash).toBe(hash(refreshToken))
    expect(JSON.stringify(banco.linhas)).not.toContain(refreshToken)
    expect(linha.expiraEm).toEqual(new Date(Date.now() + 7 * DIA))
    expect(linha.familiaIniciadaEm).toEqual(new Date())
    expect(linha.usadoEm).toBeNull()
    expect(linha.revogadoEm).toBeNull()
  })

  it('REFRESH_TOKEN_TTL_DAYS muda a validade de cada token', async () => {
    vi.stubEnv('REFRESH_TOKEN_TTL_DAYS', '3')
    await entrar()

    expect(banco.linhas[0].expiraEm).toEqual(new Date(Date.now() + 3 * DIA))
  })

  it('apaga as linhas vencidas da mesma pessoa, e só dela', async () => {
    await entrar()
    const [primeira] = banco.linhas
    const vencida = { ...primeira, id: 'velha', tokenHash: 'x', expiraEm: new Date(Date.now() - 1000) }
    const deOutraPessoa = { ...vencida, id: 'alheia', userId: 'outra' }
    banco.linhas.push(vencida, deOutraPessoa)

    await entrar()

    expect(banco.linhas.map((l) => l.id)).toContain('alheia')
    expect(banco.linhas.map((l) => l.id)).not.toContain('velha')
  })
})

describe('POST /api/auth/refresh', () => {
  it('reconsulta o Meu Ecoo com o token do app, consome o refresh e emite o par novo na mesma família', async () => {
    const { refreshToken, user } = await entrar()
    responder(200, contaDoMeuEcoo())

    const res = await renovar(refreshToken)

    const [url, init] = fetchMock.mock.calls.at(-1)!
    expect(String(url)).toBe('https://meuecoo.exemplo/api/partner/auth/renovar')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', 'X-Service-Token': 'token-de-servico' })
    expect(JSON.parse(init.body)).toEqual({ email: 'ana@exemplo.com' })
    expect(init.signal).toBeInstanceOf(AbortSignal)

    expect(res.statusCode).toBeUndefined()
    const novo = res.body as Sessao
    expect(novo.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(novo.refreshToken).not.toBe(refreshToken)
    expect(jwt.verify(novo.token, 'segredo-de-teste')).toMatchObject({ userId: user.id, email: 'ana@exemplo.com' })
    expect(novo.user).toEqual(user)

    const [antigo, atual] = banco.linhas
    expect(antigo.usadoEm).toEqual(new Date())
    expect(atual.familiaId).toBe(antigo.familiaId)
    expect(atual.familiaIniciadaEm).toEqual(antigo.familiaIniciadaEm)
    expect(atual.tokenHash).toBe(hash(novo.refreshToken))
  })

  it('o par novo também renova, e a cadeia fica numa família só', async () => {
    const primeiro = await entrar()
    responder(200, contaDoMeuEcoo())
    const segundo = (await renovar(primeiro.refreshToken)).body as Sessao
    const terceiro = await renovar(segundo.refreshToken)

    expect(terceiro.statusCode).toBeUndefined()
    expect(new Set(banco.linhas.map((l) => l.familiaId)).size).toBe(1)
    expect(banco.linhas).toHaveLength(3)
  })

  it('atualiza o espelho da assinatura e do nome; perder a assinatura não impede a renovação', async () => {
    const { refreshToken } = await entrar()
    responder(200, contaDoMeuEcoo({ name: 'Ana Maria', is_member_active: false, member_until: '2026-11-01T00:00:00Z' }))

    const res = await renovar(refreshToken)

    expect(res.statusCode).toBeUndefined()
    expect(banco.prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { nome: 'Ana Maria', isMember: false, memberUntil: new Date('2026-11-01T00:00:00Z') },
    })
    expect((res.body as Sessao).user).toMatchObject({ nome: 'Ana Maria', isMember: false })
  })

  it.each([
    ['ausente', undefined],
    ['que não é texto', 123],
    ['desconhecido', 'valor-que-nunca-foi-emitido'],
    ['vazio', ''],
  ])('refresh %s → 401 SESSAO_INVALIDA, sem chamar o Meu Ecoo', async (_caso, valor) => {
    const res = await renovar(valor)

    expect(res.statusCode).toBe(401)
    expect(res.body).toEqual({ error: 'Sessão inválida — faça login novamente', code: 'SESSAO_INVALIDA' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('corpo ausente → 401 SESSAO_INVALIDA', async () => {
    const res = fakeRes()
    await refresh({} as Request, res)

    expect(res.statusCode).toBe(401)
    expect(res.body).toMatchObject({ code: 'SESSAO_INVALIDA' })
  })

  it('token já usado depois da janela de 10 s → 401 e a família inteira é revogada', async () => {
    const { refreshToken } = await entrar()
    responder(200, contaDoMeuEcoo())
    const novo = (await renovar(refreshToken)).body as Sessao

    vi.setSystemTime(Date.now() + 11_000)
    const reuso = await renovar(refreshToken)

    expect(reuso.statusCode).toBe(401)
    expect(reuso.body).toEqual({ error: 'Sessão inválida — faça login novamente', code: 'SESSAO_INVALIDA' })
    expect(banco.linhas.every((l) => l.revogadoEm !== null)).toBe(true)
    // O par legítimo, que ficou com quem renovou, também caiu: quem roubou e quem usa não se distinguem.
    expect((await renovar(novo.refreshToken)).statusCode).toBe(401)
  })

  it('token usado há menos de 10 s (duas abas) → 409 RENOVACAO_EM_ANDAMENTO, sem revogar', async () => {
    const { refreshToken } = await entrar()
    responder(200, contaDoMeuEcoo())
    const novo = (await renovar(refreshToken)).body as Sessao

    vi.setSystemTime(Date.now() + 9_000)
    const outraAba = await renovar(refreshToken)

    expect(outraAba.statusCode).toBe(409)
    expect(outraAba.body).toEqual({ error: 'Renovação em andamento', code: 'RENOVACAO_EM_ANDAMENTO' })
    expect(banco.linhas.every((l) => l.revogadoEm === null)).toBe(true)
    expect((await renovar(novo.refreshToken)).statusCode).toBeUndefined()
  })

  it('token usado há menos de 10 s, mas de família já revogada (logout logo depois) → 401, não 409', async () => {
    const { refreshToken } = await entrar()
    responder(200, contaDoMeuEcoo())
    const novo = (await renovar(refreshToken)).body as Sessao
    await logout({ body: { refreshToken: novo.refreshToken } } as Request, fakeRes())

    const res = await renovar(refreshToken)

    expect(res.statusCode).toBe(401)
    expect(res.body).toMatchObject({ code: 'SESSAO_INVALIDA' })
  })

  it('duas renovações simultâneas com o mesmo token: uma renova, a outra recebe 409 e ninguém é revogado', async () => {
    const { refreshToken } = await entrar()
    responder(200, contaDoMeuEcoo())

    const [a, b] = await Promise.all([renovar(refreshToken), renovar(refreshToken)])

    expect([a.statusCode, b.statusCode].sort()).toEqual([409, undefined])
    expect(banco.linhas.every((l) => l.revogadoEm === null)).toBe(true)
    expect(banco.linhas).toHaveLength(2)
  })

  it('token revogado → 401 SESSAO_INVALIDA', async () => {
    const { refreshToken } = await entrar()
    banco.linhas[0].revogadoEm = new Date()

    const res = await renovar(refreshToken)

    expect(res.statusCode).toBe(401)
    expect(res.body).toMatchObject({ code: 'SESSAO_INVALIDA' })
    expect(fetchMock).toHaveBeenCalledTimes(1) // só o login
  })

  it('token vencido → 401 SESSAO_EXPIRADA, sem chamar o Meu Ecoo', async () => {
    const { refreshToken } = await entrar()
    vi.setSystemTime(Date.now() + 7 * DIA + 1000)
    fetchMock.mockClear()

    const res = await renovar(refreshToken)

    expect(res.statusCode).toBe(401)
    expect(res.body).toEqual({ error: 'Sessão expirada — faça login novamente', code: 'SESSAO_EXPIRADA' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('família com mais de 30 dias → 401 SESSAO_EXPIRADA, mesmo com o token ainda dentro dos 7 dias', async () => {
    const { refreshToken } = await entrar()
    banco.linhas[0].familiaIniciadaEm = new Date(Date.now() - 31 * DIA)
    banco.linhas[0].expiraEm = new Date(Date.now() + DIA)

    const res = await renovar(refreshToken)

    expect(res.statusCode).toBe(401)
    expect(res.body).toMatchObject({ code: 'SESSAO_EXPIRADA' })
  })

  it('a família de 29 dias ainda renova', async () => {
    const { refreshToken } = await entrar()
    banco.linhas[0].familiaIniciadaEm = new Date(Date.now() - 29 * DIA)
    responder(200, contaDoMeuEcoo())

    expect((await renovar(refreshToken)).statusCode).toBeUndefined()
  })
})

describe('o Meu Ecoo recusa ou some na renovação', () => {
  it.each([
    ['CONTA_DESATIVADA', 'Conta desativada. Fale com o suporte.'],
    ['CONTA_NAO_VERIFICADA', 'Confirme seu e-mail para entrar. Use o link que enviamos quando você criou a conta.'],
  ])('403 %s → 403 com a mensagem da conta (nunca o texto do provedor) e a família é revogada', async (code, mensagem) => {
    const { refreshToken } = await entrar()
    responder(403, { error: 'texto do provedor', code })

    const res = await renovar(refreshToken)

    expect(res.statusCode).toBe(403)
    expect(res.body).toEqual({ error: mensagem })
    expect(banco.linhas).toHaveLength(1)
    expect(banco.linhas[0].usadoEm).toBeNull()
    expect(banco.linhas[0].revogadoEm).not.toBeNull()
  })

  it('404 CONTA_NAO_ENCONTRADA → 401 SESSAO_INVALIDA e a família é revogada', async () => {
    const { refreshToken } = await entrar()
    responder(404, { error: 'Conta não encontrada.', code: 'CONTA_NAO_ENCONTRADA' })

    const res = await renovar(refreshToken)

    expect(res.statusCode).toBe(401)
    expect(res.body).toMatchObject({ code: 'SESSAO_INVALIDA' })
    expect(banco.linhas[0].revogadoEm).not.toBeNull()
  })

  it.each([
    [{ code: 'SERVICO_NAO_AUTORIZADO' }],
    [{ detail: 'Token de serviço inválido' }],
  ])('403 sem code de conta (%j) → 502 de configuração, sem consumir nem revogar', async (corpo) => {
    const { refreshToken } = await entrar()
    responder(403, corpo)

    const res = await renovar(refreshToken)

    expect(res.statusCode).toBe(502)
    expect(res.body).toEqual({ error: 'Erro de configuração do serviço. Contate o suporte.' })
    expect(banco.linhas[0].usadoEm).toBeNull()
    expect(banco.linhas[0].revogadoEm).toBeNull()
  })

  it.each([
    ['500', () => responder(500)],
    ['503', () => responder(503)],
    ['429', () => responder(429, { error: 'Muitas tentativas.' })],
    ['404 sem code (rota ainda não publicada)', () => responder(404, { detail: 'Not found' })],
    ['rede caída', () => fetchMock.mockRejectedValue(new TypeError('fetch failed'))],
    ['tempo esgotado', () => fetchMock.mockRejectedValue(new DOMException('timeout', 'TimeoutError'))],
  ])('%s → 503 RENOVACAO_INDISPONIVEL, sem consumir: o mesmo refresh renova quando o Meu Ecoo volta', async (_caso, falhar) => {
    const { refreshToken } = await entrar()
    falhar()

    const fora = await renovar(refreshToken)

    expect(fora.statusCode).toBe(503)
    expect(fora.body).toEqual({
      error: 'Não foi possível renovar a sessão agora. Tente novamente.',
      code: 'RENOVACAO_INDISPONIVEL',
    })
    expect(banco.linhas).toHaveLength(1)
    expect(banco.linhas[0].usadoEm).toBeNull()
    expect(banco.linhas[0].revogadoEm).toBeNull()

    responder(200, contaDoMeuEcoo())
    expect((await renovar(refreshToken)).statusCode).toBeUndefined()
  })

  it('200 sem email → 502, sem consumir', async () => {
    const { refreshToken } = await entrar()
    responder(200, { data: { user: {} } })

    const res = await renovar(refreshToken)

    expect(res.statusCode).toBe(502)
    expect(banco.linhas[0].usadoEm).toBeNull()
  })

  it('falha do banco ao gravar o par novo desfaz o consumo e responde 500 sem derrubar nada', async () => {
    const { refreshToken } = await entrar()
    responder(200, contaDoMeuEcoo())
    const original = banco.sessaoDeRenovacao.create.getMockImplementation()!
    banco.sessaoDeRenovacao.create.mockRejectedValueOnce(new Error('banco caiu'))
    // A tabela falsa não desfaz transações: o `$transaction` de verdade desfaz, e é isso que o código promete.
    banco.prisma.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) => {
      const antes = banco.linhas.map((l) => ({ ...l }))
      try {
        return await fn(banco.prisma)
      } catch (err) {
        banco.linhas.splice(0, banco.linhas.length, ...antes)
        throw err
      }
    })

    const res = await renovar(refreshToken)

    expect(res.statusCode).toBe(500)
    expect(banco.linhas[0].usadoEm).toBeNull()
    banco.sessaoDeRenovacao.create.mockImplementation(original)
    expect((await renovar(refreshToken)).statusCode).toBeUndefined()
  })
})

describe('POST /api/auth/logout', () => {
  async function sair(refreshToken: unknown) {
    const res = fakeRes()
    await logout({ body: { refreshToken } } as Request, res)
    return res
  }

  it('revoga a família e responde 204; o refresh deixa de renovar', async () => {
    const { refreshToken } = await entrar()
    responder(200, contaDoMeuEcoo())
    const novo = (await renovar(refreshToken)).body as Sessao

    const res = await sair(novo.refreshToken)

    expect(res.statusCode).toBe(204)
    expect(banco.linhas.every((l) => l.revogadoEm !== null)).toBe(true)
    expect((await renovar(novo.refreshToken)).statusCode).toBe(401)
  })

  it('só revoga a família do token, não as outras sessões da mesma pessoa', async () => {
    const aparelho1 = await entrar()
    const aparelho2 = await entrar()

    await sair(aparelho1.refreshToken)

    responder(200, contaDoMeuEcoo())
    expect((await renovar(aparelho2.refreshToken)).statusCode).toBeUndefined()
  })

  it.each([
    ['token desconhecido', 'nunca-foi-emitido'],
    ['token ausente', undefined],
    ['token que não é texto', { a: 1 }],
  ])('%s → 204 do mesmo jeito, sem revelar nada', async (_caso, valor) => {
    const res = await sair(valor)

    expect(res.statusCode).toBe(204)
    expect(res.body).toBeUndefined()
  })

  it('sem corpo → 204', async () => {
    const res = fakeRes()
    await logout({} as Request, res)

    expect(res.statusCode).toBe(204)
  })
})

describe('emitirRefresh', () => {
  it('na mesma família, o token novo herda familiaId e familiaIniciadaEm', async () => {
    const iniciada = new Date(Date.now() - 5 * DIA)
    await emitirRefresh(banco.prisma as never, 'u1', { familiaId: 'fam-1', familiaIniciadaEm: iniciada })

    expect(banco.linhas[0]).toMatchObject({ userId: 'u1', familiaId: 'fam-1', familiaIniciadaEm: iniciada })
  })
})
