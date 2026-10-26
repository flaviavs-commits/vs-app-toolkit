// Origem permitida no CORS. Em produção a URL do frontend é obrigatória: sem ela
// o backend recusa subir, em vez de rodar com CORS quebrado e sem nenhum aviso.
export function corsOrigin(env: NodeJS.ProcessEnv = process.env): string {
  if (env.NODE_ENV !== 'production') return '*'

  const frontendUrl = env.FRONTEND_URL?.trim()
  if (!frontendUrl) {
    throw new Error(
      'FRONTEND_URL é obrigatória com NODE_ENV=production: defina a URL exata do frontend (sem barra no final).',
    )
  }
  return frontendUrl
}
