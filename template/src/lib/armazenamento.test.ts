import { describe, expect, it } from 'vitest'

import { PREFIXO, apagarJSON, chave, chaveDoDia, gravarJSON, lerJSON, pacoteDeDados, todosOsDados } from './armazenamento'

function memoria(itens: Record<string, string> = {}): Storage {
  const m = new Map(Object.entries(itens))
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size
    },
  }
}

const quebrado = {
  getItem: () => {
    throw new Error('SecurityError')
  },
  setItem: () => {
    throw new Error('SecurityError')
  },
  removeItem: () => {
    throw new Error('SecurityError')
  },
  get length(): number {
    throw new Error('SecurityError')
  },
} as unknown as Storage

describe('dados no aparelho', () => {
  it('a chave leva o prefixo do app', () => {
    expect(PREFIXO).toBe('{{APP_SLUG}}:')
    expect(chave('sessoes')).toBe('{{APP_SLUG}}:sessoes')
  })

  it('grava e lê JSON; sem nada gravado devolve o padrão', () => {
    const s = memoria()
    expect(lerJSON('lista', [], s)).toEqual([])
    expect(gravarJSON('lista', [1, 2], s)).toBe(true)
    expect(lerJSON('lista', [], s)).toEqual([1, 2])
    apagarJSON('lista', s)
    expect(lerJSON('lista', 'vazio', s)).toBe('vazio')
  })

  it('JSON inválido gravado por fora devolve o padrão', () => {
    expect(lerJSON('x', 7, memoria({ [chave('x')]: '{quebrado' }))).toBe(7)
  })

  it('sem armazenamento, ler devolve o padrão e gravar devolve false, sem lançar', () => {
    expect(lerJSON('x', 'padrao', quebrado)).toBe('padrao')
    expect(gravarJSON('x', 1, quebrado)).toBe(false)
    expect(() => apagarJSON('x', quebrado)).not.toThrow()
    expect(todosOsDados(quebrado)).toEqual({})
  })

  it('"Baixar meus dados" junta só as chaves do app, fora o tema e a sessão', () => {
    const s = memoria({
      [chave('sessoes')]: '[{"min":25}]',
      [chave('tema')]: 'escuro',
      '{{APP_SLUG}}_token': 'jwt',
      'outro-app:dados': '1',
      [chave('texto-cru')]: 'não é json',
    })
    const pacote = pacoteDeDados(s, new Date('2026-11-06T12:00:00Z'))
    expect(pacote).toEqual({
      app: '{{APP_SLUG}}',
      versao: 1,
      exportadoEm: '2026-11-06T12:00:00.000Z',
      dados: { sessoes: [{ min: 25 }], 'texto-cru': 'não é json' },
    })
  })

  it('chaveDoDia usa a data local, com dois dígitos', () => {
    expect(chaveDoDia(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})
