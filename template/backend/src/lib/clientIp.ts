import { isIP } from 'node:net'
import type { Request } from 'express'

// ── IP de quem fez a requisição ──────────────────────────────────────────────
// Chave dos limites de tentativas (rateLimits.ts).
//
// No Railway, `req.ip` não identifica o cliente: toda requisição passa por um POP
// da borda (o gru1, em São Paulo, atende o Brasil por 46.151.194.129 e .130), e com
// `trust proxy` é esse POP que vira `req.ip`. Chaveado assim, o limite era dividido
// por todos que entram pelo mesmo POP — umas 20 senhas erradas de qualquer pessoa
// travavam o login do Brasil inteiro —, e o mesmo cliente escapava quando a borda
// alternava o endereço do POP. A borda grava o IP de quem abriu a conexão em
// X-Real-IP e sobrescreve o valor que o cliente mandar
// (docs.railway.com/networking/public-networking/specs-and-limits), então dentro do
// Railway é esse cabeçalho que vale. Fora dele (desenvolvimento e testes) não há
// borda para garantir nenhum cabeçalho, e o endereço da conexão é o único que o
// cliente não forja.
export function clientIp(req: Request): string {
  if (process.env.RAILWAY_ENVIRONMENT_ID) {
    const informadoPelaBorda = req.headers['x-real-ip']
    if (typeof informadoPelaBorda === 'string' && isIP(informadoPelaBorda.trim()) !== 0) {
      return informadoPelaBorda.trim()
    }
  }
  return req.socket.remoteAddress ?? 'sem-endereco'
}
