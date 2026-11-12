import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Request, Response } from 'express'

/**
 * Avisos de conta do Meu Ecoo (POST /api/meuecoo/eventos; contrato em docs/EVENTOS-DE-CONTA.md do
 * MeuEcoo): exclusão da conta anonimiza a cópia daqui e troca de e-mail leva a conta antiga, com os
 * dados, para o e-mail novo. O banco é uma tabela falsa em memória que recusa e-mail e id do Meu Ecoo
 * repetidos, como o Postgres; o resto é o código de verdade.
 */

const banco = vi.hoisted(() => {
  type Usuario = {
    id: string
    email: string
    nome: string
    meuEcooId: string | null
    isMember: boolean
    memberUntil: Date | null
  }
  const usuarios: Usuario[] = []
  const sessoes: { id: string; userId: string }[] = []

  const bate = (u: Record<string, unknown>, where: Record<string, unknown>) =>
    Object.entries(where).every(([campo, valor]) => u[campo] === valor)
  const unico = (u: Usuario, data: Partial<Usuario>) => {
    for (const campo of ['email', 'meuEcooId'] as const) {
      if (data[campo] != null && usuarios.some((o) => o !== u && o[campo] === data[campo])) {
        throw Object.assign(new Error(`Unique constraint failed on the fields: (\`${campo}\`)`), { code: 'P2002' })
      }
    }
  }

  const prisma: Record<string, any> = {
    user: {
      findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const u = usuarios.find((x) => bate(x, where))
        return u ? { ...u } : null
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Usuario> }) => {
        const u = usuarios.find((x) => x.id === where.id)
        if (!u) throw new Error('Registro não encontrado')
        unico(u, data)
        Object.assign(u, data)
        return { ...u }
      }),
    },
    sessaoDeRenovacao: {
      deleteMany: vi.fn(async ({ where }: { where: { userId: string } }) => {
        const alvo = sessoes.filter((s) => s.userId === where.userId)
        alvo.forEach((s) => sessoes.splice(sessoes.indexOf(s), 1))
        return { count: alvo.length }
      }),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
  }
  return { usuarios, sessoes, prisma }
})

vi.mock('../../lib/prisma.js', () => ({ default: banco.prisma }))

import { receberEventoDoMeuEcoo } from '../eventosDoMeuEcoo.js'
import authRoutes from '../authRoutes.js'

const TOKEN = 'token-de-servico-do-app'

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
  return res
}

// Sem o segundo argumento, manda o token certo; com `undefined` explícito, manda sem o cabeçalho.
async function avisar(body: unknown, ...token: unknown[]) {
  const valor = token.length ? token[0] : TOKEN
  const headers = valor === undefined ? {} : { 'x-service-token': valor }
  const res = fakeRes()
  await receberEventoDoMeuEcoo({ headers, body } as unknown as Request, res)
  return res
}

const exclusao = (extra: Record<string, unknown> = {}) => ({
  id: 'evento-1',
  tipo: 'conta_excluida',
  contaId: 'me-ana',
  email: 'ana@exemplo.com',
  ocorridoEm: '2026-11-12T15:00:00.000Z',
  ...extra,
})

const troca = (extra: Record<string, unknown> = {}) => ({
  id: 'evento-2',
  tipo: 'email_trocado',
  contaId: 'me-ana',
  email: 'ana@exemplo.com',
  emailNovo: 'ana.nova@exemplo.com',
  ocorridoEm: '2026-11-12T15:00:00.000Z',
  ...extra,
})

function conta(id: string, email: string, extra: Record<string, unknown> = {}) {
  const u = { id, email, nome: 'Nome de ' + id, meuEcooId: null, isMember: true, memberUntil: new Date('2027-01-01'), ...extra }
  banco.usuarios.push(u as never)
  return u
}
const sessao = (id: string, userId: string) => banco.sessoes.push({ id, userId })
const linha = (id: string) => banco.usuarios.find((u) => u.id === id)!
const sessoesDe = (userId: string) => banco.sessoes.filter((s) => s.userId === userId).map((s) => s.id)

let logs: string[]

beforeEach(() => {
  banco.usuarios.length = 0
  banco.sessoes.length = 0
  vi.stubEnv('PARTNER_AUTH_SERVICE_TOKEN', TOKEN)
  logs = []
  const guardar = (...partes: unknown[]) => void logs.push(partes.map(String).join(' '))
  vi.spyOn(console, 'info').mockImplementation(guardar)
  vi.spyOn(console, 'log').mockImplementation(guardar)
  vi.spyOn(console, 'warn').mockImplementation(guardar)
  vi.spyOn(console, 'error').mockImplementation(guardar)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('rota', () => {
  it('o authRoutes registra POST /api/meuecoo/eventos', () => {
    const rotas = authRoutes.stack
      .filter((camada: any) => camada.route)
      .map((camada: any) => `${Object.keys(camada.route.methods).join(',')} ${camada.route.path}`)
    expect(rotas).toContain('post /api/meuecoo/eventos')
  })
})

describe('autenticação pelo X-Service-Token', () => {
  const RECUSA = { error: 'Serviço não autorizado.', code: 'SERVICO_NAO_AUTORIZADO' }

  it.each([
    ['ausente', undefined],
    ['vazio', ''],
    ['errado, do mesmo tamanho', 'x'.repeat(TOKEN.length)],
    ['errado, de outro tamanho', 'curto'],
    ['repetido no cabeçalho (lista)', [TOKEN, TOKEN]],
  ])('token %s → 403 SERVICO_NAO_AUTORIZADO, sem tocar no banco', async (_caso, token) => {
    conta('u1', 'ana@exemplo.com')

    const res = await avisar(exclusao(), token)

    expect(res.statusCode).toBe(403)
    expect(res.body).toEqual(RECUSA)
    expect(banco.prisma.user.findUnique).not.toHaveBeenCalled()
    expect(linha('u1').email).toBe('ana@exemplo.com')
  })

  it('sem PARTNER_AUTH_SERVICE_TOKEN configurado, recusa tudo, inclusive o token vazio', async () => {
    vi.stubEnv('PARTNER_AUTH_SERVICE_TOKEN', '')

    for (const token of [undefined, '', TOKEN]) {
      const res = await avisar(exclusao(), token)
      expect(res.statusCode).toBe(403)
      expect(res.body).toEqual(RECUSA)
    }
  })

  it('o token confere antes do corpo: corpo inválido com token errado é 403, não 400', async () => {
    const res = await avisar({}, 'errado')
    expect(res.statusCode).toBe(403)
  })
})

describe('validação do corpo (400)', () => {
  it.each([
    ['sem corpo', undefined],
    ['corpo que não é objeto', 'texto'],
    ['tipo desconhecido', exclusao({ tipo: 'conta_criada' })],
    ['sem tipo', exclusao({ tipo: undefined })],
    ['contaId ausente', exclusao({ contaId: undefined })],
    ['contaId vazio', exclusao({ contaId: '' })],
    ['contaId que não é texto', exclusao({ contaId: 42 })],
    ['contaId com mais de 64 caracteres', exclusao({ contaId: 'c'.repeat(65) })],
    ['email ausente', exclusao({ email: undefined })],
    ['email inválido', exclusao({ email: 'ana.exemplo.com' })],
    ['email com espaço', exclusao({ email: 'ana @exemplo.com' })],
    ['email com mais de 254 caracteres', exclusao({ email: `${'a'.repeat(243)}@exemplo.com` })],
    ['email_trocado sem emailNovo', troca({ emailNovo: undefined })],
    ['email_trocado com emailNovo inválido', troca({ emailNovo: 'nova@' })],
    ['email_trocado com emailNovo que não é texto', troca({ emailNovo: ['nova@exemplo.com'] })],
  ])('%s → 400, sem tocar no banco', async (_caso, corpo) => {
    conta('u1', 'ana@exemplo.com', { meuEcooId: 'me-ana' })

    const res = await avisar(corpo)

    expect(res.statusCode).toBe(400)
    expect(res.body).toMatchObject({ error: expect.any(String) })
    expect(banco.prisma.user.findUnique).not.toHaveBeenCalled()
    expect(linha('u1').email).toBe('ana@exemplo.com')
  })

  it('e-mail de 254 caracteres e contaId de 64 passam', async () => {
    const longo = `${'a'.repeat(242)}@exemplo.com`
    expect(longo).toHaveLength(254)

    const res = await avisar(exclusao({ email: longo, contaId: 'c'.repeat(64) }))

    expect(res.statusCode).toBeUndefined()
    expect(res.body).toEqual({ resultado: 'sem_conta' })
  })
})

describe('conta_excluida', () => {
  it('anonimiza a conta: e-mail impossível, nome vazio, sem id do Meu Ecoo; o resto fica', async () => {
    conta('u1', 'ana@exemplo.com', { meuEcooId: 'me-ana' })
    conta('u2', 'bia@exemplo.com', { meuEcooId: 'me-bia' })

    const res = await avisar(exclusao())

    expect(res.statusCode).toBeUndefined()
    expect(res.body).toEqual({ resultado: 'anonimizada' })
    expect(linha('u1')).toEqual({
      id: 'u1',
      email: 'excluida-u1@contas-excluidas.invalid',
      nome: '',
      meuEcooId: null,
      isMember: true,
      memberUntil: new Date('2027-01-01'),
    })
    expect(linha('u2')).toMatchObject({ email: 'bia@exemplo.com', nome: 'Nome de u2', meuEcooId: 'me-bia' })
  })

  it('apaga as sessões de renovação da conta, e só dela', async () => {
    conta('u1', 'ana@exemplo.com', { meuEcooId: 'me-ana' })
    conta('u2', 'bia@exemplo.com')
    sessao('s1', 'u1')
    sessao('s2', 'u1')
    sessao('s3', 'u2')

    await avisar(exclusao())

    expect(sessoesDe('u1')).toEqual([])
    expect(sessoesDe('u2')).toEqual(['s3'])
  })

  it('faz tudo numa transação', async () => {
    conta('u1', 'ana@exemplo.com', { meuEcooId: 'me-ana' })

    await avisar(exclusao())

    expect(banco.prisma.$transaction).toHaveBeenCalledTimes(1)
  })

  it('repetir o mesmo aviso não faz nada: sem_conta', async () => {
    conta('u1', 'ana@exemplo.com', { meuEcooId: 'me-ana' })
    sessao('s1', 'u1')
    await avisar(exclusao())
    const depois = { ...linha('u1') }

    const res = await avisar(exclusao())

    expect(res.body).toEqual({ resultado: 'sem_conta' })
    expect(linha('u1')).toEqual(depois)
  })

  it('sem o id guardado (a pessoa não voltou desde a mudança), acha a conta pelo e-mail, em minúsculas', async () => {
    conta('u1', 'ana@exemplo.com')

    const res = await avisar(exclusao({ email: 'Ana@Exemplo.COM' }))

    expect(res.body).toEqual({ resultado: 'anonimizada' })
    expect(linha('u1').email).toBe('excluida-u1@contas-excluidas.invalid')
  })
})

describe('achar a conta', () => {
  it('pelo id do Meu Ecoo antes do e-mail', async () => {
    conta('u1', 'ana.antiga@exemplo.com', { meuEcooId: 'me-ana' })
    conta('u2', 'ana@exemplo.com')

    const res = await avisar(exclusao())

    expect(res.body).toEqual({ resultado: 'anonimizada' })
    expect(linha('u1').email).toBe('excluida-u1@contas-excluidas.invalid')
    expect(linha('u2').email).toBe('ana@exemplo.com')
  })

  it.each([
    ['conta_excluida', exclusao()],
    ['email_trocado', troca()],
  ])('%s: pelo e-mail, não pega conta que já é de outro id do Meu Ecoo (outra pessoa reusou o e-mail)', async (_tipo, corpo) => {
    conta('u1', 'ana@exemplo.com', { meuEcooId: 'me-outra-ana' })

    const res = await avisar(corpo)

    expect(res.body).toEqual({ resultado: 'sem_conta' })
    expect(linha('u1')).toMatchObject({ email: 'ana@exemplo.com', meuEcooId: 'me-outra-ana' })
  })

  it('nenhuma conta (a pessoa nunca usou este app) → 200 sem_conta, nos dois tipos', async () => {
    conta('u2', 'bia@exemplo.com')

    for (const corpo of [exclusao(), troca()]) {
      const res = await avisar(corpo)
      expect(res.statusCode).toBeUndefined()
      expect(res.body).toEqual({ resultado: 'sem_conta' })
    }
    expect(linha('u2').email).toBe('bia@exemplo.com')
  })
})

describe('email_trocado', () => {
  it('a conta passa ao e-mail novo (em minúsculas), guarda o id do Meu Ecoo e perde as sessões', async () => {
    conta('u1', 'ana@exemplo.com')
    sessao('s1', 'u1')

    const res = await avisar(troca({ emailNovo: 'Ana.Nova@Exemplo.com' }))

    expect(res.statusCode).toBeUndefined()
    expect(res.body).toEqual({ resultado: 'email_trocado' })
    expect(linha('u1')).toMatchObject({
      email: 'ana.nova@exemplo.com',
      meuEcooId: 'me-ana',
      nome: 'Nome de u1',
      isMember: true,
    })
    expect(sessoesDe('u1')).toEqual([])
  })

  it('achada pelo id, mantém o id e troca o e-mail que estiver nela', async () => {
    conta('u1', 'ana.antiga@exemplo.com', { meuEcooId: 'me-ana' })

    const res = await avisar(troca())

    expect(res.body).toEqual({ resultado: 'email_trocado' })
    expect(linha('u1')).toMatchObject({ email: 'ana.nova@exemplo.com', meuEcooId: 'me-ana' })
  })

  it('conflito: a outra conta com o e-mail novo vira substituida-<id> e perde as sessões; a antiga fica com o e-mail novo', async () => {
    conta('u1', 'ana@exemplo.com', { meuEcooId: 'me-ana' })
    conta('u2', 'ana.nova@exemplo.com', { nome: 'Ana (conta nova)' })
    sessao('s1', 'u1')
    sessao('s2', 'u2')

    const res = await avisar(troca())

    expect(res.statusCode).toBeUndefined()
    expect(res.body).toEqual({ resultado: 'email_trocado', conflito: true })
    expect(linha('u1')).toMatchObject({ email: 'ana.nova@exemplo.com', meuEcooId: 'me-ana', nome: 'Nome de u1' })
    // Nada é apagado: a outra conta só muda de e-mail.
    expect(linha('u2')).toMatchObject({ email: 'substituida-u2@contas-excluidas.invalid', nome: 'Ana (conta nova)' })
    expect(banco.usuarios).toHaveLength(2)
    expect(sessoesDe('u1')).toEqual([])
    expect(sessoesDe('u2')).toEqual([])
  })

  it('conta nova com o id + conta antiga sem id: acha a antiga pelo e-mail antigo, e ela fica com o e-mail novo e o id', async () => {
    // A antiga não voltou desde que o app passou a guardar o id; a pessoa entrou com o e-mail novo antes do aviso,
    // e o login deu o id à conta nova, vazia.
    conta('u1', 'ana@exemplo.com', { nome: 'Ana (com os dados)' })
    conta('u2', 'ana.nova@exemplo.com', { meuEcooId: 'me-ana', nome: 'Ana (conta nova)' })
    sessao('s1', 'u1')
    sessao('s2', 'u2')

    const res = await avisar(troca())

    expect(res.body).toEqual({ resultado: 'email_trocado', conflito: true })
    expect(linha('u1')).toMatchObject({ email: 'ana.nova@exemplo.com', meuEcooId: 'me-ana', nome: 'Ana (com os dados)' })
    expect(linha('u2')).toMatchObject({
      email: 'substituida-u2@contas-excluidas.invalid',
      meuEcooId: null,
      nome: 'Ana (conta nova)',
    })
    expect(sessoesDe('u1')).toEqual([])
    expect(sessoesDe('u2')).toEqual([])

    // Repetir o aviso não desfaz nada.
    expect((await avisar(troca())).body).toEqual({ resultado: 'email_trocado' })
    expect(linha('u1')).toMatchObject({ email: 'ana.nova@exemplo.com', meuEcooId: 'me-ana' })
  })

  it('repetir o aviso não estraga nada: a conta segue no e-mail novo e não perde a sessão aberta depois', async () => {
    conta('u1', 'ana@exemplo.com')
    await avisar(troca())
    sessao('s-depois', 'u1') // a pessoa entrou de novo, já com o e-mail novo

    const res = await avisar(troca())

    expect(res.body).toEqual({ resultado: 'email_trocado' })
    expect(linha('u1')).toMatchObject({ email: 'ana.nova@exemplo.com', meuEcooId: 'me-ana' })
    expect(sessoesDe('u1')).toEqual(['s-depois'])
  })

  it('repetir o aviso depois de um conflito não cria outro conflito', async () => {
    conta('u1', 'ana@exemplo.com', { meuEcooId: 'me-ana' })
    conta('u2', 'ana.nova@exemplo.com')
    await avisar(troca())

    const res = await avisar(troca())

    expect(res.body).toEqual({ resultado: 'email_trocado' })
    expect(linha('u1').email).toBe('ana.nova@exemplo.com')
    expect(linha('u2').email).toBe('substituida-u2@contas-excluidas.invalid')
  })
})

describe('log e resposta sem e-mail', () => {
  it('registra id do evento, tipo e resultado, e nunca o e-mail', async () => {
    conta('u1', 'ana@exemplo.com', { meuEcooId: 'me-ana' })
    conta('u2', 'ana.nova@exemplo.com')

    const res = await avisar(troca())

    expect(logs.join('\n')).toContain('evento-2')
    expect(logs.join('\n')).toContain('email_trocado')
    expect(logs.join('\n')).not.toMatch(/@/)
    expect(JSON.stringify(res.body)).not.toMatch(/@/)
  })

  it('falha do banco → 500, e o log não leva o e-mail que estiver na mensagem do erro', async () => {
    banco.prisma.user.findUnique.mockRejectedValueOnce(new Error('falhou ao buscar ana@exemplo.com'))

    const res = await avisar(exclusao())

    expect(res.statusCode).toBe(500)
    expect(JSON.stringify(res.body)).not.toMatch(/@/)
    expect(logs.join('\n')).toContain('evento-1')
    expect(logs.join('\n')).not.toMatch(/@/)
  })
})
