import { describe, it, expect } from 'vitest'
import { corsOrigin } from '../corsOrigin.js'

describe('corsOrigin', () => {
  it('fora de produção libera qualquer origem (desenvolvimento local)', () => {
    expect(corsOrigin({})).toBe('*')
    expect(corsOrigin({ NODE_ENV: 'development' })).toBe('*')
  })

  it('em produção devolve a URL exata do frontend', () => {
    const env = { NODE_ENV: 'production', FRONTEND_URL: 'https://app.vercel.app' }
    expect(corsOrigin(env)).toBe('https://app.vercel.app')
  })

  it.each([
    ['ausente', undefined],
    ['vazia', ''],
    ['só espaços', '   '],
  ])('em produção recusa subir com FRONTEND_URL %s', (_caso, frontendUrl) => {
    const env = { NODE_ENV: 'production', FRONTEND_URL: frontendUrl }
    expect(() => corsOrigin(env)).toThrow(/FRONTEND_URL/)
  })
})
