import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Os cabeçalhos de segurança do front vivem no vercel.json (a Vercel os manda em toda resposta).
// Este teste trava o que o guia de segurança do ecossistema pede (seção 8) e o que o login com
// Google exige: se alguém "endurecer" ou afrouxar a política sem medir, ele cai.

type Cabecalho = { key: string; value: string }
const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as { headers: { headers: Cabecalho[] }[] }
const cabecalhos = config.headers.flatMap((regra) => regra.headers)
const valor = (chave: string) => cabecalhos.find((h) => h.key === chave)?.value
// A CSP pode estar em bloqueio (Content-Security-Policy) ou só em relatório (-Report-Only).
const csp = valor('Content-Security-Policy-Report-Only') ?? valor('Content-Security-Policy') ?? ''
const diretiva = (nome: string) => csp.split(/;\s*/).find((d) => d.startsWith(`${nome} `))?.slice(nome.length + 1)

describe('cabeçalhos de segurança do vercel.json', () => {
  it('mandam os cabeçalhos do guia', () => {
    expect(valor('X-Content-Type-Options')).toBe('nosniff')
    expect(valor('X-Frame-Options')).toBe('DENY')
    expect(valor('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    expect(valor('Permissions-Policy')).toContain('camera=()')
    // O HSTS vem da Vercel (63072000 s, mais que os 31536000 do guia): repetir aqui só o desalinharia.
    expect(valor('Strict-Transport-Security')).toBeUndefined()
  })

  it('a CSP fecha o que o app não usa e proíbe ser embutida', () => {
    expect(diretiva('default-src')).toBe("'self'")
    expect(diretiva('object-src')).toBe("'none'")
    expect(diretiva('base-uri')).toBe("'self'")
    expect(diretiva('form-action')).toBe("'self'")
    expect(diretiva('frame-ancestors')).toBe("'none'")
  })

  it('não aceita script embutido sem hash, eval nem curinga', () => {
    expect(diretiva('script-src')).not.toContain("'unsafe-inline'")
    expect(csp).not.toContain("'unsafe-eval'")
    for (const nome of ['script-src', 'connect-src', 'frame-src']) {
      expect(diretiva(nome), nome).not.toMatch(/\*|\shttps?:(\s|$)/)
    }
  })

  it('libera o login com Google (gapi, iframe do authDomain e APIs de identidade) e a API do app', () => {
    expect(diretiva('script-src')).toContain('https://apis.google.com')
    expect(diretiva('connect-src')).toContain('https://identitytoolkit.googleapis.com')
    expect(diretiva('connect-src')).toContain('https://securetoken.googleapis.com')
    expect(diretiva('frame-src')).toContain('https://descontoss-vip.firebaseapp.com')
    // A origem da API é a do backend Railway deste app: troque pelo domínio real ao provisionar.
    expect(diretiva('connect-src')).toMatch(/https:\/\/\S+\.up\.railway\.app/)
  })

  it('avisa o coletor de violações do Meu Ecoo (report-uri)', () => {
    expect(diretiva('report-uri')).toBe('https://api-production-1b34.up.railway.app/api/csp-report')
  })
})
