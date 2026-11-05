import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import express from 'express'
import { securityHeaders } from '../securityHeaders.js'

// Express de verdade, com o middleware antes das rotas, como no server.ts.
let servidor: Server
let base: string

beforeEach(async () => {
  const app = express()
  app.disable('x-powered-by')
  app.use(securityHeaders)
  app.get('/health', (_req, res) => res.json({ ok: true }))
  app.use((_req, res) => res.status(404).json({ error: 'Rota não encontrada' }))
  servidor = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => servidor.once('listening', resolve))
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`
})

afterEach(async () => {
  servidor.closeAllConnections()
  await new Promise((resolve) => servidor.close(resolve))
})

describe('securityHeaders', () => {
  it.each(['/health', '/nao-existe'])('manda os cabeçalhos do guia em %s, sem COOP nem x-powered-by', async (caminho) => {
    const resposta = await fetch(`${base}${caminho}`)

    expect(resposta.headers.get('x-content-type-options')).toBe('nosniff')
    expect(resposta.headers.get('x-frame-options')).toBe('DENY')
    expect(resposta.headers.get('strict-transport-security')).toBe('max-age=63072000; includeSubDomains')
    expect(resposta.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
    expect(resposta.headers.get('content-security-policy')).toBe("default-src 'none'; frame-ancestors 'none'")
    expect(resposta.headers.get('permissions-policy')).toContain('camera=()')
    // COOP quebraria o popup do login com Google dos sites que falam com esta API.
    expect(resposta.headers.get('cross-origin-opener-policy')).toBeNull()
    expect(resposta.headers.get('x-powered-by')).toBeNull()
  })
})
