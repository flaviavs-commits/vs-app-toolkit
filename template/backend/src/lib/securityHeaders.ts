import type { RequestHandler } from 'express'

// ── Cabeçalhos de segurança da API (guia de segurança do ecossistema, seção 8) ─
// A API só devolve JSON, então nada dela é página: a CSP proíbe carregar qualquer
// recurso e ser embutida (`default-src 'none'`, `frame-ancestors 'none'`), e
// `X-Frame-Options` cobre navegador antigo. O HSTS só vale quando a resposta chega
// por HTTPS (o Railway termina o TLS).
//
// Sem `Cross-Origin-Opener-Policy` de propósito: `same-origin` (o padrão do `helmet()`)
// quebra o popup do login com Google (Firebase) dos sites que falam com esta API.
// Sem `x-powered-by`: ver `app.disable('x-powered-by')` no server.ts.
export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()')
  next()
}
