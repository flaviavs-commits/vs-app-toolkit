import { defineConfig } from 'vitest/config'

// Testes do backend rodam em Node, sem precisar de banco real: o Prisma e o
// `fetch` para o VS são mockados (ver src/auth/__tests__/). Foco: autenticação
// e autorização — o que o Design System Backend marca como obrigatório testar.
export default defineConfig({
  // Projeto Node puro: desliga o pipeline de CSS/PostCSS para o Vite não tentar
  // carregar o postcss.config.js do frontend (que fica no diretório acima).
  css: { postcss: { plugins: [] } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    clearMocks: true,
  },
})
