import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { CHAVE_TEMA, COR_DA_BARRA, aplicarTema, lerPreferencia, proximaPreferencia, temaEfetivo } from './tema'

// Sem DOM nos testes: Storage e Document simulados, só com o que o tema usa.
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

function documento() {
  const atributos = new Map<string, string>()
  const meta = { content: COR_DA_BARRA.claro }
  const html = {
    style: { colorScheme: '' },
    setAttribute: (nome: string, valor: string) => void atributos.set(nome, valor),
    getAttribute: (nome: string) => atributos.get(nome) ?? null,
  }
  const doc = {
    documentElement: html,
    querySelector: (seletor: string) => (seletor === 'meta[name="theme-color"]' ? meta : null),
  } as unknown as Document
  return { doc, atributos, html, meta }
}

describe('preferência de tema', () => {
  it('a chave salva é a do app', () => {
    expect(CHAVE_TEMA).toBe('{{APP_SLUG}}:tema')
  })

  it('sem nada salvo, ou com valor inválido, é claro', () => {
    expect(lerPreferencia(memoria())).toBe('claro')
    expect(lerPreferencia(memoria({ [CHAVE_TEMA]: 'roxo' }))).toBe('claro')
  })

  it('lê escuro e sistema salvos', () => {
    expect(lerPreferencia(memoria({ [CHAVE_TEMA]: 'escuro' }))).toBe('escuro')
    expect(lerPreferencia(memoria({ [CHAVE_TEMA]: 'sistema' }))).toBe('sistema')
  })

  it('o seletor alterna Claro → Escuro → Sistema → Claro', () => {
    expect(proximaPreferencia('claro')).toBe('escuro')
    expect(proximaPreferencia('escuro')).toBe('sistema')
    expect(proximaPreferencia('sistema')).toBe('claro')
  })

  it('sistema segue o aparelho; claro e escuro, não', () => {
    expect(temaEfetivo('sistema', true)).toBe('escuro')
    expect(temaEfetivo('sistema', false)).toBe('claro')
    expect(temaEfetivo('claro', true)).toBe('claro')
    expect(temaEfetivo('escuro', false)).toBe('escuro')
  })
})

describe('aplicarTema', () => {
  it('escuro grava data-tema, colorScheme e a theme-color do escuro', () => {
    const { doc, atributos, html, meta } = documento()
    aplicarTema('escuro', { doc })
    expect(atributos.get('data-tema')).toBe('escuro')
    expect(html.style.colorScheme).toBe('dark')
    expect(meta.content).toBe(COR_DA_BARRA.escuro)
  })

  it('sistema com o aparelho no claro grava claro', () => {
    const { doc, atributos, html, meta } = documento()
    aplicarTema('sistema', { doc, prefereEscuro: false })
    expect(atributos.get('data-tema')).toBe('claro')
    expect(html.style.colorScheme).toBe('light')
    expect(meta.content).toBe(COR_DA_BARRA.claro)
  })
})

describe('script inline do index.html', () => {
  // Roda antes da primeira pintura: tem de chegar ao mesmo resultado do aplicarTema, sem o bundle.
  const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1]

  it('existe e, com escuro salvo, aplica o escuro como o aplicarTema', () => {
    expect(script, 'script inline (<script> sem atributos) no index.html').toBeDefined()
    const { doc, atributos, html: raiz, meta } = documento()
    new Function('localStorage', 'document', 'matchMedia', script!)(
      memoria({ [CHAVE_TEMA]: 'escuro' }),
      doc,
      () => ({ matches: false }),
    )
    expect(atributos.get('data-tema')).toBe('escuro')
    expect(raiz.style.colorScheme).toBe('dark')
    expect(meta.content).toBe(COR_DA_BARRA.escuro)
  })

  it('com sistema salvo e o aparelho no claro, fica claro com a theme-color do claro', () => {
    const { doc, atributos, meta } = documento()
    meta.content = ''
    new Function('localStorage', 'document', 'matchMedia', script!)(memoria({ [CHAVE_TEMA]: 'sistema' }), doc, () => ({ matches: false }))
    expect(atributos.get('data-tema')).toBe('claro')
    expect(meta.content).toBe(COR_DA_BARRA.claro)
  })

  it('com o localStorage indisponível, fica no claro sem erro', () => {
    const { doc, atributos } = documento()
    const quebrado = {
      getItem: () => {
        throw new Error('SecurityError')
      },
    }
    expect(() => new Function('localStorage', 'document', 'matchMedia', script!)(quebrado, doc, () => ({ matches: true }))).not.toThrow()
    expect(atributos.get('data-tema')).toBe('claro')
  })

  it('a theme-color inicial do index.html é o fundo do claro', () => {
    expect(html.match(/<meta name="theme-color" content="([^"]+)"/)?.[1]).toBe(COR_DA_BARRA.claro)
  })
})
